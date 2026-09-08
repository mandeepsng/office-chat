import { ServerEvents } from "@office-chat/shared";
import {
  roomCreateSchema,
  roomHistorySchema,
  roomIdSchema,
} from "@office-chat/validation";
import { parseOrThrow } from "../parse";
import type { EventContext } from "./context";

export function handleRoomList(ec: EventContext): void {
  const userId = ec.conn.userId!;
  ec.conn.send(ServerEvents.RoomList, {
    rooms: ec.app.roomService.listForUser(userId),
  });
}

export function handleRoomCreate(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const input = parseOrThrow(roomCreateSchema, payload);
  const room = ec.app.roomService.create(userId, input);

  // Notify every member (they may not have this room in their list yet).
  for (const memberId of room.memberIds) {
    ec.hub.sendToUser(memberId, ServerEvents.RoomCreated, { room });
  }
}

export function handleRoomJoin(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { roomId } = parseOrThrow(roomIdSchema, payload);
  const room = ec.app.roomService.join(roomId, userId);
  ec.hub.broadcastToRoom(room.id, ServerEvents.RoomUpdated, { room });
}

export function handleRoomLeave(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const { roomId } = parseOrThrow(roomIdSchema, payload);
  ec.app.roomService.leave(roomId, userId);
  const room = ec.app.repos.rooms.getById(roomId);
  if (room) ec.hub.broadcastToRoom(room.id, ServerEvents.RoomUpdated, { room });
}

export function handleRoomHistory(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const input = parseOrThrow(roomHistorySchema, payload);
  const page = ec.app.roomService.history(userId, input);
  ec.conn.send(ServerEvents.RoomHistory, {
    roomId: input.roomId,
    messages: page.messages,
    hasMore: page.hasMore,
  });
}
