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
GIPHY GIFs · YouTube search + inline play · **1:1 audio calls with screen
share** (WebRTC, signaled over the same WebSocket) · native desktop
notifications (suppressed for the focused room) ·
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
#   → set VITE_YOUTUBE_API_KEY to enable YouTube search
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
| `LINK_PREVIEWS_ENABLED` | server | Server-side URL unfurl cards (default on; `false` to disable) |
| `LINK_PREVIEW_TTL_DAYS` | server | How long previews are cached (default `7`) |
| `VITE_WS_URL` | desktop | Server URL (`ws://localhost:8787` dev, `wss://…` prod) |
| `VITE_GIPHY_API_KEY` | desktop | Enables the GIF picker |
| `VITE_YOUTUBE_API_KEY` | desktop | Enables YouTube search (YouTube Data API v3) |

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

## Calls (1:1 audio + screen share)

The click-to-call button on a direct chat starts a WebRTC call; the server
only relays signaling (`call:*` events) and never sees media. Notes:

- **STUN only by default** (`stun:stun.l.google.com:19302`, set in
  [`apps/desktop/src/lib/call.ts`](apps/desktop/src/lib/call.ts)). This is
  enough for most office networks. If calls fail to connect for someone behind
  a strict NAT/firewall, run a TURN server (e.g. `coturn`) on the same VPS and
  add it to `ICE_SERVERS`.
- **macOS** requires the `NSMicrophoneUsageDescription` key, already set in
  `apps/desktop/src-tauri/Info.plist` and merged into the app bundle by the
  Tauri build.
- **Linux screen share** depends on the system WebKitGTK's `getDisplayMedia`
  support (via PipeWire) — this varies by distro/version; audio calls are
  unaffected either way.
- Group calls are out of scope for this app (would need an SFU media server);
  only one call at a time per user is supported.

## Future (designed for, not built)

Reactions, replies, file/image sharing, group video calls, multi-office,
invite links, device management, closed-app push (the notification layer is
already behind a `NotificationService` interface), and end-to-end encryption.
## reset DB
pnpm --filter server dev