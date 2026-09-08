import { config } from "./config";

export interface Gif {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyItem {
  id: string;
  images: {
    fixed_height: GiphyImage;
    fixed_height_small: GiphyImage;
  };
}

const BASE = "https://api.giphy.com/v1/gifs";

async function fetchGifs(endpoint: string, params: Record<string, string>): Promise<Gif[]> {
  if (!config.giphyApiKey) return [];
  const query = new URLSearchParams({ api_key: config.giphyApiKey, ...params });
  const res = await fetch(`${BASE}/${endpoint}?${query}`);
  if (!res.ok) throw new Error(`GIPHY request failed: ${res.status}`);
  const body = (await res.json()) as { data: GiphyItem[] };
  return body.data.map((item) => ({
    id: item.id,
    url: item.images.fixed_height.url,
    previewUrl: item.images.fixed_height_small.url,
    width: Number(item.images.fixed_height.width),
    height: Number(item.images.fixed_height.height),
  }));
}

export const giphyEnabled = (): boolean => config.giphyApiKey.length > 0;

export const trendingGifs = (limit = 24): Promise<Gif[]> =>
  fetchGifs("trending", { limit: String(limit), rating: "g" });

export const searchGifs = (query: string, limit = 24): Promise<Gif[]> =>
  query.trim()
    ? fetchGifs("search", { q: query.trim(), limit: String(limit), rating: "g" })
    : trendingGifs(limit);
