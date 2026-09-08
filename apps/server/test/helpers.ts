import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/db/database";
import { createContext, type AppContext } from "../src/context";
import { Hub } from "../src/websocket/hub";
import { Connection } from "../src/websocket/connection";
import { route } from "../src/websocket/router";
import { ClientEvents } from "@office-chat/shared";

export const OFFICE_CODE = "TEST123";

/** A stand-in for a ws socket that records outgoing frames. */
class FakeSocket {
  readonly OPEN = 1;
  readyState = 1;
  readonly sent: { type: string; payload: any }[] = [];
  send(raw: string): void {
    this.sent.push(JSON.parse(raw));
  }
}

export interface TestConn {
  conn: Connection;
  socket: FakeSocket;
  /** Route a raw frame through the full router. */
  send(type: string, payload?: unknown): void;
  /** Last frame of a given type, or undefined. */
  last(type: string): any;
  /** All frames of a given type. */
  all(type: string): any[];
}

export function makeHarness() {
  const db = createDatabase(":memory:");
  const app: AppContext = createContext(db);
  const hub = new Hub(app.repos);

  function makeConn(): TestConn {
    const socket = new FakeSocket();
    const conn = new Connection(socket as unknown as import("ws").WebSocket);
    hub.add(conn);
    const api: TestConn = {
      conn,
      socket,
      send: (type, payload = {}) => route({ app, hub, conn, officeCode: OFFICE_CODE }, { type, payload }),
      last: (type) => [...socket.sent].reverse().find((f) => f.type === type),
      all: (type) => socket.sent.filter((f) => f.type === type),
    };
    return api;
  }

  /** Register + authenticate a fresh user, returning its ids and connection. */
  function authUser(name: string) {
    const userId = randomUUID();
    const deviceId = randomUUID();
    const tc = makeConn();
    tc.send(ClientEvents.AuthRegister, {
      officeCode: OFFICE_CODE,
      userId,
      deviceId,
      name,
      platform: "linux",
    });
    return { userId, deviceId, ...tc };
  }

  return { app, hub, makeConn, authUser };
}
