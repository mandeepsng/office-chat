import type { ReadReceipt } from "@office-chat/shared";

/** Per room, each user's last-read pointer — powers group "seen by" avatars. */
export const receipts = $state<{
  readsByRoom: Record<string, Record<string, { messageId: string; createdAt: string }>>;
}>({
  readsByRoom: {},
});

/** Replace a room's read state from a history load. */
export function setRoomReads(roomId: string, reads: ReadReceipt[]): void {
  const map: Record<string, { messageId: string; createdAt: string }> = {};
  for (const r of reads) map[r.userId] = { messageId: r.messageId, createdAt: r.createdAt };
  receipts.readsByRoom[roomId] = map;
}

/** Advance one user's read pointer (from a live message:read event). */
export function setReader(
  roomId: string,
  userId: string,
  messageId: string,
  createdAt: string,
): void {
  const map = (receipts.readsByRoom[roomId] ??= {});
  const current = map[userId];
  if (!current || current.createdAt < createdAt) map[userId] = { messageId, createdAt };
}
