import {
  applySyncOperation,
  createClientId,
  createEmptySnapshot,
  createSummaryFromDocument,
  exportListToMarkdown
} from "../../shared/syncModel";
import {
  type AddTodoRequest,
  type CreateTodoListRequest,
  type DeleteTodoRequest,
  type ExportMarkdownResponse,
  type ImportMarkdownRequest,
  type ReorderTodoRequest,
  type SyncOperation,
  type SyncOperationResponse,
  type SyncOperationRequest,
  type SyncServerConfig,
  type SyncServerSnapshot,
  type SyncStatus,
  type TodoApi,
  type TodoChangeEvent,
  type TodoListDocument,
  type TodoListSummary,
  type ToggleTodoRequest,
  type UpdateTodoRequest
} from "../../shared/todoTypes";

type StoredRemoteState = {
  config: SyncServerConfig | null;
  remoteModeEnabled: boolean;
  snapshot: SyncServerSnapshot;
  pendingOperations: SyncOperation[];
};

type RemoteMessage =
  | { type: "snapshot"; version: number }
  | { type: "change"; version: number };

const storageKey = "markdown-todolist.remote-state.v1";

export class RemoteTodoApi implements TodoApi {
  private state: StoredRemoteState;
  private connected = false;
  private flushing = false;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private listeners = new Set<(event: TodoChangeEvent) => void>();

  constructor(
    config: SyncServerConfig,
    options: { remoteModeEnabled?: boolean; autoStart?: boolean } = {}
  ) {
    const storedState = readStoredState();
    this.state = {
      config,
      remoteModeEnabled:
        options.remoteModeEnabled ?? storedState?.remoteModeEnabled ?? Boolean(storedState?.config),
      snapshot: storedState?.snapshot ?? createEmptySnapshot(),
      pendingOperations: storedState?.pendingOperations ?? []
    };
    this.persist();
    if (options.autoStart ?? true) {
      this.connect();
      void this.refreshSnapshot();
      void this.flushPendingOperations();
    }
  }

  getSyncStatus(): SyncStatus {
    return {
      mode: "remote",
      connected: this.connected,
      pendingOperations: this.state.pendingOperations.length,
      message: this.connected
        ? this.state.pendingOperations.length > 0
          ? "有待同步更改"
          : "已连接同步服务器"
        : "离线模式，正在等待重连"
    };
  }

  subscribeToChanges(listener: (event: TodoChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async listTodoLists(): Promise<TodoListSummary[]> {
    return this.state.snapshot.lists.map(createSummaryFromDocument);
  }

  async createTodoList(request: CreateTodoListRequest): Promise<TodoListDocument> {
    const listId = request.id ?? createClientId("list");
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "createList",
      createdAt: new Date().toISOString(),
      payload: {
        listId,
        name: request.name
      }
    };
    await this.applyOperation(operation);
    return this.readTodoList(listId);
  }

  async openTodoList(): Promise<TodoListDocument | null> {
    return null;
  }

  async readTodoList(listId: string): Promise<TodoListDocument> {
    const document = this.state.snapshot.lists.find((list) => list.id === listId);
    if (!document) {
      throw new Error(JSON.stringify({ message: "TodoList 不存在", code: "LIST_NOT_FOUND" }));
    }

    return cloneDocument(document);
  }

  async addTodo(request: AddTodoRequest): Promise<TodoListDocument> {
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "addTodo",
      createdAt: new Date().toISOString(),
      payload: {
        listId: request.listId,
        todoId: request.todoId ?? createClientId("todo"),
        priority: request.priority,
        text: request.text
      }
    };
    await this.applyOperation(operation);
    return this.readTodoList(request.listId);
  }

