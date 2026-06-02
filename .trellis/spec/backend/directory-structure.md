# Backend Directory Structure

## Scope / Trigger

The backend is the Electron main process. It owns native dialogs, filesystem
access, Markdown parsing/writing, the registry, and IPC handlers.

## Directory Layout

```text
src/
|-- main/
|   |-- errors.ts
|   |-- index.ts
|   |-- ipc.ts
|   |-- markdownTodo.ts
|   |-- markdownTodo.test.ts
|   |-- paths.ts
|   |-- todoRegistry.ts
|   +-- todoService.ts
|-- preload/
|   +-- index.ts
+-- shared/
    +-- todoTypes.ts
```

## Contracts

* `ipc.ts` registers Electron IPC handlers.
* `todoService.ts` coordinates dialogs, registry, and file operations.
* `markdownTodo.ts` is the single source of truth for Markdown parsing/writing.
* `todoRegistry.ts` owns `data/todolist-registry.json`.

## Wrong vs Correct

Wrong: duplicate Markdown checkbox parsing in renderer code.

Correct: add behavior to `markdownTodo.ts` and cover it with Vitest.
