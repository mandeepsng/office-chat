# OfficeChat

A lightweight, private desktop messenger for a small team (≈5–20 people). No
email, no passwords — just a shared **office code**. Built to feel fast, native,
and simple.

- **Desktop:** Tauri 2 · Svelte 5 · TypeScript · plain CSS (theme-aware)
- **Server:** Node.js · TypeScript · `ws` WebSockets · SQLite (`better-sqlite3`)
- **Monorepo:** pnpm workspaces with shared types + Zod validation

## Features

Direct + group chats · message history with cursor pagination · optimistic send
with an **offline queue** · exponential-backoff reconnection · presence
(online/offline) · debounced typing indicators · read receipts · emoji picker ·
GIPHY GIFs · native desktop notifications (suppressed for the focused room) ·
system tray with close-to-tray · light/dark themes · keyboard shortcuts.

## Repository layout

```
office-chat/
├── apps/
│   ├── desktop/   # Tauri + Svelte client
│   └── server/    # Node WebSocket + SQLite server
└── packages/
    ├── shared/       # Shared types, event names, constants
    └── validation/   # Zod schemas for every WS payload
```

## Requirements

- **Node.js** 20+
- **pnpm** 10+ (`npm install -g pnpm`)
- **Rust** + your platform's [Tauri prerequisites](https://tauri.app/start/prerequisites/) (only needed to run/build the desktop app)

## Setup

```bash
pnpm install

# Configure the server
cp apps/server/.env.example apps/server/.env
#   → set OFFICE_CODE to a value your team will share

# (optional) configure the desktop client
cp apps/desktop/.env.example apps/desktop/.env
#   → set VITE_GIPHY_API_KEY to enable GIFs
```

## Run

```bash
# Server + desktop together
pnpm dev

# …or individually
pnpm dev:server                     # ws://localhost:8787  (+ GET /health)
pnpm --filter @office-chat/desktop tauri dev   # native window
```

Running the desktop UI in a browser (no native shell) also works for quick UI work:

```bash
pnpm dev:desktop   # http://localhost:5173
```

> Native notifications and the system tray only work inside the Tauri window,
> not the browser preview.

## Build

```bash
pnpm --filter @office-chat/desktop tauri build
```

> **Icons:** `apps/desktop/src-tauri/tauri.conf.json` ships with an empty icon
> set. Generate icons before a production bundle with
> `pnpm --filter @office-chat/desktop tauri icon <path-to-1024x1024.png>`.

## Test & typecheck

```bash
pnpm test         # server test suite (node:test)
pnpm typecheck    # all packages
```

## How auth works

First launch asks for a name + office code. The client generates a `userId` and
`deviceId` (UUIDs), the server validates the office code, and the identity is
stored locally. On later launches the client reconnects silently with the stored
identity — no office code needed unless the local identity is cleared.

The office code is a **simple private-team gate, not strong authentication.** The
server never sends it back to clients. See the "Future" list below for the path
to invite tokens / signed auth.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `OFFICE_CODE` | server | Shared join code (required; must not be `CHANGE_ME` in prod) |
| `PORT` / `HOST` | server | Listen address (default `8787` / `0.0.0.0`) |
| `DATABASE_PATH` | server | SQLite file (default `./data/officechat.db`) |
| `LOG_MESSAGE_CONTENT` | server | Log message bodies (dev only) |
| `VITE_WS_URL` | desktop | Server URL (`ws://localhost:8787` dev, `wss://…` prod) |
| `VITE_GIPHY_API_KEY` | desktop | Enables the GIF picker |

## Production deployment

Run the server behind Nginx terminating TLS, and point the client at `wss://`.

```
Client ──wss──▶ Nginx ──ws──▶ Node (OfficeChat) ──▶ SQLite
```

Keep the process alive with systemd or PM2, e.g.:

```bash
pnpm --filter @office-chat/server start   # tsx src/index.ts
```

Never use plain `ws://` over the public internet, and never commit real secrets.

## Future (designed for, not built)

Reactions, replies, file/image sharing, voice/video, multi-office, invite links,
device management, closed-app push (the notification layer is already behind a
`NotificationService` interface), and end-to-end encryption.
## reset DB
pnpm --filter server dev