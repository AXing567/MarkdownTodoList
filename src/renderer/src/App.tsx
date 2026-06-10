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
  RefreshCw,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactElement } from "react";
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

type EditingTodoState = {
  todoId: string;
  text: string;
};

type TodoContextMenuState = {
  listId: string;
  todo: TodoItem;
  x: number;
  y: number;
};

type DraggingTodoState = {
  priority: Priority;
  todoId: string;
};

const completionEffectDurationMs = 1400;
const todoContextMenuSize = {
  width: 150,
  height: 44
};

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
  const [editingTodo, setEditingTodo] = useState<EditingTodoState | null>(null);
  const [todoContextMenu, setTodoContextMenu] = useState<TodoContextMenuState | null>(null);
  const [draggingTodo, setDraggingTodo] = useState<DraggingTodoState | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [status, setStatus] = useState<StatusState>({ kind: "loading", message: "正在载入" });
  const copyTimerRef = useRef<number | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const completionEffectTimersRef = useRef<Map<string, number>>(new Map());
  const [completionEffectKeys, setCompletionEffectKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    return () => {
      clearCopyTimer();
      clearCompletionEffectTimers();
    };
  }, []);

  useEffect(() => {
    void loadLists();
  }, []);

  useEffect(() => {
    if (!todoContextMenu) {
      return;
    }

    function closeContextMenu(): void {
      setTodoContextMenu(null);
    }

    function closeContextMenuOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setTodoContextMenu(null);
      }
    }

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", closeContextMenuOnEscape);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", closeContextMenuOnEscape);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [todoContextMenu]);

  useEffect(() => {
    if (!editingTodo) {
      return;
    }

    const textarea = editingTextareaRef.current;
    if (!textarea) {
      return;
    }

    resizeTodoEditTextarea(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [editingTodo?.todoId]);

  useEffect(() => {
    const textarea = editingTextareaRef.current;
    if (!textarea) {
      return;
    }

    resizeTodoEditTextarea(textarea);
  }, [editingTodo?.text]);

  const visibleTodosByPriority = useMemo(() => {
    const grouped = new Map<Priority, TodoItem[]>();
    for (const priority of PRIORITIES) {
      grouped.set(priority, []);
    }

    const activeListId = activeList?.id;

    for (const todo of activeList?.todos ?? []) {
      const isCompletionEffectVisible = activeListId
        ? completionEffectKeys.has(createTodoEffectKey(activeListId, todo.id))
        : false;

      if (!showCompleted && todo.completed && !isCompletionEffectVisible) {
        continue;
      }
      grouped.get(todo.priority)?.push(todo);
    }

    return grouped;
  }, [activeList, completionEffectKeys, showCompleted]);

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

  async function removeListFromApp(listId: string): Promise<void> {
    await runAction(async () => {
      const summaries = await window.todoApi.removeTodoList(listId);
      setLists(summaries);

      if (activeList?.id !== listId) {
        return;
      }

      const nextList = summaries[0];
      if (!nextList) {
        setActiveList(null);
        return;
      }

      const document = await window.todoApi.readTodoList(nextList.id);
      setActiveList(document);
    }, "已从列表移除");
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
      if (todo.completed) {
        stopCompletionEffect(activeList.id, todo.id);
      } else {
        startCompletionEffect(activeList.id, todo.id);
      }
      setActiveList(document);
      await refreshListSummaries();
    }, todo.completed ? "已恢复待办" : "已完成待办");
  }

  async function saveTodoEdit(todo: TodoItem, text: string): Promise<void> {
    if (!activeList) {
      return;
    }

    const nextText = text.trim();
    if (nextText === todo.text) {
      setEditingTodo(null);
      return;
    }

    if (!nextText) {
      setStatus({ kind: "error", message: "待办内容不能为空" });
      return;
    }

    await runAction(async () => {
      const document = await window.todoApi.updateTodo({
        listId: activeList.id,
        todoId: todo.id,
        text: nextText
      });
      setActiveList(document);
      setEditingTodo(null);
      await refreshListSummaries();
    }, "已更新待办");
  }

  async function deleteTodoItem(menuState: TodoContextMenuState): Promise<void> {
    setTodoContextMenu(null);
    clearCopyTimer();
    stopCompletionEffect(menuState.listId, menuState.todo.id);

    if (editingTodo?.todoId === menuState.todo.id) {
      setEditingTodo(null);
    }

    await runAction(async () => {
      const document = await window.todoApi.deleteTodo({
        listId: menuState.listId,
        todoId: menuState.todo.id
      });
      setActiveList(document);
      await refreshListSummaries();
    }, "已删除待办");
  }

  async function reorderTodo(todo: TodoItem, targetTodo: TodoItem): Promise<void> {
    if (!activeList || todo.id === targetTodo.id || todo.priority !== targetTodo.priority) {
      clearDragState();
      return;
    }

    await runAction(async () => {
      const document = await window.todoApi.reorderTodo({
        listId: activeList.id,
        todoId: todo.id,
        targetTodoId: targetTodo.id
      });
      setActiveList(document);
      await refreshListSummaries();
    }, "已调整待办顺序");
    clearDragState();
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

  function scheduleCopyTodoText(text: string): void {
    clearCopyTimer();
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null;
      void copyTodoText(text);
    }, 180);
  }

  function startEditingTodo(todo: TodoItem): void {
    clearCopyTimer();
    setTodoContextMenu(null);
    setEditingTodo({ todoId: todo.id, text: todo.text });
  }

  function openTodoContextMenu(
    event: MouseEvent<HTMLLIElement>,
    listId: string,
    todo: TodoItem
  ): void {
    if (event.target instanceof HTMLElement && event.target.closest(".todo-edit-input")) {
      return;
    }

    event.preventDefault();
    clearCopyTimer();

    setTodoContextMenu({
      listId,
      todo,
      x: clampMenuPosition(event.clientX, window.innerWidth, todoContextMenuSize.width),
      y: clampMenuPosition(event.clientY, window.innerHeight, todoContextMenuSize.height)
    });
  }

  function startDraggingTodo(todo: TodoItem): void {
    clearCopyTimer();
    setTodoContextMenu(null);
    setDraggingTodo({ priority: todo.priority, todoId: todo.id });
  }

  function clearDragState(): void {
    setDraggingTodo(null);
    setDragOverTodoId(null);
  }

  function clearCopyTimer(): void {
    if (copyTimerRef.current === null) {
      return;
    }

    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = null;
  }

  function startCompletionEffect(listId: string, todoId: string): void {
    const effectKey = createTodoEffectKey(listId, todoId);
    stopCompletionEffect(listId, todoId);

    setCompletionEffectKeys((current) => {
      const next = new Set(current);
      next.add(effectKey);
      return next;
    });

    const timerId = window.setTimeout(() => {
      completionEffectTimersRef.current.delete(effectKey);
      setCompletionEffectKeys((current) => {
        if (!current.has(effectKey)) {
          return current;
        }

        const next = new Set(current);
        next.delete(effectKey);
        return next;
      });
    }, completionEffectDurationMs);

    completionEffectTimersRef.current.set(effectKey, timerId);
  }

  function stopCompletionEffect(listId: string, todoId: string): void {
    const effectKey = createTodoEffectKey(listId, todoId);
    const timerId = completionEffectTimersRef.current.get(effectKey);
    if (timerId) {
      window.clearTimeout(timerId);
      completionEffectTimersRef.current.delete(effectKey);
    }

    setCompletionEffectKeys((current) => {
      if (!current.has(effectKey)) {
        return current;
      }

      const next = new Set(current);
      next.delete(effectKey);
      return next;
    });
  }

  function clearCompletionEffectTimers(): void {
    for (const timerId of completionEffectTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    completionEffectTimersRef.current.clear();
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
              <div
                key={list.id}
                className={list.id === activeList?.id ? "list-row active" : "list-row"}
              >
                <button
                  className="list-item"
                  type="button"
                  onClick={() => void selectList(list.id)}
                >
                  <span>{list.name}</span>
                  <small>{list.storage === "managed" ? "项目内" : "外部文件"}</small>
                </button>
                <button
                  className="icon-button remove-list-button"
                  type="button"
                  title="移除出列表"
                  aria-label={`移除出列表：${list.name}`}
                  onClick={() => void removeListFromApp(list.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
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
                  <textarea
                    className="todo-draft-input"
                    value={drafts[priority]}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [priority]: event.target.value }))
                    }
                    rows={3}
                    placeholder={`添加 ${priority} 待办`}
                    aria-label={`添加 ${priority} 待办`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.ctrlKey) {
                        event.preventDefault();
                        void addTodo(priority);
                      }
                    }}
                  />
                  <button className="icon-button" type="submit" title="添加" aria-label="添加待办">
                    <Plus size={18} />
                  </button>
                </form>

                <ul className="todo-list">
                  {(visibleTodosByPriority.get(priority) ?? []).map((todo) => {
                    const isEditing = editingTodo?.todoId === todo.id;
                    const isCompletionEffectActive =
                      Boolean(activeList) &&
                      todo.completed &&
                      completionEffectKeys.has(createTodoEffectKey(activeList.id, todo.id));
                    const isDragging = draggingTodo?.todoId === todo.id;
                    const isDragTarget = dragOverTodoId === todo.id;
                    const todoClassName = [
                      "todo",
                      todo.completed ? "completed" : "",
                      isEditing ? "editing" : "",
                      isCompletionEffectActive ? "completion-effect" : "",
                      isDragging ? "dragging" : "",
                      isDragTarget ? "drag-target" : ""
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <li
                        key={todo.id}
                        className={todoClassName}
                        draggable={!isEditing}
                        onContextMenu={(event) => openTodoContextMenu(event, activeList.id, todo)}
                        onDragStart={(event) => {
                          startDraggingTodo(todo);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", todo.id);
                        }}
                        onDragOver={(event) => {
                          if (draggingTodo?.priority !== todo.priority || draggingTodo.todoId === todo.id) {
                            return;
                          }

                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverTodoId(todo.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverTodoId === todo.id) {
                            setDragOverTodoId(null);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const draggedTodo = activeList.todos.find(
                            (item) => item.id === draggingTodo?.todoId
                          );
                          if (!draggedTodo) {
                            clearDragState();
                            return;
                          }

                          void reorderTodo(draggedTodo, todo);
                        }}
                        onDragEnd={clearDragState}
                      >
                        <button
                          className="check-button"
                          type="button"
                          aria-label={todo.completed ? "标记为未完成" : "标记为完成"}
                          onClick={() => void toggleTodo(todo)}
                        >
                          {todo.completed ? <Check size={16} /> : <Circle size={16} />}
                        </button>
                        {isEditing ? (
                          <textarea
                            ref={editingTextareaRef}
                            className="todo-edit-input"
                            value={editingTodo.text}
                            rows={6}
                            aria-label="编辑待办内容"
                            onChange={(event) => {
                              resizeTodoEditTextarea(event.currentTarget);
                              setEditingTodo({ todoId: todo.id, text: event.target.value });
                            }}
                            onBlur={() => void saveTodoEdit(todo, editingTodo.text)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && event.ctrlKey) {
                                event.preventDefault();
                                void saveTodoEdit(todo, editingTodo.text);
                              }
                              if (event.key === "Escape") {
                                setEditingTodo(null);
                              }
                            }}
                          />
                        ) : (
                          <button
                            className="todo-text-button"
                            type="button"
                            title="单击复制，双击编辑"
                            aria-label={`复制或编辑待办内容：${todo.text}`}
                            onClick={() => scheduleCopyTodoText(todo.text)}
                            onDoubleClick={() => startEditingTodo(todo)}
                          >
                            <span>{todo.text}</span>
                            <Clipboard size={14} />
                          </button>
                        )}
                      </li>
                    );
                  })}
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

        {todoContextMenu ? (
          <div
            className="todo-context-menu"
            style={{ left: todoContextMenu.x, top: todoContextMenu.y }}
            role="menu"
            aria-label="待办操作"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="todo-context-menu-item danger"
              type="button"
              role="menuitem"
              onClick={() => void deleteTodoItem(todoContextMenu)}
            >
              <Trash2 size={15} />
              删除待办
            </button>
          </div>
        ) : null}
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

function resizeTodoEditTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
}

function createTodoEffectKey(listId: string, todoId: string): string {
  return `${listId}:${todoId}`;
}

function clampMenuPosition(position: number, viewportSize: number, menuSize: number): number {
  const margin = 8;
  return Math.max(margin, Math.min(position, viewportSize - menuSize - margin));
}
