import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function getManagedTodoDir(): string {
  const baseDir = app.isPackaged ? app.getPath("userData") : process.cwd();
  const todoDir = join(baseDir, "data", "todolists");
  mkdirSync(todoDir, { recursive: true });
  return todoDir;
}

export function getRegistryPath(): string {
  const baseDir = app.isPackaged ? app.getPath("userData") : process.cwd();
  const dataDir = join(baseDir, "data");
  mkdirSync(dataDir, { recursive: true });
  return join(dataDir, "todolist-registry.json");
}
