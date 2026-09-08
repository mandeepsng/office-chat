# OfficeChat — Full Development Brief

## 1. Project Overview

Build a lightweight private desktop messaging application called **OfficeChat** for a small office/team.

The application should work on:

* Windows
* macOS
* Linux

The primary goal is to create a **very lightweight alternative to Slack/Discord for a small private team**, without traditional account registration.

The application should feel:

* Fast
* Lightweight
* Modern
* Simple
* Private
* Native
* Minimal

The expected initial team size is approximately **5–20 users**, but the architecture should not unnecessarily prevent growth.

---

# 2. Core Technology Stack

Use a monorepo.

### Desktop

* Tauri 2
* Svelte
* TypeScript
* Tailwind CSS
* Rust only where native OS functionality is required

### Backend

* Node.js
* TypeScript
* WebSocket
* SQLite

### Package manager

Use:

```bash
pnpm
```

Use pnpm workspaces.

### Monorepo

```text
office-chat/
│
├── apps/
│   ├── desktop/
│   └── server/
│
├── packages/
│   ├── shared/
│   └── validation/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

Do NOT introduce Laravel, PostgreSQL, Redis, Docker, Kubernetes, or other infrastructure unless there is a strong technical reason.

The initial application should remain extremely lightweight.

---

# 3. Product Philosophy

This is a private office messenger, not a public social platform.

Avoid unnecessary complexity.

The MVP should prioritize:

1. Fast startup
2. Low RAM usage
3. Instant messaging
4. Reliable reconnection
5. Desktop notifications
6. Simple onboarding
7. Clean UI
8. Local message caching
9. Easy deployment

---

# 4. Authentication / Identity

There should be **no traditional login system**.

Do not ask users for:

* Email
* Password
* Username + password
* Phone number

Instead, first launch should display:

```text
Welcome to OfficeChat

Your name
[ Mandeep ]

Office Code
[ ABC123 ]

        Join Office
```

The server validates the office code.

After successful joining, generate a UUID for the installation/device.

Example:

```text
user_id:
550e8400-e29b-41d4-a716-446655440000
```

Store the identity locally.

On subsequent launches:

```text
Start app
   ↓
Load local identity
   ↓
Connect WebSocket
   ↓
User is automatically authenticated
```

The user should not need to enter the office code again unless their local identity is removed.

---

# 5. Office Code

The server should have an environment variable:

```env
OFFICE_CODE=ABC123
```

The client sends the office code during initial registration.

The server should never send the actual office code back to the client.

Use an environment variable rather than hardcoding the code.

---

# 6. User Model

Initial user fields:

```text
users
-----
id
name
avatar
created_at
last_seen_at
is_online
```

`id` should be UUID.

Avatar can initially be:

* Generated initials
* Emoji avatar
* Local/default avatar

Do not implement complicated profile management in v1.

---

# 7. Device Identity

Create a `devices` table:

```text
devices
-------
id
user_id
device_name
platform
last_seen_at
created_at
```

Platform values:

```text
windows
macos
linux
```

A user can eventually have multiple devices.

Design the schema so multi-device support is possible, even if the UI initially focuses on one desktop installation.

---

# 8. Chat Types

Support:

### Direct messages

```text
Mandeep ↔ Rohit
```

### Group rooms

```text
Development Team
Marketing Team
Office General
```

Database:

```text
rooms
-----
id
type
name
created_by
created_at
```

`type`:

```text
direct
group
```

Members:

```text
room_members
------------
room_id
user_id
joined_at
```

---

# 9. Messages

Database:

```text
messages
--------
id
room_id
sender_id
content
message_type
reply_to_id
created_at
updated_at
deleted_at
```

Message types:

```text
text
gif
image
file
system
```

For MVP:

* text
* gif

should work first.

---

# 10. Message IDs

Generate UUIDs for messages.

The client can generate a temporary local ID before sending.

Example:

```text
client_message_id
```

The server should make message creation idempotent where practical so reconnects do not accidentally create duplicate messages.

---

# 11. WebSocket Architecture

The Node.js server should maintain WebSocket connections.

Example:

```text
Tauri Desktop
      │
      │ WebSocket
      ▼
Node.js Server
      │
      ├── Authentication
      ├── Presence
      ├── Rooms
      ├── Messages
      ├── Typing
      └── Read receipts
      │
      ▼
