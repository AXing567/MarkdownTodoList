/// <reference types="vite/client" />

import type { TodoApi } from "../../shared/todoTypes";

declare global {
  interface Window {
    todoApi?: TodoApi;
  }
}
