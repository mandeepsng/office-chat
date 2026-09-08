import { ServerEvents, TYPING } from "@office-chat/shared";
import { typingSchema } from "@office-chat/validation";
import { parseOrThrow } from "../parse";
import type { EventContext } from "./context";

export function handleTypingStart(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { roomId } = parseOrThrow(typingSchema, payload);
  if (!ec.app.roomService.isMember(roomId, userId)) return;

  ec.hub.broadcastToRoom(roomId, ServerEvents.TypingStart, { roomId, userId }, userId);

  // Auto-clear so a dropped stop event doesn't leave a stuck indicator.
  const existing = ec.conn.typingTimers.get(roomId);
  if (existing) clearTimeout(existing);
  ec.conn.typingTimers.set(
    roomId,
    setTimeout(() => emitStop(ec, roomId), TYPING.TIMEOUT_MS),
  );
}

export function handleTypingStop(ec: EventContext, payload: unknown): void {
  const { roomId } = parseOrThrow(typingSchema, payload);
  emitStop(ec, roomId);
}

function emitStop(ec: EventContext, roomId: string): void {
  const userId = ec.conn.userId;
  if (!userId) return;
  const timer = ec.conn.typingTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    ec.conn.typingTimers.delete(roomId);
  }
  ec.hub.broadcastToRoom(roomId, ServerEvents.TypingStop, { roomId, userId }, userId);
}
