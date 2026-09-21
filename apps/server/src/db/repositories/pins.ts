import type { Database as DB } from "better-sqlite3";
import type { MessageType, PinnedMessage } from "@office-chat/shared";

interface PinRow {
  roomId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
  content: string;
  messageType: string;
  senderId: string;
}

const toPinned = (r: PinRow): PinnedMessage => ({
  roomId: r.roomId,
  messageId: r.messageId,
  pinnedBy: r.pinnedBy,
  pinnedAt: r.pinnedAt,
  content: r.content,
  messageType: r.messageType as MessageType,
  senderId: r.senderId,
});

/** A small office room shouldn't accumulate an unbounded pin list. */
export const MAX_PINS_PER_ROOM = 20;

export class PinsRepository {
  constructor(private readonly db: DB) {}

  count(roomId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM room_pins WHERE room_id = ?`)
      .get(roomId) as { n: number };
    return row.n;
  }

  isPinned(roomId: string, messageId: string): boolean {
    return !!this.db
      .prepare(`SELECT 1 FROM room_pins WHERE room_id = ? AND message_id = ?`)
      .get(roomId, messageId);
  }

  pin(roomId: string, messageId: string, pinnedBy: string, now: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO room_pins (room_id, message_id, pinned_by, pinned_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(roomId, messageId, pinnedBy, now);
  }

  unpin(roomId: string, messageId: string): void {
    this.db
      .prepare(`DELETE FROM room_pins WHERE room_id = ? AND message_id = ?`)
      .run(roomId, messageId);
  }

  /** All pinned messages in a room, newest pin first, with enough of the
   *  message hydrated to render a banner without a second round trip. */
  listForRoom(roomId: string): PinnedMessage[] {
    const rows = this.db
      .prepare(
        `SELECT p.room_id AS roomId, p.message_id AS messageId, p.pinned_by AS pinnedBy,
                p.pinned_at AS pinnedAt, m.content, m.message_type AS messageType, m.sender_id AS senderId
         FROM room_pins p
         JOIN messages m ON m.id = p.message_id
         WHERE p.room_id = ? AND m.deleted_at IS NULL
         ORDER BY p.pinned_at DESC`,
      )
      .all(roomId) as PinRow[];
    return rows.map(toPinned);
  }
}
