import { ServerEvents } from "@office-chat/shared";
import { callIceSchema, callSdpSchema, callTargetSchema } from "@office-chat/validation";
import { parseOrThrow } from "../parse";
import type { EventContext } from "./context";

/** Caller starts a 1:1 call. Rejects immediately if the callee is offline or either side is busy. */
export function handleCallInvite(ec: EventContext, payload: unknown): void {
  const fromUserId = ec.conn.userId!;
  const { toUserId } = parseOrThrow(callTargetSchema, payload);
  if (toUserId === fromUserId) return;

  if (!ec.hub.isUserOnline(toUserId)) {
    ec.conn.send(ServerEvents.CallUnavailable, { userId: toUserId });
    return;
  }
  if (ec.app.callService.isBusy(fromUserId) || ec.app.callService.isBusy(toUserId)) {
    ec.conn.send(ServerEvents.CallBusy, { userId: toUserId });
    return;
  }

  ec.app.callService.start(fromUserId, toUserId);
  ec.hub.sendToUser(toUserId, ServerEvents.CallIncoming, {
    fromUserId,
    fromName: ec.app.repos.users.getById(fromUserId)?.name ?? "Someone",
  });
}

/** Callee accepted; tell the caller so it can create and send the WebRTC offer. */
export function handleCallAccept(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { toUserId } = parseOrThrow(callTargetSchema, payload);
  if (ec.app.callService.peerOf(userId) !== toUserId) return;
  ec.hub.sendToUser(toUserId, ServerEvents.CallAccepted, { fromUserId: userId });
}

export function handleCallReject(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { toUserId } = parseOrThrow(callTargetSchema, payload);
  ec.app.callService.end(userId);
  ec.hub.sendToUser(toUserId, ServerEvents.CallRejected, { fromUserId: userId });
}

export function handleCallEnd(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { toUserId } = parseOrThrow(callTargetSchema, payload);
  ec.app.callService.end(userId);
  ec.hub.sendToUser(toUserId, ServerEvents.CallEnded, { fromUserId: userId });
}

// The three relays below only forward between users who are each other's
// current call peer, so a client can't puppet SDP/ICE into an unrelated call.

export function handleCallOffer(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { toUserId, sdp } = parseOrThrow(callSdpSchema, payload);
  if (ec.app.callService.peerOf(userId) !== toUserId) return;
  ec.hub.sendToUser(toUserId, ServerEvents.CallOffer, { fromUserId: userId, sdp });
}

export function handleCallAnswer(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { toUserId, sdp } = parseOrThrow(callSdpSchema, payload);
  if (ec.app.callService.peerOf(userId) !== toUserId) return;
  ec.hub.sendToUser(toUserId, ServerEvents.CallAnswer, { fromUserId: userId, sdp });
}

export function handleCallIce(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { toUserId, candidate } = parseOrThrow(callIceSchema, payload);
  if (ec.app.callService.peerOf(userId) !== toUserId) return;
  ec.hub.sendToUser(toUserId, ServerEvents.CallIce, { fromUserId: userId, candidate });
}
