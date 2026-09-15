# OfficeChat — Native / System Features Implementation Plan

This document plans the next round of **OS-level / native desktop** features for the
OfficeChat Tauri app. It builds on what already exists and follows the project's
core priorities: **Reliability › Simplicity › Performance › Clean architecture ›
UX › Security › Extensibility**. No over-engineering — smallest production-quality
version first.

---

## 0. Current State (already implemented)

| Feature | Where | Status |
|---|---|---|
| Native toast notifications + **click-to-open room** | `src-tauri/src/notify.rs`, `src/lib/notifications.ts` | ✅ |
| Toast sound (Windows **IM chime**) | `src-tauri/src/notify.rs` | ✅ |
| In-app message sounds (soft pop / send whoosh) | `src/lib/sounds.ts` | ✅ |
| System tray (Version / Show / Quit) | `src-tauri/src/lib.rs` | ✅ |
| Close-to-tray (window hide, not exit) | `src-tauri/src/lib.rs` | ✅ |
| Autostart at login | `tauri-plugin-autostart` | ✅ |
| Auto-updater | `tauri-plugin-updater` | ✅ |
| Notification suppression when room focused | `src/lib/controller.ts` | ✅ |
| **Single-instance lock** (P0) | `src-tauri/src/lib.rs` | ✅ |
| **Tray unread badge + sidebar pills** (P1) | `src-tauri/src/tray.rs`, `src/lib/stores/unread.svelte.ts`, `src/lib/badge.ts`, `Sidebar.svelte` | ✅ |
| **Taskbar flash / attention** (P2) | `src-tauri/src/tray.rs` (`flash_window`) | ✅ |
| **Global hotkey** (P3) — Ctrl/Cmd+Shift+O toggles window | `src-tauri/src/lib.rs` | ✅ |
| **Window state persistence** (P4) | `src-tauri/src/lib.rs` (`window-state` plugin) | ✅ |
| **DND + sound/notification settings** (P5) | `src/lib/stores/settings.svelte.ts`, `Settings.svelte`, tray DND, `notify.rs` sound param | ✅ |

**Installed plugins:** `notification`, `dialog`, `autostart`, `updater`, `process`, `single-instance`, `global-shortcut`, `window-state`.

---

## Priority Order

```
P0  Single-instance lock          (correctness — prevents dup connections)
P1  Tray unread badge             (core chat UX)
P2  Taskbar flash / attention     (core chat UX)
P3  Global hotkey                 (native feel)
P4  Window state persistence      (polish)
P5  DND / mute + sound settings   (user control)
P6  Idle / away presence          (nice-to-have)
```

Each phase is independently shippable. Verify after each:
`pnpm exec svelte-check` (frontend) + `cargo check` (in `src-tauri/`).

---

## P0 — Single-Instance Lock

**Problem:** launching the app twice opens two windows, two trays, and two
WebSocket connections (double presence, double notifications).

**Approach:** `tauri-plugin-single-instance`. On a second launch, the plugin
fires a callback in the already-running instance instead of starting a new one —
we unminimize + focus the existing window.

**Changes**
- `Cargo.toml` (desktop-only target):
  ```toml
  tauri-plugin-single-instance = "2"
  ```
- `src-tauri/src/lib.rs` — register **first**, before other plugins:
  ```rust
  #[cfg(desktop)]
  builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
          let _ = w.unminimize();
          let _ = w.show();
          let _ = w.set_focus();
      }
  }));
  ```
- No capability change needed (backend-only).

**Risk:** low. **Test:** launch app, launch again → second launch focuses the first.

---

## P1 — Tray Unread Badge

**Goal:** show total unread count so the user knows there are messages without
opening the window.

**Two surfaces:**
1. **Tray tooltip / title** — `"OfficeChat — 3 unread"` (all platforms, trivial).
2. **Native badge** — Windows taskbar **overlay icon**, macOS **dock badge**,
   Linux (Unity) count via `window.set_badge_count()` (Tauri 2 API where
   supported).

**Unread model (frontend):**
- New store `src/lib/stores/unread.svelte.ts`:
  ```ts
  export const unread = $state<{ byRoom: Record<string, number>; total: number }>(
    { byRoom: {}, total: 0 },
  );
  ```
- In `controller.onMessageNew`: if the message's room is **not** the active+focused
  room, increment `unread.byRoom[roomId]` and recompute `total`.
- When a room is opened/read (`markReadLatest`), reset that room's count to 0.
- Sidebar shows a per-room pill using the same store (bonus UI win).

**Push count to native:**
- New Rust command `set_unread(count: u32)` in `notify.rs` (or a `tray.rs`):
  - `count == 0` → clear overlay/badge, tooltip = `"OfficeChat"`.
  - `count > 0` → tooltip = `"OfficeChat — {count} unread"`; set badge.
  - Windows: `window.set_overlay_icon(...)` with a small red dot/number icon, or
    fall back to tooltip only if overlay asset generation is deemed too heavy for v1.
  - macOS/Linux: `window.set_badge_count(Some(count))`.
- Frontend calls `invoke("set_unread", { count: unread.total })` in an `$effect`.

**Scope note:** v1 can ship **tooltip + macOS/Linux badge count + Windows overlay
dot** (static red-dot icon, no rendered number) to stay simple. Numbered Windows
overlay = future enhancement.

**Risk:** medium (per-OS badge behavior differs — see CLAUDE.md §29).
**Test:** receive messages while minimized → tray tooltip + badge update; open room → clears.

---

## P2 — Taskbar Flash / Request Attention

