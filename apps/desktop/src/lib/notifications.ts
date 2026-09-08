import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export interface NotificationPayload {
  title: string;
  body: string;
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
        sendNotification({ title: payload.title, body: payload.body });
      }
    } catch (err) {
      // Running in a plain browser (dev) — degrade gracefully.
      console.warn("Notification unavailable", err);
    }
  }
}

export const notifications: NotificationService = new TauriNotificationService();
