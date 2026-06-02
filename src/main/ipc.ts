import { ipcMain } from "electron";
import type { ApiErrorPayload } from "../shared/todoTypes";
import { AppError, toErrorMessage } from "./errors";
import {
  addTodo,
  createTodoList,
  listTodoLists,
  openTodoList,
  readTodoList,
  removeTodoList,
  revealFile,
  toggleTodo
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
  ipcMain.handle("todo:remove", (_event, listId) =>
    withErrors(() => removeTodoList(listId))
  );
  ipcMain.handle("todo:reveal", (_event, listId) => withErrors(() => revealFile(listId)));
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
