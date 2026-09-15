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
export function mentionParts(
  content: string,
  mentionIds: string[],
  selfId: string | null,
): MentionPart[] {
  if (mentionIds.length === 0) return [{ text: content, mention: false, self: false }];

  const tokens = mentionIds
    .map((id) => ({ token: `@${userName(id)}`, self: id === selfId }))
    .sort((a, b) => b.token.length - a.token.length);

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
