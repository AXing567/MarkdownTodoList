import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { PRIORITIES, type Priority, type TodoItem } from "../shared/todoTypes";
import { AppError } from "./errors";

type ParsedLine = {
  raw: string;
  priority: Priority | null;
  todoId: string | null;
  todoLinePart: "task" | "continuation" | null;
};

type ParsedMarkdown = {
  lines: ParsedLine[];
  todos: TodoItem[];
};

const headingPattern = /^#\s+(P[0-2])\s*$/;
const todoPattern = /^(\s*)-\s+\[([ xX])]\s+(.*)$/;
const continuationPattern = /^ {2,}(.*)$/;

export function createEmptyMarkdown(): string {
  return PRIORITIES.map((priority) => `# ${priority}\n`).join("\n").trimEnd() + "\n";
}

export function parseMarkdown(content: string): TodoItem[] {
  return parseMarkdownWithLines(content).todos;
}

export async function readTodoFile(filePath: string): Promise<TodoItem[]> {
  const content = await readFile(filePath, "utf8");
  return parseMarkdown(content);
}

export async function ensureTodoFile(filePath: string): Promise<void> {
  await writeFile(filePath, createEmptyMarkdown(), { flag: "wx", encoding: "utf8" });
}

export async function addTodoToFile(
  filePath: string,
  priority: Priority,
  text: string
): Promise<TodoItem[]> {
  const normalizedText = normalizeTodoText(text);
  const content = await readFile(filePath, "utf8").catch(() => createEmptyMarkdown());
  const nextContent = insertTodo(content, priority, normalizedText);
  await writeFile(filePath, nextContent, "utf8");
  return parseMarkdown(nextContent);
}

export async function setTodoCompletedInFile(
  filePath: string,
  todoId: string,
  completed: boolean
): Promise<TodoItem[]> {
  const content = await readFile(filePath, "utf8");
  const parsed = parseMarkdownWithLines(content);
  let changed = false;

  const nextLines = parsed.lines.map((line) => {
    if (line.todoId !== todoId) {
      return line.raw;
    }

    if (line.todoLinePart === "continuation") {
      return line.raw;
    }

    changed = true;
    return line.raw.replace(todoPattern, `$1- [${completed ? "x" : " "}] $3`);
  });

  if (!changed) {
    throw new AppError("TODO_NOT_FOUND", "没有找到对应的待办事项。");
  }

  const nextContent = normalizeTrailingNewline(nextLines.join("\n"));
  await writeFile(filePath, nextContent, "utf8");
  return parseMarkdown(nextContent);
}

export async function updateTodoTextInFile(
  filePath: string,
  todoId: string,
  text: string
): Promise<TodoItem[]> {
  const normalizedText = normalizeTodoText(text);
  const content = await readFile(filePath, "utf8");
  const parsed = parseMarkdownWithLines(content);
  let changed = false;

  const nextLines = parsed.lines.flatMap((line) => {
    if (line.todoId !== todoId) {
      return [line.raw];
    }

    if (line.todoLinePart === "continuation") {
      return [];
    }

    changed = true;
    const todoMatch = line.raw.match(todoPattern);
    if (!todoMatch) {
      return [line.raw];
    }

    return createTodoMarkdownLines(todoMatch[2] ?? " ", normalizedText, todoMatch[1] ?? "");
  });

  if (!changed) {
    throw new AppError("TODO_NOT_FOUND", "没有找到对应的待办事项。");
  }

  const nextContent = normalizeTrailingNewline(nextLines.join("\n"));
  await writeFile(filePath, nextContent, "utf8");
  return parseMarkdown(nextContent);
}

export async function deleteTodoFromFile(filePath: string, todoId: string): Promise<TodoItem[]> {
  const content = await readFile(filePath, "utf8");
  const parsed = parseMarkdownWithLines(content);
  let changed = false;

  const nextLines = parsed.lines.flatMap((line) => {
    if (line.todoId !== todoId) {
      return [line.raw];
    }

    if (line.todoLinePart === "task") {
      changed = true;
    }
    return [];
  });

  if (!changed) {
    throw new AppError("TODO_NOT_FOUND", "没有找到对应的待办事项。");
  }

  const nextContent = normalizeTrailingNewline(nextLines.join("\n"));
  await writeFile(filePath, nextContent, "utf8");
  return parseMarkdown(nextContent);
}

export function deriveDefaultName(filePath: string): string {
  return basename(filePath).replace(/\.md$/i, "");
}

export function createListId(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex").slice(0, 16);
}

