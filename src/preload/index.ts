import { contextBridge, ipcRenderer } from "electron";
import type {
  AddTodoRequest,
  CreateTodoListRequest,
  DeleteTodoRequest,
  ReorderTodoRequest,
  SaveMarkdownToLocalRequest,
  TodoApi,
  ToggleTodoRequest,
  UpdateTodoRequest
} from "../shared/todoTypes";

const todoApi: TodoApi = {
  listTodoLists: () => ipcRenderer.invoke("todo:list"),
  createTodoList: (request: CreateTodoListRequest) =>
    ipcRenderer.invoke("todo:create", request),
  openTodoList: () => ipcRenderer.invoke("todo:open"),
  readTodoList: (listId: string) => ipcRenderer.invoke("todo:read", listId),
  addTodo: (request: AddTodoRequest) => ipcRenderer.invoke("todo:add", request),
  toggleTodo: (request: ToggleTodoRequest) => ipcRenderer.invoke("todo:toggle", request),
  updateTodo: (request: UpdateTodoRequest) => ipcRenderer.invoke("todo:update", request),
  deleteTodo: (request: DeleteTodoRequest) => ipcRenderer.invoke("todo:delete", request),
  reorderTodo: (request: ReorderTodoRequest) => ipcRenderer.invoke("todo:reorder", request),
  removeTodoList: (listId: string) => ipcRenderer.invoke("todo:remove", listId),
  revealFile: (listId: string) => ipcRenderer.invoke("todo:reveal", listId),
  importMarkdown: (request: SaveMarkdownToLocalRequest) =>
    ipcRenderer.invoke("todo:import-markdown", request),
  exportMarkdown: (listId: string) => ipcRenderer.invoke("todo:export-markdown", listId),
  saveMarkdownToLocal: (request: SaveMarkdownToLocalRequest) =>
    ipcRenderer.invoke("todo:import-markdown", request)
};

contextBridge.exposeInMainWorld("todoApi", todoApi);
