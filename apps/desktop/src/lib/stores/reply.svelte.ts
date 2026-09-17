import type { ChatMessage } from "../types";

/**
 * The message the composer is currently replying to (null = not replying).
 * Shared so the reply button (in a message bubble) and the composer banner
 * stay in sync.
 */
export const replyState = $state<{ target: ChatMessage | null }>({ target: null });

export function setReplyTarget(message: ChatMessage): void {
  replyState.target = message;
}

export function clearReplyTarget(): void {
  replyState.target = null;
}
