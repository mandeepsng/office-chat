import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ClientEvents, ServerEvents, LIMITS } from "@office-chat/shared";
import { makeHarness } from "./helpers";

/** The office room every registered user shares. */
function officeRoomId(user: ReturnType<ReturnType<typeof makeHarness>["authUser"]>): string {
  return user.last(ServerEvents.AuthSuccess).payload.rooms.find(
    (r: any) => r.name === "Office General",
  ).id;
}

test("sends a valid message and acks the sender", () => {
  const h = makeHarness();
  const user = h.authUser("Mandeep");
  const roomId = officeRoomId(user);

  user.send(ClientEvents.MessageSend, {
    roomId,
    clientMessageId: randomUUID(),
    content: "Hello bro",
  });

  const ack = user.last(ServerEvents.MessageSent);
  assert.ok(ack, "message:sent ack received");
  assert.equal(ack.payload.message.content, "Hello bro");
  assert.equal(ack.payload.message.messageType, "text");
});

test("broadcasts new messages to other room members", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B"); // both auto-join Office General
  const roomId = officeRoomId(a);

  a.send(ClientEvents.MessageSend, {
    roomId,
    clientMessageId: randomUUID(),
    content: "ping",
  });

  const delivered = b.last(ServerEvents.MessageNew);
  assert.ok(delivered, "recipient got message:new");
  assert.equal(delivered.payload.message.content, "ping");
  // Sender should not receive its own message:new (only the ack).
  assert.equal(a.all(ServerEvents.MessageNew).length, 0);
});

test("rejects an empty message payload", () => {
  const h = makeHarness();
  const user = h.authUser("Mandeep");
  const roomId = officeRoomId(user);

  user.send(ClientEvents.MessageSend, {
    roomId,
    clientMessageId: randomUUID(),
    content: "   ",
  });
  const err = user.last(ServerEvents.Error);
  assert.equal(err.payload.code, "INVALID_PAYLOAD");
});

test("rejects an over-length message", () => {
  const h = makeHarness();
  const user = h.authUser("Mandeep");
  const roomId = officeRoomId(user);

  user.send(ClientEvents.MessageSend, {
    roomId,
    clientMessageId: randomUUID(),
    content: "x".repeat(LIMITS.MESSAGE_MAX_LENGTH + 1),
  });
  assert.equal(user.last(ServerEvents.Error).payload.code, "INVALID_PAYLOAD");
});

test("rejects sending to a room the user is not in", () => {
  const h = makeHarness();
  const user = h.authUser("Mandeep");

  user.send(ClientEvents.MessageSend, {
    roomId: randomUUID(),
    clientMessageId: randomUUID(),
    content: "hi",
  });
  const err = user.last(ServerEvents.Error);
  assert.ok(["ROOM_NOT_FOUND", "NOT_ROOM_MEMBER"].includes(err.payload.code));
});

test("is idempotent for a repeated clientMessageId", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const roomId = officeRoomId(a);
  const clientMessageId = randomUUID();

  a.send(ClientEvents.MessageSend, { roomId, clientMessageId, content: "once" });
  a.send(ClientEvents.MessageSend, { roomId, clientMessageId, content: "once" });

  // Two acks (both resolve), but only one broadcast to B.
  assert.equal(a.all(ServerEvents.MessageSent).length, 2);
  assert.equal(b.all(ServerEvents.MessageNew).length, 1);
});
