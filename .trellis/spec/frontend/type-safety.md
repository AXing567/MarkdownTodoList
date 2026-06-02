# Frontend Type Safety

## Scope / Trigger

Use this spec for renderer and shared TypeScript contracts.

## Contracts

* TypeScript is strict, with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
* Cross-layer types live in `src/shared/todoTypes.ts`.
* `Priority` is derived from `PRIORITIES`, currently `P0`, `P1`, and `P2`.
* Do not use `any`.

## API Signature

```ts
type TodoApi = {
  listTodoLists: () => Promise<TodoListSummary[]>;
  createTodoList: (request: CreateTodoListRequest) => Promise<TodoListDocument>;
  openTodoList: () => Promise<TodoListDocument | null>;
  readTodoList: (listId: string) => Promise<TodoListDocument>;
  addTodo: (request: AddTodoRequest) => Promise<TodoListDocument>;
  toggleTodo: (request: ToggleTodoRequest) => Promise<TodoListDocument>;
  removeTodoList: (listId: string) => Promise<TodoListSummary[]>;
  revealFile: (listId: string) => Promise<void>;
};
```

## Tests Required

When shared types or priority values change, update Markdown tests and check all
renderer call sites with `npm run typecheck`.
