# Frontend Component Guidelines

## Scope / Trigger

Use this spec when building React UI in `src/renderer/src/`.

## Component Contract

* Components are TypeScript functions.
* Use `ReactElement` return types when an explicit return type is needed.
* Import domain types from `src/shared/todoTypes.ts`.
* Icon-only buttons must include `aria-label` and `title`.

## Styling Contract

Use `src/renderer/src/styles.css`. Keep repeated controls such as icon buttons,
priority columns, todo rows, and counters at stable sizes.

## Good / Bad Cases

Good:

```tsx
<button title="刷新" aria-label="刷新 TodoList">
  <RefreshCw size={18} />
</button>
```

Bad:

```tsx
<button>
  <RefreshCw size={18} />
</button>
```
