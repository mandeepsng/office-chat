import dns from "node:dns/promises";
import net from "node:net";
import type { LinkPreview } from "@office-chat/shared";
import type { Repositories } from "../db";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const OK_TTL_MS = () => env.linkPreviewTtlDays * 24 * 60 * 60 * 1000;
// Failed lookups are retried sooner than successful ones.
const FAIL_TTL_MS = 24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024; // only need the <head>
const USER_AGENT = "OfficeChatBot/1.0 (+link-preview)";

/** Reject private/loopback/link-local IPs to avoid SSRF into the local network. */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v = ip.toLowerCase();
  return (
    v === "::1" ||
    v === "::" ||
    v.startsWith("fe80") || // link-local
    v.startsWith("fc") ||
    v.startsWith("fd") || // unique local
    v.startsWith("::ffff:127.") ||
    v.startsWith("::ffff:10.") ||
    v.startsWith("::ffff:192.168.")
  );
}

/** Validate the URL is a public http(s) target (parse + DNS + IP check). */
export async function assertSafeUrl(raw: string): Promise<URL> {
  const url = new URL(raw); // throws on garbage
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("unsupported protocol");
  }
  const host = url.hostname;
  if (host === "localhost") throw new Error("blocked host");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("blocked ip");
    return url;
  }
  // Resolve the hostname and ensure no address points at a private range.
  const addrs = await dns.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("blocked host");
  }
  return url;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));
}

/** Read a `<meta property|name="key" content="...">` value (order-insensitive). */
function metaContent(html: string, key: string): string | undefined {
  const attr = `(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`;
  const re = new RegExp(
    `<meta[^>]*${attr}[^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*${attr}`,
    "i",
  );
  const m = html.match(re);
  const value = m?.[1] ?? m?.[2];
  return value ? decodeEntities(value.trim()) : undefined;
}

export function parseHtml(html: string, base: URL): LinkPreview {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    (titleTag ? decodeEntities(titleTag.trim()) : undefined);
  const description =
    metaContent(html, "og:description") ??
    metaContent(html, "twitter:description") ??
    metaContent(html, "description");
  const rawImage =
    metaContent(html, "og:image") ??
    metaContent(html, "og:image:url") ??
    metaContent(html, "twitter:image");
  const siteName = metaContent(html, "og:site_name");

  let image: string | undefined;
  if (rawImage) {
    try {
      image = new URL(rawImage, base).toString();
    } catch {
      image = undefined;
    }
  }
  return { url: base.toString(), title, description, image, siteName };
}

/** Fetch and parse the <head> of a page. Returns null on any failure. */
async function fetchPreview(url: URL): Promise<LinkPreview | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok || !res.body) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) return null;

    // Read at most MAX_BYTES so a huge page can't exhaust memory.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    void reader.cancel();
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");

    const preview = parseHtml(html, new URL(res.url || url.toString()));
    // A preview with no title and no image isn't worth showing.
    if (!preview.title && !preview.image) return null;
    return preview;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export class LinkPreviewService {
  constructor(private readonly repos: Repositories) {}

  /**
   * Return a cached preview if fresh, otherwise fetch (SSRF-guarded), cache the
   * result (positive or negative), and return it.
   */
  async getPreview(rawUrl: string): Promise<LinkPreview | null> {
    if (!env.linkPreviewsEnabled) return null;

    let safeUrl: URL;
    try {
      safeUrl = await assertSafeUrl(rawUrl);
    } catch {
      return null; // don't cache invalid/unsafe URLs
    }
    const key = safeUrl.toString();

    const cached = this.repos.linkPreviews.get(key);
    if (cached) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      const ttl = cached.ok ? OK_TTL_MS() : FAIL_TTL_MS;
      if (age < ttl) return cached.preview;
    }

    const preview = await fetchPreview(safeUrl);
    this.repos.linkPreviews.put(key, preview, new Date().toISOString());
    if (!preview) logger.debug("Link preview miss", { url: key });
    return preview;
  }
}