SQLite
```

Do NOT poll the server for new messages.

All realtime communication should use WebSocket.

---

# 12. WebSocket Protocol

Use structured JSON messages.

Every WebSocket message should have a consistent structure.

Example:

```json
{
  "type": "message:send",
  "payload": {}
}
```

Server responses:

```json
{
  "type": "message:new",
  "payload": {}
}
```

---

# 13. WebSocket Events

Implement at minimum:

### Client → Server

```text
auth:register
auth:connect

room:list
room:create
room:join
room:leave

message:send
message:edit
message:delete

message:read

typing:start
typing:stop

presence:update
```

### Server → Client

```text
auth:success
auth:error

room:list
room:created
room:updated

message:new
message:updated
message:deleted

message:sent
message:read

typing:start
typing:stop

presence:online
presence:offline

error
```

Keep event names centralized inside:

```text
packages/shared/
```

Do not duplicate event strings throughout the project.

---

# 14. Shared TypeScript Package

Create:

```text
packages/shared/
```

It should contain:

```text
types/
events/
constants/
```

Example:

```ts
export type MessageType =
  | "text"
  | "gif"
  | "image"
  | "file"
  | "system";
```

Example:

```ts
export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
  updatedAt?: string;
}
```

The desktop app and server must use these shared types.

---

# 15. Validation

Create:

```text
packages/validation/
```

Use a validation library such as Zod.

Validate WebSocket payloads on the server.

Never trust client input.

Example:

```text
message:send
```

should validate:

* roomId
* content
* message type
* message length
* optional reply ID

---

# 16. Message Sending Flow

Example:

```text
Mandeep types:

"Hello bro 👋"

       ↓

Desktop client

       ↓

WebSocket

message:send

       ↓

Node.js

       ↓

Validate

       ↓

Check user is member of room

       ↓

Save SQLite

       ↓

Broadcast message:new

       ↓

Other connected users receive message
```

---

# 17. Offline / Reconnection

This is important.

The client must automatically reconnect if WebSocket disconnects.

Use exponential backoff.

Example:

```text
1 sec
2 sec
4 sec
8 sec
16 sec
30 sec max
```

Do not reconnect aggressively forever without delay.

UI should show:

```text
Connected
Connecting...
Offline
```

---

# 18. Local Storage

Use local storage for:

* user ID
* device ID
* username
* office information
* WebSocket settings

Do not store sensitive secrets unnecessarily.

For message caching, preferably use a local SQLite database on the desktop side if practical.

The goal is:

```text
Open app
   ↓
Chat appears immediately
   ↓
Background sync
```

The user should not wait for the server before seeing previously loaded conversations.

---

# 19. Desktop UI

Use Svelte + Tailwind.

Design should be inspired by modern messaging applications but **do not clone Slack, Discord, Teams, or other products pixel-for-pixel**.

Main layout:

```text
┌────────────────────────────────────────────────────┐
│ OfficeChat                                         │
├───────────────┬────────────────────────────────────┤
│               │                                    │
│ Search        │  Rohit                             │
│               │  ● Online                          │
│ DIRECT        │────────────────────────────────────│
│               │                                    │
│ Mandeep       │          Hey bro 👋                │
│ Rohit         │                                    │
│ Aman          │  How are you?                      │
│               │                                    │
│ GROUPS        │                     I'm good!      │
│               │                                    │
│ General       │                                    │
│ Development   │────────────────────────────────────│
│ Design        │ 😊   Type a message...       GIF   │
│               │                                    │
└───────────────┴────────────────────────────────────┘
```

---

# 20. Sidebar

Sidebar should include:

* Current user
* Online status
* Search
* Direct messages
* Groups
* Create group button
* Settings

Keep it minimal.

---

# 21. Chat Header

Display:

```text
Rohit
● Online
```

For group:

```text
Development Team
5 members
```

---

# 22. Message UI

Message bubbles should support:

* Text
* Emoji
* GIF
* Timestamp
* Sender
* Read state

Example:

```text
Rohit
Hey bro 👋

12:42 PM
```

For own messages:

```text
Hey! What's up?

