/**
 * User-controllable notification & sound preferences, persisted to
 * localStorage. The controller reads these before showing toasts, playing
 * sounds, or flashing the taskbar.
 */
export type ToastSound = "IM" | "Default" | "Mail" | "Silent";

export interface AppSettings {
  /** Show native desktop notifications for background messages. */
  notificationsEnabled: boolean;
  /** Play in-app sounds (incoming pop / send whoosh). */
  soundsEnabled: boolean;
  /** Master mute: suppress all toasts, sounds and taskbar flashing. */
  dnd: boolean;
  /** Which Windows toast sound to use (macOS/Linux use the OS default). */
  toastSound: ToastSound;
  /** In-app sound volume, 0–1. */
  volume: number;
}

const KEY = "officechat.settings";

const DEFAULTS: AppSettings = {
  notificationsEnabled: true,
  soundsEnabled: true,
  dnd: false,
  toastSound: "IM",
  volume: 0.6,
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    // Merge onto defaults so new fields appear for existing users.
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = $state<AppSettings>(load());

/** Transient UI state for the settings modal (not persisted). */
export const settingsUi = $state<{ open: boolean }>({ open: false });

export function saveSettings(): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        notificationsEnabled: settings.notificationsEnabled,
        soundsEnabled: settings.soundsEnabled,
        dnd: settings.dnd,
        toastSound: settings.toastSound,
        volume: settings.volume,
      }),
    );
  } catch {
    // Storage unavailable — settings just won't persist.
  }
}

export function toggleDnd(): void {
  settings.dnd = !settings.dnd;
  saveSettings();
}
