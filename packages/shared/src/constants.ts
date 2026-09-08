// Shared limits and defaults used by both validation and UI.

export const LIMITS = {
  /** Max characters in a text message. */
  MESSAGE_MAX_LENGTH: 4000,
  NAME_MAX_LENGTH: 60,
  ROOM_NAME_MAX_LENGTH: 80,
  /** Default page size for message history. */
  HISTORY_PAGE_SIZE: 50,
  HISTORY_MAX_PAGE_SIZE: 100,
} as const;

export const RECONNECT = {
  /** Exponential backoff schedule (ms) for the desktop WebSocket client. */
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
} as const;

export const TYPING = {
  /** Client debounce before emitting typing:start again (ms). */
  DEBOUNCE_MS: 900,
  /** Server auto-clears a typing indicator after this idle window (ms). */
  TIMEOUT_MS: 5000,
} as const;

export const RATE_LIMIT = {
  MESSAGES_PER_SECOND: 5,
  BURST: 10,
} as const;

export const MESSAGE_TYPES = [
  "text",
  "gif",
  "image",
  "file",
  "system",
] as const;

export const PLATFORMS = ["windows", "macos", "linux"] as const;
