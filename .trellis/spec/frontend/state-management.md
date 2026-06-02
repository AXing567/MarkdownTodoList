# Frontend State Management

## Scope / Trigger

Use this spec for renderer state decisions.

## Contracts

* Use React local state by default.
* Treat Markdown files and the registry as the source of truth.
* After mutations, refresh summaries and replace the active document with the
  IPC response.
* Derived values such as visible todos and completion counts can use `useMemo`.

## Validation & Error Matrix

| Case | UI behavior |
|------|-------------|
| Empty TodoList name | Show an error message before IPC |
| Empty todo text | Show an error message before IPC |
| IPC failure | Show the returned user-facing message |
| No lists | Show an empty state |
| No visible todos | Show `暂无待办` in the priority column |

## Wrong vs Correct

Wrong: mark a todo complete locally without waiting for the file write.

Correct: call `window.todoApi.toggleTodo()` and render the returned document.
