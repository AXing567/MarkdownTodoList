import {
  Check,
  Clipboard,
  Circle,
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  Loader2,
  MapPin,
  Plus,
  RefreshCw
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  PRIORITIES,
  type Priority,
  type TodoItem,
  type TodoListDocument,
  type TodoListSummary
} from "../../shared/todoTypes";

type StatusState = {
  kind: "idle" | "loading" | "error";
  message: string;
};

type DraftByPriority = Record<Priority, string>;

const emptyDrafts: DraftByPriority = {
  P0: "",
  P1: "",
  P2: ""
};

const priorityMeta: Record<Priority, { label: string; description: string }> = {
  P0: { label: "P0", description: "马上处理" },
  P1: { label: "P1", description: "近期推进" },
  P2: { label: "P2", description: "稍后安排" }
};

export function App(): ReactElement {
  const [lists, setLists] = useState<TodoListSummary[]>([]);
  const [activeList, setActiveList] = useState<TodoListDocument | null>(null);
  const [newListName, setNewListName] = useState("");
  const [drafts, setDrafts] = useState<DraftByPriority>(emptyDrafts);
  const [showCompleted, setShowCompleted] = useState(false);
  const [status, setStatus] = useState<StatusState>({ kind: "loading", message: "正在载入" });

  useEffect(() => {
    void loadLists();
  }, []);

  const visibleTodosByPriority = useMemo(() => {
    const grouped = new Map<Priority, TodoItem[]>();
    for (const priority of PRIORITIES) {
      grouped.set(priority, []);
    }

    for (const todo of activeList?.todos ?? []) {
      if (!showCompleted && todo.completed) {
        continue;
      }
      grouped.get(todo.priority)?.push(todo);
    }

    return grouped;
  }, [activeList, showCompleted]);

  const completedCount = activeList?.todos.filter((todo) => todo.completed).length ?? 0;
  const openCount = activeList ? activeList.todos.length - completedCount : 0;

  async function loadLists(): Promise<void> {
    await runAction(async () => {
      const summaries = await window.todoApi.listTodoLists();
      setLists(summaries);
      if (!activeList && summaries[0]) {
        const document = await window.todoApi.readTodoList(summaries[0].id);
        setActiveList(document);
      }
    }, "已刷新 TodoList");
  }

  async function createList(mode: "managed" | "external"): Promise<void> {
    const name = newListName.trim();
    if (!name) {
      setStatus({ kind: "error", message: "请先输入 TodoList 名称" });
      return;
    }

    await runAction(async () => {
      const document = await window.todoApi.createTodoList({ name, mode });
      setActiveList(document);
      setNewListName("");
      await refreshListSummaries();
    }, "已创建 TodoList");
  }

  async function openExternalList(): Promise<void> {
    await runAction(async () => {
      const document = await window.todoApi.openTodoList();
      if (!document) {
        return;
      }
      setActiveList(document);
      await refreshListSummaries();
    }, "已打开 Markdown 文件");
  }

  async function selectList(listId: string): Promise<void> {
    await runAction(async () => {
      const document = await window.todoApi.readTodoList(listId);
      setActiveList(document);
    }, "已切换 TodoList");
  }

  async function addTodo(priority: Priority): Promise<void> {
    if (!activeList) {
      return;
    }

    const text = drafts[priority].trim();
    if (!text) {
      setStatus({ kind: "error", message: "待办内容不能为空" });
      return;
    }

    await runAction(async () => {
      const document = await window.todoApi.addTodo({
        listId: activeList.id,
        priority,
        text
      });
      setActiveList(document);
      setDrafts((current) => ({ ...current, [priority]: "" }));
      await refreshListSummaries();
    }, "已添加待办");
  }

  async function toggleTodo(todo: TodoItem): Promise<void> {
    if (!activeList) {
      return;
    }

    await runAction(async () => {
      const document = await window.todoApi.toggleTodo({
        listId: activeList.id,
        todoId: todo.id,
        completed: !todo.completed
      });
      setActiveList(document);
      await refreshListSummaries();
    }, todo.completed ? "已恢复待办" : "已完成待办");
  }

  async function revealActiveFile(): Promise<void> {
    if (!activeList) {
      return;
    }

    await runAction(async () => {
      await window.todoApi.revealFile(activeList.id);
    }, "已在文件管理器中定位");
  }

  async function copyTodoText(text: string): Promise<void> {
    await runAction(async () => {
      await navigator.clipboard.writeText(text);
    }, "已复制待办内容");
  }

  async function refreshListSummaries(): Promise<void> {
    const summaries = await window.todoApi.listTodoLists();
    setLists(summaries);
  }

  async function runAction(action: () => Promise<void>, successMessage: string): Promise<void> {
    setStatus({ kind: "loading", message: "正在处理" });
    try {
      await action();
      setStatus({ kind: "idle", message: successMessage });
    } catch (error) {
      setStatus({ kind: "error", message: readApiError(error) });
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <h1>Markdown TodoList</h1>
            <p>本地 Markdown 待办</p>
          </div>
          <button
            className="icon-button"
            type="button"
            title="刷新"
            aria-label="刷新 TodoList"
            onClick={() => void loadLists()}
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <section className="create-panel" aria-label="新建 TodoList">
          <label htmlFor="list-name">新建 TodoList</label>
          <input
            id="list-name"
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            placeholder="例如：每日计划"
          />
          <div className="create-actions">
            <button type="button" onClick={() => void createList("managed")}>
              <FilePlus size={17} />
              项目内
            </button>
            <button type="button" onClick={() => void createList("external")}>
              <MapPin size={17} />
              选择位置
            </button>
          </div>
          <button className="secondary-action" type="button" onClick={() => void openExternalList()}>
            <FolderOpen size={17} />
            打开已有 md
          </button>
        </section>

        <nav className="list-nav" aria-label="TodoList 列表">
          {lists.length === 0 ? (
            <div className="empty-list">还没有 TodoList</div>
          ) : (
            lists.map((list) => (
              <button
                key={list.id}
                className={list.id === activeList?.id ? "list-item active" : "list-item"}
                type="button"
                onClick={() => void selectList(list.id)}
              >
                <span>{list.name}</span>
                <small>{list.storage === "managed" ? "项目内" : "外部文件"}</small>
              </button>
            ))
          )}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          {activeList ? (
            <>
              <div className="title-block">
                <h2>{activeList.name}</h2>
                <p title={activeList.filePath}>{activeList.filePath}</p>
              </div>
              <div className="header-actions">
                <div className="counter" aria-label="待办统计">
                  <strong>{openCount}</strong>
                  <span>未完成</span>
                  <strong>{completedCount}</strong>
                  <span>已完成</span>
                </div>
                <button type="button" onClick={() => setShowCompleted((value) => !value)}>
                  {showCompleted ? <EyeOff size={17} /> : <Eye size={17} />}
                  {showCompleted ? "隐藏完成" : "显示完成"}
                </button>
                <button type="button" onClick={() => void revealActiveFile()}>
                  <FolderOpen size={17} />
                  文件位置
                </button>
              </div>
            </>
          ) : (
            <div className="title-block">
              <h2>创建或打开一个 TodoList</h2>
              <p>每个列表都会对应一个真实 Markdown 文件</p>
            </div>
          )}
        </header>

        <StatusBanner status={status} />

        {activeList ? (
          <div className="priority-grid">
            {PRIORITIES.map((priority) => (
              <section className="priority-section" key={priority}>
                <div className="priority-heading">
                  <div>
                    <h3>{priorityMeta[priority].label}</h3>
                    <p>{priorityMeta[priority].description}</p>
                  </div>
                  <span>{visibleTodosByPriority.get(priority)?.length ?? 0}</span>
                </div>

                <form
                  className="add-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addTodo(priority);
                  }}
                >
                  <input
                    value={drafts[priority]}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [priority]: event.target.value }))
                    }
                    placeholder={`添加 ${priority} 待办`}
                  />
                  <button className="icon-button" type="submit" title="添加" aria-label="添加待办">
                    <Plus size={18} />
                  </button>
                </form>

                <ul className="todo-list">
                  {(visibleTodosByPriority.get(priority) ?? []).map((todo) => (
                    <li key={todo.id} className={todo.completed ? "todo completed" : "todo"}>
                      <button
                        className="check-button"
                        type="button"
                        aria-label={todo.completed ? "标记为未完成" : "标记为完成"}
                        onClick={() => void toggleTodo(todo)}
                      >
                        {todo.completed ? <Check size={16} /> : <Circle size={16} />}
                      </button>
                      <button
                        className="todo-text-button"
                        type="button"
                        title="复制待办内容"
                        aria-label={`复制待办内容：${todo.text}`}
                        onClick={() => void copyTodoText(todo.text)}
                      >
                        <span>{todo.text}</span>
                        <Clipboard size={14} />
                      </button>
                    </li>
                  ))}
                  {(visibleTodosByPriority.get(priority) ?? []).length === 0 ? (
                    <li className="empty-todos">暂无待办</li>
                  ) : null}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="welcome">
            <FilePlus size={44} />
            <h3>从左侧开始</h3>
            <p>创建项目内 Markdown 文件，或选择电脑上的保存位置。</p>
          </div>
        )}
      </section>
    </main>
  );
}

function StatusBanner({ status }: { status: StatusState }): ReactElement | null {
  if (status.kind === "idle" && !status.message) {
    return null;
  }

  return (
    <div className={`status-banner ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
      {status.kind === "loading" ? <Loader2 className="spin" size={16} /> : null}
      <span>{status.message}</span>
    </div>
  );
}

function readApiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "操作失败";
  }

  const jsonStart = error.message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(error.message.slice(jsonStart)) as { message?: string };
      if (parsed.message) {
        return parsed.message;
      }
    } catch {
      return error.message;
    }
  }

  return error.message || "操作失败";
}
