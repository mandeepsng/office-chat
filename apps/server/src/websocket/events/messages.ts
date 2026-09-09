import { ServerEvents, ErrorCodes } from "@office-chat/shared";
import {
  messageDeleteSchema,
  messageEditSchema,
  messageReadSchema,
  messageSendSchema,
} from "@office-chat/validation";
import { AppError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";
import { parseOrThrow } from "../parse";
import type { EventContext } from "./context";

export function handleMessageSend(ec: EventContext, payload: unknown): void {
  const senderId = ec.conn.userId!;

  // Per-connection rate limit guards against flooding.
  if (!ec.conn.bucket.tryRemove()) {
    throw new AppError(ErrorCodes.RateLimited, "You are sending messages too fast");
  }

  const input = parseOrThrow(messageSendSchema, payload);
  const { message, duplicate } = ec.app.messageService.send(senderId, input);

  // Acknowledge to the sender so it can reconcile its optimistic copy.
  ec.conn.send(ServerEvents.MessageSent, {
    clientMessageId: input.clientMessageId,
    message,
  });

  // Only fan out newly-created messages (a retried duplicate was already sent).
  if (!duplicate) {
    ec.hub.broadcastToRoom(message.roomId, ServerEvents.MessageNew, { message }, senderId);
    logger.info("Message stored", {
      roomId: message.roomId,
      senderId,
      ...(env.logMessageContent ? { content: message.content } : {}),
    });
  }
}

export function handleMessageEdit(ec: EventContext, payload: unknown): void {
  const input = parseOrThrow(messageEditSchema, payload);
  const message = ec.app.messageService.edit(ec.conn.userId!, input);
  ec.hub.broadcastToRoom(message.roomId, ServerEvents.MessageUpdated, { message });
}

export function handleMessageDelete(ec: EventContext, payload: unknown): void {
  const { messageId } = parseOrThrow(messageDeleteSchema, payload);
  const message = ec.app.messageService.delete(ec.conn.userId!, messageId);
  ec.hub.broadcastToRoom(message.roomId, ServerEvents.MessageDeleted, {
    messageId: message.id,
    roomId: message.roomId,
  });
}

export function handleMessageRead(ec: EventContext, payload: unknown): void {
  const userId = ec.conn.userId!;
  const input = parseOrThrow(messageReadSchema, payload);
  ec.app.messageService.markRead(userId, input);
  const readMessage = ec.app.repos.messages.getById(input.messageId);
  // Tell other room members this user has read up to messageId.
  ec.hub.broadcastToRoom(
    input.roomId,
    ServerEvents.MessageRead,
    {
      roomId: input.roomId,
      messageId: input.messageId,
      userId,
      createdAt: readMessage?.createdAt ?? new Date().toISOString(),
    },
    userId,
  );
}
