# Markdown TodoList

一个本地运行的 Markdown TodoList 应用。每个 TodoList 都对应一个真实的 `.md` 文件，支持项目内保存和用户自选文件位置。

## 功能

- Electron + React/Vite + TypeScript
- 开发端口：`43157`
- Todo 等级：`P0`、`P1`、`P2`
- Markdown 格式：

```md
# P0
- [ ] 吃早餐

# P1

# P2
```

- 勾选网页中的待办会同步写回 Markdown：`[ ]` -> `[x]`
- 点击待办文字可一键复制待办内容
- 默认隐藏已完成待办，可一键显示
- 支持打包为 Windows 安装包或便携版

## 开发运行

```bash
npm install
npm run dev
```

运行后会打开 Electron 窗口；开发服务器使用 `http://127.0.0.1:43157`。

## 构建与打包

```bash
npm run build
npm run package
npm run dist
```

- `npm run package`：生成未压缩应用目录，适合快速验证
- `npm run dist`：生成安装包/便携版，输出到 `release/`

## 数据位置

- 开发模式下，项目内 TodoList 默认保存在 `data/todolists/`
- 打包后，项目内 TodoList 默认保存在 Electron 的用户数据目录
- 外部 TodoList 使用系统文件选择器创建或打开

## 质量检查

```bash
npm run lint
npm run typecheck
npm test
```
