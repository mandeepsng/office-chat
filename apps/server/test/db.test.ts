import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/db/database";
import { createRepositories } from "../src/db";

function repos() {
  return createRepositories(createDatabase(":memory:"));
}

test("creates and retrieves a user", () => {
  const r = repos();
  const id = randomUUID();
  const now = new Date().toISOString();
  r.users.upsert({ id, name: "Mandeep", now });
  const user = r.users.getById(id);
  assert.equal(user?.name, "Mandeep");
  assert.equal(user?.isOnline, false);
});

test("upsert refreshes the display name", () => {
  const r = repos();
  const id = randomUUID();
  const now = new Date().toISOString();
  r.users.upsert({ id, name: "Old", now });
  r.users.upsert({ id, name: "New", now });
  assert.equal(r.users.getById(id)?.name, "New");
});

test("stores a message and retrieves history oldest-first", () => {
  const r = repos();
  const now = new Date().toISOString();
  const uid = randomUUID();
  r.users.upsert({ id: uid, name: "A", now });
  const room = r.rooms.create({
    id: randomUUID(),
    type: "group",
    name: "General",
    createdBy: uid,
    memberIds: [uid],
    now,
  });

  for (let i = 0; i < 3; i++) {
    r.messages.insert({
      id: randomUUID(),
      roomId: room.id,
      senderId: uid,
      content: `msg ${i}`,
      messageType: "text",
      replyToId: null,
      clientMessageId: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
    });
  }

  const page = r.messages.history(room.id, { limit: 50 });
  assert.equal(page.messages.length, 3);
  assert.equal(page.messages[0]?.content, "msg 0");
  assert.equal(page.messages[2]?.content, "msg 2");
  assert.equal(page.hasMore, false);
});

test("paginates history with a cursor", () => {
  const r = repos();
  const now = new Date().toISOString();
  const uid = randomUUID();
  r.users.upsert({ id: uid, name: "A", now });
  const room = r.rooms.create({
    id: randomUUID(),
    type: "group",
    name: "General",
    createdBy: uid,
    memberIds: [uid],
    now,
  });

  const ids: string[] = [];
  for (let i = 0; i < 10; i++) {
    const id = randomUUID();
    ids.push(id);
    r.messages.insert({
      id,
      roomId: room.id,
      senderId: uid,
      content: `msg ${i}`,
      messageType: "text",
      replyToId: null,
      clientMessageId: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
    });
  }

  const first = r.messages.history(room.id, { limit: 5 });
  assert.equal(first.messages.length, 5);
  assert.equal(first.hasMore, true);
  // Newest 5 returned oldest-first => msg 5..9
  assert.equal(first.messages[0]?.content, "msg 5");

  const older = r.messages.history(room.id, { limit: 5, before: first.messages[0]!.id });
  assert.equal(older.messages.length, 5);
  assert.equal(older.hasMore, false);
  assert.equal(older.messages[0]?.content, "msg 0");
  assert.equal(older.messages[4]?.content, "msg 4");
});

test("deduplicates direct rooms between the same two users", () => {
  const r = repos();
  const now = new Date().toISOString();
  const a = randomUUID();
  const b = randomUUID();
  r.users.upsert({ id: a, name: "A", now });
  r.users.upsert({ id: b, name: "B", now });
  const room = r.rooms.create({
    id: randomUUID(),
    type: "direct",
    name: "Direct",
    createdBy: a,
    memberIds: [a, b],
    now,
  });
  assert.equal(r.rooms.findDirectRoom(a, b)?.id, room.id);
  assert.equal(r.rooms.findDirectRoom(b, a)?.id, room.id);
});
