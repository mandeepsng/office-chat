import type { PinnedMessage } from "@office-chat/shared";

/** Pinned messages per room, kept in sync via room:pinsUpdated events. */
export const pins = $state<{ byRoom: Record<string, PinnedMessage[]> }>({ byRoom: {} });

/** Replace the full pin list for one room (from room:pinsUpdated or room:history). */
export function setPins(roomId: string, list: PinnedMessage[]): void {
  pins.byRoom[roomId] = list;
}

export function pinsForRoom(roomId: string): PinnedMessage[] {
  return pins.byRoom[roomId] ?? [];
}

export function isPinned(roomId: string, messageId: string): boolean {
  return pinsForRoom(roomId).some((p) => p.messageId === messageId);
}
