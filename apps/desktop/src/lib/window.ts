import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Unminimize, show and focus the main window. Used for notification clicks and
 * incoming calls — both are moments the user needs to see the app right now,
 * even if it's minimized or sitting in the tray. Best-effort: no-op in a plain
 * browser during dev.
 */
export async function bringWindowToFront(): Promise<void> {
  try {
    const win = getCurrentWindow();
    await win.unminimize();
    await win.show();
    await win.setFocus();
  } catch {
    // Not running under Tauri (dev) — navigation/UI updates still work.
  }
}
