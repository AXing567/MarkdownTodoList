# brainstorm: mobile todo with VPS sync

## Goal

Build a mobile-friendly todo client and a lightweight server that can run on a 1 CPU / 1 GB RAM VPS. Both the existing desktop client and the new mobile client should use the VPS as a sync server so todos stay synchronized in near real time.

## What I already know

* The project is currently a Markdown todo application.
* The current app is Electron + React/Vite + TypeScript.
* The current renderer is a desktop-oriented React app with some small-screen CSS, but the UI still assumes a sidebar/workspace layout.
* Todo data is currently stored as local Markdown files and a local JSON registry.
* Desktop operations go through Electron preload IPC into `src/main/todoService.ts`.
* Shared todo types live in `src/shared/todoTypes.ts`.
* The user wants a mobile version of the todo app.
* The user wants a deployable server suitable for a small VPS, specifically 1c1g.
* Desktop and mobile clients should both connect to the VPS server.
* Todos should synchronize with the server in real time.
* The client should let the user fill in server information once and keep using it afterward.

## Assumptions (temporary)

* The MVP can share most business logic and data shape between desktop and mobile if the current project structure allows it.
* "Real time" can mean WebSocket push plus local optimistic updates, unless repo constraints suggest another simpler approach.
* The server should be easy to deploy with common VPS tooling, likely a single binary/container/process plus persistent local storage.
* The MVP server is single-user/private and protected by a shared access key/password configured at deploy time.
* Sync mode uses the server as the source of truth. Local Markdown files become import/export material instead of the live sync data source.
* Clients should support short offline editing by caching server data locally and replaying queued operations after reconnect.
* Conflict handling for the MVP uses last-write-wins semantics based on accepted operation order/version.

## Open Questions

* None for the MVP currently in progress.

## Requirements (evolving)

* Provide a mobile-friendly PWA/web todo client first.
* Keep the mobile client architecture compatible with a future native wrapper.
* Provide a lightweight sync server deployable to arbitrary VPS machines.
* Protect the first server version with a single shared access key/password.
* Allow desktop and mobile clients to connect to the same server.
* Persist server connection settings after first client setup.
* Keep todos synchronized with the server in near real time.
* In sync mode, treat server data as authoritative.
* Preserve Markdown as import/export instead of live local sync storage.
* Cache the latest server-backed todo data locally on desktop and mobile clients.
* Allow short offline editing by queueing create/update/complete/delete/reorder operations locally.
* Replay queued operations automatically after reconnect.
* Resolve concurrent/offline conflicts with last-write-wins behavior for the MVP.

## Acceptance Criteria (evolving)

* [x] A user can deploy the server on a 1c1g VPS with documented commands.
* [x] A user can open the mobile PWA/web client from a phone browser.
* [x] The mobile client can be added to the phone home screen if PWA support is included in MVP.
* [x] A desktop client can connect to the server after server info is configured once.
* [x] A mobile client can connect to the same server after server info is configured once.
* [x] Unauthorized clients cannot read or mutate todos without the configured access key/password.
* [x] Creating, updating, completing, deleting, and reordering todos on one client syncs to the other client.
* [x] Desktop users can import existing Markdown todo files into server-backed lists.
* [x] Desktop users can export server-backed lists back to Markdown.
* [x] A client can create, update, complete, delete, and reorder todos during a short network outage.
* [x] Queued offline edits sync automatically when connectivity returns.
* [x] The app shows sync status clearly enough that users can tell whether changes are pending, synced, or failed.
* [x] If two clients edit the same item before syncing, the later accepted operation wins without corrupting the list.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / CI checks pass.
* Docs or deployment notes updated for server setup and client configuration.
* Rollout/rollback and data persistence risks considered.

## Out of Scope (explicit)

* Native mobile app packaging for the first implementation.
* Multi-user registration/login and per-user sharing for the first implementation.
* Bidirectional live sync with arbitrary local Markdown files for the first implementation.
* Manual conflict resolution UI for the first implementation.

## Technical Notes

* Created during brainstorm.
* Existing files inspected:
  * `package.json`: no backend/server dependencies yet; current scripts target Electron app build/dev/test/lint.
  * `electron.vite.config.ts`: renderer dev server fixed to `127.0.0.1:43157`.
  * `src/shared/todoTypes.ts`: canonical todo/list request and API types.
  * `src/main/todoService.ts`: local Markdown-backed todo mutations.
  * `src/main/todoRegistry.ts`: local JSON list registry.
  * `src/main/ipc.ts` and `src/preload/index.ts`: Electron IPC API boundary.
  * `src/renderer/src/App.tsx` and `styles.css`: current UI and state flow.
  * `src/main/markdownTodo.ts`: Markdown parser/writer and stable ID behavior.
