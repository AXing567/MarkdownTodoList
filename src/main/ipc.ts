import { ipcMain } from "electron";
import type { ApiErrorPayload } from "../shared/todoTypes";
import { AppError, toErrorMessage } from "./errors";
import {
  addTodo,
  createTodoList,
  deleteTodo,
  exportMarkdown,
  importMarkdown,
  listTodoLists,
  openTodoList,
  readTodoList,
  removeTodoList,
  reorderTodo,
  revealFile,
  toggleTodo,
  updateTodo
} from "./todoService";

export function registerIpcHandlers(): void {
  ipcMain.handle("todo:list", () => withErrors(listTodoLists));
  ipcMain.handle("todo:create", (_event, request) =>
    withErrors(() => createTodoList(request))
  );
  ipcMain.handle("todo:open", () => withErrors(openTodoList));
  ipcMain.handle("todo:read", (_event, listId) => withErrors(() => readTodoList(listId)));
  ipcMain.handle("todo:add", (_event, request) => withErrors(() => addTodo(request)));
  ipcMain.handle("todo:toggle", (_event, request) =>
    withErrors(() => toggleTodo(request))
  );
  ipcMain.handle("todo:update", (_event, request) =>
    withErrors(() => updateTodo(request))
  );
  ipcMain.handle("todo:delete", (_event, request) =>
    withErrors(() => deleteTodo(request))
  );
  ipcMain.handle("todo:reorder", (_event, request) =>
    withErrors(() => reorderTodo(request))
  );
  ipcMain.handle("todo:remove", (_event, listId) =>
    withErrors(() => removeTodoList(listId))
  );
  ipcMain.handle("todo:reveal", (_event, listId) => withErrors(() => revealFile(listId)));
  ipcMain.handle("todo:import-markdown", (_event, request) =>
    withErrors(() => importMarkdown(request))
  );
  ipcMain.handle("todo:export-markdown", (_event, listId) =>
    withErrors(() => exportMarkdown(listId))
  );
}

async function withErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const payload: ApiErrorPayload = {
      message: toErrorMessage(error),
      code: error instanceof AppError ? error.code : "UNKNOWN_ERROR"
    };
    throw new Error(JSON.stringify(payload), { cause: error });
  }
}
