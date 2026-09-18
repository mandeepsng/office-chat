import http from "node:http";
import fs from "node:fs";
import { WebSocketServer } from "ws";
import type { WsEnvelope } from "@office-chat/shared";
import { ErrorCodes, ServerEvents } from "@office-chat/shared";
import type { AppContext } from "../context";
import { env } from "../config/env";
import { LocalFileStorage } from "../services/storage-service";
import { logger } from "../utils/logger";
import { Connection } from "./connection";
import { Hub } from "./hub";
import { announceOffline } from "./events/presence";
import { route } from "./router";

const JSON_HEADERS = { "content-type": "application/json" } as const;
// Permissive CORS: the Tauri webview is a distinct origin from the server, and
// this is a private office deployment (see brief §33/§34).
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-user-id",
} as const;

/**
 * Accept an image upload from a registered user and store it. The message that
 * references it travels over WebSocket as a normal `image` message whose content
 * is the returned URL — the binary never touches SQLite.
 */
function handleUpload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  app: AppContext,
  storage: LocalFileStorage,
): void {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string" || !app.repos.users.getById(userId)) {
    res.writeHead(401, { ...JSON_HEADERS, ...CORS_HEADERS });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const contentType = (req.headers["content-type"] ?? "").split(";")[0]!.trim();
  if (!storage.isAllowedType(contentType)) {
    res.writeHead(415, { ...JSON_HEADERS, ...CORS_HEADERS });
    res.end(JSON.stringify({ error: "unsupported_type" }));
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > env.maxUploadBytes) {
      aborted = true;
      res.writeHead(413, { ...JSON_HEADERS, ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "too_large" }));
      req.destroy();
    } else {
      chunks.push(chunk);
    }
  });
  req.on("end", () => {
    if (aborted) return;
    const { url } = storage.save(Buffer.concat(chunks), contentType);
    res.writeHead(200, { ...JSON_HEADERS, ...CORS_HEADERS });
    res.end(JSON.stringify({ url }));
    logger.info("Image uploaded", { userId, url, bytes: size });
  });
  req.on("error", () => {
    if (!aborted) {
      res.writeHead(500, { ...JSON_HEADERS, ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "upload_failed" }));
    }
  });
}

// Lightweight in-memory rate limit for /unfurl (per user, sliding window).
const UNFURL_WINDOW_MS = 60_000;
const UNFURL_MAX_PER_WINDOW = 40;
const unfurlHits = new Map<string, number[]>();

function unfurlRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (unfurlHits.get(userId) ?? []).filter((t) => now - t < UNFURL_WINDOW_MS);
  if (recent.length >= UNFURL_MAX_PER_WINDOW) {
    unfurlHits.set(userId, recent);
    return true;
  }
  recent.push(now);
  unfurlHits.set(userId, recent);
  return false;
}

/**
 * Return an Open-Graph-style preview for a URL so the client can render a card.
 * Server-side so the office network isn't exposed via arbitrary client fetches;
 * see LinkPreviewService for SSRF guards, caching and size/time limits.
 */
async function handleUnfurl(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  app: AppContext,
): Promise<void> {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string" || !app.repos.users.getById(userId)) {
    res.writeHead(401, { ...JSON_HEADERS, ...CORS_HEADERS });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  if (unfurlRateLimited(userId)) {
    res.writeHead(429, { ...JSON_HEADERS, ...CORS_HEADERS });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const target = new URL(req.url ?? "", "http://localhost").searchParams.get("url") ?? "";
  const preview = await app.linkPreviewService.getPreview(target);
  res.writeHead(200, { ...JSON_HEADERS, ...CORS_HEADERS });
  res.end(JSON.stringify(preview ? { ok: true, preview } : { ok: false }));
}

export interface OfficeChatServer {
  http: http.Server;
  wss: WebSocketServer;
  hub: Hub;
}

export function createServer(app: AppContext, officeCode: string): OfficeChatServer {
  const storage = new LocalFileStorage(env.filesPath);

  const httpServer = http.createServer((req, res) => {
    const url = req.url ?? "";

    // CORS preflight for the upload POST (triggered by the x-user-id header).
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { ...JSON_HEADERS, ...CORS_HEADERS });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "POST" && url === "/upload") {
      handleUpload(req, res, app, storage);
      return;
    }

    if (req.method === "GET" && url.startsWith("/unfurl")) {
      void handleUnfurl(req, res, app);
      return;
    }

    if (req.method === "GET" && url.startsWith("/files/")) {
      const name = decodeURIComponent(url.slice("/files/".length));
      const file = storage.resolve(name);
      if (!file) {
        res.writeHead(404, { ...JSON_HEADERS, ...CORS_HEADERS });
        res.end(JSON.stringify({ status: "not_found" }));
        return;
      }
      res.writeHead(200, {
        "content-type": storage.contentType(name),
        "cache-control": "public, max-age=31536000, immutable",
        ...CORS_HEADERS,
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    res.writeHead(404, { ...JSON_HEADERS, ...CORS_HEADERS });
    res.end(JSON.stringify({ status: "not_found" }));
  });

  const hub = new Hub(app.repos);
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    const conn = new Connection(ws);
    hub.add(conn);

    ws.on("message", (raw) => {
      let envelope: WsEnvelope;
      try {
        envelope = JSON.parse(raw.toString());
      } catch {
        conn.send(ServerEvents.Error, {
          code: ErrorCodes.InvalidJson,
          message: "Invalid JSON",
        });
        return;
      }
      if (!envelope || typeof envelope.type !== "string") {
        conn.send(ServerEvents.Error, {
          code: ErrorCodes.InvalidPayload,
          message: "Missing event type",
        });
        return;
      }
      route({ app, hub, conn, officeCode }, envelope);
    });

    ws.on("close", () => {
      announceOffline({ app, hub, conn });
      logger.debug("Connection closed", { connection: conn.id, userId: conn.userId });
    });

    ws.on("error", (err) => {
      logger.warn("Socket error", { connection: conn.id, error: err.message });
    });
  });

  return { http: httpServer, wss, hub };
}
