import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface NotificationPayload {
  title: string;
  body: string;
  /** Room to open when the user clicks the notification. */
  roomId?: string;
  /** Windows toast sound: "IM" | "Default" | "Mail" | "Silent". */
  sound?: string;
}

/** Abstraction so push delivery can be swapped in later without UI changes. */
export interface NotificationService {
  notify(payload: NotificationPayload): Promise<void>;
}

/**
 * v1 implementation backed by a native Rust toast (see `src-tauri/src/notify.rs`).
 *
 * We deliberately bypass `@tauri-apps/plugin-notification` for message toasts:
 * its desktop backend never wires up click handling, so a clicked notification
 * could not open the conversation. The Rust command shows the toast and, on
 * Windows, emits a `notification-click` event we forward to the app.
 */
class NativeNotificationService implements NotificationService {
  async notify(payload: NotificationPayload): Promise<void> {
    try {
      await invoke("show_notification", {
        title: payload.title,
        body: payload.body,
        roomId: payload.roomId ?? null,
        sound: payload.sound ?? null,
      });
    } catch (err) {
      // Running in a plain browser (dev) — degrade gracefully.
      console.warn("Notification unavailable", err);
    }
  }
}

export const notifications: NotificationService = new NativeNotificationService();

/**
 * Register a handler for notification clicks. The clicked notification's room
 * id is passed through so the app can open the right conversation. Best-effort:
 * desktop click delivery varies by OS, and `listen` throws in a plain browser
 * during dev, so failures are swallowed.
 */
export async function onNotificationClick(
  handler: (roomId: string) => void,
): Promise<void> {
  try {
    await listen<string | null>("notification-click", (event) => {
      if (typeof event.payload === "string") handler(event.payload);
    });
  } catch (err) {
    console.warn("Notification click handling unavailable", err);
  }
}
