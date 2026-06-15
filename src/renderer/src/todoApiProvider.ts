import type { SyncServerConfig, TodoApi } from "../../shared/todoTypes";
import {
  clearRemoteConfig,
  disableRemoteMode,
  readRemoteConfig,
  readSavedRemoteConfig,
  RemoteTodoApi,
  writeRemoteConfig
} from "./remoteTodoApi";

let remoteApi: RemoteTodoApi | null = null;

export function getInitialRemoteConfig(): SyncServerConfig | null {
  return readRemoteConfig();
}

export function getSavedRemoteConfig(): SyncServerConfig | null {
  return readSavedRemoteConfig();
}

export function hasLocalTodoApi(): boolean {
  return Boolean(window.todoApi);
}

export function createTodoApi(config: SyncServerConfig | null): TodoApi | null {
  remoteApi?.dispose();
  remoteApi = null;

  if (config) {
    remoteApi = new RemoteTodoApi(config);
    return remoteApi;
  }

  return window.todoApi ?? null;
}

export function saveRemoteConfig(config: SyncServerConfig): SyncServerConfig {
  const normalized = {
    serverUrl: config.serverUrl.replace(/\/+$/u, ""),
    accessKey: config.accessKey
  };
  writeRemoteConfig(normalized);
  return normalized;
}

export function forgetRemoteConfig(): void {
  remoteApi?.dispose();
  remoteApi = null;
  disableRemoteMode();
}

export function deleteSavedRemoteConfig(): void {
  remoteApi?.dispose();
  remoteApi = null;
  clearRemoteConfig();
}
