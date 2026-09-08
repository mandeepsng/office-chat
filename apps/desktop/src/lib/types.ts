import type { Message, MessageStatus } from "@office-chat/shared";

/** The locally-persisted identity created on first join. */
export interface Identity {
  userId: string;
  deviceId: string;
  name: string;
  avatar: string | null;
}

/** A message plus client-side delivery status for optimistic UI. */
export interface ChatMessage extends Message {
  status: MessageStatus;
}
