import type { ChatMessage } from "../types";

/**
 * The message currently being edited (null = not editing). Shared so the edit
 * button (in a bubble) drives the composer, which reuses its input for editing.
 */
export const editState = $state<{ target: ChatMessage | null }>({ target: null });

export function setEditTarget(message: ChatMessage): void {
  editState.target = message;
}

export function clearEditTarget(): void {
  editState.target = null;
}
