import { test } from "node:test";
import assert from "node:assert/strict";
import { ClientEvents, ServerEvents } from "@office-chat/shared";
import { makeHarness } from "./helpers";

test("creates a group room and notifies members", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");

  a.send(ClientEvents.RoomCreate, {
    type: "group",
    name: "Development",
    memberIds: [b.userId],
  });

  const created = a.last(ServerEvents.RoomCreated);
  assert.ok(created);
  assert.equal(created.payload.room.name, "Development");
  assert.ok(created.payload.room.memberIds.includes(a.userId));
  assert.ok(created.payload.room.memberIds.includes(b.userId));
  // B is also notified about the new room.
  assert.ok(b.last(ServerEvents.RoomCreated));
});

test("creates and deduplicates a direct room", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");

  a.send(ClientEvents.RoomCreate, { type: "direct", memberIds: [b.userId] });
  const first = a.last(ServerEvents.RoomCreated).payload.room;

  a.send(ClientEvents.RoomCreate, { type: "direct", memberIds: [b.userId] });
  const second = a.last(ServerEvents.RoomCreated).payload.room;

  assert.equal(first.id, second.id);
  assert.equal(first.type, "direct");
});

test("lists rooms for a user", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  a.send(ClientEvents.RoomList, {});
  const list = a.last(ServerEvents.RoomList);
  assert.ok(list.payload.rooms.some((r: any) => r.name === "Office General"));
});

test("joins and leaves a group room", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");

  a.send(ClientEvents.RoomCreate, { type: "group", name: "Design", memberIds: [] });
  const roomId = a.last(ServerEvents.RoomCreated).payload.room.id;

  b.send(ClientEvents.RoomJoin, { roomId });
  assert.equal(h.app.roomService.isMember(roomId, b.userId), true);

  b.send(ClientEvents.RoomLeave, { roomId });
  assert.equal(h.app.roomService.isMember(roomId, b.userId), false);
});

test("rejects joining a direct room", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const c = h.authUser("C");

  a.send(ClientEvents.RoomCreate, { type: "direct", memberIds: [b.userId] });
  const roomId = a.last(ServerEvents.RoomCreated).payload.room.id;

  c.send(ClientEvents.RoomJoin, { roomId });
  assert.equal(c.last(ServerEvents.Error).payload.code, "FORBIDDEN");
});
