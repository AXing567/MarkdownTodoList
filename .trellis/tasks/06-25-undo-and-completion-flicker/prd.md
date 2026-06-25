# Add Undo and Fix Completion Flicker

## Goal

Add a reliable undo flow for accidental todo changes and remove the brief disappearance/reappearance flicker when completing a todo.

## Requirements

- Ctrl+Z should undo the latest persisted todo action for the active list.
- Undo should work after common mutations: add, complete/restore, edit, delete, and reorder todos.
- Undo must write the previous document back through the existing app persistence/sync API instead of only changing renderer state.
- Completion animation should keep the completed row visible smoothly before it is hidden when completed items are not shown.
- Preserve existing local, remote, and mobile-compatible behavior.

## Acceptance Criteria

- [ ] Pressing Ctrl+Z after a todo mutation restores the previous active list state.
- [ ] Undo refreshes list summaries and sync status.
- [ ] Completing a todo no longer flashes/disappears before the completion effect finishes.
- [ ] Existing lint, tests, typecheck, and build pass.

## Technical Notes

- Existing state guidelines prefer persisted documents returned by IPC/API after mutations.
- Existing `importMarkdown` can be used as a document replacement path if it preserves list IDs.
- Completion flicker likely comes from a refresh/read cycle replacing the active document while the completion-effect key is still settling.
