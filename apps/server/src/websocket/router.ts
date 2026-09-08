import { ClientEvents, ServerEvents, ErrorCodes } from "@office-chat/shared";
import type { WsEnvelope } from "@office-chat/shared";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { EventContext, EventHandler } from "./events/context";
import { handleAuthConnect, handleAuthRegister } from "./events/auth";
import {
  handleRoomCreate,
  handleRoomHistory,
  handleRoomJoin,
  handleRoomLeave,
  handleRoomList,
} from "./events/rooms";
import {
  handleMessageDelete,
  handleMessageEdit,
  handleMessageRead,
  handleMessageSend,
} from "./events/messages";
import { handleTypingStart, handleTypingStop } from "./events/typing";
import { handlePresenceUpdate } from "./events/presence";

const preAuthHandlers: Record<string, EventHandler> = {
  [ClientEvents.AuthRegister]: handleAuthRegister,
  [ClientEvents.AuthConnect]: handleAuthConnect,
};

const authedHandlers: Record<string, EventHandler> = {
  [ClientEvents.RoomList]: handleRoomList,
  [ClientEvents.RoomCreate]: handleRoomCreate,
  [ClientEvents.RoomJoin]: handleRoomJoin,
  [ClientEvents.RoomLeave]: handleRoomLeave,
  [ClientEvents.RoomHistory]: handleRoomHistory,
  [ClientEvents.MessageSend]: handleMessageSend,
  [ClientEvents.MessageEdit]: handleMessageEdit,
  [ClientEvents.MessageDelete]: handleMessageDelete,
  [ClientEvents.MessageRead]: handleMessageRead,
  [ClientEvents.TypingStart]: handleTypingStart,
  [ClientEvents.TypingStop]: handleTypingStop,
  [ClientEvents.PresenceUpdate]: handlePresenceUpdate,
};

export function route(ec: EventContext, envelope: WsEnvelope): void {
  const { type, payload } = envelope;

  try {
    const preAuth = preAuthHandlers[type];
    if (preAuth) {
      preAuth(ec, payload);
      return;
    }

    if (!ec.conn.authenticated) {
      ec.conn.send(ServerEvents.Error, {
        code: ErrorCodes.Unauthenticated,
        message: "Authenticate before sending this event",
        event: type,
      });
      return;
    }

    const handler = authedHandlers[type];
    if (!handler) {
      ec.conn.send(ServerEvents.Error, {
        code: ErrorCodes.UnknownEvent,
        message: `Unknown event: ${type}`,
        event: type,
      });
      return;
    }

    handler(ec, payload);
  } catch (err) {
    if (err instanceof AppError) {
      ec.conn.send(ServerEvents.Error, { code: err.code, message: err.message, event: type });
      return;
    }
    // Never let one bad frame crash the server.
    logger.error("Unhandled event error", { event: type, error: (err as Error).message });
    ec.conn.send(ServerEvents.Error, {
      code: ErrorCodes.Internal,
      message: "Internal server error",
      event: type,
    });
  }
}
