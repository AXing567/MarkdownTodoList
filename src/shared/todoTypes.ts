export const PRIORITIES = ["P0", "P1", "P2"] as const;

export type Priority = (typeof PRIORITIES)[number];

export type TodoItem = {
  id: string;
  priority: Priority;
  text: string;
  completed: boolean;
};

export type TodoListSummary = {
  id: string;
  name: string;
  filePath: string;
  storage: "managed" | "external";
  updatedAt: string;
};

export type TodoListDocument = TodoListSummary & {
  todos: TodoItem[];
};

export type CreateTodoListRequest = {
  name: string;
  mode: "managed" | "external";
};

export type AddTodoRequest = {
  listId: string;
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

export type TodoApi = {
  listTodoLists: () => Promise<TodoListSummary[]>;
  createTodoList: (request: CreateTodoListRequest) => Promise<TodoListDocument>;
  openTodoList: () => Promise<TodoListDocument | null>;
  readTodoList: (listId: string) => Promise<TodoListDocument>;
  addTodo: (request: AddTodoRequest) => Promise<TodoListDocument>;
  toggleTodo: (request: ToggleTodoRequest) => Promise<TodoListDocument>;
  updateTodo: (request: UpdateTodoRequest) => Promise<TodoListDocument>;
  deleteTodo: (request: DeleteTodoRequest) => Promise<TodoListDocument>;
  removeTodoList: (listId: string) => Promise<TodoListSummary[]>;
  revealFile: (listId: string) => Promise<void>;
};

export type ApiErrorPayload = {
  message: string;
  code: string;
};
