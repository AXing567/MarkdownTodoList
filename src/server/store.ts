import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  applySyncOperations,
  createEmptySnapshot,
  SyncModelError
} from "../shared/syncModel";
import {
  type SyncOperation,
  type SyncOperationResponse,
  type SyncServerSnapshot
} from "../shared/todoTypes";

type StoreFile = {
  snapshot: SyncServerSnapshot;
};

export class TodoStore {
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async readSnapshot(): Promise<SyncServerSnapshot> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as StoreFile;
      if (!isSnapshot(parsed.snapshot)) {
        return createEmptySnapshot();
      }

      return parsed.snapshot;
    } catch {
      return createEmptySnapshot();
    }
  }

  async applyOperations(operations: SyncOperation[]): Promise<SyncOperationResponse> {
    if (operations.length === 0) {
      return {
        snapshot: await this.readSnapshot(),
        acceptedOperationIds: []
      };
    }

    return this.enqueueWrite(async () => {
      const snapshot = await this.readSnapshot();
      const nextSnapshot = applySyncOperations(snapshot, operations);
      await this.writeSnapshot(nextSnapshot);
      return {
        snapshot: nextSnapshot,
        acceptedOperationIds: operations.map((operation) => operation.id)
      };
    });
  }

  private async writeSnapshot(snapshot: SyncServerSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify({ snapshot }, null, 2), "utf8");
  }

  private async enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const previousWrite = this.writeQueue;
    let releaseWrite: () => void = () => undefined;
    this.writeQueue = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    await previousWrite;
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SyncModelError) {
        throw error;
      }
      throw error;
    } finally {
      releaseWrite();
    }
  }
}

function isSnapshot(value: unknown): value is SyncServerSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { version?: unknown; lists?: unknown };
  return typeof candidate.version === "number" && Array.isArray(candidate.lists);
}
