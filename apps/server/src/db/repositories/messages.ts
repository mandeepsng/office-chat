import type { Database as DB } from "better-sqlite3";
import type { Message, MessageType, ReadReceipt } from "@office-chat/shared";

interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  reply_to_id: string | null;
  client_message_id: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  roomId: r.room_id,
  senderId: r.sender_id,
  content: r.content,
  messageType: r.message_type as MessageType,
  replyToId: r.reply_to_id,
  clientMessageId: r.client_message_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export interface HistoryPage {
  messages: Message[];
  hasMore: boolean;
}

export class MessagesRepository {
  constructor(private readonly db: DB) {}

  insert(m: Message): Message {
    this.db
      .prepare(
        `INSERT INTO messages
           (id, room_id, sender_id, content, message_type, reply_to_id, client_message_id, created_at, updated_at, deleted_at)
         VALUES
           (@id, @roomId, @senderId, @content, @messageType, @replyToId, @clientMessageId, @createdAt, @updatedAt, @deletedAt)`,
      )
      .run(m);
    return m;
  }

  getById(id: string): Message | null {
    const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as MessageRow | undefined;
    return row ? toMessage(row) : null;
  }

  findByClientId(senderId: string, clientMessageId: string): Message | null {
    const row = this.db
      .prepare(`SELECT * FROM messages WHERE sender_id = ? AND client_message_id = ?`)
      .get(senderId, clientMessageId) as MessageRow | undefined;
    return row ? toMessage(row) : null;
  }

  /**
   * Cursor-based history. Returns up to `limit` messages ending at (but not
   * including) `before`, oldest-first. `hasMore` signals older pages exist.
   */
  history(roomId: string, opts: { before?: string; limit: number }): HistoryPage {
    let beforeRowid = Number.MAX_SAFE_INTEGER;
    if (opts.before) {
      const cursor = this.db
        .prepare(`SELECT rowid FROM messages WHERE id = ?`)
        .get(opts.before) as { rowid: number } | undefined;
      if (cursor) beforeRowid = cursor.rowid;
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE room_id = ? AND rowid < ?
         ORDER BY rowid DESC
         LIMIT ?`,
      )
      .all(roomId, beforeRowid, opts.limit + 1) as MessageRow[];

    const hasMore = rows.length > opts.limit;
    const page = rows.slice(0, opts.limit).reverse().map(toMessage);
    return { messages: page, hasMore };
  }

  update(id: string, content: string, updatedAt: string): Message | null {
    this.db
      .prepare(`UPDATE messages SET content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(content, updatedAt, id);
    return this.getById(id);
  }

  softDelete(id: string, deletedAt: string): Message | null {
    this.db
      .prepare(`UPDATE messages SET content = '', deleted_at = ? WHERE id = ?`)
      .run(deletedAt, id);
    return this.getById(id);
  }

  setLastRead(roomId: string, userId: string, messageId: string, readAt: string): void {
    this.db
      .prepare(
        `INSERT INTO read_receipts (room_id, user_id, last_read_msg_id, read_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(room_id, user_id) DO UPDATE SET
           last_read_msg_id = excluded.last_read_msg_id,
           read_at = excluded.read_at`,
      )
      .run(roomId, userId, messageId, readAt);
  }

  /** Everyone's last-read pointer in a room, with the read message's timestamp. */
  readReceiptsForRoom(roomId: string): ReadReceipt[] {
    return this.db
      .prepare(
        `SELECT r.user_id AS userId, r.last_read_msg_id AS messageId, m.created_at AS createdAt
         FROM read_receipts r
         JOIN messages m ON m.id = r.last_read_msg_id
         WHERE r.room_id = ?`,
      )
      .all(roomId) as ReadReceipt[];
  }
}
