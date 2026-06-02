# Frontend Directory Structure

## Scope / Trigger

Use this spec for Electron renderer UI work. Renderer code must stay UI-focused
and call filesystem behavior only through the preload API.

## Directory Layout

```text
src/
|-- renderer/
|   |-- index.html
|   +-- src/
|       |-- App.tsx
|       |-- main.tsx
|       |-- styles.css
|       +-- vite-env.d.ts
|-- preload/
|   +-- index.ts
+-- shared/
    +-- todoTypes.ts
```

## Contracts

* Renderer components consume `window.todoApi`.
* Cross-layer types belong in `src/shared/todoTypes.ts`.
* Renderer code must not import Node filesystem modules or Electron main-process
  APIs.

## Good / Bad Cases

Good: `src/renderer/src/App.tsx` calls `window.todoApi.addTodo()`.

Bad: a renderer component imports `node:fs` or `electron`.
