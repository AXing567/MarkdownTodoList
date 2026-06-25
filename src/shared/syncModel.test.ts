import { describe, expect, it } from "vitest";
import {
  applySyncOperation,
  createEmptySnapshot,
  exportListToMarkdown,
  SyncModelError
} from "./syncModel";
import type { SyncOperation } from "./todoTypes";

describe("syncModel", () => {
  it("imports markdown into a remote list and exports it back", () => {
    const snapshot = applySyncOperation(createEmptySnapshot(), {
      id: "op-import",
      type: "importMarkdown",
      createdAt: "2026-06-15T00:00:00.000Z",
      payload: {
        listId: "list-1",
        name: "Work",
        markdown: "# P0\n- [ ] Ship sync\n\n# P1\n- [x] Review\n"
      }
    });

    expect(snapshot.version).toBe(1);
    expect(snapshot.lists[0]).toEqual(
      expect.objectContaining({
        id: "list-1",
        name: "Work",
        storage: "remote",
        version: 1
      })
    );
    expect(snapshot.lists[0]?.todos).toEqual([
      expect.objectContaining({ priority: "P0", text: "Ship sync", completed: false }),
      expect.objectContaining({ priority: "P1", text: "Review", completed: true })
    ]);

    expect(exportListToMarkdown(snapshot.lists[0]!).markdown).toContain("- [ ] Ship sync");
  });

  it("replaces an existing remote list when importing the same list id", () => {
    const imported = applySyncOperation(createEmptySnapshot(), {
      id: "op-import",
      type: "importMarkdown",
      createdAt: "2026-06-15T00:00:00.000Z",
      payload: {
        listId: "list-1",
        name: "Work",
        markdown: "# P0\n- [ ] Old item\n"
      }
    });

    const restored = applySyncOperation(imported, {
      id: "op-restore",
      type: "importMarkdown",
      createdAt: "2026-06-15T00:01:00.000Z",
      payload: {
        listId: "list-1",
        name: "Work",
        markdown: "# P0\n- [x] Restored item\n\n# P1\n\n# P2\n"
      }
    });

    expect(restored.lists).toHaveLength(1);
    expect(restored.lists[0]?.todos).toEqual([
      expect.objectContaining({ text: "Restored item", completed: true })
    ]);
    expect(exportListToMarkdown(restored.lists[0]!).markdown).not.toContain("Old item");
  });

  it("applies todo mutations with increasing versions", () => {
    const createList: SyncOperation = {
      id: "op-create",
      type: "createList",
      createdAt: "2026-06-15T00:00:00.000Z",
      payload: { listId: "list-1", name: "Today" }
    };
    const addTodo: SyncOperation = {
      id: "op-add",
      type: "addTodo",
      createdAt: "2026-06-15T00:01:00.000Z",
      payload: { listId: "list-1", todoId: "todo-1", priority: "P0", text: "Build" }
    };
    const updateTodo: SyncOperation = {
      id: "op-update",
      type: "updateTodo",
      createdAt: "2026-06-15T00:02:00.000Z",
      payload: { listId: "list-1", todoId: "todo-1", text: "Build sync" }
    };
    const toggleTodo: SyncOperation = {
      id: "op-toggle",
      type: "toggleTodo",
      createdAt: "2026-06-15T00:03:00.000Z",
      payload: { listId: "list-1", todoId: "todo-1", completed: true }
    };

    const snapshot = [createList, addTodo, updateTodo, toggleTodo].reduce(
      applySyncOperation,
      createEmptySnapshot()
    );

    expect(snapshot.version).toBe(4);
    expect(snapshot.lists[0]?.updatedAt).toBe("2026-06-15T00:03:00.000Z");
    expect(snapshot.lists[0]?.todos[0]).toEqual(
      expect.objectContaining({
        text: "Build sync",
        completed: true,
        version: 4
      })
    );
  });

  it("reorders todos only within the same priority", () => {
    let snapshot = createEmptySnapshot();
    for (const operation of [
      {
        id: "op-create",
        type: "createList",
        createdAt: "2026-06-15T00:00:00.000Z",
        payload: { listId: "list-1", name: "Today" }
      },
      {
        id: "op-add-1",
        type: "addTodo",
        createdAt: "2026-06-15T00:01:00.000Z",
        payload: { listId: "list-1", todoId: "todo-1", priority: "P0", text: "First" }
      },
      {
        id: "op-add-2",
        type: "addTodo",
        createdAt: "2026-06-15T00:02:00.000Z",
        payload: { listId: "list-1", todoId: "todo-2", priority: "P0", text: "Second" }
      },
      {
        id: "op-reorder",
        type: "reorderTodo",
        createdAt: "2026-06-15T00:03:00.000Z",
        payload: { listId: "list-1", todoId: "todo-2", targetTodoId: "todo-1" }
      }
    ] satisfies SyncOperation[]) {
      snapshot = applySyncOperation(snapshot, operation);
    }

    expect(snapshot.lists[0]?.todos.map((todo) => todo.id)).toEqual(["todo-2", "todo-1"]);
  });

  it("throws model errors for missing lists and empty todo text", () => {
    expect(() =>
      applySyncOperation(createEmptySnapshot(), {
        id: "op-add",
        type: "addTodo",
        createdAt: "2026-06-15T00:00:00.000Z",
        payload: { listId: "missing", todoId: "todo-1", priority: "P0", text: "Build" }
      })
    ).toThrow(SyncModelError);

    const snapshot = applySyncOperation(createEmptySnapshot(), {
      id: "op-create",
      type: "createList",
      createdAt: "2026-06-15T00:00:00.000Z",
      payload: { listId: "list-1", name: "Today" }
    });

    expect(() =>
      applySyncOperation(snapshot, {
        id: "op-add-empty",
        type: "addTodo",
        createdAt: "2026-06-15T00:00:00.000Z",
        payload: { listId: "list-1", todoId: "todo-1", priority: "P0", text: "  " }
      })
    ).toThrow(SyncModelError);
  });
});
