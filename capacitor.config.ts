import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "local.markdown.todolist",
  appName: "Markdown TodoList",
  webDir: "out/renderer",
  android: {
    allowMixedContent: true
  }
};

export default config;