* Implemented files:
  * `src/shared/markdownFormat.ts`: shared Markdown parse/render utilities.
  * `src/shared/syncModel.ts`: shared sync snapshot operation logic.
  * `src/server/index.ts`: lightweight HTTP/WebSocket server and static PWA hosting.
  * `src/server/store.ts`: JSON file persistence for small VPS deployment.
  * `src/renderer/src/remoteTodoApi.ts`: remote sync adapter with local cache and offline queue.
  * `src/renderer/src/todoApiProvider.ts`: local/remote API selection.
  * `src/renderer/public/*`: PWA manifest, icon, and service worker.
  * `docs/sync-server.md`: deployment notes.
* Local verification completed:
  * `npm run typecheck`
  * `npm test`
  * `npm run lint`
  * `npm run build`
  * `npm run build:pwa`
  * local sync server smoke test on `127.0.0.1:43158`

## Research Notes

### Constraints from our repo/project

* The current app is local-first around Markdown files. Sync will require either a new remote data source or a bridge that mirrors server state into local Markdown.
* The renderer currently calls `window.todoApi`, so web/mobile reuse will likely require an adapter layer rather than hard-coding Electron IPC everywhere.
* A 1c1g VPS favors a small Node service, file/SQLite persistence, and minimal runtime dependencies.
* Real-time sync needs a push channel. WebSocket is the most flexible for bidirectional updates; SSE is simpler but only server-to-client.

### Feasible approaches here

**Approach A: Shared Web/PWA client + lightweight Node sync server** (Recommended)

* How it works: refactor renderer to use a `TodoApi` adapter; Electron uses IPC/local or remote adapter, mobile uses the same React UI as a responsive/PWA web app; server exposes HTTP APIs plus WebSocket sync.
* Pros: one UI codebase, easiest mobile deployment, no app store/build pipeline, fits small VPS, desktop and mobile share behavior.
* Cons: mobile is web/PWA rather than native; native filesystem integration remains desktop-only.

**Approach B: Keep desktop Electron UI, build separate mobile web client**

* How it works: add a server and create a second mobile-focused React entry/app.
* Pros: faster to design a phone-first interface without disturbing desktop UI too much.
* Cons: more duplicated UI/state logic; future feature parity costs more.

**Approach C: Native mobile wrapper later**

* How it works: first build responsive web/PWA and server, then optionally wrap with Capacitor/Tauri mobile later.
* Pros: preserves future native-app path.
* Cons: native packaging is additional scope and testing burden.

## Decision (ADR-lite)

**Context**: The mobile client can be delivered as a web/PWA experience or as a native app. The project already has a React renderer, and the server must be easy to deploy on small VPS machines.

**Decision**: Build the first mobile version as a PWA/web client and preserve a future path to a native wrapper.

**Consequences**: The MVP can focus on sync correctness, server deployment, and responsive mobile UX without adding native mobile packaging complexity. Future native app work can reuse the web client if the API and storage boundaries stay clean.

**Context**: The server can be single-user/private or support multi-user accounts. The first target deployment is an arbitrary 1c1g VPS.

**Decision**: Build the first server as a single-user private service protected by a shared access key/password.

**Consequences**: Deployment and runtime stay simple. The API should still avoid hard-coding assumptions that would make future multi-user support impossible.

**Context**: The existing desktop app stores todo lists in local Markdown files. Real-time sync across desktop and mobile can either keep Markdown as the live data source or use the server as the source of truth.

**Decision**: In sync mode, use the server as the source of truth and keep Markdown as import/export.

**Consequences**: Real-time sync is simpler and safer because all clients converge on server state. The original Markdown workflow remains useful for portability, but live editing arbitrary local `.md` files is outside the first sync MVP.

**Context**: Offline edits can conflict when multiple clients modify the same todo/list before all operations reach the server.

**Decision**: Use last-write-wins conflict handling for the MVP.

**Consequences**: Sync behavior stays simple and predictable enough for a single-user private server. A later version can add manual conflict review if real usage shows overwritten edits are painful.
