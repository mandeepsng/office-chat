import http from "node:http";
import { WebSocketServer } from "ws";
import type { WsEnvelope } from "@office-chat/shared";
import { ErrorCodes, ServerEvents } from "@office-chat/shared";
import type { AppContext } from "../context";
import { logger } from "../utils/logger";
import { Connection } from "./connection";
import { Hub } from "./hub";
import { announceOffline } from "./events/presence";
import { route } from "./router";

export interface OfficeChatServer {
  http: http.Server;
  wss: WebSocketServer;
  hub: Hub;
}

export function createServer(app: AppContext, officeCode: string): OfficeChatServer {
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
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
