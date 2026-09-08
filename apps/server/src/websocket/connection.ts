import type { WebSocket } from "ws";
import { RATE_LIMIT } from "@office-chat/shared";
import { TokenBucket } from "../utils/rate-limit";

let counter = 0;

/** Server-side view of one live socket (one device). */
export class Connection {
  readonly id = `c${++counter}`;
  userId: string | null = null;
  deviceId: string | null = null;
  authenticated = false;
  readonly bucket = new TokenBucket(RATE_LIMIT.MESSAGES_PER_SECOND, RATE_LIMIT.BURST);
  /** Active typing indicators keyed by room, so we can auto-clear them. */
  readonly typingTimers = new Map<string, NodeJS.Timeout>();

  constructor(readonly ws: WebSocket) {}

  send(type: string, payload: unknown): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  clearTypingTimers(): void {
    for (const t of this.typingTimers.values()) clearTimeout(t);
    this.typingTimers.clear();
  }
}
