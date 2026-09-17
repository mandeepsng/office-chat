import type { Reaction } from "@office-chat/shared";

/** Reactions per message id, kept in sync via reaction:updated events. */
export const reactions = $state<{ byMessage: Record<string, Reaction[]> }>({ byMessage: {} });

/** Replace the full reaction set for one message (from a reaction:updated event). */
export function setReactions(messageId: string, list: Reaction[]): void {
  reactions.byMessage[messageId] = list;
}

/** Seed reactions from a history page (a flat list across many messages). */
export function seedReactions(list: Reaction[]): void {
  const grouped: Record<string, Reaction[]> = {};
  for (const r of list) (grouped[r.messageId] ??= []).push(r);
  for (const [id, rs] of Object.entries(grouped)) reactions.byMessage[id] = rs;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  /** Whether the current user reacted with this emoji. */
  mine: boolean;
}

/** Aggregate a message's reactions into per-emoji chips for rendering. */
export function reactionGroups(messageId: string, ownUserId: string): ReactionGroup[] {
  const list = reactions.byMessage[messageId];
  if (!list || list.length === 0) return [];
  const map = new Map<string, ReactionGroup>();
  for (const r of list) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    g.count += 1;
    if (r.userId === ownUserId) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
}