**Goal:** when a message arrives and the window is not focused, flash the taskbar
button (Windows) / bounce dock (macOS) to draw the eye.

**Approach:** Tauri window API `request_user_attention`.
- Rust command `flash_attention()`:
  ```rust
  use tauri::window::UserAttentionType;
  if let Some(w) = app.get_webview_window("main") {
      let _ = w.request_user_attention(Some(UserAttentionType::Informational));
  }
  ```
- Call it from the same branch in `controller.onMessageNew` that shows the toast
  (i.e. room not focused). Clear naturally on focus (OS handles it).

**Capability:** add `core:window:allow-request-user-attention` to
`capabilities/default.json` **if** we call it from JS instead of a Rust command.
Preferred: keep it a Rust command (no capability change).

**Risk:** low. **Test:** blur window, receive message → taskbar flashes.

---

## P3 — Global Hotkey

**Goal:** a system-wide shortcut (default `Ctrl/Cmd+Shift+O`) toggles the window
from anywhere.

**Approach:** `tauri-plugin-global-shortcut`.
- `Cargo.toml`: `tauri-plugin-global-shortcut = "2"`
- Register in `setup`: on trigger, if window visible+focused → hide; else show +
  unminimize + focus (toggle behaviour).
- `capabilities/default.json`: add `global-shortcut:allow-register`,
  `global-shortcut:allow-unregister`, `global-shortcut:default`.
- Make the accelerator a constant now; wire it to settings later (P5).

**Risk:** low–medium (shortcut may clash with another app; keep it configurable).
**Test:** minimize app, press hotkey → window appears; press again → hides.

---

## P4 — Window State Persistence

**Goal:** remember window size/position/maximized between launches.

**Approach:** `tauri-plugin-window-state` (`= "2"`) — zero-config; auto-saves and
restores on the `main` window. Register the plugin, done.

**Edge case:** interaction with `--autostart` hidden start — ensure restore
doesn't force-show a window meant to stay hidden in tray. Verify the plugin's
`StateFlags` exclude `VISIBLE`, or apply state then re-hide when `--autostart`.

**Risk:** low. **Test:** resize/move, quit, relaunch → geometry restored.

---

## P5 — Do-Not-Disturb + Sound/Notification Settings

**Goal:** user control over the notification/sound behavior that is currently
hardcoded.

**Frontend**
- New store `src/lib/stores/settings.svelte.ts`, persisted via existing
  `LocalStore` (extend the interface with `getSettings`/`saveSettings`):
  ```ts
  interface AppSettings {
    notificationsEnabled: boolean;
    soundsEnabled: boolean;
    dnd: boolean;            // suppress all toasts + sounds
    toastSound: "IM" | "Default" | "Mail" | "Silent";
    volume: number;         // 0..1, scales in-app sounds
  }
  ```
- `controller` checks `settings.dnd` / `*Enabled` before `notifications.notify`
  and before `playIncoming()` / `playSend()`.
- `sounds.ts` `blip()` multiplies `peak` by `settings.volume`.
- `notify.rs` `show_notification` gains a `sound: String` param mapped to the
  `Sound` enum (`"IM"|"Default"|"Mail"|"Silent"`).

**UI**
- A small **Settings panel** (modal or sidebar section) with toggles + a sound
  dropdown + volume slider. Keyboard accessible (Esc to close).

**Tray integration**
- Add a checkable **"Do Not Disturb"** item to the tray menu that flips
  `settings.dnd` (emit event → frontend updates store, or store in Rust and read).

**Risk:** low. **Test:** toggle DND → no toast/sound; toggle sound off → silent
but toast still shows.

---

## P6 — Idle / Away Presence

**Goal:** auto-set presence to **away** after N minutes of no OS input, back to
**online** on activity.

**Approach:** query OS idle time.
- Simplest cross-platform: `user-idle` crate (Rust) polled every ~30s, or JS
  `mousemove`/`keydown` listeners + a timer (webview-only, misses idle when
  window unfocused — acceptable for v1).
- When idle ≥ threshold → send `presence:update` with `away`; on activity → `online`.
- Requires a small protocol addition: an `away` presence state (extend
  `packages/shared` presence events + server broadcast). **Coordinate with server.**

**Risk:** medium (touches shared protocol + server). Ship last.
**Test:** leave app idle → status flips to away; move mouse → online.

---

## Cross-Cutting Notes

- **Capabilities:** every new JS-invoked native call needs its permission in
  `src-tauri/src/capabilities/default.json`. Backend-only Rust commands don't.
- **Per-OS behavior:** badges, flashing, and idle differ across Windows/macOS/Linux
  (CLAUDE.md §29). Guard with `#[cfg(...)]` and degrade gracefully — never panic.
- **Keep it modular:** put tray/badge logic in a `src-tauri/src/tray.rs`, keep
  `notify.rs` focused on notifications. Avoid growing `lib.rs`.
- **No new heavy deps:** all suggested plugins are official Tauri plugins, tiny.

---

## Suggested Delivery Milestones

| Milestone | Includes | Outcome |
|---|---|---|
| **M1 — Correctness** | P0 | No duplicate instances/connections |
| **M2 — Awareness** | P1 + P2 | User notices messages without the window open |
| **M3 — Native feel** | P3 + P4 | Hotkey + remembered window geometry |
| **M4 — Control** | P5 | DND + configurable sounds/notifications |
| **M5 — Presence** | P6 | Auto away/online |

Recommend implementing **M1 → M2** first (highest value, lowest risk), then reassess.
