import type { Database as DB } from "better-sqlite3";
import type { LinkPreview } from "@office-chat/shared";

export interface CachedPreview {
  ok: boolean;
  preview: LinkPreview | null;
  fetchedAt: string;
}

interface Row {
  url: string;
  ok: number;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  fetched_at: string;
}

/** Durable cache for URL unfurls so we fetch each link at most once per TTL. */
export class LinkPreviewsRepository {
  constructor(private readonly db: DB) {}

  get(url: string): CachedPreview | null {
    const row = this.db
      .prepare(`SELECT * FROM link_previews WHERE url = ?`)
      .get(url) as Row | undefined;
    if (!row) return null;
    return {
      ok: row.ok === 1,
      fetchedAt: row.fetched_at,
      preview:
        row.ok === 1
          ? {
              url: row.url,
              title: row.title ?? undefined,
              description: row.description ?? undefined,
              image: row.image ?? undefined,
              siteName: row.site_name ?? undefined,
            }
          : null,
    };
  }

  /** Insert or replace a cache entry (positive or negative). */
  put(url: string, preview: LinkPreview | null, now: string): void {
    this.db
      .prepare(
        `INSERT INTO link_previews (url, ok, title, description, image, site_name, fetched_at)
         VALUES (@url, @ok, @title, @description, @image, @site_name, @fetched_at)
         ON CONFLICT(url) DO UPDATE SET
           ok = excluded.ok, title = excluded.title, description = excluded.description,
           image = excluded.image, site_name = excluded.site_name, fetched_at = excluded.fetched_at`,
      )
      .run({
        url,
        ok: preview ? 1 : 0,
        title: preview?.title ?? null,
        description: preview?.description ?? null,
        image: preview?.image ?? null,
        site_name: preview?.siteName ?? null,
        fetched_at: now,
      });
  }
}
