import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { TodoListSummary } from "../shared/todoTypes";
import { readRegistry, removeList, upsertList } from "./todoRegistry";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("todoRegistry", () => {
  it("removes a list from the registry without touching other entries", async () => {
    const registryPath = await createTempRegistryPath();
    const first = createSummary("first");
    const second = createSummary("second");
    await upsertList(registryPath, first);
    await upsertList(registryPath, second);

    const result = await removeList(registryPath, first.id);

    expect(result.removed).toBe(true);
    expect(result.lists).toEqual([second]);
    await expect(readRegistry(registryPath)).resolves.toEqual([second]);
  });

  it("keeps the registry unchanged when the list is missing", async () => {
    const registryPath = await createTempRegistryPath();
    const list = createSummary("only");
    await upsertList(registryPath, list);

    const result = await removeList(registryPath, "missing");

    expect(result.removed).toBe(false);
    expect(result.lists).toEqual([list]);
    await expect(readFile(registryPath, "utf8")).resolves.toContain(list.id);
  });
});

async function createTempRegistryPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "markdown-todolist-registry-"));
  tempDirs.push(dir);
  return join(dir, "registry.json");
}

function createSummary(id: string): TodoListSummary {
  return {
    id,
    name: id,
    filePath: `${id}.md`,
    storage: "managed",
    updatedAt: "2026-06-02T00:00:00.000Z"
  };
}
