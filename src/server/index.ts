import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { SyncModelError, exportListToMarkdown } from "../shared/syncModel";
import { type SyncOperationRequest } from "../shared/todoTypes";
import { TodoStore } from "./store";

type ServerConfig = {
  host: string;
  port: number;
  accessKey: string;
  dataPath: string;
  staticDir: string;
};

const config = readConfig();
const store = new TodoStore(config.dataPath);
const server = createServer((request, response) => {
  void handleRequest(request, response);
});
const webSocketServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token") ?? "";
  if (token !== config.accessKey) {
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});

webSocketServer.on("connection", (webSocket) => {
  void store.readSnapshot().then((snapshot) => {
    webSocket.send(JSON.stringify({ type: "snapshot", version: snapshot.version }));
  });
});

void startServer();

async function startServer(): Promise<void> {
  await mkdir(resolve(config.dataPath, ".."), { recursive: true });
  server.listen(config.port, config.host, () => {
    console.log(`Markdown TodoList sync server listening on http://${config.host}:${config.port}`);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (!isAuthorized(request)) {
        sendJson(response, 401, { message: "未授权", code: "UNAUTHORIZED" });
        return;
      }

      await handleApiRequest(request, response, url);
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    if (error instanceof SyncModelError) {
      sendJson(response, 400, { message: error.message, code: error.code });
      return;
    }

    sendJson(response, 500, { message: "服务器内部错误", code: "SERVER_ERROR" });
  }
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<void> {
  if (request.method === "GET" && url.pathname === "/api/snapshot") {
    sendJson(response, 200, await store.readSnapshot());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/operations") {
    const body = await readJsonBody<SyncOperationRequest>(request);
    if (!body || !Array.isArray(body.operations)) {
      sendJson(response, 400, { message: "请求格式错误", code: "BAD_REQUEST" });
      return;
    }

    const result = await store.applyOperations(body.operations);
    broadcastChange(result.snapshot.version);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/lists/")) {
    const parts = url.pathname.split("/");
    const listId = parts[3];
    const action = parts[4];
    if (listId && action === "markdown") {
      const snapshot = await store.readSnapshot();
      const document = snapshot.lists.find((list) => list.id === listId);
      if (!document) {
        sendJson(response, 404, { message: "TodoList 不存在", code: "LIST_NOT_FOUND" });
        return;
      }
      sendJson(response, 200, exportListToMarkdown(document));
      return;
    }
  }

  sendJson(response, 404, { message: "接口不存在", code: "NOT_FOUND" });
}

function broadcastChange(version: number): void {
  const message = JSON.stringify({ type: "change", version });
  for (const client of webSocketServer.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function isAuthorized(request: IncomingMessage): boolean {
  const authHeader = request.headers.authorization ?? "";
  return authHeader === `Bearer ${config.accessKey}`;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const content = JSON.stringify(body);
  response.writeHead(statusCode, withCorsHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }));
  response.end(content);
}

function serveStatic(response: ServerResponse, pathname: string): void {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = resolve(config.staticDir, `.${normalize(decodeURIComponent(safePath))}`);
  if (!requestedPath.startsWith(resolve(config.staticDir)) || !existsSync(requestedPath)) {
    const indexPath = join(config.staticDir, "index.html");
    if (existsSync(indexPath)) {
      streamFile(response, indexPath);
      return;
    }

    response.writeHead(404);
    response.end("Not found");
    return;
  }

  streamFile(response, requestedPath);
}

function streamFile(response: ServerResponse, filePath: string): void {
  response.writeHead(200, withCorsHeaders({
    "content-type": getContentType(filePath),
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000"
  }));
  createReadStream(filePath).pipe(response);
}

function setCorsHeaders(response: ServerResponse): void {
  for (const [key, value] of Object.entries(createCorsHeaders())) {
    response.setHeader(key, value);
  }
}

function withCorsHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    ...createCorsHeaders()
  };
}

function createCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400"
  };
}

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".webmanifest":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function readConfig(): ServerConfig {
  const accessKey = process.env.TODO_ACCESS_KEY;
  if (!accessKey) {
    throw new Error("TODO_ACCESS_KEY is required");
  }

  const port = Number.parseInt(process.env.TODO_PORT ?? "43158", 10);
  return {
    host: process.env.TODO_HOST ?? "0.0.0.0",
    port: Number.isFinite(port) ? port : 43158,
    accessKey,
    dataPath: process.env.TODO_DATA_PATH ?? resolve("data", "sync-server.json"),
    staticDir: process.env.TODO_STATIC_DIR ?? resolve("out", "renderer")
  };
}
