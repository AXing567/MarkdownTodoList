# Fix Todo List Flicker After Mutations

## Goal

Prevent the desktop and Android clients from briefly switching to the first todo list after creating, completing, restoring, editing, deleting, or reordering todos.

## Requirements

- Keep the currently selected list stable during local mutations and remote sync change notifications.
- Preserve existing list summary refresh behavior.
- Apply the fix in the shared renderer so both desktop and Android clients benefit.

## Acceptance Criteria

- [ ] Mutating a todo does not briefly render the first list before returning to the active list.
- [ ] Manual refresh and initial load still select the current list when possible and fall back to the first list only when needed.
- [ ] Lint, tests, typecheck, and builds pass.
- [ ] Windows and Android client packages are rebuilt for user testing.

## Technical Notes

- Root cause candidate: the sync subscription callback closes over a stale `activeList` value and calls `loadLists` without the current list id.
- Fix should use a ref or equivalent current-state mechanism for asynchronous change callbacks.
