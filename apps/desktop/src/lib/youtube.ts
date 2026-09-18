import { config } from "./config";

export interface Video {
  id: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  /** Canonical watch URL — this is what we store as the message content. */
  url: string;
}

interface YtSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { medium?: { url: string }; default?: { url: string } };
  };
}

const SEARCH = "https://www.googleapis.com/youtube/v3/search";

export const youtubeEnabled = (): boolean => config.youtubeApiKey.length > 0;

/** Watch URL for a video id. */
export const watchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;

/** Privacy-friendly, no-cookie embed URL used inside the chat bubble. */
export const embedUrl = (id: string): string => `https://www.youtube-nocookie.com/embed/${id}`;

/**
 * Extract a video id from any common YouTube URL form
 * (watch?v=, youtu.be/, /embed/, /shorts/). Returns null if it isn't one.
 */
export function youtubeIdFromUrl(text: string): string | null {
  const t = text.trim();
  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([\w-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Video id from a stored `youtube` message's content (a watch URL). */
export const videoIdFromContent = (content: string): string | null =>
  youtubeIdFromUrl(content);

export async function searchVideos(query: string, limit = 15): Promise<Video[]> {
  if (!youtubeEnabled() || !query.trim()) return [];
  const params = new URLSearchParams({
    key: config.youtubeApiKey,
    q: query.trim(),
    part: "snippet",
    type: "video",
    maxResults: String(limit),
    safeSearch: "moderate",
  });
  const res = await fetch(`${SEARCH}?${params}`);
  if (!res.ok) throw new Error(`YouTube request failed: ${res.status}`);
  const body = (await res.json()) as { items: YtSearchItem[] };
  return body.items
    .filter((item) => item.id.videoId)
    .map((item) => {
      const id = item.id.videoId as string;
      const thumb = item.snippet.thumbnails.medium ?? item.snippet.thumbnails.default;
      return {
        id,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnailUrl: thumb?.url ?? "",
        url: watchUrl(id),
      };
    });
}
