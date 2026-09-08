import type { AuthRegisterInput } from "@office-chat/validation";
import type { Device, User } from "@office-chat/shared";
import type { Repositories } from "../db";

export class UserService {
  constructor(private readonly repos: Repositories) {}

  /**
   * First-time registration: create/refresh the user + device and auto-join the
   * shared office room. Idempotent — safe to call on every reconnect.
   */
  register(input: AuthRegisterInput): { user: User; device: Device } {
    const now = new Date().toISOString();
    const user = this.repos.users.upsert({
      id: input.userId,
      name: input.name,
      avatar: input.avatar ?? null,
      now,
    });
    const device = this.repos.devices.upsert({
      id: input.deviceId,
      userId: input.userId,
      deviceName: input.deviceName,
      platform: input.platform,
      now,
    });

    const defaultRoom = this.repos.rooms.ensureDefaultRoom(now);
    this.repos.rooms.addMember(defaultRoom.id, user.id, now);

    return { user, device };
  }

  /** Reconnect with an existing identity; no office code required. */
  connect(userId: string, deviceId: string): { user: User; device: Device } | null {
    const user = this.repos.users.getById(userId);
    const device = this.repos.devices.getById(deviceId);
    if (!user || !device || device.userId !== userId) return null;
    this.repos.devices.touch(deviceId, new Date().toISOString());
    return { user, device };
  }

  setPresence(userId: string, isOnline: boolean): User | null {
    const now = new Date().toISOString();
    this.repos.users.setOnline(userId, isOnline, now);
    return this.repos.users.getById(userId);
  }
}
