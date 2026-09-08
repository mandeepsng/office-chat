import type { User } from "@office-chat/shared";

/** Everyone in the office, presence, and per-room typing indicators. */
export const directory = $state<{
  users: Record<string, User>;
  onlineUserIds: string[];
  typingByRoom: Record<string, string[]>;
}>({
  users: {},
  onlineUserIds: [],
  typingByRoom: {},
});

export function setUsers(users: User[]): void {
  for (const user of users) directory.users[user.id] = user;
}

export function userName(id: string): string {
  return directory.users[id]?.name ?? "Unknown";
}

export function isOnline(id: string): boolean {
  return directory.onlineUserIds.includes(id);
}

export function setOnline(userId: string, online: boolean): void {
  const present = directory.onlineUserIds.includes(userId);
  if (online && !present) directory.onlineUserIds.push(userId);
  if (!online && present) {
    directory.onlineUserIds = directory.onlineUserIds.filter((id) => id !== userId);
  }
}