function parseMarkdownWithLines(content: string): ParsedMarkdown {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const sourceLines = normalizedContent.split("\n");
  const lines: ParsedLine[] = [];
  const todos: TodoItem[] = [];
  let currentPriority: Priority | null = null;
  const occurrenceByStableKey = new Map<string, number>();

  for (let index = 0; index < sourceLines.length; index += 1) {
    const raw = sourceLines[index] ?? "";
    const headingMatch = raw.match(headingPattern);
    if (headingMatch?.[1] && isPriority(headingMatch[1])) {
      currentPriority = headingMatch[1];
      lines.push({ raw, priority: currentPriority, todoId: null, todoLinePart: null });
      continue;
    }

    const previousLine = lines.at(-1);
    const continuationMatch = raw.match(continuationPattern);
    if (continuationMatch && previousLine?.todoId && previousLine.priority === currentPriority) {
      lines.push({
        raw,
        priority: currentPriority,
        todoId: previousLine.todoId,
        todoLinePart: "continuation"
      });
      continue;
    }

    const todoMatch = raw.match(todoPattern);
    if (todoMatch && currentPriority) {
      const completedMark = todoMatch[2] ?? " ";
      const textLines = [todoMatch[3]?.trim() ?? ""];
      for (let nextIndex = index + 1; nextIndex < sourceLines.length; nextIndex += 1) {
        const nextRaw = sourceLines[nextIndex] ?? "";
        const continuationMatch = nextRaw.match(continuationPattern);
        if (!continuationMatch) {
          break;
        }

        textLines.push(continuationMatch[1]?.trimEnd() ?? "");
      }
      const text = textLines.join("\n");
      const stableKey = `${currentPriority}:${text}`;
      const occurrence = occurrenceByStableKey.get(stableKey) ?? 0;
      occurrenceByStableKey.set(stableKey, occurrence + 1);
      const todoId = createTodoId(currentPriority, text, occurrence);

      todos.push({
        id: todoId,
        priority: currentPriority,
        text,
        completed: completedMark.toLowerCase() === "x"
      });
      lines.push({ raw, priority: currentPriority, todoId, todoLinePart: "task" });
      continue;
    }

    lines.push({ raw, priority: currentPriority, todoId: null, todoLinePart: null });
  }

  return { lines, todos };
}

function insertTodo(content: string, priority: Priority, text: string): string {
  const normalizedContent = ensurePrioritySections(content);
  const lines = normalizedContent.replace(/\r\n/g, "\n").split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === `# ${priority}`);

  if (headingIndex === -1) {
    throw new AppError("PRIORITY_SECTION_MISSING", `Markdown 缺少 # ${priority} 分区。`);
  }

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (headingPattern.test(lines[index] ?? "")) {
      sectionEnd = index;
      break;
    }
  }

  let insertAt = sectionEnd;
  while (insertAt > headingIndex + 1 && (lines[insertAt - 1] ?? "").trim() === "") {
    insertAt -= 1;
  }

  lines.splice(insertAt, 0, ...createTodoMarkdownLines(" ", text));
  return normalizeTrailingNewline(lines.join("\n"));
}

function ensurePrioritySections(content: string): string {
  const normalizedContent = normalizeTrailingNewline(content.replace(/\r\n/g, "\n"));
  const existingLines = normalizedContent.split("\n");
  const missingSections = PRIORITIES.filter(
    (priority) => !existingLines.some((line) => line.trim() === `# ${priority}`)
  );

  if (missingSections.length === 0) {
    return normalizedContent;
  }

  const suffix = missingSections.map((priority) => `# ${priority}\n`).join("\n");
  return normalizeTrailingNewline(`${normalizedContent}\n${suffix}`);
}

function normalizeTodoText(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) {
    throw new AppError("EMPTY_TODO", "待办内容不能为空。");
  }

  return normalized;
}

function createTodoId(priority: Priority, text: string, occurrence: number): string {
  return createHash("sha256")
    .update(`${priority}:${text}:${occurrence}`)
    .digest("hex")
    .slice(0, 16);
}

function normalizeTrailingNewline(content: string): string {
  return content.replace(/\s*$/u, "\n");
}

function createTodoMarkdownLines(completedMark: string, text: string, indent = ""): string[] {
  const [firstLine = "", ...restLines] = text.split("\n");
  return [
    `${indent}- [${completedMark}] ${firstLine}`,
    ...restLines.map((line) => `${indent}  ${line}`)
  ];
}

function isPriority(value: string): value is Priority {
  return PRIORITIES.includes(value as Priority);
}

export function createUntitledFileName(name: string): string {
  const safeName = name
    .trim()
    .split("")
    .map((char) => (isSafeFileNameChar(char) ? char : "-"))
    .join("")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${safeName || `todolist-${randomUUID().slice(0, 8)}`}.md`;
}

function isSafeFileNameChar(char: string): boolean {
  const forbiddenChars = new Set(["<", ">", ":", "\"", "/", "\\", "|", "?", "*"]);
  return !forbiddenChars.has(char) && char.charCodeAt(0) >= 32;
}