12:43 PM ✓✓
```

---

# 23. Emoji

Add an emoji picker.

Do not build an emoji database manually.

Use a reliable open-source emoji picker compatible with Svelte.

Emoji should be inserted into the composer.

Example:

```text
😂
🔥
❤️
👍
🎉
🚀
```

---

# 24. GIF

Integrate GIPHY API.

The composer should have:

```text
[😊] [GIF]
```

Clicking GIF opens:

```text
┌─────────────────────────────┐
│ Search GIFs                 │
│ [ happy birthday        ]   │
│                             │
│ [GIF] [GIF] [GIF]           │
│ [GIF] [GIF] [GIF]           │
└─────────────────────────────┘
```

Do not download GIF files to the server for MVP.

Store the GIF URL and metadata.

Example:

```json
{
  "messageType": "gif",
  "content": "https://..."
}
```

Use environment variable:

```env
GIPHY_API_KEY=
```

---

# 25. Typing Indicator

When user starts typing:

```text
typing:start
```

When typing stops:

```text
typing:stop
```

Display:

```text
Rohit is typing...
```

Debounce typing events.

Do not send a WebSocket event on every keystroke.

---

# 26. Read Receipts

Support:

```text
✓   sent
✓✓  delivered
✓✓  read
```

Initially implement this simply.

When the user opens a conversation and messages are visible:

```text
message:read
```

should be sent.

---

# 27. Presence

Display:

```text
● Online
○ Offline
```

The server should maintain connection state.

When a WebSocket disconnects:

```text
presence:offline
```

should be broadcast.

Use `last_seen_at` for offline users.

---

# 28. Notifications

Use the Tauri notification plugin for native desktop notifications.

When a new message arrives:

```text
Rohit
Hey bro, are you coming?
```

The OS should display a native notification.

Important:

Do not display a notification if the user is currently viewing the same conversation, unless configured otherwise.

Notification logic:

```text
New message
     ↓
Is app connected?
     ↓
Yes
     ↓
Is current room open?
   /       \
 Yes       No
  ↓         ↓
No       Notification
notification
```

---

# 29. Windows / macOS / Linux

Tauri must support:

```text
Windows
macOS
Linux
```

Test the application on all three platforms where possible.

Do not assume identical notification behavior across all operating systems.

Native notification behavior should use Tauri's official notification plugin.

---

# 30. Closed-App Notifications

Do not incorrectly assume that Firebase FCM works identically on Windows, macOS, and Linux desktop applications.

For the first MVP:

1. Implement reliable native notifications while the application/background process is available.
2. Keep the notification service abstract.
3. Create an interface such as:

```ts
interface NotificationService {
  notify(message: NotificationPayload): Promise<void>;
}
```

Later, implement platform-specific push delivery if true closed-app push is required.

Do not tightly couple the entire application to FCM.

---

# 31. System Tray

Add a system tray icon.

When user closes the window, optionally minimize to tray rather than completely exiting.

Tray menu:

```text
OfficeChat

Show OfficeChat
──────────────
Quit
```

This is useful for notifications.

---

# 32. Auto Start

Eventually support:

```text
Start OfficeChat with system
```

Keep this configurable.

Do not force auto-start by default without user consent.

---

# 33. Security

Even though this is a private office application, implement basic security.

### Server

Validate:

* office code
* user ID
* room membership
* message length
* message type
* payload structure

Never allow a client to send messages to arbitrary rooms.

### WebSocket

Use:

```text
wss://
```

in production.

Do not use plain `ws://` over the public internet.

---

# 34. Office Code Security

The office code is not a replacement for strong authentication.

It is intended as a simple private-team access mechanism.

Document this limitation clearly.

Later we can add:

* invitation tokens
* admin approval
* device approval
* signed authentication tokens

Do not over-engineer v1.

---

# 35. Rate Limiting

Implement basic server-side rate limiting.

Example:

```text
Maximum messages per second per connection
Maximum message length
Maximum connection attempts
```

Prevent accidental or malicious message flooding.

---

# 36. SQLite

Use SQLite on the server.

Recommended library:

```text
better-sqlite3
```

or another well-maintained SQLite driver.

Prefer synchronous SQLite operations if the workload is tiny and simplicity is improved.

For 5–20 office users this is completely acceptable.

Create migrations or an initialization function so the database can be created automatically.

---

# 37. Database Indexes

Add indexes for:

```text
messages.room_id
messages.created_at
messages.sender_id
room_members.user_id
room_members.room_id
```

Message history should be queried using pagination.

Do NOT load thousands of messages at once.

---

# 38. Message History

When opening a room:

```text
GET latest 50 messages
```

Older messages should load when scrolling upward.

