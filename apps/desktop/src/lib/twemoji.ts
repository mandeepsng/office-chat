import twemoji from "@twemoji/api";

// Render emoji as Twitter's crisp SVGs (identical on Windows/macOS/Linux)
// instead of relying on the OS font. Assets come from the jsDelivr CDN.
const OPTIONS = { folder: "svg", ext: ".svg" } as const;

/** Escape HTML so untrusted text is safe to inject via {@html}. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace emoji in an ALREADY-ESCAPED/safe HTML string with Twemoji <img>s.
 * Use this when the surrounding markup was produced by trusted code.
 */
export function twemojify(safeHtml: string): string {
  return twemoji.parse(safeHtml, OPTIONS);
}

/**
 * Turn a plain string into HTML where every emoji is a Twemoji <img>.
 * The text is escaped first, so the result is safe for {@html}.
 */
export function emojiHtml(text: string): string {
  return twemoji.parse(escapeHtml(text), OPTIONS);
}
