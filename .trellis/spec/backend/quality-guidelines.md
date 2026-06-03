# Backend Quality Guidelines

## Required Checks

Run these before handing off app changes:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Required Patterns

* Use `src/main/markdownTodo.ts` for Markdown checkbox parsing and writing.
* Use `src/shared/todoTypes.ts` for IPC contracts.
* Preserve `scripts/run-with-electron-env.cjs`; it deletes
  `ELECTRON_RUN_AS_NODE` for Electron dev/package commands.

## Tests Required

Add or update Vitest coverage whenever Markdown format behavior changes.
Todo text editing must preserve the checkbox completion marker and rewrite only
the text portion of the Markdown task line.

## Review Checklist

* Does every file mutation round-trip back to the renderer?
* Are duplicate names, missing files, empty text, and missing todos handled?
* Are scripts runnable in environments that set `ELECTRON_RUN_AS_NODE=1`?
