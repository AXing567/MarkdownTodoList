import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { TodoStore } from "./store";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("TodoStore", () => {
  it("persists applied operations", async () => {
    const store = new TodoStore(await createTempStorePath());

    const result = await store.applyOperations([
      {
        id: "op-create",
        type: "createList",
        createdAt: "2026-06-15T00:00:00.000Z",
        payload: { listId: "list-1", name: "Today" }
      },
      {
        id: "op-add",
        type: "addTodo",
        createdAt: "2026-06-15T00:01:00.000Z",
        payload: { listId: "list-1", todoId: "todo-1", priority: "P0", text: "Sync" }
      }
    ]);

    expect(result.acceptedOperationIds).toEqual(["op-create", "op-add"]);
    expect(result.snapshot.version).toBe(2);

    const reloadedStore = new TodoStore(await reuseLastStorePath());
    await expect(reloadedStore.readSnapshot()).resolves.toEqual(result.snapshot);
  });
});

async function createTempStorePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "markdown-todolist-sync-store-"));
  tempDirs.push(dir);
  return join(dir, "sync.json");
}

async function reuseLastStorePath(): Promise<string> {
  const dir = tempDirs.at(-1);
  if (!dir) {
    throw new Error("Expected temp dir");
  }

  return join(dir, "sync.json");
}
