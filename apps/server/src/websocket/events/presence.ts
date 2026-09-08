import { ServerEvents } from "@office-chat/shared";
import { presenceUpdateSchema } from "@office-chat/validation";
import { parseOrThrow } from "../parse";
import type { EventContext } from "./context";

/** Lightweight presence heartbeat. v1 only distinguishes online/offline. */
export function handlePresenceUpdate(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  parseOrThrow(presenceUpdateSchema, payload);
  ec.app.userService.setPresence(userId, true);
  ec.hub.broadcastToAll(ServerEvents.PresenceOnline, { userId }, userId);
}

/** Called on socket close; announces offline once the last device disconnects. */
export function announceOffline(ec: Omit<EventContext, "officeCode">): void {
  const { app, hub, conn } = ec;
  const userId = conn.userId;
  if (!userId) return;

  hub.remove(conn);
  conn.clearTypingTimers();

  if (!hub.isUserOnline(userId)) {
    const user = app.userService.setPresence(userId, false);
    hub.broadcastToAll(ServerEvents.PresenceOffline, {
      userId,
      lastSeenAt: user?.lastSeenAt ?? new Date().toISOString(),
    });
  }
}
