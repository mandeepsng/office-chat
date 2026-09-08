import type { Identity, ChatMessage } from "./types";

/**
 * Abstraction over local persistence so the backing store can change later
 * (e.g. to a Tauri SQLite cache) without touching UI components.
 */
export interface LocalStore {
  getIdentity(): Identity | null;
  saveIdentity(identity: Identity): void;
  clearIdentity(): void;
  getCachedMessages(roomId: string): ChatMessage[];
  cacheMessages(roomId: string, messages: ChatMessage[]): void;
}

const IDENTITY_KEY = "officechat.identity";
const cacheKey = (roomId: string) => `officechat.cache.${roomId}`;
/** Keep the on-open cache small so startup stays instant. */
const MAX_CACHED = 50;

class BrowserLocalStore implements LocalStore {
  getIdentity(): Identity | null {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      return raw ? (JSON.parse(raw) as Identity) : null;
    } catch {
      return null;
    }
  }

  saveIdentity(identity: Identity): void {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  }

  clearIdentity(): void {
    localStorage.removeItem(IDENTITY_KEY);
  }

  getCachedMessages(roomId: string): ChatMessage[] {
    try {
      const raw = localStorage.getItem(cacheKey(roomId));
      return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  }

  cacheMessages(roomId: string, messages: ChatMessage[]): void {
    const trimmed = messages.slice(-MAX_CACHED);
    try {
      localStorage.setItem(cacheKey(roomId), JSON.stringify(trimmed));
    } catch {
      // Storage full / unavailable — caching is best-effort.
    }
  }
}

export const store: LocalStore = new BrowserLocalStore();
