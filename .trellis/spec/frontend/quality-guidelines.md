# Frontend Quality Guidelines

## Required Checks

Run these before handing off app changes:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Forbidden Patterns

* Direct filesystem or Electron main-process access from renderer components.
* `any` in TypeScript source.
* Hidden file-write failures caused by optimistic UI updates.

## Review Checklist

* Does the renderer depend only on shared contracts and preload APIs?
* Are IPC errors surfaced to the user?
* Does the UI work for no lists, no active list, and no visible todos?
* Do icon-only buttons have labels?
