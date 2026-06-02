# Develop Markdown TodoList App

## Goal

Build a maintainable and robust TodoList application that runs locally in a browser on an uncommon port. Users can create TodoLists backed by real Markdown files, either at a user-selected location or in a project-managed Markdown storage folder. The web UI should stay synchronized with the Markdown task state.

## What I already know

* The app must open in a browser after running the project.
* The local server should use an uncommon port.
* Users need a "new TodoList" flow.
* Each TodoList maps to an actual `.md` file.
* Users can choose a file location, or create files under a project folder dedicated to Markdown TodoLists.
* Todo priorities are exactly three levels: `P0`, `P1`, `P2`.
* Markdown format uses top-level headings:
  * `# P0`
  * `# P1`
  * `# P2`
* Todos are Markdown checkbox list items under each heading, for example `- [ ] 吃早餐`.
* Completing a todo in the UI must update the underlying Markdown from `[ ]` to `[x]`.
* Completed todos should be hidden by default, with a one-click control to show them.
* The project should be easy to package, deploy, and run on other computers.
* The repository currently has no application source code or package configuration; this task will scaffold the app from scratch.
* Existing project files are Trellis/agent setup files plus `AGENTS.md`.

## Assumptions (temporary)

* The MVP can run as a local Node.js desktop-like web app with a browser frontend and a backend file API.
* A browser-only app cannot freely create/read arbitrary local files without user file picker limitations, so a backend process or desktop wrapper is likely required.
* The project-managed Markdown storage folder can be named `data/todolists/` unless a better convention appears during repo inspection.
* Markdown files should be normalized to contain all three sections even if they are missing.

## Open Questions

* None for MVP.

## Requirements (evolving)

* Provide a web UI for viewing TodoLists grouped by P0/P1/P2.
* Provide a way to create a TodoList backed by a Markdown file.
* Provide a native file/folder chooser through Electron.
* Provide a way to create todos under each priority.
* Provide checkbox toggling that persists to Markdown.
* Hide completed todos by default.
* Provide a one-click control to show/hide completed todos.
* Keep implementation maintainable with clear module boundaries and validation around file operations.
* Make local running, packaging, and deployment straightforward.

## Acceptance Criteria (evolving)

* [x] Running the project starts a local app on an uncommon port.
* [x] Opening the local URL shows the TodoList app without extra setup.
* [x] A user can create a TodoList Markdown file in the project-managed storage folder.
* [x] A user can choose an external Markdown file location through a native dialog.
* [x] A user can add todos under P0, P1, and P2.
* [x] Todos are written as Markdown checkbox items under `# P0`, `# P1`, and `# P2`.
* [x] Checking a todo in the UI updates the corresponding `.md` file to `[x]`.
* [x] Completed todos are hidden by default and can be shown with one click.
* [x] The app can be packaged or deployed to another computer with clear commands.

## Definition of Done

* Tests added/updated where appropriate.
* Lint/typecheck/build pass.
* Manual browser verification passes.
* Packaging/deployment instructions are documented.
* Specs/notes updated if new project conventions are established.

## Out of Scope (explicit)

* Multi-user collaboration.
* Cloud sync.
* Rich Markdown editing beyond priority headings and checkbox todos.
* Mobile-native app packaging.

## Technical Notes

* Repo inspection found no existing frontend/backend framework, build scripts, or package manager lockfile.
* Browser file APIs can read/write user-approved files, but MDN marks `showSaveFilePicker()` as limited/not baseline and requiring secure context plus direct user activation.
* Tauri and Electron both provide native dialogs that return file system paths; that better matches "user chooses actual file location."
* Technical approach pending user preference.

## Research Notes

### What similar approaches support

* Browser File System Access API: keeps the app as a normal web page, but browser support is limited and access is permission/handle based rather than arbitrary path based.
* Electron: provides a web UI in a desktop shell, native file dialogs, Node filesystem access, and mature packaging tooling. It can also run a local backend on an uncommon port.
* Tauri: provides native dialogs and filesystem access with smaller desktop bundles, but production apps usually run inside a WebView rather than as a normal browser page on a port.

### Constraints from this project

* User-selected real Markdown file locations are a core requirement.
* Project-managed Markdown storage is also required.
* The app should be maintainable and robust from the start because there is no existing codebase to constrain the design.
* The app should be easy to package/deploy to other computers.

### Feasible approaches here

**Approach A: Local Node web app + browser** (closest to "open webpage")

* How it works: Vite/React frontend calls an Express API on an uncommon port; the backend manages Markdown files under a project storage folder and can write to user-provided validated absolute paths.
* Pros: Simple to run, easy to understand, easy to deploy with Node, directly satisfies the uncommon port requirement.
* Cons: A normal browser cannot reliably provide an OS save dialog with persistent arbitrary file paths across all browsers; external file creation may need path input or Chromium-only APIs.

**Approach B: Electron desktop app + local web server** (recommended for full requirement fit)

* How it works: React UI runs in Electron; Electron exposes native file/folder selection and writes Markdown through a backend/service layer. Development can use an uncommon local port; packaging can produce an installer/portable app.
* Pros: Best match for "choose actual file location", robust filesystem access, strong packaging story, still uses web frontend technology.
* Cons: Larger app size and a bit more setup than a pure Node web app.

**Approach C: Tauri desktop app**

* How it works: React UI runs in a lightweight WebView; Tauri plugins handle file dialogs and filesystem writes.
* Pros: Smaller bundles than Electron, good native file support.
* Cons: Adds Rust/toolchain requirements, and production mode is less aligned with "open webpage on a port."

## Decision (ADR-lite)

**Context**: The app must let users choose actual Markdown file locations and write checkbox changes back to disk. A browser-only app has limited, browser-specific local file APIs.

**Decision**: Use Electron with React/Vite. Development uses an uncommon Vite port, and Electron provides native dialogs plus filesystem access. Core Markdown behavior lives in a service module so it can be tested independently from the UI.

**Consequences**: Packaging is straightforward with Electron Builder, and filesystem behavior is robust. The packaged app is larger than a pure web app, but it fits the file-location requirement much better.

## Technical Approach

* Scaffold a TypeScript Electron + React/Vite app.
* Use `43157` as the uncommon local development port.
* Store project-managed Markdown TodoLists under `data/todolists/`.
* Keep Markdown parsing/writing in `src/main/markdownTodo.ts`.
* Expose a narrow IPC API from preload to renderer.
* Keep renderer state local and refresh from disk after mutations.
* Add tests for Markdown parsing/writing behavior.
