/**
 * Per-room unread message counts. Drives the sidebar pills and the native
 * tray/taskbar badge (see `lib/badge.ts`). Counts are in-memory only — they
 * reflect messages received this session while a room wasn't focused.
 */
export const unread = $state<{ byRoom: Record<string, number>; total: number }>({
  byRoom: {},
  total: 0,
});

function recompute(): void {
  unread.total = Object.values(unread.byRoom).reduce((sum, n) => sum + n, 0);
}

/** Count one more unread message in a room. */
export function bumpUnread(roomId: string): void {
  unread.byRoom[roomId] = (unread.byRoom[roomId] ?? 0) + 1;
  recompute();
}

/** Clear a room's unread count (e.g. when it's opened or read). */
export function clearUnread(roomId: string): void {
  if (unread.byRoom[roomId]) {
    delete unread.byRoom[roomId];
    recompute();
  }
}
