import { userName } from "./stores/directory.svelte";

export interface MentionPart {
  text: string;
  /** True when this part is a highlighted @mention token. */
  mention: boolean;
  /** True when the mention refers to the current user. */
  self: boolean;
}

/**
 * Split message text into plain and @mention segments so the UI can highlight
 * mentions. Tokens are built from the message's validated mention ids, matched
 * longest-first so "@Mandeep Singh" wins over "@Mandeep".
 */
/** Broadcast mentions that ping the whole room; always highlighted. */
const BROADCAST_TOKENS = ["@everyone", "@here"] as const;

export function mentionParts(
  content: string,
  mentionIds: string[],
  selfId: string | null,
): MentionPart[] {
  const tokens = [
    ...mentionIds.map((id) => ({ token: `@${userName(id)}`, self: id === selfId })),
    ...BROADCAST_TOKENS.map((token) => ({ token, self: true })),
  ].sort((a, b) => b.token.length - a.token.length);

  const parts: MentionPart[] = [];
  let i = 0;
  while (i < content.length) {
    const hit = tokens.find((t) => content.startsWith(t.token, i));
    if (hit) {
      parts.push({ text: hit.token, mention: true, self: hit.self });
      i += hit.token.length;
    } else {
      // Accumulate plain text up to the next '@' (a potential mention start).
      const next = content.indexOf("@", i + 1);
      const end = next === -1 ? content.length : next;
      parts.push({ text: content.slice(i, end), mention: false, self: false });
      i = end;
    }
  }
  return parts;
}
