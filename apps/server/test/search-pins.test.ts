import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ClientEvents, ServerEvents } from "@office-chat/shared";
import { makeHarness } from "./helpers";

function officeRoomId(user: ReturnType<ReturnType<typeof makeHarness>["authUser"]>): string {
  return user.last(ServerEvents.AuthSuccess).payload.rooms.find(
    (r: any) => r.name === "Office General",
  ).id;
}

test("message search finds a matching message in a room the user belongs to", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const roomId = officeRoomId(a);

  a.send(ClientEvents.MessageSend, {
    roomId,
    clientMessageId: randomUUID(),
    content: "the quarterly report is ready",
  });
  a.send(ClientEvents.MessageSend, {
    roomId,
    clientMessageId: randomUUID(),
    content: "totally unrelated",
  });

  a.send(ClientEvents.MessageSearch, { query: "quarterly" });

  const results = a.last(ServerEvents.MessageSearchResults).payload.messages;
  assert.equal(results.length, 1);
  assert.match(results[0].content, /quarterly/);
});

test("message search is case-insensitive and scoped to the caller's rooms", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const roomId = officeRoomId(a);

  a.send(ClientEvents.MessageSend, { roomId, clientMessageId: randomUUID(), content: "Deploy TODAY" });

  b.send(ClientEvents.MessageSearch, { query: "deploy" });
  const results = b.last(ServerEvents.MessageSearchResults).payload.messages;
  assert.equal(results.length, 1, "B shares Office General with A, so the message is visible");
});

test("message search rejects an unknown roomId scope", () => {
  const h = makeHarness();
  const a = h.authUser("A");

  a.send(ClientEvents.MessageSearch, { query: "x", roomId: randomUUID() });
  const err = a.last(ServerEvents.Error);
  assert.ok(["ROOM_NOT_FOUND", "NOT_ROOM_MEMBER"].includes(err.payload.code));
});

test("pins a message and broadcasts the updated pin list to the room", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const roomId = officeRoomId(a);

  a.send(ClientEvents.MessageSend, { roomId, clientMessageId: randomUUID(), content: "pin me" });
  const messageId = a.last(ServerEvents.MessageSent).payload.message.id;

  a.send(ClientEvents.MessagePinToggle, { messageId });

  const aPins = a.last(ServerEvents.RoomPinsUpdated).payload.pins;
  assert.equal(aPins.length, 1);
  assert.equal(aPins[0].messageId, messageId);

  const bPins = b.last(ServerEvents.RoomPinsUpdated).payload.pins;
  assert.equal(bPins.length, 1, "other room members are notified too");
});

test("toggling pin twice unpins the message", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const roomId = officeRoomId(a);

  a.send(ClientEvents.MessageSend, { roomId, clientMessageId: randomUUID(), content: "pin me" });
  const messageId = a.last(ServerEvents.MessageSent).payload.message.id;

  a.send(ClientEvents.MessagePinToggle, { messageId });
  a.send(ClientEvents.MessagePinToggle, { messageId });

  const updates = a.all(ServerEvents.RoomPinsUpdated);
  assert.equal(updates[updates.length - 1].payload.pins.length, 0);
});

test("rejects pinning a message in a room the user is not in", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const outsider = h.authUser("Outsider");
  const roomId = officeRoomId(a);

  a.send(ClientEvents.MessageSend, { roomId, clientMessageId: randomUUID(), content: "secret" });
  const messageId = a.last(ServerEvents.MessageSent).payload.message.id;

  // Outsider leaves Office General so it's no longer a shared room.
  outsider.send(ClientEvents.RoomLeave, { roomId });
  outsider.send(ClientEvents.MessagePinToggle, { messageId });

  const err = outsider.last(ServerEvents.Error);
  assert.equal(err.payload.code, "NOT_ROOM_MEMBER");
});

test("reacting with a GIF url stores and broadcasts it like an emoji reaction", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const roomId = officeRoomId(a);

  a.send(ClientEvents.MessageSend, { roomId, clientMessageId: randomUUID(), content: "funny?" });
  const messageId = a.last(ServerEvents.MessageSent).payload.message.id;

  const gifUrl = "https://media.giphy.com/media/abc123/giphy.gif";
  a.send(ClientEvents.ReactionToggle, { messageId, emoji: gifUrl });

  const reactions = a.last(ServerEvents.ReactionUpdated).payload.reactions;
  assert.equal(reactions.length, 1);
  assert.equal(reactions[0].emoji, gifUrl);
});
