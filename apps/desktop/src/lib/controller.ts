import {
  ClientEvents,
  ServerEvents,
  TYPING,
  type Device,
  type Message,
  type MessageType,
  type PinnedMessage,
  type Reaction,
  type ReadReceipt,
  type Room,
  type User,
} from "@office-chat/shared";
import { config, detectPlatform } from "./config";
import { store } from "./storage";
import { notifications, onNotificationClick } from "./notifications";
import { playIncoming, playSend } from "./sounds";
import { setUnreadBadge, flashWindow, onToggleDnd } from "./badge";
import { unread, bumpUnread, clearUnread } from "./stores/unread.svelte";
import { settings, toggleDnd } from "./stores/settings.svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WsClient } from "./ws/client";
import { CallManager } from "./call";
import type { ChatMessage, Identity } from "./types";
import { connection } from "./stores/connection.svelte";
import { auth } from "./stores/auth.svelte";
import { rooms, upsertRoom } from "./stores/rooms.svelte";
import { directory, setOnline, setUsers, userName } from "./stores/directory.svelte";
import { setReader, setRoomReads } from "./stores/receipts.svelte";
import { reactions, setReactions, seedReactions } from "./stores/reactions.svelte";
import { setPins } from "./stores/pins.svelte";
import { startSearch, setSearchResults } from "./stores/search.svelte";
import {
  addMessage,
  confirmMessage,
  findMessage,
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
  private readonly calls = new CallManager(this.client);
  private readonly loadedRooms = new Set<string>();
  private typingActive = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private windowFocused = true;

  /** Called once on app mount. */
  init(): void {
    applyTheme();
    this.trackFocus();
    // Clicking a message notification brings the app forward and opens its room.
    void onNotificationClick((roomId) => this.focusRoom(roomId));
    // The tray's "Do Not Disturb" entry toggles the same setting as the UI.
    void onToggleDnd(() => toggleDnd());
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

  /** Bring the window forward (it may be hidden in the tray) and open a room. */
  private async focusRoom(roomId: string): Promise<void> {
    try {
      const win = getCurrentWindow();
      await win.unminimize();
      await win.show();
      await win.setFocus();
    } catch {
      // Not running under Tauri (dev) — navigation still works below.
    }
    if (rooms.list.some((r) => r.id === roomId)) this.openRoom(roomId);
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
    clearUnread(roomId);
    this.syncBadge();
  }

  /** Mirror the total unread count onto the OS tray/taskbar. */
  private syncBadge(): void {
    void setUnreadBadge(unread.total);
  }

  loadOlder(roomId: string): void {
    const list = roomMessages(roomId);
    const oldest = list[0];
    this.client.send(ClientEvents.RoomHistory, {
      roomId,
      ...(oldest ? { before: oldest.id } : {}),
    });
  }

  sendMessage(
    content: string,
    messageType: MessageType = "text",
    mentions: string[] = [],
    replyToId: string | null = null,
  ): void {
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
      replyToId,
      mentions,
      clientMessageId,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
      status: "pending",
    };
    addMessage(optimistic, "pending");
    if (!settings.dnd && settings.soundsEnabled) playSend();
    this.client.send(ClientEvents.MessageSend, {
      roomId,
      clientMessageId,
      content: optimistic.content,
      messageType,
      mentions,
      ...(replyToId ? { replyToId } : {}),
    });
    this.stopTyping();
  }

  sendGif(url: string): void {
    this.sendMessage(url, "gif");
  }

  sendImage(url: string): void {
    this.sendMessage(url, "image");
  }

  sendYoutube(url: string): void {
    this.sendMessage(url, "youtube");
  }

  sendVoice(url: string): void {
    this.sendMessage(url, "voice");
  }

  /** Edit one of your own text messages; the server broadcasts message:updated. */
  editMessage(messageId: string, content: string): void {
    if (!content.trim()) return;
    this.client.send(ClientEvents.MessageEdit, { messageId, content: content.trim() });
  }

  /** Delete one of your own messages; the server broadcasts message:deleted. */
  deleteMessage(messageId: string): void {
    this.client.send(ClientEvents.MessageDelete, { messageId });
  }

  /** Add/remove an emoji (or GIF url) reaction on any message in the current room. */
  toggleReaction(messageId: string, emoji: string): void {
    this.client.send(ClientEvents.ReactionToggle, { messageId, emoji });
  }

  /** Pin/unpin a message; the server broadcasts the room's full pin list back. */
  togglePin(messageId: string): void {
    this.client.send(ClientEvents.MessagePinToggle, { messageId });
  }

  /** Search message content, scoped server-side to the caller's rooms (or one room). */
  searchMessages(query: string, roomId?: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;
    startSearch(trimmed);
    this.client.send(ClientEvents.MessageSearch, { query: trimmed, ...(roomId ? { roomId } : {}) });
  }

  createDirect(userId: string): void {
    this.client.send(ClientEvents.RoomCreate, { type: "direct", memberIds: [userId] });
  }

  startCall(userId: string): void {
    this.calls.startCall(userId);
  }

  acceptCall(): void {
    void this.calls.accept();
  }

  rejectCall(): void {
    this.calls.reject();
  }

  hangupCall(): void {
    this.calls.hangup();
  }

  toggleCallMute(): void {
    this.calls.toggleMute();
  }

  toggleCallScreenShare(): void {
    void this.calls.toggleScreenShare();
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
      const { roomId, messages: older, hasMore, reads, reactions: reax, pins: roomPins } = p as {
        roomId: string;
        messages: Message[];
        hasMore: boolean;
        reads?: ReadReceipt[];
        reactions?: Reaction[];
        pins?: PinnedMessage[];
      };
      prependHistory(roomId, older, hasMore);
      if (reads) setRoomReads(roomId, reads);
      if (reax) seedReactions(reax);
      if (roomPins) setPins(roomId, roomPins);
      this.loadedRooms.add(roomId);
      store.cacheMessages(roomId, roomMessages(roomId));
    });

    this.client.on(ServerEvents.ReactionUpdated, (p) => {
      const { messageId, roomId, reactions: list } = p as {
        messageId: string;
        roomId: string;
        reactions: Reaction[];
      };
      const previous = reactions.byMessage[messageId] ?? [];
      setReactions(messageId, list);
      this.notifyNewReactions(roomId, messageId, previous, list);
    });

    this.client.on(ServerEvents.RoomPinsUpdated, (p) => {
      const { roomId, pins: roomPins } = p as { roomId: string; pins: PinnedMessage[] };
      setPins(roomId, roomPins);
    });

    this.client.on(ServerEvents.MessageSearchResults, (p) => {
      const { query, messages: results } = p as { query: string; messages: Message[] };
      setSearchResults(query, results);
    });

    this.client.on(ServerEvents.MessageSent, (p) => {
      const { clientMessageId, message } = p as { clientMessageId: string; message: Message };
      confirmMessage(clientMessageId, message);
      store.cacheMessages(message.roomId, roomMessages(message.roomId));
    });

    this.client.on(ServerEvents.MessageNew, (p) => this.onMessageNew((p as { message: Message }).message));

    this.client.on(ServerEvents.MessageUpdated, (p) => {
      const message = (p as { message: Message }).message;
      updateMessage(message);
      // Keep the local cache in sync so an edit survives an app reload.
      store.cacheMessages(message.roomId, roomMessages(message.roomId));
    });

    this.client.on(ServerEvents.MessageDeleted, (p) => {
      const { messageId, roomId } = p as { messageId: string; roomId: string };
      const msg = roomMessages(roomId).find((m) => m.id === messageId);
      if (msg) {
        msg.deletedAt = new Date().toISOString();
        msg.content = "";
      }
      // Persist the deletion so the message doesn't reappear after a reload.
      store.cacheMessages(roomId, roomMessages(roomId));
    });

    this.client.on(ServerEvents.MessageRead, (p) => {
      const { roomId, messageId, userId, createdAt } = p as {
        roomId: string;
        messageId: string;
        userId: string;
        createdAt: string;
      };
      if (auth.identity) markReadUpTo(roomId, messageId, auth.identity.userId);
      setReader(roomId, userId, messageId, createdAt);
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
    // The server may have resolved us to an existing account (same name), whose
    // canonical id differs from the one we generated. Persist it so the next
    // auth:connect uses the id the server actually knows.
    if (auth.identity && auth.identity.userId !== payload.user.id) {
      auth.identity = { ...auth.identity, userId: payload.user.id, name: payload.user.name };
      store.saveIdentity(auth.identity);
    }

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
      // Chat is open and focused, so the toast is suppressed — play a quiet
      // in-app sound instead so the user still notices the message.
      if (!settings.dnd && settings.soundsEnabled) playIncoming();
      this.markReadLatest(message.roomId);
    } else {
      // Track it as unread regardless (the pill/badge is passive).
      bumpUnread(message.roomId);
      this.syncBadge();

      const mentionsMe = !!auth.identity && message.mentions.includes(auth.identity.userId);
      // Do Not Disturb silences everything. Otherwise a direct @mention is
      // important enough to notify even if generic notifications are muted.
      if (!settings.dnd && (settings.notificationsEnabled || mentionsMe)) {
        const sender = userName(message.senderId);
        const preview =
          message.messageType === "gif"
            ? "Sent a GIF"
            : message.messageType === "image"
              ? "Sent an image"
              : message.messageType === "youtube"
                ? "Shared a video ▶️"
                : message.messageType === "voice"
                  ? "Sent a voice message 🎤"
                  : message.content;
        void notifications.notify({
          title: mentionsMe ? `${sender} mentioned you 💬` : sender,
          body: preview,
          roomId: message.roomId,
          sound: settings.toastSound,
        });
        void flashWindow();
      }
    }
  }

  /** Notify the message's sender when someone else adds a new reaction to it. */
  private notifyNewReactions(
    roomId: string,
    messageId: string,
    previous: Reaction[],
    current: Reaction[],
  ): void {
    if (settings.dnd || !settings.notificationsEnabled || !auth.identity) return;
    const ownId = auth.identity.userId;
    const message = findMessage(roomId, messageId);
    if (!message || message.senderId !== ownId) return;

    const added = current.filter(
      (r) => r.userId !== ownId && !previous.some((p) => p.userId === r.userId && p.emoji === r.emoji),
    );
    const latest = added[added.length - 1];
    if (!latest) return;

    // A room that's open and focused already shows the reaction inline.
    if (rooms.activeRoomId === roomId && this.windowFocused) return;

    const isGif = latest.emoji.startsWith("http://") || latest.emoji.startsWith("https://");
    void notifications.notify({
      title: userName(latest.userId),
      body: isGif ? "Reacted with a GIF to your message" : `Reacted ${latest.emoji} to your message`,
      roomId,
      sound: settings.toastSound,
    });
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
      if (rooms.activeRoomId) {
        this.markReadLatest(rooms.activeRoomId);
        clearUnread(rooms.activeRoomId);
        this.syncBadge();
      }
    });
    window.addEventListener("blur", () => (this.windowFocused = false));
  }
}

export const controller = new Controller();
