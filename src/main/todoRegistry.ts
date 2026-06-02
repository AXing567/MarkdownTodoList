import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { TodoListSummary } from "../shared/todoTypes";

type RegistryFile = {
  lists: TodoListSummary[];
};

export async function readRegistry(registryPath: string): Promise<TodoListSummary[]> {
  try {
    const content = await readFile(registryPath, "utf8");
    const parsed = JSON.parse(content) as RegistryFile;
    if (!Array.isArray(parsed.lists)) {
      return [];
    }

    return parsed.lists;
  } catch {
    return [];
  }
}

export async function upsertList(
  registryPath: string,
  list: TodoListSummary
): Promise<TodoListSummary[]> {
  const lists = await readRegistry(registryPath);
  const existingIndex = lists.findIndex((item) => item.id === list.id);
  const nextLists =
    existingIndex >= 0
      ? lists.map((item) => (item.id === list.id ? list : item))
      : [list, ...lists];

  await writeRegistry(registryPath, nextLists);
  return nextLists;
}

export async function findList(
  registryPath: string,
  listId: string
): Promise<TodoListSummary | null> {
  const lists = await readRegistry(registryPath);
  return lists.find((list) => list.id === listId) ?? null;
}

async function writeRegistry(registryPath: string, lists: TodoListSummary[]): Promise<void> {
  mkdirSync(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify({ lists }, null, 2), "utf8");
}
