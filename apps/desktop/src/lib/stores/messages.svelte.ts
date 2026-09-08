import type { Message, MessageStatus } from "@office-chat/shared";
import type { ChatMessage } from "../types";

export const messages = $state<{
  byRoom: Record<string, ChatMessage[]>;
  hasMore: Record<string, boolean>;
}>({
  byRoom: {},
  hasMore: {},
});

function ensureRoom(roomId: string): ChatMessage[] {
  return (messages.byRoom[roomId] ??= []);
}

export function roomMessages(roomId: string): ChatMessage[] {
  return messages.byRoom[roomId] ?? [];
}

/** Append a message, de-duplicating by id or client id (idempotent). */
export function addMessage(message: Message, status: MessageStatus): void {
  const list = ensureRoom(message.roomId);
  const existing = list.find(
    (m) =>
      m.id === message.id ||
      (message.clientMessageId != null && m.clientMessageId === message.clientMessageId),
  );
  if (existing) {
    Object.assign(existing, message, { status });
    return;
  }
  list.push({ ...message, status });
}

/** Reconcile an optimistic message once the server acks it. */
export function confirmMessage(clientMessageId: string, message: Message): void {
  const list = ensureRoom(message.roomId);
  const optimistic = list.find((m) => m.clientMessageId === clientMessageId);
  if (optimistic) Object.assign(optimistic, message, { status: "sent" });
  else list.push({ ...message, status: "sent" });
}

export function updateMessage(message: Message): void {
  const list = messages.byRoom[message.roomId];
  const existing = list?.find((m) => m.id === message.id);
  if (existing) Object.assign(existing, message);
}

export function markRoomFailed(roomId: string): void {
  for (const m of messages.byRoom[roomId] ?? []) {
    if (m.status === "pending") m.status = "failed";
  }
}

/** Mark own messages up to `messageId` as read (read-receipt fan-in). */
export function markReadUpTo(roomId: string, messageId: string, ownUserId: string): void {
  const list = messages.byRoom[roomId];
  if (!list) return;
  const target = list.find((m) => m.id === messageId);
  if (!target) return;
  for (const m of list) {
    if (m.senderId === ownUserId && m.createdAt <= target.createdAt) m.status = "read";
  }
}

/** Prepend an older page (history pagination). */
export function prependHistory(roomId: string, older: Message[], hasMore: boolean): void {
  const list = ensureRoom(roomId);
  const existingIds = new Set(list.map((m) => m.id));
  const toAdd: ChatMessage[] = older
    .filter((m) => !existingIds.has(m.id))
    .map((m) => ({ ...m, status: "delivered" as MessageStatus }));
  messages.byRoom[roomId] = [...toAdd, ...list];
  messages.hasMore[roomId] = hasMore;
}

export function seedRoom(roomId: string, history: ChatMessage[]): void {
  if (!messages.byRoom[roomId] || messages.byRoom[roomId]!.length === 0) {
    messages.byRoom[roomId] = history;
  }
}