Use cursor-based pagination if possible.

Example:

```text
before=<message_id>
limit=50
```

---

# 39. Server API

Most realtime functionality should use WebSocket.

HTTP endpoints can be minimal.

Potential endpoints:

```text
GET /health

POST /register
GET /rooms
GET /rooms/:id/messages
```

But avoid unnecessary REST complexity.

---

# 40. Health Endpoint

Add:

```text
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

This will help VPS monitoring.

---

# 41. Environment Variables

Create:

```text
.env.example
```

Example:

```env
PORT=3000
HOST=0.0.0.0

OFFICE_CODE=CHANGE_ME

DATABASE_PATH=./data/officechat.db

GIPHY_API_KEY=

NODE_ENV=development
```

Do not commit real secrets.

---

# 42. Error Handling

Never crash the WebSocket server because of one invalid client payload.

Handle:

```text
invalid JSON
invalid event
invalid authentication
invalid room
unauthorized room
invalid message
database error
```

Return structured errors:

```json
{
  "type": "error",
  "payload": {
    "code": "ROOM_NOT_FOUND",
    "message": "Room not found"
  }
}
```

---

# 43. Logging

Use simple structured logging.

Development:

```text
[INFO] Server started on :3000
[INFO] User connected: Mandeep
[INFO] Message received
[INFO] User disconnected
```

Do not log message content in production unless explicitly configured.

Never log secrets.

---

# 44. Performance Goals

The application should be lightweight.

Target:

### Server

For approximately 5–20 connected users:

```text
RAM: ideally <100 MB
CPU: near idle when inactive
```

Avoid unnecessary dependencies.

### Desktop

Tauri should be preferred over Electron specifically because this is a lightweight application.

---

# 45. Offline UX

If connection is lost:

Display:

```text
⚠ Reconnecting...
```

The user should still be able to:

* Read cached messages
* Navigate existing conversations

Sending a new message while offline should either:

1. Queue it locally and send after reconnection, or
2. Clearly mark it as pending.

Prefer option 1 if implementation remains reliable.

Example:

```text
Sending...
Pending
Sent
Delivered
Read
Failed
```

---

# 46. Message Queue

For reliable offline sending:

```text
local message
      ↓
status = pending
      ↓
WebSocket reconnect
      ↓
send
      ↓
server ACK
      ↓
status = sent
```

Use a `client_message_id` to avoid duplicate messages.

---

# 47. UI States

The application must handle:

### Loading

```text
Loading OfficeChat...
```

### Connecting

```text
Connecting...
```

### Connected

```text
● Connected
```

### Offline

```text
⚠ Offline
```

### Empty chat

```text
No messages yet.

Say hello 👋
```

---

# 48. Responsive Desktop UI

The application is primarily desktop.

Optimize for:

```text
1280×720
1440×900
1920×1080
```

The UI should also remain usable on smaller laptop screens.

---

# 49. Theme

Support:

* Light
* Dark

Default to system preference.

Use clean modern typography.

Avoid excessive gradients or heavy animations.

Animations should be subtle.

---

# 50. Accessibility

Support:

* Keyboard navigation
* Enter to send
* Shift + Enter for newline
* Escape to close popups
* Proper focus states
* Accessible buttons
* Screen-reader labels where practical

---

# 51. Keyboard Shortcuts

Implement:

```text
Enter          Send
Shift+Enter    New line
Escape         Close popup
Ctrl/Cmd+K     Search
```

---

# 52. Search

MVP can implement basic message/user search.

Start with:

```text
Search users
Search rooms
```

Then add message search.

Do not implement an advanced search engine.

SQLite `LIKE` is sufficient initially.

---

# 53. File Attachments

Do not make full file storage a requirement for the first milestone.

Architecture should allow:

```text
image
file
```

message types later.

When implementing:

```text
files/
```

should be abstracted behind a storage service.

Potential future providers:

* Local filesystem
* S3
* Cloudflare R2

Do not add S3/R2 to v1 unless required.

---

# 54. Project Coding Standards

Use TypeScript wherever possible.

Avoid:

```ts
any
```

unless absolutely necessary.

Use strict TypeScript.

Use clear module boundaries.

Avoid giant files.

Do not put the entire WebSocket implementation into one 2,000-line file.

---

# 55. Suggested Server Structure

```text
apps/server/

