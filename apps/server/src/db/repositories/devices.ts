import type { Database as DB } from "better-sqlite3";
import type { Device, Platform } from "@office-chat/shared";

interface DeviceRow {
  id: string;
  user_id: string;
  device_name: string;
  platform: string;
  last_seen_at: string;
  created_at: string;
}

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  userId: r.user_id,
  deviceName: r.device_name,
  platform: r.platform as Platform,
  lastSeenAt: r.last_seen_at,
  createdAt: r.created_at,
});

export class DevicesRepository {
  constructor(private readonly db: DB) {}

  upsert(input: {
    id: string;
    userId: string;
    deviceName: string;
    platform: Platform;
    now: string;
  }): Device {
    this.db
      .prepare(
        `INSERT INTO devices (id, user_id, device_name, platform, last_seen_at, created_at)
         VALUES (@id, @userId, @deviceName, @platform, @now, @now)
         ON CONFLICT(id) DO UPDATE SET
           device_name = excluded.device_name,
           platform = excluded.platform,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(input);
    return this.getById(input.id)!;
  }

  getById(id: string): Device | null {
    const row = this.db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id) as DeviceRow | undefined;
    return row ? toDevice(row) : null;
  }

  touch(id: string, now: string): void {
    this.db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(now, id);
  }
}
