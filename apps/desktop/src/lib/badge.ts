import { invoke } from "@tauri-apps/api/core";

/**
 * Native taskbar/tray helpers, backed by Rust commands in `src-tauri/src/tray.rs`.
 * Both are best-effort: they throw in a plain browser during dev, so failures
 * are swallowed.
 */

/** Push the total unread count to the OS tray tooltip and taskbar badge/overlay. */
export async function setUnreadBadge(count: number): Promise<void> {
  try {
    await invoke("set_unread", { count });
  } catch {
    // Not running under Tauri (dev browser) — ignore.
  }
}

/** Flash the taskbar button / bounce the dock to draw attention to a new message. */
export async function flashWindow(): Promise<void> {
  try {
    await invoke("flash_window");
  } catch {
    // Not running under Tauri (dev browser) — ignore.
  }
}
