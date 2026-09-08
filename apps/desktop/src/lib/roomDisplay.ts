import type { Room } from "@office-chat/shared";
import { directory, isOnline, userName } from "./stores/directory.svelte";

/** The other participant of a direct room (from the current user's view). */
export function directPeerId(room: Room, ownId: string): string | undefined {
  return room.memberIds.find((id) => id !== ownId);
}

export function roomTitle(room: Room, ownId: string): string {
  if (room.type === "direct") {
    const peer = directPeerId(room, ownId);
    return peer ? userName(peer) : "Direct message";
  }
  return room.name;
}

export function roomSubtitle(room: Room, ownId: string): string {
  if (room.type === "direct") {
    const peer = directPeerId(room, ownId);
    return peer && isOnline(peer) ? "Online" : "Offline";
  }
  const count = room.memberIds.length;
  return `${count} member${count === 1 ? "" : "s"}`;
}

export function roomAvatar(room: Room, ownId: string): string {
  const label = room.type === "direct"
    ? roomTitle(room, ownId)
    : room.name;
  return label.trim().charAt(0).toUpperCase() || "#";
}

export function directPeerOnline(room: Room, ownId: string): boolean {
  const peer = directPeerId(room, ownId);
  return !!peer && directory.users[peer] !== undefined && isOnline(peer);
}
