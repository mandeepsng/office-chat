import type { LinkPreview } from "@office-chat/shared";
import { config } from "./config";
import { auth } from "./stores/auth.svelte";

export type PreviewEntry =
  | { status: "loading" }
  | { status: "done"; data: LinkPreview }
  | { status: "error" };

// One entry per URL, shared across all message bubbles so each link is fetched once.
const cache = $state<Record<string, PreviewEntry>>({});

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/i;

/** The first http(s) URL in a string, or null. */
export function firstUrl(text: string): string | null {
  return text.match(URL_RE)?.[1] ?? null;
}

/** Current cache entry for a URL (reactive), or undefined if never requested. */
export function previewOf(url: string): PreviewEntry | undefined {
  return cache[url];
}

/** Start fetching a URL's preview once; safe to call on every render. */
export function ensurePreview(url: string): void {
  if (cache[url]) return;
  cache[url] = { status: "loading" };
  void load(url);
}

async function load(url: string): Promise<void> {
  const userId = auth.identity?.userId;
  if (!userId) {
    cache[url] = { status: "error" };
    return;
  }
  try {
    const res = await fetch(`${config.httpUrl}/unfurl?url=${encodeURIComponent(url)}`, {
      headers: { "x-user-id": userId },
    });
    const body = (await res.json()) as { ok: boolean; preview?: LinkPreview };
    cache[url] =
      body.ok && body.preview ? { status: "done", data: body.preview } : { status: "error" };
  } catch {
    cache[url] = { status: "error" };
  }
}
