import type { Database as DB } from "better-sqlite3";
import type { Room, RoomType } from "@office-chat/shared";

interface RoomRow {
  id: string;
  type: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export class RoomsRepository {
  constructor(private readonly db: DB) {}

  private hydrate(row: RoomRow): Room {
    return {
      id: row.id,
      type: row.type as RoomType,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      memberIds: this.memberIds(row.id),
    };
  }

  create(input: {
    id: string;
    type: RoomType;
    name: string;
    createdBy: string | null;
    memberIds: string[];
    now: string;
  }): Room {
    const insertRoom = this.db.prepare(
      `INSERT INTO rooms (id, type, name, created_by, created_at)
       VALUES (@id, @type, @name, @createdBy, @now)`,
    );
    const insertMember = this.db.prepare(
      `INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)`,
    );
    const tx = this.db.transaction(() => {
      insertRoom.run({
        id: input.id,
        type: input.type,
        name: input.name,
        createdBy: input.createdBy,
        now: input.now,
      });
      for (const uid of input.memberIds) insertMember.run(input.id, uid, input.now);
    });
    tx();
    return this.getById(input.id)!;
  }

  getById(id: string): Room | null {
    const row = this.db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(id) as RoomRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  memberIds(roomId: string): string[] {
    return (
      this.db.prepare(`SELECT user_id FROM room_members WHERE room_id = ?`).all(roomId) as {
        user_id: string;
      }[]
    ).map((r) => r.user_id);
  }

  isMember(roomId: string, userId: string): boolean {
    return !!this.db
      .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
      .get(roomId, userId);
  }

  addMember(roomId: string, userId: string, now: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)`)
      .run(roomId, userId, now);
  }

  removeMember(roomId: string, userId: string): void {
    this.db.prepare(`DELETE FROM room_members WHERE room_id = ? AND user_id = ?`).run(roomId, userId);
  }

  listForUser(userId: string): Room[] {
    const rows = this.db
      .prepare(
        `SELECT r.* FROM rooms r
         JOIN room_members m ON m.room_id = r.id
         WHERE m.user_id = ?
         ORDER BY r.type DESC, r.name COLLATE NOCASE`,
      )
      .all(userId) as RoomRow[];
    return rows.map((r) => this.hydrate(r));
  }

  /** Find an existing 1:1 direct room between exactly two users. */
  findDirectRoom(userA: string, userB: string): Room | null {
    const row = this.db
      .prepare(
        `SELECT r.* FROM rooms r
         WHERE r.type = 'direct'
           AND (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) = 2
           AND EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ?)
           AND EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ?)
         LIMIT 1`,
      )
      .get(userA, userB) as RoomRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  /** The shared "Office General" room every user auto-joins. */
  ensureDefaultRoom(now: string): Room {
    const existing = this.db
      .prepare(`SELECT * FROM rooms WHERE type = 'group' AND name = 'Office General' LIMIT 1`)
      .get() as RoomRow | undefined;
    if (existing) return this.hydrate(existing);
    return this.create({
      id: crypto.randomUUID(),
      type: "group",
      name: "Office General",
      createdBy: null,
      memberIds: [],
      now,
    });
  }
}