src/
├── index.ts
├── config/
│   └── env.ts
├── db/
│   ├── database.ts
│   ├── migrations.ts
│   └── repositories/
│       ├── users.ts
│       ├── rooms.ts
│       └── messages.ts
├── websocket/
│   ├── server.ts
│   ├── connection.ts
│   ├── router.ts
│   └── events/
│       ├── auth.ts
│       ├── rooms.ts
│       ├── messages.ts
│       ├── typing.ts
│       └── presence.ts
├── services/
│   ├── user-service.ts
│   ├── room-service.ts
│   └── message-service.ts
└── utils/
```

Keep it simple if a smaller structure is sufficient.

---

# 56. Suggested Desktop Structure

```text
apps/desktop/

src/
├── lib/
│   ├── websocket/
│   │   ├── client.ts
│   │   ├── events.ts
│   │   └── reconnect.ts
│   ├── notifications/
│   ├── storage/
│   └── api/
├── components/
│   ├── Sidebar/
│   ├── Chat/
│   ├── Composer/
│   ├── EmojiPicker/
│   ├── GifPicker/
│   └── Common/
├── stores/
│   ├── auth.ts
│   ├── rooms.ts
│   ├── messages.ts
│   └── connection.ts
└── routes/
    └── ...
```

---

# 57. State Management

Use Svelte stores or Svelte 5 runes.

Keep state separated:

```text
auth
connection
rooms
messages
presence
typing
```

Do not put the entire application state into one giant store.

---

# 58. Desktop Storage

Create an abstraction:

```ts
interface LocalStorage {
  getUser(): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  clearUser(): Promise<void>;
}
```

This allows the implementation to change later without rewriting UI components.

---

# 59. Notification Abstraction

Create:

```ts
interface NotificationService {
  notify(payload: NotificationPayload): Promise<void>;
}
```

Possible future implementations:

```text
TauriNotificationService
FCMNotificationService
WindowsPushService
MacOSPushService
LinuxPushService
```

For v1:

```text
TauriNotificationService
```

---

# 60. Important Notification Rule

If the application window is focused and the user is currently viewing:

```text
room_id = incoming_message.room_id
```

do not show a notification.

If the application is minimized/background and a message arrives:

show notification.

---

# 61. GIF Architecture

The client should call GIPHY or preferably route requests through a small backend endpoint if API-key exposure is a concern.

Do not store large GIF binary files in SQLite.

Store:

```text
gif_id
gif_url
preview_url
width
height
```

as message metadata if needed.

---

# 62. Future Features

Do not implement now, but design with room for:

* Message reactions
* Reply to message
* Message editing
* Message deletion
* File sharing
* Image previews
* Voice messages
* Voice calls
* Video calls
* Screen sharing
* User profiles
* Admin panel
* Multiple offices
* Invite links
* Device management
* Push notifications
* End-to-end encryption

Do not allow these future features to overcomplicate the MVP.

---

# 63. Deployment

The backend should be deployable to a small VPS.

Example:

```text
Ubuntu VPS
   │
   ├── Node.js
   ├── OfficeChat server
   └── SQLite
```

Use:

```text
systemd
```

or PM2.

Recommended production:

```text
Nginx
   ↓
HTTPS/WSS
   ↓
