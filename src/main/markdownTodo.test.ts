import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  addTodoToFile,
  createEmptyMarkdown,
  parseMarkdown,
  setTodoCompletedInFile,
  updateTodoTextInFile
} from "./markdownTodo";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("markdownTodo", () => {
  it("creates the required priority sections", () => {
    expect(createEmptyMarkdown()).toBe("# P0\n\n# P1\n\n# P2\n");
  });

  it("parses checkbox todos below priority headings", () => {
    const todos = parseMarkdown("# P0\n- [ ] 吃早餐\n- [x] 写代码\n\n# P1\n- [X] 复盘\n");

    expect(todos).toEqual([
      expect.objectContaining({ priority: "P0", text: "吃早餐", completed: false }),
      expect.objectContaining({ priority: "P0", text: "写代码", completed: true }),
      expect.objectContaining({ priority: "P1", text: "复盘", completed: true })
    ]);
  });

  it("adds todos under the target priority and preserves markdown sections", async () => {
    const filePath = await createTempTodoFile("# P0\n\n# P1\n\n# P2\n");

    await addTodoToFile(filePath, "P1", "  处理 邮件  ");

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n\n# P1\n- [ ] 处理 邮件\n\n# P2\n"
    );
  });

  it("toggles the matching todo while leaving other lines unchanged", async () => {
    const filePath = await createTempTodoFile("# P0\n- [ ] 吃早餐\n\n# P1\n- [ ] 吃早餐\n");
    const [firstTodo] = parseMarkdown(await readFile(filePath, "utf8"));

    if (!firstTodo) {
      throw new Error("Expected test todo to exist");
    }

    await setTodoCompletedInFile(filePath, firstTodo.id, true);

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n- [x] 吃早餐\n\n# P1\n- [ ] 吃早餐\n"
    );
  });

  it("updates todo text while preserving completion state", async () => {
    const filePath = await createTempTodoFile("# P0\n- [x] 旧内容\n");
    const [todo] = parseMarkdown(await readFile(filePath, "utf8"));

    if (!todo) {
      throw new Error("Expected test todo to exist");
    }

    await updateTodoTextInFile(filePath, todo.id, "  新 内容  ");

    await expect(readFile(filePath, "utf8")).resolves.toBe("# P0\n- [x] 新 内容\n");
  });
});

async function createTempTodoFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "markdown-todolist-"));
  tempDirs.push(dir);
  const filePath = join(dir, "todos.md");
  await writeFile(filePath, content, "utf8");
  return filePath;
}
