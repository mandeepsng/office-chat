// Domain entities shared between the server and the desktop client.

export type Platform = "windows" | "macos" | "linux";

export type RoomType = "direct" | "group";

export type MessageType = "text" | "gif" | "image" | "file" | "system";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "offline"
  | "error";

export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface User {
  id: string;
  name: string;
  avatar: string | null;
  lastSeenAt: string;
  isOnline: boolean;
}

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  platform: Platform;
  lastSeenAt: string;
  createdAt: string;
}

export interface Room {
  id: string;
  type: RoomType;
  name: string;
  createdBy: string | null;
  createdAt: string;
  /** Populated for direct rooms so the client can render the other person. */
  memberIds: string[];
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  replyToId: string | null;
  /** Echoes the client-generated id so the sender can reconcile its optimistic copy. */
  clientMessageId: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

/** The envelope every WebSocket frame uses, in both directions. */
export interface WsEnvelope<T = unknown> {
  type: string;
  payload: T;
}

export interface WsErrorPayload {
  code: string;
  message: string;
  /** Optional correlation to the client frame that triggered the error. */
  event?: string;
}
