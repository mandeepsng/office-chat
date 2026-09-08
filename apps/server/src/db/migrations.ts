import type { Database as DB } from "better-sqlite3";

/**
 * Idempotent schema initialization. Kept as a single versioned block; for a
 * 5-20 user office a full migration framework would be over-engineering.
 */
export function runMigrations(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      avatar        TEXT,
      created_at    TEXT NOT NULL,
      last_seen_at  TEXT NOT NULL,
      is_online     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS devices (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_name   TEXT NOT NULL,
      platform      TEXT NOT NULL,
      last_seen_at  TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      name        TEXT NOT NULL,
      created_by  TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at  TEXT NOT NULL,
      PRIMARY KEY (room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT PRIMARY KEY,
      room_id           TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      sender_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content           TEXT NOT NULL,
      message_type      TEXT NOT NULL DEFAULT 'text',
      reply_to_id       TEXT,
      client_message_id TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT,
      deleted_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS read_receipts (
      room_id           TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_msg_id  TEXT NOT NULL,
      read_at           TEXT NOT NULL,
      PRIMARY KEY (room_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_id     ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at  ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_sender_id   ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);

    -- Idempotent sends: a (sender, client_message_id) pair maps to one message.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_client_id
      ON messages(sender_id, client_message_id)
      WHERE client_message_id IS NOT NULL;
  `);
}
