import type { Room } from "@office-chat/shared";

export const rooms = $state<{
  list: Room[];
  activeRoomId: string | null;
}>({
  list: [],
  activeRoomId: null,
});

export function upsertRoom(room: Room): void {
  const index = rooms.list.findIndex((r) => r.id === room.id);
  if (index >= 0) rooms.list[index] = room;
  else rooms.list.push(room);
}
