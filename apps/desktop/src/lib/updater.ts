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
