# Backend Error Handling

## Scope / Trigger

Use this spec for Electron main-process services and IPC handlers.

## Error Type

Expected user-facing failures use `AppError`:

```ts
new AppError("EMPTY_TODO", "待办内容不能为空。");
```

## IPC Contract

IPC handlers are wrapped by `withErrors()` in `src/main/ipc.ts`. Errors are
serialized as:

```ts
type ApiErrorPayload = {
  message: string;
  code: string;
};
```

## Validation & Error Matrix

| Code | Trigger |
|------|---------|
| `EMPTY_LIST_NAME` | TodoList name is blank |
| `EMPTY_TODO` | Todo text is blank |
| `FILE_SELECTION_CANCELLED` | User cancels external save location |
| `FILE_EXISTS` | Target Markdown file already exists |
| `LIST_NOT_FOUND` | Registry has no matching list |
| `FILE_NOT_FOUND` | Registered Markdown file cannot be accessed |
| `TODO_NOT_FOUND` | Toggle request references a missing todo |
| `UNKNOWN_ERROR` | Unexpected error |

## Wrong vs Correct

Wrong: throw raw filesystem errors for expected user actions.

Correct: convert expected failures to `AppError` and let IPC serialize them.
