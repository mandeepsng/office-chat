import {
  ClientEvents,
  ServerEvents,
  TYPING,
  type Device,
  type Message,
  type MessageType,
  type Room,
  type User,
} from "@office-chat/shared";
import { config, detectPlatform } from "./config";
import { store } from "./storage";
import { notifications } from "./notifications";
import { WsClient } from "./ws/client";
import type { ChatMessage, Identity } from "./types";
import { connection } from "./stores/connection.svelte";
import { auth } from "./stores/auth.svelte";
import { rooms, upsertRoom } from "./stores/rooms.svelte";
import { directory, setOnline, setUsers, userName } from "./stores/directory.svelte";
import {
  addMessage,
  confirmMessage,
  markReadUpTo,
  markRoomFailed,
  prependHistory,
  roomMessages,
  seedRoom,
  updateMessage,
} from "./stores/messages.svelte";
import { applyTheme } from "./stores/theme.svelte";

interface AuthSuccessPayload {
  user: User;
  device: Device | null;
  rooms: Room[];
  users: User[];
  onlineUserIds: string[];
}

class Controller {
  private readonly client = new WsClient(config.wsUrl);
  private readonly loadedRooms = new Set<string>();
  private typingActive = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private windowFocused = true;

  /** Called once on app mount. */
  init(): void {
    applyTheme();
    this.trackFocus();
    this.wireEvents();

    const identity = store.getIdentity();
    if (identity) {
      auth.identity = identity;
      auth.phase = "connecting";
      this.client.connect({
        type: ClientEvents.AuthConnect,
        payload: { userId: identity.userId, deviceId: identity.deviceId },
      });
    }
  }

  /** First-time join with name + office code. */
  register(name: string, officeCode: string): void {
    const identity: Identity = {
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      name: name.trim(),
      avatar: null,
    };
    auth.identity = identity;
    auth.authError = null;
    auth.phase = "connecting";
    store.saveIdentity(identity);

    this.client.connect({
      type: ClientEvents.AuthRegister,
      payload: {
        officeCode: officeCode.trim(),
        userId: identity.userId,
        deviceId: identity.deviceId,
        name: identity.name,
        deviceName: `${identity.name}'s Desktop`,
        platform: detectPlatform(),
      },
    });
  }

  resetIdentity(): void {
    this.client.disconnect();
    store.clearIdentity();
    location.reload();
  }

  // --- Actions -------------------------------------------------------------

  openRoom(roomId: string): void {
    rooms.activeRoomId = roomId;
    // Show cached messages instantly, then sync from the server.
    if (!this.loadedRooms.has(roomId)) {
      seedRoom(roomId, store.getCachedMessages(roomId));
      this.client.send(ClientEvents.RoomHistory, { roomId });
    }
    this.markReadLatest(roomId);
  }

  loadOlder(roomId: string): void {
    const list = roomMessages(roomId);
    const oldest = list[0];
    this.client.send(ClientEvents.RoomHistory, {
      roomId,
      ...(oldest ? { before: oldest.id } : {}),
    });
  }

