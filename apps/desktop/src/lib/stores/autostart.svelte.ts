import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

// Marks whether we've already applied the "on by default" behaviour, so a user
// who deliberately turns autostart off doesn't get it silently re-enabled on
// the next launch.
const INIT_KEY = "officechat.autostart.initialized";

export const autostart = $state<{ enabled: boolean; ready: boolean }>({
  enabled: false,
  ready: false,
});

/**
 * Reflect the OS-level autostart registration into the store, and enable it by
 * default the very first time the app runs (honouring later opt-out). All calls
 * are best-effort: in a plain browser during dev the plugin is unavailable, so
 * failures are swallowed rather than blocking startup.
 */
export async function initAutostart(): Promise<void> {
  try {
    if (!localStorage.getItem(INIT_KEY)) {
      await enable();
      localStorage.setItem(INIT_KEY, "1");
    }
    autostart.enabled = await isEnabled();
  } catch (err) {
    console.warn("Autostart unavailable", err);
  } finally {
    autostart.ready = true;
  }
}

/** Toggle launch-at-login on/off and sync the store to the real OS state. */
export async function toggleAutostart(): Promise<void> {
  try {
    if (await isEnabled()) {
      await disable();
    } else {
      await enable();
    }
    localStorage.setItem(INIT_KEY, "1");
    autostart.enabled = await isEnabled();
  } catch (err) {
    console.warn("Failed to toggle autostart", err);
  }
}
