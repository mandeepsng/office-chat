import type { Database as DB } from "better-sqlite3";
import type { User } from "@office-chat/shared";

interface UserRow {
  id: string;
  name: string;
  avatar: string | null;
  created_at: string;
  last_seen_at: string;
  is_online: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  avatar: r.avatar,
  lastSeenAt: r.last_seen_at,
  isOnline: r.is_online === 1,
});

export class UsersRepository {
  constructor(private readonly db: DB) {}

  /** Insert on first join, otherwise refresh the display name. */
  upsert(input: { id: string; name: string; avatar?: string | null; now: string }): User {
    this.db
      .prepare(
        `INSERT INTO users (id, name, avatar, created_at, last_seen_at, is_online)
         VALUES (@id, @name, @avatar, @now, @now, 0)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           avatar = COALESCE(excluded.avatar, users.avatar),
           last_seen_at = excluded.last_seen_at`,
      )
      .run({ id: input.id, name: input.name, avatar: input.avatar ?? null, now: input.now });
    return this.getById(input.id)!;
  }

  getById(id: string): User | null {
    const row = this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  all(): User[] {
    return (this.db.prepare(`SELECT * FROM users ORDER BY name COLLATE NOCASE`).all() as UserRow[]).map(toUser);
  }

  setOnline(id: string, isOnline: boolean, now: string): void {
    this.db
      .prepare(`UPDATE users SET is_online = ?, last_seen_at = ? WHERE id = ?`)
      .run(isOnline ? 1 : 0, now, id);
  }
}
