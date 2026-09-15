import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * File storage abstraction. v1 writes to the local filesystem; the same
 * interface can later back onto S3 / R2 without touching the upload routes.
 * Only small images are expected — binaries never go into SQLite (see brief §61).
 */
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class LocalFileStorage {
  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Whether we accept this MIME type for upload. */
  isAllowedType(contentType: string): boolean {
    return contentType in EXT_BY_TYPE;
  }

  /** Persist bytes and return the public path (e.g. `/files/<uuid>.png`). */
  save(bytes: Buffer, contentType: string): { name: string; url: string } {
    const ext = EXT_BY_TYPE[contentType] ?? "bin";
    const name = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(this.dir, name), bytes);
    return { name, url: `/files/${name}` };
  }

  /** Resolve a stored file to an absolute path, or null if invalid/missing. */
  resolve(name: string): string | null {
    // Only a bare `uuid.ext` name is valid — blocks path traversal.
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) return null;
    const full = path.join(this.dir, name);
    return fs.existsSync(full) ? full : null;
  }

  /** MIME type for serving a stored file, inferred from its extension. */
  contentType(name: string): string {
    const ext = path.extname(name).slice(1).toLowerCase();
    const match = Object.entries(EXT_BY_TYPE).find(([, e]) => e === ext);
    return match ? match[0] : "application/octet-stream";
  }
}
