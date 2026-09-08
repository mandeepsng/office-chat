import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ClientEvents, ServerEvents } from "@office-chat/shared";
import { makeHarness, OFFICE_CODE } from "./helpers";

test("registers with the correct office code", () => {
  const h = makeHarness();
  const tc = h.makeConn();
  const userId = randomUUID();
  tc.send(ClientEvents.AuthRegister, {
    officeCode: OFFICE_CODE,
    userId,
    deviceId: randomUUID(),
    name: "Mandeep",
    platform: "windows",
  });
  const success = tc.last(ServerEvents.AuthSuccess);
  assert.ok(success, "auth:success emitted");
  assert.equal(success.payload.user.id, userId);
  assert.equal(tc.conn.authenticated, true);
  // Auto-joined the default office room.
  assert.ok(success.payload.rooms.some((r: any) => r.name === "Office General"));
});

test("rejects an incorrect office code", () => {
  const h = makeHarness();
  const tc = h.makeConn();
  tc.send(ClientEvents.AuthRegister, {
    officeCode: "WRONG",
    userId: randomUUID(),
    deviceId: randomUUID(),
    name: "Mandeep",
    platform: "windows",
  });
  const err = tc.last(ServerEvents.AuthError);
  assert.ok(err, "auth:error emitted");
  assert.equal(err.payload.code, "INVALID_OFFICE_CODE");
  assert.equal(tc.conn.authenticated, false);
});

test("reconnects an existing identity without the office code", () => {
  const h = makeHarness();
  const user = h.authUser("Rohit");

  const tc = h.makeConn();
  tc.send(ClientEvents.AuthConnect, { userId: user.userId, deviceId: user.deviceId });
  assert.ok(tc.last(ServerEvents.AuthSuccess), "reconnect succeeds");
});

test("rejects reconnect for an unknown identity", () => {
  const h = makeHarness();
  const tc = h.makeConn();
  tc.send(ClientEvents.AuthConnect, { userId: randomUUID(), deviceId: randomUUID() });
  const err = tc.last(ServerEvents.AuthError);
  assert.equal(err.payload.code, "USER_NOT_FOUND");
});

test("blocks authed events before authentication", () => {
  const h = makeHarness();
  const tc = h.makeConn();
  tc.send(ClientEvents.RoomList, {});
  const err = tc.last(ServerEvents.Error);
  assert.equal(err.payload.code, "UNAUTHENTICATED");
});
