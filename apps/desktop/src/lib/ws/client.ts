import { RECONNECT } from "@office-chat/shared";
import type { ConnectionStatus, WsEnvelope } from "@office-chat/shared";

type Listener = (payload: unknown) => void;

/**
 * WebSocket client with exponential-backoff reconnection and an offline send
 * queue. Frames sent before the connection is authenticated are buffered and
 * flushed once `markReady()` is called by the controller on auth success.
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private ready = false;
  private manualClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authFrame: WsEnvelope | null = null;
  private readonly queue: WsEnvelope[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly url: string) {}

  onStatus: (status: ConnectionStatus) => void = () => {};

  on(type: string, listener: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  /** Open the socket and (re)authenticate with the given frame on every connect. */
  connect(authFrame: WsEnvelope): void {
    this.authFrame = authFrame;
    this.manualClose = false;
    this.open();
  }

  private open(): void {
    this.clearReconnect();
    this.onStatus("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.authFrame) ws.send(JSON.stringify(this.authFrame));
    };

    ws.onmessage = (event) => {
      let envelope: WsEnvelope;
      try {
        envelope = JSON.parse(event.data as string);
      } catch {
        return;
      }
      this.emit(envelope.type, envelope.payload);
    };

    ws.onclose = () => {
      this.ready = false;
      if (this.manualClose) {
        this.onStatus("offline");
        return;
      }
      this.onStatus("offline");
      this.scheduleReconnect();
    };

    ws.onerror = () => ws.close();
  }

  /** Called by the controller once auth:success arrives: flush the queue. */
  markReady(): void {
    this.ready = true;
    this.attempt = 0;
    this.onStatus("connected");
    for (const frame of this.queue.splice(0)) this.rawSend(frame);
  }

  /** Send now if ready, otherwise queue for delivery after reconnect. */
  send(type: string, payload: unknown): void {
    const frame: WsEnvelope = { type, payload };
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.rawSend(frame);
    } else {
      this.queue.push(frame);
    }
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearReconnect();
    this.ws?.close();
  }

  private rawSend(frame: WsEnvelope): void {
    this.ws?.send(JSON.stringify(frame));
  }

  private emit(type: string, payload: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT.BASE_DELAY_MS * 2 ** this.attempt,
      RECONNECT.MAX_DELAY_MS,
    );
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