  sendMessage(content: string, messageType: MessageType = "text"): void {
    const roomId = rooms.activeRoomId;
    const identity = auth.identity;
    if (!roomId || !identity || !content.trim()) return;

    const clientMessageId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: clientMessageId,
      roomId,
      senderId: identity.userId,
      content: content.trim(),
      messageType,
      replyToId: null,
      clientMessageId,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
      status: "pending",
    };
    addMessage(optimistic, "pending");
    this.client.send(ClientEvents.MessageSend, {
      roomId,
      clientMessageId,
      content: optimistic.content,
      messageType,
    });
    this.stopTyping();
  }

  sendGif(url: string): void {
    this.sendMessage(url, "gif");
  }

  createDirect(userId: string): void {
    this.client.send(ClientEvents.RoomCreate, { type: "direct", memberIds: [userId] });
  }

  createGroup(name: string, memberIds: string[]): void {
    this.client.send(ClientEvents.RoomCreate, { type: "group", name, memberIds });
  }

  /** Debounced typing indicator; safe to call on every keystroke. */
  handleTyping(): void {
    const roomId = rooms.activeRoomId;
    if (!roomId) return;
    if (!this.typingActive) {
      this.client.send(ClientEvents.TypingStart, { roomId });
      this.typingActive = true;
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), TYPING.DEBOUNCE_MS);
  }

  private stopTyping(): void {
    const roomId = rooms.activeRoomId;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = null;
    if (this.typingActive && roomId) {
      this.client.send(ClientEvents.TypingStop, { roomId });
    }
    this.typingActive = false;
  }

  private markReadLatest(roomId: string): void {
    const list = roomMessages(roomId);
    const last = list[list.length - 1];
    if (last) this.client.send(ClientEvents.MessageRead, { roomId, messageId: last.id });
  }

  // --- Wiring --------------------------------------------------------------

  private wireEvents(): void {
    this.client.onStatus = (status) => {
      connection.status = status;
      if (status === "offline") this.typingActive = false;
    };

    this.client.on(ServerEvents.AuthSuccess, (p) => this.onAuthSuccess(p as AuthSuccessPayload));

    this.client.on(ServerEvents.AuthError, (p) => {
      const { code, message } = p as { code: string; message: string };
      auth.authError = message;
      auth.phase = "join";
      // A stale identity should send the user back to the join screen.
      if (code === "USER_NOT_FOUND") {
        store.clearIdentity();
        auth.identity = null;
      }
      this.client.disconnect();
    });

    this.client.on(ServerEvents.RoomList, (p) => {
      rooms.list = (p as { rooms: Room[] }).rooms;
    });

    this.client.on(ServerEvents.RoomCreated, (p) => {
      const room = (p as { room: Room }).room;
      upsertRoom(room);
      // Auto-open a room this user just started.
      if (room.createdBy === auth.identity?.userId) this.openRoom(room.id);
    });

    this.client.on(ServerEvents.RoomUpdated, (p) => upsertRoom((p as { room: Room }).room));

    this.client.on(ServerEvents.RoomHistory, (p) => {
      const { roomId, messages: older, hasMore } = p as {
        roomId: string;
        messages: Message[];
        hasMore: boolean;
      };
      prependHistory(roomId, older, hasMore);
      this.loadedRooms.add(roomId);
      store.cacheMessages(roomId, roomMessages(roomId));
    });

    this.client.on(ServerEvents.MessageSent, (p) => {
      const { clientMessageId, message } = p as { clientMessageId: string; message: Message };
      confirmMessage(clientMessageId, message);
      store.cacheMessages(message.roomId, roomMessages(message.roomId));
    });

    this.client.on(ServerEvents.MessageNew, (p) => this.onMessageNew((p as { message: Message }).message));

    this.client.on(ServerEvents.MessageUpdated, (p) =>
      updateMessage((p as { message: Message }).message),
    );

    this.client.on(ServerEvents.MessageDeleted, (p) => {
      const { messageId, roomId } = p as { messageId: string; roomId: string };
      const msg = roomMessages(roomId).find((m) => m.id === messageId);
      if (msg) {
        msg.deletedAt = new Date().toISOString();
        msg.content = "";
      }
    });

    this.client.on(ServerEvents.MessageRead, (p) => {
      const { roomId, messageId } = p as { roomId: string; messageId: string };
      if (auth.identity) markReadUpTo(roomId, messageId, auth.identity.userId);
    });

    this.client.on(ServerEvents.PresenceOnline, (p) =>
      setOnline((p as { userId: string }).userId, true),
    );
    this.client.on(ServerEvents.PresenceOffline, (p) => {
      const { userId, lastSeenAt } = p as { userId: string; lastSeenAt: string };
      setOnline(userId, false);
      const user = directory.users[userId];
      if (user) user.lastSeenAt = lastSeenAt;
    });

    this.client.on(ServerEvents.TypingStart, (p) => this.setTyping(p, true));
    this.client.on(ServerEvents.TypingStop, (p) => this.setTyping(p, false));

    this.client.on(ServerEvents.Error, (p) => {
      const { code } = p as { code: string };
      // A rejected send leaves optimistic messages stuck; flag them.
      if (code === "RATE_LIMITED" && rooms.activeRoomId) markRoomFailed(rooms.activeRoomId);
    });
  }

  private onAuthSuccess(payload: AuthSuccessPayload): void {
    auth.user = payload.user;
    auth.authError = null;
    auth.phase = "ready";
    rooms.list = payload.rooms;
    setUsers(payload.users);
    directory.onlineUserIds = payload.onlineUserIds;

    this.client.markReady(); // flush any queued (offline) frames

    if (!rooms.activeRoomId) {
      const general = payload.rooms.find((r) => r.name === "Office General") ?? payload.rooms[0];
      if (general) this.openRoom(general.id);
    }
  }

  private onMessageNew(message: Message): void {
    addMessage(message, "delivered");
    store.cacheMessages(message.roomId, roomMessages(message.roomId));

    const isActive = rooms.activeRoomId === message.roomId;
    if (isActive && this.windowFocused) {
      this.markReadLatest(message.roomId);
    } else {
      // Suppress notifications only for the focused, currently-open room.
      void notifications.notify({
        title: userName(message.senderId),
        body: message.messageType === "gif" ? "Sent a GIF" : message.content,
      });
    }
  }

  private setTyping(payload: unknown, typing: boolean): void {
    const { roomId, userId } = payload as { roomId: string; userId: string };
    if (userId === auth.identity?.userId) return;
    const current = directory.typingByRoom[roomId] ?? [];
    directory.typingByRoom[roomId] = typing
      ? [...new Set([...current, userId])]
      : current.filter((id) => id !== userId);
  }

  private trackFocus(): void {
    this.windowFocused = document.hasFocus();
    window.addEventListener("focus", () => {
      this.windowFocused = true;
      if (rooms.activeRoomId) this.markReadLatest(rooms.activeRoomId);
    });
    window.addEventListener("blur", () => (this.windowFocused = false));
  }
}

export const controller = new Controller();
