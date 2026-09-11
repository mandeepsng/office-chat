import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Check GitHub Releases for a newer signed build and, if found, download,
 * install, and relaunch. Best-effort: any failure (offline, running in a plain
 * browser during dev, no update available) is swallowed so it never blocks
 * startup.
 */
export async function runAutoUpdate(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    console.warn("Auto-update skipped", err);
  }
}

/** How often to re-check for updates while the app keeps running (6 hours). */
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Check for updates immediately, then every 6 hours for as long as the app is
 * running. This matters because OfficeChat minimizes to the tray and launches
 * at login, so a session can stay open for days without a restart — a
 * startup-only check would never deliver updates to those users.
 */
export function startAutoUpdatePolling(): void {
  void runAutoUpdate();
  setInterval(() => void runAutoUpdate(), UPDATE_INTERVAL_MS);
}
