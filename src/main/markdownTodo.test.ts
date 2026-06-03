import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  addTodoToFile,
  createEmptyMarkdown,
  deleteTodoFromFile,
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

  it("parses indented continuation lines as multiline todo text", () => {
    const todos = parseMarkdown("# P0\n- [ ] 第一行\n  第二行\n  第三行\n\n# P1\n");

    expect(todos).toEqual([
      expect.objectContaining({
        priority: "P0",
        text: "第一行\n第二行\n第三行",
        completed: false
      })
    ]);
  });

  it("adds todos under the target priority and preserves markdown sections", async () => {
    const filePath = await createTempTodoFile("# P0\n\n# P1\n\n# P2\n");

    await addTodoToFile(filePath, "P1", "  处理 邮件  ");

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n\n# P1\n- [ ] 处理 邮件\n\n# P2\n"
    );
  });

  it("adds multiline todos using markdown continuation lines", async () => {
    const filePath = await createTempTodoFile("# P0\n\n# P1\n\n# P2\n");

    await addTodoToFile(filePath, "P1", "  第一行\n  第二行  \n\n第三行  ");

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n\n# P1\n- [ ] 第一行\n  第二行\n  \n  第三行\n\n# P2\n"
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

  it("toggles multiline todos while preserving continuation lines", async () => {
    const filePath = await createTempTodoFile("# P0\n- [ ] 第一行\n  第二行\n  第三行\n");
    const [todo] = parseMarkdown(await readFile(filePath, "utf8"));

    if (!todo) {
      throw new Error("Expected test todo to exist");
    }

    await setTodoCompletedInFile(filePath, todo.id, true);

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n- [x] 第一行\n  第二行\n  第三行\n"
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

  it("updates multiline todo text while replacing old continuation lines", async () => {
    const filePath = await createTempTodoFile("# P0\n- [x] 旧内容\n  旧第二行\n\n# P1\n");
    const [todo] = parseMarkdown(await readFile(filePath, "utf8"));

    if (!todo) {
      throw new Error("Expected test todo to exist");
    }

    await updateTodoTextInFile(filePath, todo.id, "新第一行\n 新第二行 \n新第三行");

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n- [x] 新第一行\n  新第二行\n  新第三行\n\n# P1\n"
    );
  });

  it("deletes only the matching todo line", async () => {
    const filePath = await createTempTodoFile(
      "# P0\n- [ ] 吃早餐\n- [x] 写代码\n\n# P1\n- [ ] 复盘\n"
    );
    const [, secondTodo] = parseMarkdown(await readFile(filePath, "utf8"));

    if (!secondTodo) {
      throw new Error("Expected test todo to exist");
    }

    await deleteTodoFromFile(filePath, secondTodo.id);

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n- [ ] 吃早餐\n\n# P1\n- [ ] 复盘\n"
    );
  });

  it("deletes multiline todo continuation lines", async () => {
    const filePath = await createTempTodoFile(
      "# P0\n- [ ] 保留\n- [x] 删除第一行\n  删除第二行\n  删除第三行\n- [ ] 也保留\n"
    );
    const [, secondTodo] = parseMarkdown(await readFile(filePath, "utf8"));

    if (!secondTodo) {
      throw new Error("Expected test todo to exist");
    }

    await deleteTodoFromFile(filePath, secondTodo.id);

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "# P0\n- [ ] 保留\n- [ ] 也保留\n"
    );
  });
});

async function createTempTodoFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "markdown-todolist-"));
  tempDirs.push(dir);
  const filePath = join(dir, "todos.md");
  await writeFile(filePath, content, "utf8");
  return filePath;
}
