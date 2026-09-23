import { test } from "node:test";
import assert from "node:assert/strict";
import { ClientEvents, ServerEvents } from "@office-chat/shared";
import { makeHarness } from "./helpers";
import { announceOffline } from "../src/websocket/events/presence";

test("invite rings the callee with the caller's name", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");

  a.send(ClientEvents.CallInvite, { toUserId: b.userId });

  const incoming = b.last(ServerEvents.CallIncoming);
  assert.ok(incoming);
  assert.equal(incoming.payload.fromUserId, a.userId);
  assert.equal(incoming.payload.fromName, "A");
});

test("inviting an offline user is rejected as unavailable", () => {
  const h = makeHarness();
  const a = h.authUser("A");

  a.send(ClientEvents.CallInvite, { toUserId: "00000000-0000-0000-0000-000000000000" });

  assert.ok(a.last(ServerEvents.CallUnavailable));
});

test("inviting a user already on a call is rejected as busy", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const c = h.authUser("C");

  a.send(ClientEvents.CallInvite, { toUserId: b.userId });
  c.send(ClientEvents.CallInvite, { toUserId: b.userId });

  assert.ok(c.last(ServerEvents.CallBusy));
});

test("accept notifies the caller so it can send the offer", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");

  a.send(ClientEvents.CallInvite, { toUserId: b.userId });
  b.send(ClientEvents.CallAccept, { toUserId: a.userId });

  const accepted = a.last(ServerEvents.CallAccepted);
  assert.ok(accepted);
  assert.equal(accepted.payload.fromUserId, b.userId);
});

test("reject notifies the caller and frees both users for another call", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const c = h.authUser("C");

  a.send(ClientEvents.CallInvite, { toUserId: b.userId });
  b.send(ClientEvents.CallReject, { toUserId: a.userId });

  assert.ok(a.last(ServerEvents.CallRejected));

  // Both are free again — a new invite from C to B should ring, not bounce as busy.
  c.send(ClientEvents.CallInvite, { toUserId: b.userId });
  assert.ok(b.last(ServerEvents.CallIncoming));
});

test("offer/answer/ice relay between an active call's two peers", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");

  a.send(ClientEvents.CallInvite, { toUserId: b.userId });
  b.send(ClientEvents.CallAccept, { toUserId: a.userId });

  a.send(ClientEvents.CallOffer, { toUserId: b.userId, sdp: "v=0 offer" });
  const offer = b.last(ServerEvents.CallOffer);
  assert.equal(offer.payload.sdp, "v=0 offer");
  assert.equal(offer.payload.fromUserId, a.userId);

  b.send(ClientEvents.CallAnswer, { toUserId: a.userId, sdp: "v=0 answer" });
  assert.equal(a.last(ServerEvents.CallAnswer).payload.sdp, "v=0 answer");

  a.send(ClientEvents.CallIce, { toUserId: b.userId, candidate: { candidate: "x" } });
  assert.deepEqual(b.last(ServerEvents.CallIce).payload.candidate, { candidate: "x" });
});

test("signaling is rejected between users who are not each other's call peer", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const c = h.authUser("C");

  // A and B are in a call; C tries to inject an offer into it.
  a.send(ClientEvents.CallInvite, { toUserId: b.userId });
  b.send(ClientEvents.CallAccept, { toUserId: a.userId });

  c.send(ClientEvents.CallOffer, { toUserId: b.userId, sdp: "v=0 malicious" });
  assert.equal(b.last(ServerEvents.CallOffer), undefined);
});

test("end notifies the other side and frees both users", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");
  const c = h.authUser("C");

  a.send(ClientEvents.CallInvite, { toUserId: b.userId });
  b.send(ClientEvents.CallAccept, { toUserId: a.userId });

  a.send(ClientEvents.CallEnd, { toUserId: b.userId });
  assert.ok(b.last(ServerEvents.CallEnded));

  c.send(ClientEvents.CallInvite, { toUserId: b.userId });
  assert.ok(b.last(ServerEvents.CallIncoming));
});

test("a dropped connection ends the call and notifies the peer", () => {
  const h = makeHarness();
  const a = h.authUser("A");
  const b = h.authUser("B");

  a.send(ClientEvents.CallInvite, { toUserId: b.userId });
  b.send(ClientEvents.CallAccept, { toUserId: a.userId });

  announceOffline({ app: h.app, hub: h.hub, conn: a.conn });

  assert.ok(b.last(ServerEvents.CallEnded));
  assert.equal(h.app.callService.isBusy(b.userId), false);
});
