import type { Repositories } from "../db";
import type { Connection } from "./connection";

/** Tracks live connections and fans out frames to users and rooms. */
export class Hub {
  private readonly connections = new Set<Connection>();
  private readonly byUser = new Map<string, Set<Connection>>();

  constructor(private readonly repos: Repositories) {}

  add(conn: Connection): void {
    this.connections.add(conn);
  }

  /** Associate an authenticated connection with its user (multi-device). */
  bindUser(conn: Connection): void {
    if (!conn.userId) return;
    let set = this.byUser.get(conn.userId);
    if (!set) {
      set = new Set();
      this.byUser.set(conn.userId, set);
    }
    set.add(conn);
  }

  remove(conn: Connection): void {
    this.connections.delete(conn);
    if (conn.userId) {
      const set = this.byUser.get(conn.userId);
      set?.delete(conn);
      if (set && set.size === 0) this.byUser.delete(conn.userId);
    }
  }

  /** A user is online if at least one of their devices is connected. */
  isUserOnline(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }

  onlineUserIds(): string[] {
    return [...this.byUser.keys()];
  }

  sendToUser(userId: string, type: string, payload: unknown): void {
    for (const conn of this.byUser.get(userId) ?? []) conn.send(type, payload);
  }

  broadcastToRoom(
    roomId: string,
    type: string,
    payload: unknown,
    exceptUserId?: string,
  ): void {
    for (const userId of this.repos.rooms.memberIds(roomId)) {
      if (userId === exceptUserId) continue;
      this.sendToUser(userId, type, payload);
    }
  }

  broadcastToAll(type: string, payload: unknown, exceptUserId?: string): void {
    for (const [userId, set] of this.byUser) {
      if (userId === exceptUserId) continue;
      for (const conn of set) conn.send(type, payload);
    }
  }
}
