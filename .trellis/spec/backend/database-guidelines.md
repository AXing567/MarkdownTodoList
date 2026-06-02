# Backend Persistence Guidelines

## Scope / Trigger

This project has no database. Markdown files and a JSON registry are the
persistence layer.

## Contracts

* Managed Markdown files are stored under `data/todolists/` during development.
* Packaged apps store managed files under Electron `userData`.
* Registry entries match `TodoListSummary` from `src/shared/todoTypes.ts`.
* Registry path is resolved by `getRegistryPath()` in `src/main/paths.ts`.

## Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| Registry missing | Return an empty list |
| Registry invalid JSON | Return an empty list |
| List not found | Throw `AppError("LIST_NOT_FOUND", ...)` |
| File missing | Throw `AppError("FILE_NOT_FOUND", ...)` |

## Migration Rule

If the registry schema changes, add a versioned migration in `todoRegistry.ts`
and cover the behavior with tests.
