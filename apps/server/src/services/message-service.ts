import { ErrorCodes } from "@office-chat/shared";
import type { Message } from "@office-chat/shared";
import type {
  MessageEditInput,
  MessageReadInput,
  MessageSendInput,
} from "@office-chat/validation";
import type { Repositories } from "../db";
import { AppError } from "../utils/errors";
import type { RoomService } from "./room-service";

export interface SendResult {
  message: Message;
  /** True when an existing message was returned via idempotency. */
  duplicate: boolean;
}

export class MessageService {
  constructor(
    private readonly repos: Repositories,
    private readonly rooms: RoomService,
  ) {}

  send(senderId: string, input: MessageSendInput): SendResult {
    this.rooms.requireMembership(input.roomId, senderId);

    // Idempotency: a retried send with the same client id returns the original.
    const existing = this.repos.messages.findByClientId(senderId, input.clientMessageId);
    if (existing) return { message: existing, duplicate: true };

    if (input.replyToId) {
      const parent = this.repos.messages.getById(input.replyToId);
      if (!parent || parent.roomId !== input.roomId) {
        throw new AppError(ErrorCodes.MessageNotFound, "Replied-to message not found");
      }
    }

    const message: Message = {
      id: crypto.randomUUID(),
      roomId: input.roomId,
      senderId,
      content: input.content,
      messageType: input.messageType,
      replyToId: input.replyToId ?? null,
      clientMessageId: input.clientMessageId,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
    };
    this.repos.messages.insert(message);
    return { message, duplicate: false };
  }

  edit(senderId: string, input: MessageEditInput): Message {
    const message = this.repos.messages.getById(input.messageId);
    if (!message || message.deletedAt) {
      throw new AppError(ErrorCodes.MessageNotFound, "Message not found");
    }
    if (message.senderId !== senderId) {
      throw new AppError(ErrorCodes.Forbidden, "You can only edit your own messages");
    }
    return this.repos.messages.update(input.messageId, input.content, new Date().toISOString())!;
  }

  delete(senderId: string, messageId: string): Message {
    const message = this.repos.messages.getById(messageId);
    if (!message) throw new AppError(ErrorCodes.MessageNotFound, "Message not found");
    if (message.senderId !== senderId) {
      throw new AppError(ErrorCodes.Forbidden, "You can only delete your own messages");
    }
    return this.repos.messages.softDelete(messageId, new Date().toISOString())!;
  }

  markRead(userId: string, input: MessageReadInput): void {
    this.rooms.requireMembership(input.roomId, userId);
    const message = this.repos.messages.getById(input.messageId);
    if (!message || message.roomId !== input.roomId) {
      throw new AppError(ErrorCodes.MessageNotFound, "Message not found");
    }
    this.repos.messages.setLastRead(input.roomId, userId, input.messageId, new Date().toISOString());
  }
}