Node.js
```

---

# 64. Production URLs

Example:

```text
https://chat.example.com
wss://chat.example.com/ws
```

The desktop app should use an environment/configurable server URL.

Do not hardcode localhost.

Development:

```text
ws://localhost:3000
```

Production:

```text
wss://chat.example.com
```

---

# 65. README Requirements

The README must explain:

### Requirements

* Node.js
* pnpm
* Rust
* Tauri prerequisites

### Install

```bash
pnpm install
```

### Run server

```bash
pnpm --filter server dev
```

### Run desktop

```bash
pnpm --filter desktop tauri dev
```

### Build

```bash
pnpm --filter desktop tauri build
```

Also explain how to configure:

```env
OFFICE_CODE=
GIPHY_API_KEY=
```

---

# 66. Development Phases

Implement in this exact order.

## Phase 1 — Foundation

* Monorepo
* pnpm
* Tauri
* Svelte
* Node.js
* TypeScript
* SQLite
* Shared package

## Phase 2 — Identity

* Office code
* Device ID
* Username
* Registration
* Persistent local identity

## Phase 3 — WebSocket

* Connection
* Authentication
* Reconnection
* Presence
* Event router

## Phase 4 — Messaging

* Rooms
* Direct chat
* Group chat
* Send message
* Receive message
* Message history
* Pagination

## Phase 5 — UX

* Sidebar
* Chat screen
* Composer
* Typing
* Read receipts
* Online/offline

## Phase 6 — Emoji/GIF

* Emoji picker
* GIPHY integration
* GIF messages

## Phase 7 — Notifications

* Tauri native notifications
* Notification suppression when chat is open
* Tray behavior

## Phase 8 — Offline

* Local message cache
* Pending messages
* Reconnect
* Synchronization

## Phase 9 — Production

* HTTPS
* WSS
* Nginx
* systemd/PM2
* Logging
* Health endpoint

---

# 67. Testing Requirements

Write tests for critical backend functionality.

At minimum:

### Authentication

* Correct office code
* Incorrect office code

### Messages

* Valid message
* Invalid message
* User not in room
* Message too long

### Rooms

* Create room
* Join room
* Leave room

### WebSocket

* Connect
* Disconnect
* Reconnect
* Broadcast message

### Database

* Create user
* Create room
* Store message
* Retrieve history

---

# 68. Important Engineering Rules

Do NOT:

* Add unnecessary frameworks
* Add Laravel
* Add Redis for the initial MVP
* Add PostgreSQL
* Add Docker unless required
* Build a complicated authentication system
* Use Firebase as the realtime message transport
* Assume FCM works identically on all desktop OSes
* Store huge binary files in SQLite
* Create giant components
* Put secrets in Git
* Trust client input
* Load unlimited message history

---

# 69. Realtime Architecture Decision

Use:

```text
WebSocket
```

for:

* Messages
* Typing
* Presence
* Read receipts
* Room updates

Use:

```text
Tauri native notifications
```

for:

* Desktop notifications while the application/background process is available.

Keep push notification architecture abstract for future implementation.

Do NOT make FCM responsible for normal realtime messaging.

---

# 70. Final UX Goal

The user should experience the application like this:

```text
Install OfficeChat
       ↓
Open
       ↓
Enter name + office code
       ↓
Join
       ↓
See team members
       ↓
Click Rohit
       ↓
Send:

"Hey bro 👋"

       ↓
Instantly delivered
       ↓
Rohit receives native notification
       ↓
Rohit replies:

"Hey! 👋"
```

Everything should feel almost instantaneous.

---

# 71. Definition of Done — MVP

The MVP is considered complete when:

* [ ] Tauri desktop app builds
* [ ] Windows build works
* [ ] macOS build works
* [ ] Linux build works
* [ ] No traditional login exists
* [ ] Office code registration works
* [ ] User identity persists
* [ ] WebSocket connection works
* [ ] Automatic reconnect works
* [ ] Users show online/offline
* [ ] Direct messaging works
* [ ] Group messaging works
* [ ] Messages persist in SQLite
* [ ] Message history loads
* [ ] Pagination works
* [ ] Typing indicator works
* [ ] Read receipts work
* [ ] Emoji picker works
* [ ] GIF picker works
* [ ] Native notifications work
* [ ] Notification suppression works
* [ ] System tray works
* [ ] Light/dark mode works
* [ ] Offline state works
* [ ] Pending messages work or are clearly marked
* [ ] Server has `/health`
* [ ] Production WSS works
* [ ] README contains setup instructions
* [ ] No secrets are committed
* [ ] Critical backend tests pass

---

# 72. Claude's Implementation Instructions

You are the lead engineer for this project.

Do not simply provide conceptual explanations.

**Implement the project.**

Start by inspecting the existing repository structure if files already exist.

If an existing implementation is provided, improve it instead of blindly replacing it.

Work incrementally.

After each major phase:

1. Check TypeScript errors.
2. Check imports.
3. Check package dependencies.
4. Check WebSocket event consistency.
5. Check database schema.
6. Check frontend state management.
7. Check Tauri configuration.

Prioritize a working MVP over unnecessary abstraction.

When making architecture decisions, prefer the simplest solution that satisfies the requirements.

The final project should be clean enough that another developer can clone the repository and understand it quickly.

## Most important priorities

```text
1. Reliability
2. Simplicity
3. Performance
4. Clean architecture
5. Good UX
6. Security
7. Future extensibility
```

Do not over-engineer a 5–20 person office messenger.

Build the smallest production-quality version first.
