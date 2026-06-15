import {
  normalizeTodoText,
  parseMarkdown,
  renderMarkdown
} from "./markdownFormat";
import {
  type ExportMarkdownResponse,
  type SyncOperation,
  type SyncServerSnapshot,
  type TodoItem,
  type TodoListDocument,
  type TodoListSummary
} from "./todoTypes";

export type SyncModelErrorCode =
  | "EMPTY_LIST_NAME"
  | "EMPTY_TODO"
  | "LIST_NOT_FOUND"
  | "TODO_NOT_FOUND"
  | "INVALID_MARKDOWN";

export class SyncModelError extends Error {
  constructor(
    public readonly code: SyncModelErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SyncModelError";
  }
}

export function createEmptySnapshot(): SyncServerSnapshot {
  return { version: 0, lists: [] };
}

export function applySyncOperation(
  snapshot: SyncServerSnapshot,
  operation: SyncOperation
): SyncServerSnapshot {
  const timestamp = operation.createdAt || new Date().toISOString();
  const version = snapshot.version + 1;
  const lists = snapshot.lists.map(cloneList);

  switch (operation.type) {
    case "createList": {
      const name = normalizeListName(operation.payload.name);
      upsertList(lists, {
        id: operation.payload.listId,
        name,
        filePath: `remote://${operation.payload.listId}`,
        storage: "remote",
        updatedAt: timestamp,
        version,
        todos: []
      });
      break;
    }
    case "removeList": {
      const nextLists = lists.filter((list) => list.id !== operation.payload.listId);
      if (nextLists.length === lists.length) {
        throw new SyncModelError("LIST_NOT_FOUND", "TodoList 不存在");
      }
      return { version, lists: nextLists };
    }
    case "addTodo": {
      const list = requireList(lists, operation.payload.listId);
      const text = normalizeTodoTextForModel(operation.payload.text);
      const todo: TodoItem = {
        id: operation.payload.todoId,
        priority: operation.payload.priority,
        text,
        completed: false,
        updatedAt: timestamp,
        version
      };
      list.todos = [...list.todos, todo];
      touchList(list, timestamp, version);
      break;
    }
    case "toggleTodo": {
      const list = requireList(lists, operation.payload.listId);
      const todo = requireTodo(list, operation.payload.todoId);
      todo.completed = operation.payload.completed;
      touchTodo(todo, timestamp, version);
      touchList(list, timestamp, version);
      break;
    }
    case "updateTodo": {
      const list = requireList(lists, operation.payload.listId);
      const todo = requireTodo(list, operation.payload.todoId);
      todo.text = normalizeTodoTextForModel(operation.payload.text);
      touchTodo(todo, timestamp, version);
      touchList(list, timestamp, version);
      break;
    }
    case "deleteTodo": {
      const list = requireList(lists, operation.payload.listId);
      const nextTodos = list.todos.filter((todo) => todo.id !== operation.payload.todoId);
      if (nextTodos.length === list.todos.length) {
        throw new SyncModelError("TODO_NOT_FOUND", "待办不存在");
      }
      list.todos = nextTodos;
      touchList(list, timestamp, version);
      break;
    }
    case "reorderTodo": {
      const list = requireList(lists, operation.payload.listId);
      list.todos = reorderTodos(list.todos, operation.payload.todoId, operation.payload.targetTodoId);
      touchList(list, timestamp, version);
      break;
    }
    case "importMarkdown": {
      const name = normalizeListName(operation.payload.name);
      const todos = parseImportedMarkdown(operation.payload.markdown, timestamp, version);
      upsertList(lists, {
        id: operation.payload.listId,
        name,
        filePath: `remote://${operation.payload.listId}`,
        storage: "remote",
        updatedAt: timestamp,
        version,
        todos
      });
      break;
    }
  }

  return { version, lists };
}

export function applySyncOperations(
  snapshot: SyncServerSnapshot,
  operations: SyncOperation[]
): SyncServerSnapshot {
  return operations.reduce(applySyncOperation, snapshot);
}