  async toggleTodo(request: ToggleTodoRequest): Promise<TodoListDocument> {
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "toggleTodo",
      createdAt: new Date().toISOString(),
      payload: request
    };
    await this.applyOperation(operation);
    return this.readTodoList(request.listId);
  }

  async updateTodo(request: UpdateTodoRequest): Promise<TodoListDocument> {
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "updateTodo",
      createdAt: new Date().toISOString(),
      payload: request
    };
    await this.applyOperation(operation);
    return this.readTodoList(request.listId);
  }

  async deleteTodo(request: DeleteTodoRequest): Promise<TodoListDocument> {
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "deleteTodo",
      createdAt: new Date().toISOString(),
      payload: request
    };
    await this.applyOperation(operation);
    return this.readTodoList(request.listId);
  }

  async reorderTodo(request: ReorderTodoRequest): Promise<TodoListDocument> {
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "reorderTodo",
      createdAt: new Date().toISOString(),
      payload: request
    };
    await this.applyOperation(operation);
    return this.readTodoList(request.listId);
  }

  async removeTodoList(listId: string): Promise<TodoListSummary[]> {
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "removeList",
      createdAt: new Date().toISOString(),
      payload: { listId }
    };
    await this.applyOperation(operation);
    return this.listTodoLists();
  }

  async revealFile(): Promise<void> {
    throw new Error(JSON.stringify({ message: "远程列表没有本地文件位置", code: "REMOTE_ONLY" }));
  }

  async importMarkdown(request: ImportMarkdownRequest): Promise<TodoListDocument> {
    const listId = request.id ?? createClientId("list");
    const operation: SyncOperation = {
      id: createClientId("op"),
      type: "importMarkdown",
      createdAt: new Date().toISOString(),
      payload: {
        listId,
        name: request.name,
        markdown: request.markdown
      }
    };
    await this.applyOperation(operation);
    return this.readTodoList(listId);
  }

  async exportMarkdown(listId: string): Promise<ExportMarkdownResponse> {
    const response = await this.request<ExportMarkdownResponse>(`/api/lists/${listId}/markdown`, {
      method: "GET"
    }).catch(() => exportListToMarkdown(this.requireDocument(listId)));
    return response;
  }

  dispose(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
  }

  private async applyOperation(operation: SyncOperation): Promise<void> {
    this.state.snapshot = applySyncOperation(this.state.snapshot, operation);
    this.state.pendingOperations = [...this.state.pendingOperations, operation];
    this.persist();
    this.emitChange();
    await this.flushPendingOperations();
  }

  private async refreshSnapshot(): Promise<void> {
    if (!this.state.config) {
      return;
    }

    try {
      const snapshot = await this.request<SyncServerSnapshot>("/api/snapshot", {
        method: "GET"
      });
      this.connected = true;
      this.state.snapshot = snapshot;
      this.persist();
      this.emitChange();
    } catch {
      this.connected = false;
      this.emitChange();
    }
  }

  private async flushPendingOperations(): Promise<void> {
    if (this.flushing || this.state.pendingOperations.length === 0) {
      return;
    }

    this.flushing = true;
    try {
      const body: SyncOperationRequest = {
        operations: this.state.pendingOperations
      };
      const result = await this.request<SyncOperationResponse>("/api/operations", {
        method: "POST",
        body: JSON.stringify(body)
      });
      this.connected = true;
      const acceptedIds = new Set(result.acceptedOperationIds);
      this.state.pendingOperations = this.state.pendingOperations.filter(
        (operation) => !acceptedIds.has(operation.id)
      );
      this.state.snapshot = result.snapshot;
      this.persist();
      this.emitChange();
    } catch {
      this.connected = false;
      this.emitChange();
    } finally {
      this.flushing = false;
    }
  }

  private connect(): void {
    if (!this.state.config || this.socket) {
      return;
    }

    const socket = new WebSocket(createWebSocketUrl(this.state.config));
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.connected = true;
      this.emitChange();
      void this.refreshSnapshot().then(() => this.flushPendingOperations());
    });

    socket.addEventListener("message", (event) => {
      const message = parseRemoteMessage(event.data);
      if (!message) {
        return;
      }

      if (message.version > this.state.snapshot.version) {
        void this.refreshSnapshot().then(() => this.flushPendingOperations());
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.connected = false;
      this.emitChange();
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      void this.flushPendingOperations();
    }, 2500);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.state.config) {
      throw new Error("Missing remote config");
    }

    const response = await fetch(createApiUrl(this.state.config, path), {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.state.config.accessKey}`,
        ...init.headers
      }
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; code?: string }
        | null;
      throw new Error(
        JSON.stringify({
          message: payload?.message ?? "同步服务器请求失败",
          code: payload?.code ?? "REMOTE_ERROR"
        })
      );
    }

    return (await response.json()) as T;
  }

  private requireDocument(listId: string): TodoListDocument {
    const document = this.state.snapshot.lists.find((list) => list.id === listId);
    if (!document) {
      throw new Error(JSON.stringify({ message: "TodoList 不存在", code: "LIST_NOT_FOUND" }));
    }

    return document;
  }

  private emitChange(): void {
    const event = { version: this.state.snapshot.version };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private persist(): void {
    writeStoredState(this.state);
  }
}

export function readRemoteConfig(): SyncServerConfig | null {
  const state = readStoredState();
  return state?.remoteModeEnabled ? state.config : null;
}

export function readSavedRemoteConfig(): SyncServerConfig | null {
  return readStoredState()?.config ?? null;
}

export function writeRemoteConfig(config: SyncServerConfig): void {
  const state = readStoredState() ?? {
    config: null,
    remoteModeEnabled: false,
    snapshot: createEmptySnapshot(),
    pendingOperations: []
  };
  writeStoredState({
    ...state,
    config: normalizeConfig(config),
    remoteModeEnabled: true
  });
}

export function disableRemoteMode(): void {
  const state = readStoredState();
  if (!state) {
    return;
  }

  writeStoredState({ ...state, remoteModeEnabled: false });
}

export function clearRemoteConfig(): void {
  const state = readStoredState() ?? {
    config: null,
    remoteModeEnabled: false,
    snapshot: createEmptySnapshot(),
    pendingOperations: []
  };

  writeStoredState({
    ...state,
    config: null,
    remoteModeEnabled: false,
    pendingOperations: []
  });
}

function readStoredState(): StoredRemoteState | null {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredRemoteState;
    return {
      config: parsed.config ? normalizeConfig(parsed.config) : null,
      remoteModeEnabled:
        typeof parsed.remoteModeEnabled === "boolean"
          ? parsed.remoteModeEnabled
          : Boolean(parsed.config),
      snapshot: parsed.snapshot ?? createEmptySnapshot(),
      pendingOperations: Array.isArray(parsed.pendingOperations)
        ? parsed.pendingOperations
        : []
    };
  } catch {
    return null;
  }
}

function writeStoredState(state: StoredRemoteState): void {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function normalizeConfig(config: SyncServerConfig): SyncServerConfig {
  return {
    serverUrl: config.serverUrl.replace(/\/+$/u, ""),
    accessKey: config.accessKey
  };
}

function createWebSocketUrl(config: SyncServerConfig): string {
  const url = new URL(config.serverUrl);
  const basePath = url.pathname.replace(/\/+$/u, "");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = basePath ? `${basePath}-ws` : "/ws";
  url.search = new URLSearchParams({ token: config.accessKey }).toString();
  return url.toString();
}

function createApiUrl(config: SyncServerConfig, path: string): string {
  const url = new URL(config.serverUrl);
  const basePath = url.pathname.replace(/\/+$/u, "");
  if (basePath) {
    url.pathname = `${basePath}-api${path.replace(/^\/api/u, "")}`;
  } else {
    url.pathname = path;
  }
  return url.toString();
}

function parseRemoteMessage(value: unknown): RemoteMessage | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as RemoteMessage;
    return typeof parsed.version === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function cloneDocument(document: TodoListDocument): TodoListDocument {
  return {
    ...document,
    todos: document.todos.map((todo) => ({ ...todo }))
  };
}
