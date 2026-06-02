# Frontend Hook Guidelines

## Scope / Trigger

Use this spec when extracting renderer stateful logic.

## Contract

The app currently keeps state directly in `App.tsx`. Extract a custom hook only
when the same stateful logic is reused or the component becomes difficult to
scan.

## Naming

Custom hooks must start with `use` and live under `src/renderer/src/` until a
feature folder structure exists.

## Data Fetching

Call `window.todoApi` from effects or event handlers. After a mutation, prefer
the persisted document returned by the IPC handler over optimistic local edits.
