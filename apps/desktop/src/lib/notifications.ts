import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export interface NotificationPayload {
  title: string;
  body: string;
  /** Room to open when the user clicks the notification. */
  roomId?: string;
}

/** Abstraction so push delivery can be swapped in later without UI changes. */
export interface NotificationService {
  notify(payload: NotificationPayload): Promise<void>;
}

/** v1 implementation backed by Tauri's native notification plugin. */
class TauriNotificationService implements NotificationService {
  private granted = false;

  private async ensurePermission(): Promise<boolean> {
    if (this.granted) return true;
    try {
      this.granted = await isPermissionGranted();
      if (!this.granted) {
        this.granted = (await requestPermission()) === "granted";
      }
    } catch {
      this.granted = false;
    }
    return this.granted;
  }

  async notify(payload: NotificationPayload): Promise<void> {
    try {
      if (await this.ensurePermission()) {
        sendNotification({
          title: payload.title,
          body: payload.body,
          ...(payload.roomId ? { extra: { roomId: payload.roomId } } : {}),
        });
      }
    } catch (err) {
      // Running in a plain browser (dev) — degrade gracefully.
      console.warn("Notification unavailable", err);
    }
  }
}

export const notifications: NotificationService = new TauriNotificationService();

/**
 * Register a handler for notification clicks. The clicked notification's
 * `extra.roomId` is passed through so the app can open the right conversation.
 * Best-effort: desktop click delivery varies by OS, and it throws in a plain
 * browser during dev, so failures are swallowed.
 */
export async function onNotificationClick(
  handler: (roomId: string) => void,
): Promise<void> {
  try {
    await onAction((notification) => {
      const roomId = (notification.extra as { roomId?: unknown } | undefined)?.roomId;
      if (typeof roomId === "string") handler(roomId);
    });
  } catch (err) {
    console.warn("Notification click handling unavailable", err);
  }
}
