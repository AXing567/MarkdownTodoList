# Sync Server Deployment

This server hosts the mobile PWA and the private sync API for Markdown TodoList.
It is designed for a small VPS and uses a local JSON data file by default.

## Build

```bash
npm install
npm run build:pwa
```

The build creates:

* `out/renderer/` for the PWA static files
* `out/server/` for the Node sync server

## Environment

Set these variables before starting the server:

```bash
TODO_ACCESS_KEY=change-this-long-random-secret
TODO_PORT=43158
TODO_HOST=0.0.0.0
TODO_DATA_PATH=/opt/markdown-todolist/data/sync-server.json
TODO_STATIC_DIR=/opt/markdown-todolist/out/renderer
```

`TODO_ACCESS_KEY` is required. Desktop and mobile clients use this value as the
access key when connecting.

Use a port that does not conflict with existing services on the VPS. The default
port is `43158`.

## Start

```bash
node out/server/server/index.js
```

For a long-running VPS process, run it behind your existing process manager
such as `systemd`, `pm2`, or a container runtime. Put HTTPS and domain routing in
your reverse proxy if you already use one.

## API

* `GET /health` does not require authentication.
* `GET /api/snapshot` requires `Authorization: Bearer <TODO_ACCESS_KEY>`.
* `POST /api/operations` requires the same authorization header.
* `GET /api/lists/:listId/markdown` exports one list as Markdown.
* `GET /ws?token=<TODO_ACCESS_KEY>` opens the real-time sync channel.

## Client Setup

Open the PWA URL from a phone or desktop browser, then enter:

* Server URL: the public URL of this service
* Access key: `TODO_ACCESS_KEY`

The client stores this information locally and reuses it on future launches.

If the app is published behind a reverse proxy subpath, enter that subpath as
the server URL, for example:

```text
http://your-vps-ip/todo
```

The client will derive API and WebSocket URLs from that base path.
