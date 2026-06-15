import { PRIORITIES, type Priority, type TodoItem } from "./todoTypes";

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

export function renderMarkdown(todos: TodoItem[]): string {
  const lines: string[] = [];
  for (const priority of PRIORITIES) {
    lines.push(`# ${priority}`);
    for (const todo of todos.filter((item) => item.priority === priority)) {
      lines.push(...createTodoMarkdownLines(todo.completed ? "x" : " ", todo.text));
    }
    lines.push("");
  }

  return normalizeTrailingNewline(lines.join("\n"));
}

export function normalizeTodoText(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) {
    throw new Error("EMPTY_TODO");
  }

  return normalized;
}

export function createTodoMarkdownLines(
  completedMark: string,
  text: string,
  indent = ""
): string[] {
  const [firstLine = "", ...restLines] = text.split("\n");
  return [
    `${indent}- [${completedMark}] ${firstLine}`,
    ...restLines.map((line) => `${indent}  ${line}`)
  ];
}

export function parseMarkdownWithLines(content: string): ParsedMarkdown {
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
        const nextContinuationMatch = nextRaw.match(continuationPattern);
        if (!nextContinuationMatch) {
          break;
        }

        textLines.push(nextContinuationMatch[1]?.trimEnd() ?? "");
      }
      const text = textLines.join("\n");
      const stableKey = `${currentPriority}:${text}`;
      const occurrence = occurrenceByStableKey.get(stableKey) ?? 0;
      occurrenceByStableKey.set(stableKey, occurrence + 1);
      const todoId = createStableTodoId(currentPriority, text, occurrence);

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

export function normalizeTrailingNewline(content: string): string {
  return content.replace(/\s*$/u, "\n");
}

export function isPriority(value: string): value is Priority {
  return PRIORITIES.includes(value as Priority);
}

export function createStableTodoId(priority: Priority, text: string, occurrence: number): string {
  return `${hashString(`${priority}:${text}:${occurrence}`, 0x811c9dc5)}${hashString(
    `${occurrence}:${text}:${priority}`,
    0x9e3779b9
  )}`.slice(0, 16);
}

function hashString(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
