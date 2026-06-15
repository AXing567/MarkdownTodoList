export const PRIORITIES = ["P0", "P1", "P2"] as const;

export type Priority = (typeof PRIORITIES)[number];

export type TodoItem = {
  id: string;
  priority: Priority;
  text: string;
  completed: boolean;
  updatedAt?: string;
  version?: number;
};

export type TodoListSummary = {
  id: string;
  name: string;
  filePath: string;
  storage: "managed" | "external" | "remote";
  updatedAt: string;
  version?: number;
};

export type TodoListDocument = TodoListSummary & {
  todos: TodoItem[];
};

export type CreateTodoListRequest = {
  id?: string;
  name: string;
  mode: "managed" | "external";
};

export type AddTodoRequest = {
  listId: string;
  todoId?: string;
  priority: Priority;
  text: string;
};

export type ToggleTodoRequest = {
  listId: string;
  todoId: string;
  completed: boolean;
};

export type UpdateTodoRequest = {
  listId: string;
  todoId: string;
  text: string;
};

export type DeleteTodoRequest = {
  listId: string;
  todoId: string;
};

export type ReorderTodoRequest = {
  listId: string;
  todoId: string;
  targetTodoId: string;
};

export type ImportMarkdownRequest = {
  id?: string;
  name: string;
  markdown: string;
};

export type SaveMarkdownToLocalRequest = {
  id?: string;
  name: string;
  markdown: string;
};

export type ExportMarkdownResponse = {
  fileName: string;
  markdown: string;
};

export type SyncServerConfig = {
  serverUrl: string;
  accessKey: string;
};

export type SyncStatus = {
  mode: "local" | "remote";
  connected: boolean;
  pendingOperations: number;
  message: string;
};

export type TodoChangeEvent = {
  version: number;
};

export type CreateListOperation = {
  id: string;
  type: "createList";
  createdAt: string;
  payload: {
    listId: string;
    name: string;
  };
};

export type RemoveListOperation = {
  id: string;
  type: "removeList";
  createdAt: string;
  payload: {
    listId: string;
  };
};

export type AddTodoOperation = {
  id: string;
  type: "addTodo";
  createdAt: string;
  payload: {
    listId: string;
    todoId: string;
    priority: Priority;
    text: string;
  };
};

export type ToggleTodoOperation = {
  id: string;
  type: "toggleTodo";
  createdAt: string;
  payload: {
    listId: string;
    todoId: string;
    completed: boolean;
  };
};

export type UpdateTodoOperation = {
  id: string;
  type: "updateTodo";
  createdAt: string;
  payload: {
    listId: string;
    todoId: string;
    text: string;
  };
};

export type DeleteTodoOperation = {
  id: string;
  type: "deleteTodo";
  createdAt: string;
  payload: {
    listId: string;
    todoId: string;
  };
};

export type ReorderTodoOperation = {
  id: string;
  type: "reorderTodo";
  createdAt: string;
  payload: {
    listId: string;
    todoId: string;
    targetTodoId: string;
  };
};

export type ImportMarkdownOperation = {
  id: string;
  type: "importMarkdown";
  createdAt: string;
  payload: {
    listId: string;
    name: string;
    markdown: string;
  };
};

export type SyncOperation =
  | CreateListOperation
  | RemoveListOperation
  | AddTodoOperation
  | ToggleTodoOperation
  | UpdateTodoOperation
  | DeleteTodoOperation
  | ReorderTodoOperation
  | ImportMarkdownOperation;

export type SyncOperationRequest = {
  operations: SyncOperation[];
};

export type TodoApi = {
  listTodoLists: () => Promise<TodoListSummary[]>;
  createTodoList: (request: CreateTodoListRequest) => Promise<TodoListDocument>;
  openTodoList: () => Promise<TodoListDocument | null>;
  readTodoList: (listId: string) => Promise<TodoListDocument>;
  addTodo: (request: AddTodoRequest) => Promise<TodoListDocument>;
  toggleTodo: (request: ToggleTodoRequest) => Promise<TodoListDocument>;
  updateTodo: (request: UpdateTodoRequest) => Promise<TodoListDocument>;
  deleteTodo: (request: DeleteTodoRequest) => Promise<TodoListDocument>;
  reorderTodo: (request: ReorderTodoRequest) => Promise<TodoListDocument>;
  removeTodoList: (listId: string) => Promise<TodoListSummary[]>;
  revealFile: (listId: string) => Promise<void>;
  importMarkdown?: (request: ImportMarkdownRequest) => Promise<TodoListDocument>;
  exportMarkdown?: (listId: string) => Promise<ExportMarkdownResponse>;
  saveMarkdownToLocal?: (request: SaveMarkdownToLocalRequest) => Promise<TodoListDocument>;
  getSyncStatus?: () => SyncStatus;
  subscribeToChanges?: (listener: (event: TodoChangeEvent) => void) => () => void;
};

export type ApiErrorPayload = {
  message: string;
  code: string;
};

export type SyncServerSnapshot = {
  version: number;
  lists: TodoListDocument[];
};

export type SyncOperationResponse = {
  snapshot: SyncServerSnapshot;
  acceptedOperationIds: string[];
};