export function createSummaryFromDocument(document: TodoListDocument): TodoListSummary {
  const summary: TodoListSummary = {
    id: document.id,
    name: document.name,
    filePath: document.filePath,
    storage: document.storage,
    updatedAt: document.updatedAt
  };
  if (document.version !== undefined) {
    summary.version = document.version;
  }
  return summary;
}

export function exportListToMarkdown(document: TodoListDocument): ExportMarkdownResponse {
  return {
    fileName: `${createSafeFileBaseName(document.name)}.md`,
    markdown: renderMarkdown(document.todos)
  };
}

export function createClientId(prefix: string): string {
  const randomPart =
    globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomPart}`;
}

function cloneList(list: TodoListDocument): TodoListDocument {
  return {
    ...list,
    todos: list.todos.map((todo) => ({ ...todo }))
  };
}

function upsertList(lists: TodoListDocument[], list: TodoListDocument): void {
  const existingIndex = lists.findIndex((item) => item.id === list.id);
  if (existingIndex >= 0) {
    lists[existingIndex] = list;
    return;
  }

  lists.unshift(list);
}

function requireList(lists: TodoListDocument[], listId: string): TodoListDocument {
  const list = lists.find((item) => item.id === listId);
  if (!list) {
    throw new SyncModelError("LIST_NOT_FOUND", "TodoList 不存在");
  }

  return list;
}

function requireTodo(list: TodoListDocument, todoId: string): TodoItem {
  const todo = list.todos.find((item) => item.id === todoId);
  if (!todo) {
    throw new SyncModelError("TODO_NOT_FOUND", "待办不存在");
  }

  return todo;
}

function reorderTodos(
  todos: TodoItem[],
  todoId: string,
  targetTodoId: string
): TodoItem[] {
  if (todoId === targetTodoId) {
    return todos;
  }

  const todo = todos.find((item) => item.id === todoId);
  const targetTodo = todos.find((item) => item.id === targetTodoId);
  if (!todo || !targetTodo || todo.priority !== targetTodo.priority) {
    throw new SyncModelError("TODO_NOT_FOUND", "待办不存在");
  }

  const nextTodos = todos.filter((item) => item.id !== todoId);
  const targetIndex = nextTodos.findIndex((item) => item.id === targetTodoId);
  if (targetIndex === -1) {
    throw new SyncModelError("TODO_NOT_FOUND", "待办不存在");
  }

  nextTodos.splice(targetIndex, 0, todo);
  return nextTodos;
}

function parseImportedMarkdown(
  markdown: string,
  timestamp: string,
  version: number
): TodoItem[] {
  try {
    return parseMarkdown(markdown).map((todo) => ({
      ...todo,
      updatedAt: timestamp,
      version
    }));
  } catch {
    throw new SyncModelError("INVALID_MARKDOWN", "Markdown 内容无法解析");
  }
}

function touchList(list: TodoListDocument, updatedAt: string, version: number): void {
  list.updatedAt = updatedAt;
  list.version = version;
}

function touchTodo(todo: TodoItem, updatedAt: string, version: number): void {
  todo.updatedAt = updatedAt;
  todo.version = version;
}

function normalizeListName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new SyncModelError("EMPTY_LIST_NAME", "TodoList 名称不能为空");
  }

  return normalized;
}

function normalizeTodoTextForModel(text: string): string {
  try {
    return normalizeTodoText(text);
  } catch {
    throw new SyncModelError("EMPTY_TODO", "待办内容不能为空");
  }
}

function createSafeFileBaseName(name: string): string {
  const safeName = name
    .trim()
    .split("")
    .map((char) => (isSafeFileNameChar(char) ? char : "-"))
    .join("")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return safeName || "todolist";
}

function isSafeFileNameChar(char: string): boolean {
  const forbiddenChars = new Set(["<", ">", ":", "\"", "/", "\\", "|", "?", "*"]);
  return !forbiddenChars.has(char) && char.charCodeAt(0) >= 32;
}
