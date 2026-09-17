import type { Database as DB } from "better-sqlite3";
import type { Reaction } from "@office-chat/shared";

export class ReactionsRepository {
  constructor(private readonly db: DB) {}

  /** Add the reaction if absent, remove it if present. Returns true if added. */
  toggle(messageId: string, userId: string, emoji: string, now: string): boolean {
    const exists = this.db
      .prepare(`SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`)
      .get(messageId, userId, emoji);
    if (exists) {
      this.db
        .prepare(`DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`)
        .run(messageId, userId, emoji);
      return false;
    }
    this.db
      .prepare(
        `INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(messageId, userId, emoji, now);
    return true;
  }

  /** All reactions on one message. */
  forMessage(messageId: string): Reaction[] {
    return this.db
      .prepare(
        `SELECT message_id AS messageId, user_id AS userId, emoji FROM reactions WHERE message_id = ?`,
      )
      .all(messageId) as Reaction[];
  }

  /** All reactions across a set of messages (for hydrating history). */
  forMessages(messageIds: string[]): Reaction[] {
    if (messageIds.length === 0) return [];
    const placeholders = messageIds.map(() => "?").join(",");
    return this.db
      .prepare(
        `SELECT message_id AS messageId, user_id AS userId, emoji
         FROM reactions WHERE message_id IN (${placeholders})`,
      )
      .all(...messageIds) as Reaction[];
  }
}
