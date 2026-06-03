import { dialog, shell } from "electron";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AddTodoRequest,
  type CreateTodoListRequest,
  type TodoListDocument,
  type TodoListSummary,
  type ToggleTodoRequest,
  type UpdateTodoRequest
} from "../shared/todoTypes";
import { AppError } from "./errors";
import {
  addTodoToFile,
  createEmptyMarkdown,
  createListId,
  createUntitledFileName,
  deriveDefaultName,
  readTodoFile,
  setTodoCompletedInFile,
  updateTodoTextInFile
} from "./markdownTodo";
import { getManagedTodoDir, getRegistryPath } from "./paths";
import { findList, readRegistry, removeList, upsertList } from "./todoRegistry";

export async function listTodoLists(): Promise<TodoListSummary[]> {
  return readRegistry(getRegistryPath());
}

export async function createTodoList(
  request: CreateTodoListRequest
): Promise<TodoListDocument> {
  const name = normalizeListName(request.name);
  const filePath =
    request.mode === "managed"
      ? await createManagedFile(name)
      : await chooseExternalMarkdownPath(name);

  if (!filePath) {
    throw new AppError("FILE_SELECTION_CANCELLED", "已取消选择文件。");
  }

  await writeFile(filePath, createEmptyMarkdown(), { encoding: "utf8", flag: "wx" }).catch(
    async (error: unknown) => {
      if (isFileExistsError(error)) {
        throw new AppError("FILE_EXISTS", "目标文件已存在，请换一个名称或位置。");
      }
      throw error;
    }
  );

  return registerAndRead({
    id: createListId(filePath),
    name,
    filePath,
    storage: request.mode,
    updatedAt: new Date().toISOString()
  });
}

export async function openTodoList(): Promise<TodoListDocument | null> {
  const result = await dialog.showOpenDialog({
    title: "打开 TodoList Markdown 文件",
    filters: [{ name: "Markdown", extensions: ["md"] }],
    properties: ["openFile"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const filePath = result.filePaths[0];
  const file = await stat(filePath);
  if (!file.isFile()) {
    throw new AppError("INVALID_FILE", "请选择一个 Markdown 文件。");
  }

  return registerAndRead({
    id: createListId(filePath),
    name: deriveDefaultName(filePath),
    filePath,
    storage: "external",
    updatedAt: new Date().toISOString()
  });
}

export async function readTodoList(listId: string): Promise<TodoListDocument> {
  const summary = await requireList(listId);
  const todos = await readTodoFile(summary.filePath);
  return { ...summary, todos };
}

export async function addTodo(request: AddTodoRequest): Promise<TodoListDocument> {
  const summary = await requireList(request.listId);
  const todos = await addTodoToFile(summary.filePath, request.priority, request.text);
  const updatedSummary = await touchSummary(summary);
  return { ...updatedSummary, todos };
}

export async function toggleTodo(request: ToggleTodoRequest): Promise<TodoListDocument> {
  const summary = await requireList(request.listId);
  const todos = await setTodoCompletedInFile(
    summary.filePath,
    request.todoId,
    request.completed
  );
  const updatedSummary = await touchSummary(summary);
  return { ...updatedSummary, todos };
}

export async function updateTodo(request: UpdateTodoRequest): Promise<TodoListDocument> {
  const summary = await requireList(request.listId);
  const todos = await updateTodoTextInFile(summary.filePath, request.todoId, request.text);
  const updatedSummary = await touchSummary(summary);
  return { ...updatedSummary, todos };
}

export async function revealFile(listId: string): Promise<void> {
  const summary = await requireList(listId);
  shell.showItemInFolder(summary.filePath);
}

export async function removeTodoList(listId: string): Promise<TodoListSummary[]> {
  const result = await removeList(getRegistryPath(), listId);
  if (!result.removed) {
    throw new AppError("LIST_NOT_FOUND", "没有找到这个 TodoList。");
  }

  return result.lists;
}

async function createManagedFile(name: string): Promise<string> {
  const todoDir = getManagedTodoDir();
  await mkdir(todoDir, { recursive: true });
  const fileName = createUntitledFileName(name);
  return join(todoDir, fileName);
}

async function chooseExternalMarkdownPath(name: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: "选择 TodoList 保存位置",
    defaultPath: createUntitledFileName(name),
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath.endsWith(".md") ? result.filePath : `${result.filePath}.md`;
}

async function registerAndRead(summary: TodoListSummary): Promise<TodoListDocument> {
  await upsertList(getRegistryPath(), summary);
  const todos = await readTodoFile(summary.filePath);
  return { ...summary, todos };
}

async function requireList(listId: string): Promise<TodoListSummary> {
  const summary = await findList(getRegistryPath(), listId);
  if (!summary) {
    throw new AppError("LIST_NOT_FOUND", "没有找到这个 TodoList。");
  }

  await access(summary.filePath).catch(() => {
    throw new AppError("FILE_NOT_FOUND", "对应的 Markdown 文件不存在或无法访问。");
  });

  return summary;
}

async function touchSummary(summary: TodoListSummary): Promise<TodoListSummary> {
  const updatedSummary = { ...summary, updatedAt: new Date().toISOString() };
  await upsertList(getRegistryPath(), updatedSummary);
  return updatedSummary;
}

function normalizeListName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new AppError("EMPTY_LIST_NAME", "TodoList 名称不能为空。");
  }

  return normalized;
}

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}
