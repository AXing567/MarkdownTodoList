import {
  Check,
  Clipboard,
  Circle,
  Download,
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  HardDrive,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent, ReactElement } from "react";
import {
  PRIORITIES,
  type Priority,
  type SyncServerConfig,
  type SyncStatus,
  type TodoApi,
  type TodoItem,
  type TodoListDocument,
  type TodoListSummary
} from "../../shared/todoTypes";
import {
  createTodoApi,
  deleteSavedRemoteConfig,
  forgetRemoteConfig,
  getInitialRemoteConfig,
  getSavedRemoteConfig,
  hasLocalTodoApi,
  saveRemoteConfig
} from "./todoApiProvider";
import { RemoteTodoApi } from "./remoteTodoApi";

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
  const initialRemoteConfig = getInitialRemoteConfig();
  const initialSavedRemoteConfig = getSavedRemoteConfig();
  const [remoteConfig, setRemoteConfig] = useState<SyncServerConfig | null>(() =>
    initialRemoteConfig
  );
  const [todoApi, setTodoApi] = useState<TodoApi | null>(() =>
    createTodoApi(initialRemoteConfig)
  );
  const [lists, setLists] = useState<TodoListSummary[]>([]);
  const [activeList, setActiveList] = useState<TodoListDocument | null>(null);
  const [newListName, setNewListName] = useState("");
  const [drafts, setDrafts] = useState<DraftByPriority>(emptyDrafts);
  const [editingTodo, setEditingTodo] = useState<EditingTodoState | null>(null);
  const [todoContextMenu, setTodoContextMenu] = useState<TodoContextMenuState | null>(null);
  const [draggingTodo, setDraggingTodo] = useState<DraggingTodoState | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    kind: "loading",
    message: "正在载入"
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(() =>
    todoApi?.getSyncStatus?.() ?? createLocalSyncStatus()
  );
  const [serverUrlDraft, setServerUrlDraft] = useState(
    initialRemoteConfig?.serverUrl ?? initialSavedRemoteConfig?.serverUrl ?? ""
  );
  const [accessKeyDraft, setAccessKeyDraft] = useState(
    initialRemoteConfig?.accessKey ?? initialSavedRemoteConfig?.accessKey ?? ""
  );
  const copyTimerRef = useRef<number | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const completionEffectTimersRef = useRef<Map<string, number>>(new Map());
  const activeListIdRef = useRef<string | null>(null);
  const [completionEffectKeys, setCompletionEffectKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    return () => {
      clearCopyTimer();
      clearCompletionEffectTimers();
    };
  }, []);

  useEffect(() => {
    setTodoApi(createTodoApi(remoteConfig));
    const savedConfig = remoteConfig ?? getSavedRemoteConfig();
    setServerUrlDraft(savedConfig?.serverUrl ?? "");
    setAccessKeyDraft(savedConfig?.accessKey ?? "");
  }, [remoteConfig]);

  useEffect(() => {
    if (!todoApi) {
      setLists([]);
      setActiveDocument(null);
      setStatus({
        kind: "idle",
        message: "请先配置同步服务器"
      });
      setSyncStatus(null);
      return;
    }

    setSyncStatus(todoApi.getSyncStatus?.() ?? createLocalSyncStatus());
    void loadLists(todoApi, activeListIdRef.current);
    const unsubscribe = todoApi.subscribeToChanges?.(() => {
      setSyncStatus(todoApi.getSyncStatus?.() ?? createLocalSyncStatus());
      void loadLists(todoApi, activeListIdRef.current);
    });

    return unsubscribe;
  }, [todoApi]);

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
  const isRemoteMode = Boolean(remoteConfig);
  const canUseLocalMode = hasLocalTodoApi();
  const savedRemoteConfig = remoteConfig ?? getSavedRemoteConfig();
  const canUploadLocalMarkdown = Boolean(
    savedRemoteConfig && window.todoApi?.openTodoList && window.todoApi.exportMarkdown
  );

  function setActiveDocument(document: TodoListDocument | null): void {
    activeListIdRef.current = document?.id ?? null;
    setActiveList(document);
  }

  async function loadLists(api = todoApi, preferredListId = activeListIdRef.current): Promise<void> {
    if (!api) {
      return;
    }

    await runAction(async () => {
      const summaries = await api.listTodoLists();
      setLists(summaries);
      const nextList =
        summaries.find((summary) => summary.id === preferredListId) ?? summaries[0];
      if (nextList) {
        const document = await api.readTodoList(nextList.id);
        setActiveDocument(document);
      } else {
        setActiveDocument(null);
      }
      setSyncStatus(api.getSyncStatus?.() ?? createLocalSyncStatus());
    }, "已刷新 TodoList");
  }

  async function createList(mode: "managed" | "external"): Promise<void> {
    if (!todoApi) {
      return;
    }

    const name = newListName.trim();
    if (!name) {
      setStatus({ kind: "error", message: "请先输入 TodoList 名称" });
      return;
    }

    await runAction(async () => {
      const document = await todoApi.createTodoList({
        name,
        mode: isRemoteMode ? "managed" : mode
      });
      setActiveDocument(document);
      setNewListName("");
      setIsCreateSheetOpen(false);
      await refreshListSummaries();
    }, "已创建 TodoList");
  }

  async function openExternalList(): Promise<void> {
    if (!todoApi) {
      return;
    }

    await runAction(async () => {
      const document = await todoApi.openTodoList();
      if (!document) {
        return;
      }
      setActiveDocument(document);
      setIsCreateSheetOpen(false);
      await refreshListSummaries();
    }, "已打开 Markdown 文件");
  }

  async function importMarkdown(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    const importMarkdownFile = todoApi?.importMarkdown;
    if (!file || !importMarkdownFile) {
      return;
    }

    await runAction(async () => {
      const markdown = await file.text();
      const document = await importMarkdownFile({
        name: file.name.replace(/\.md$/i, ""),
        markdown
      });
      setActiveDocument(document);
      setIsCreateSheetOpen(false);
      await refreshListSummaries();
    }, "已导入 Markdown");
  }

  async function exportMarkdown(): Promise<void> {
    const exportMarkdownFile = todoApi?.exportMarkdown;
    if (!activeList || !exportMarkdownFile) {
      return;
    }

    await runAction(async () => {
      const result = await exportMarkdownFile(activeList.id);
      downloadTextFile(result.fileName, result.markdown);
    }, "已导出 Markdown");
  }

  async function uploadSelectedLocalListToCloud(): Promise<void> {
    const localApi = window.todoApi;
    if (!localApi?.openTodoList || !localApi.exportMarkdown) {
      setStatus({ kind: "error", message: "当前客户端不能选择本地 Markdown" });
      return;
    }

    const savedConfig = remoteConfig ?? getSavedRemoteConfig();
    if (!savedConfig) {
      setStatus({ kind: "error", message: "请先填写并连接同步服务器" });
      return;
    }

    await runAction(async () => {
      const localDocument = await localApi.openTodoList();
      if (!localDocument) {
        return "已取消选择本地 MD";
      }

      const localMarkdown = await localApi.exportMarkdown?.(localDocument.id);
      if (!localMarkdown) {
        throw new Error("本地 Markdown 导出失败");
      }

      const remoteApi = new RemoteTodoApi(savedConfig, {
        remoteModeEnabled: false,
        autoStart: false
      });

      try {
        const remoteDocument = await remoteApi.importMarkdown({
          id: localDocument.id,
          name: localDocument.name,
          markdown: localMarkdown.markdown
        });
        const enabledConfig = saveRemoteConfig(savedConfig);
        setRemoteConfig(enabledConfig);
        setActiveDocument(remoteDocument);
        setIsSettingsSheetOpen(false);
        setStatus({ kind: "idle", message: "本地 MD 已同步到云端" });
      } finally {
        remoteApi.dispose();
      }
    }, "本地 MD 已同步到云端");
  }

  async function syncCloudListToLocal(): Promise<void> {
    const localApi = window.todoApi;
    if (!activeList || !todoApi?.exportMarkdown || !localApi?.saveMarkdownToLocal) {
      return;
    }

    await runAction(async () => {
      const remoteMarkdown = await todoApi.exportMarkdown?.(activeList.id);
      if (!remoteMarkdown) {
        throw new Error("云端 Markdown 导出失败");
      }

      const localDocument = await localApi.saveMarkdownToLocal?.({
        id: activeList.id,
        name: activeList.name,
        markdown: remoteMarkdown.markdown
      });
      if (!localDocument) {
        throw new Error("本地 Markdown 保存失败");
      }

      forgetRemoteConfig();
      setRemoteConfig(null);
      setTodoApi(createTodoApi(null));
      setActiveDocument(localDocument);
      setStatus({ kind: "idle", message: "云端 MD 已同步到本地" });
    }, "云端 MD 已同步到本地");
  }

  async function selectList(listId: string): Promise<void> {
    if (!todoApi) {
      return;
    }

    await runAction(async () => {
      const document = await todoApi.readTodoList(listId);
      setActiveDocument(document);
    }, "已切换 TodoList");
  }

  async function removeListFromApp(listId: string): Promise<void> {
    if (!todoApi) {
      return;
    }

    await runAction(async () => {
      const summaries = await todoApi.removeTodoList(listId);
      setLists(summaries);

      if (activeList?.id !== listId) {
        return;
      }

      const nextList = summaries[0];
      if (!nextList) {
        setActiveDocument(null);
        return;
      }

      const document = await todoApi.readTodoList(nextList.id);
      setActiveDocument(document);
    }, isRemoteMode ? "已删除列表" : "已从列表移除");
  }

  async function addTodo(priority: Priority): Promise<void> {
    if (!activeList || !todoApi) {
      return;
    }

    const text = drafts[priority].trim();
    if (!text) {
      setStatus({ kind: "error", message: "待办内容不能为空" });
      return;
    }

    await runAction(async () => {
      const document = await todoApi.addTodo({
        listId: activeList.id,
        priority,
        text
      });
      setActiveDocument(document);
      setDrafts((current) => ({ ...current, [priority]: "" }));
      await refreshListSummaries();
    }, "已添加待办");
  }

  async function toggleTodo(todo: TodoItem): Promise<void> {
    if (!activeList || !todoApi) {
      return;
    }

    await runAction(async () => {
      const document = await todoApi.toggleTodo({
        listId: activeList.id,
        todoId: todo.id,
        completed: !todo.completed
      });
      if (todo.completed) {
        stopCompletionEffect(activeList.id, todo.id);
      } else {
        startCompletionEffect(activeList.id, todo.id);
      }
      setActiveDocument(document);
      await refreshListSummaries();
    }, todo.completed ? "已恢复待办" : "已完成待办");
  }

  async function saveTodoEdit(todo: TodoItem, text: string): Promise<void> {
    if (!activeList || !todoApi) {
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
      const document = await todoApi.updateTodo({
        listId: activeList.id,
        todoId: todo.id,
        text: nextText
      });
      setActiveDocument(document);
      setEditingTodo(null);
      await refreshListSummaries();
    }, "已更新待办");
  }

  async function deleteTodoItem(menuState: TodoContextMenuState): Promise<void> {
    if (!todoApi) {
      return;
    }

    setTodoContextMenu(null);
    clearCopyTimer();
    stopCompletionEffect(menuState.listId, menuState.todo.id);

    if (editingTodo?.todoId === menuState.todo.id) {
      setEditingTodo(null);
    }

    await runAction(async () => {
      const document = await todoApi.deleteTodo({
        listId: menuState.listId,
        todoId: menuState.todo.id
      });
      setActiveDocument(document);
      await refreshListSummaries();
    }, "已删除待办");
  }

  async function reorderTodo(todo: TodoItem, targetTodo: TodoItem): Promise<void> {
    if (!activeList || !todoApi || todo.id === targetTodo.id || todo.priority !== targetTodo.priority) {
      clearDragState();
      return;
    }

    await runAction(async () => {
      const document = await todoApi.reorderTodo({
        listId: activeList.id,
        todoId: todo.id,
        targetTodoId: targetTodo.id
      });
      setActiveDocument(document);
      await refreshListSummaries();
    }, "已调整待办顺序");
    clearDragState();
  }

  async function revealActiveFile(): Promise<void> {
    if (!activeList || !todoApi) {
      return;
    }

    await runAction(async () => {
      await todoApi.revealFile(activeList.id);
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

  function connectRemoteServer(): void {
    const serverUrl = serverUrlDraft.trim();
    const accessKey = accessKeyDraft.trim();
    if (!serverUrl || !accessKey) {
      setStatus({ kind: "error", message: "请填写服务器地址和访问密钥" });
      return;
    }

    try {
      const normalizedUrl = new URL(serverUrl).toString().replace(/\/+$/u, "");
      const config = saveRemoteConfig({ serverUrl: normalizedUrl, accessKey });
      setRemoteConfig(config);
      setIsSettingsSheetOpen(false);
      setStatus({ kind: "idle", message: "已保存同步服务器" });
    } catch {
      setStatus({ kind: "error", message: "服务器地址格式不正确" });
    }
  }

  function switchToLocalMode(): void {
    forgetRemoteConfig();
    setRemoteConfig(null);
    setTodoApi(createTodoApi(null));
    setStatus({ kind: "idle", message: "已切换到本地模式" });
  }

  function removeSavedRemoteServer(): void {
    deleteSavedRemoteConfig();
    setRemoteConfig(null);
    setServerUrlDraft("");
    setAccessKeyDraft("");
    setTodoApi(createTodoApi(null));
    setStatus({ kind: "idle", message: "已删除服务器信息" });
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
    if (!todoApi) {
      return;
    }

    const summaries = await todoApi.listTodoLists();
    setLists(summaries);
    setSyncStatus(todoApi.getSyncStatus?.() ?? createLocalSyncStatus());
  }

  async function runAction(
    action: () => Promise<string | void>,
    successMessage: string
  ): Promise<void> {
    setStatus({ kind: "loading", message: "正在处理" });
    try {
      const nextSuccessMessage = await action();
      setStatus({ kind: "idle", message: nextSuccessMessage ?? successMessage });
    } catch (error) {
      setStatus({ kind: "error", message: readApiError(error) });
    } finally {
      setSyncStatus(todoApi?.getSyncStatus?.() ?? (todoApi ? createLocalSyncStatus() : null));
    }
  }

  function renderSyncPanel(): ReactElement {
    return (
      <section className="sync-panel" aria-label="同步服务器">
        <div className="panel-heading">
          <Server size={17} />
          <span>同步服务器</span>
        </div>
        <input
          value={serverUrlDraft}
          onChange={(event) => setServerUrlDraft(event.target.value)}
          placeholder="https://todo.example.com"
          aria-label="服务器地址"
        />
        <input
          value={accessKeyDraft}
          onChange={(event) => setAccessKeyDraft(event.target.value)}
          placeholder="访问密钥"
          aria-label="访问密钥"
          type="password"
        />
        <div className="create-actions">
          <button type="button" onClick={connectRemoteServer}>
            <Server size={17} />
            连接
          </button>
          {isRemoteMode && canUseLocalMode ? (
            <button type="button" onClick={switchToLocalMode}>
              <LogOut size={17} />
              本地
            </button>
          ) : null}
          {savedRemoteConfig ? (
            <button type="button" onClick={removeSavedRemoteServer}>
              <Trash2 size={17} />
              删除
            </button>
          ) : null}
        </div>
        {canUploadLocalMarkdown ? (
          <button
            className="secondary-action"
            type="button"
            onClick={() => void uploadSelectedLocalListToCloud()}
          >
            <Upload size={17} />
            选择本机 md 上传云端
          </button>
        ) : null}
        {syncStatus ? <SyncStatusPill status={syncStatus} /> : null}
      </section>
    );
  }

  function renderCreatePanel(listNameInputId: string): ReactElement {
    return (
      <section className="create-panel" aria-label="新建 TodoList">
        <label htmlFor={listNameInputId}>新建 TodoList</label>
        <input
          id={listNameInputId}
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          placeholder="例如：每日计划"
        />
        <div className="create-actions">
          <button type="button" onClick={() => void createList("managed")}>
            <FilePlus size={17} />
            {isRemoteMode ? "云端" : "项目内"}
          </button>
          {!isRemoteMode ? (
            <button type="button" onClick={() => void createList("external")}>
              <MapPin size={17} />
              选择位置
            </button>
          ) : null}
        </div>
        {!isRemoteMode ? (
          <button className="secondary-action" type="button" onClick={() => void openExternalList()}>
            <FolderOpen size={17} />
            打开已有 md
          </button>
        ) : null}
        {todoApi?.importMarkdown ? (
          <label className="file-action">
            <Upload size={17} />
            导入 Markdown
            <input type="file" accept=".md,text/markdown,text/plain" onChange={(event) => void importMarkdown(event)} />
          </label>
        ) : null}
      </section>
    );
  }

  function renderListNav(): ReactElement {
    return (
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
                <small>{list.storage === "remote" ? "云端同步" : list.storage === "managed" ? "项目内" : "外部文件"}</small>
              </button>
              <button
                className="icon-button remove-list-button"
                type="button"
                title={isRemoteMode ? "删除列表" : "移除出列表"}
                aria-label={`${isRemoteMode ? "删除列表" : "移除出列表"}：${list.name}`}
                onClick={() => void removeListFromApp(list.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </nav>
    );
  }

  return (
    <main className="app-shell">
      <header className="mobile-topbar">
        <button
          className="icon-button"
          type="button"
          title="新建 TodoList"
          aria-label="新建 TodoList"
          onClick={() => {
            setIsCreateSheetOpen(true);
            setIsSettingsSheetOpen(false);
          }}
        >
          <Plus size={20} />
        </button>
        <div className="mobile-title">
          <strong>{activeList?.name ?? "Markdown TodoList"}</strong>
          <span>{syncStatus?.message ?? (isRemoteMode ? "云端同步" : "本地模式")}</span>
        </div>
        <button
          className="icon-button"
          type="button"
          title="设置"
          aria-label="打开设置"
          onClick={() => {
            setIsSettingsSheetOpen(true);
            setIsCreateSheetOpen(false);
          }}
        >
          <Settings size={20} />
        </button>
      </header>

      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <h1>Markdown TodoList</h1>
            <p>{isRemoteMode ? "VPS 实时同步" : "本地 Markdown 待办"}</p>
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

        {renderSyncPanel()}

        {todoApi ? (
          <>
            {renderCreatePanel("desktop-list-name")}
            {renderListNav()}
          </>
        ) : (
          <div className="empty-list">手机端需要先填写同步服务器信息。</div>
        )}
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          {activeList ? (
            <>
              <div className="title-block">
                <h2>{activeList.name}</h2>
                <p title={activeList.filePath}>
                  {activeList.storage === "remote" ? "云端同步列表" : activeList.filePath}
                </p>
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
                {todoApi?.exportMarkdown ? (
                  <button type="button" onClick={() => void exportMarkdown()}>
                    <Download size={17} />
                    导出 md
                  </button>
                ) : null}
                {canUploadLocalMarkdown ? (
                  <button type="button" onClick={() => void uploadSelectedLocalListToCloud()}>
                    <Upload size={17} />
                    上传本机 md
                  </button>
                ) : null}
                {isRemoteMode && window.todoApi?.saveMarkdownToLocal ? (
                  <button type="button" onClick={() => void syncCloudListToLocal()}>
                    <HardDrive size={17} />
                    同步到本地
                  </button>
                ) : null}
                {!isRemoteMode ? (
                  <button type="button" onClick={() => void revealActiveFile()}>
                    <FolderOpen size={17} />
                    文件位置
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="title-block">
              <h2>{todoApi ? "创建或打开一个 TodoList" : "连接同步服务器"}</h2>
              <p>
                {todoApi
                  ? "每个列表都可以在本地或云端保存"
                  : "填写服务器地址和访问密钥后即可在手机和桌面同步"}
              </p>
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
            {todoApi ? <FilePlus size={44} /> : <Server size={44} />}
            <h3>{todoApi ? "从左侧开始" : "先连接服务器"}</h3>
            <p>
              {todoApi
                ? "创建一个云端 TodoList，或导入已有 Markdown。"
                : "手机端和桌面端填写同一个服务器地址和访问密钥即可同步。"}
            </p>
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

      {isCreateSheetOpen ? (
        <div
          className="mobile-sheet-backdrop"
          role="presentation"
          onClick={() => setIsCreateSheetOpen(false)}
        >
          <section
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="新建 TodoList"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-heading">
              <span>新建 TodoList</span>
              <button
                className="icon-button"
                type="button"
                title="关闭"
                aria-label="关闭新建面板"
                onClick={() => setIsCreateSheetOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {todoApi ? (
              renderCreatePanel("mobile-list-name")
            ) : (
              <div className="empty-list">请先在设置里连接同步服务器。</div>
            )}
          </section>
        </div>
      ) : null}

      {isSettingsSheetOpen ? (
        <div
          className="mobile-sheet-backdrop"
          role="presentation"
          onClick={() => setIsSettingsSheetOpen(false)}
        >
          <section
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="设置"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-heading">
              <span>设置</span>
              <button
                className="icon-button"
                type="button"
                title="关闭"
                aria-label="关闭设置"
                onClick={() => setIsSettingsSheetOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {renderSyncPanel()}
          </section>
        </div>
      ) : null}
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

function SyncStatusPill({ status }: { status: SyncStatus }): ReactElement {
  return (
    <div className={status.connected ? "sync-status connected" : "sync-status offline"}>
      <span>{status.message}</span>
      {status.pendingOperations > 0 ? <strong>{status.pendingOperations}</strong> : null}
    </div>
  );
}

function createLocalSyncStatus(): SyncStatus {
  return {
    mode: "local",
    connected: true,
    pendingOperations: 0,
    message: "本地模式"
  };
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

function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
