<script lang="ts">
  import { tick } from "svelte";
  import { auth } from "../lib/stores/auth.svelte";
  import { rooms } from "../lib/stores/rooms.svelte";
  import { connection } from "../lib/stores/connection.svelte";
  import { directory, userName } from "../lib/stores/directory.svelte";
  import { receipts } from "../lib/stores/receipts.svelte";
  import { messages, roomMessages } from "../lib/stores/messages.svelte";
  import type { PinnedMessage, User } from "@office-chat/shared";
  import { controller } from "../lib/controller";
  import { roomSubtitle, roomTitle, directPeerId, directPeerOnline } from "../lib/roomDisplay";
  import { pinsForRoom } from "../lib/stores/pins.svelte";
  import MessageBubble from "./MessageBubble.svelte";
  import Composer from "./Composer.svelte";
  import Icon from "./Icon.svelte";

  const ownId = $derived(auth.identity?.userId ?? "");
  const room = $derived(rooms.list.find((r) => r.id === rooms.activeRoomId));
  const list = $derived(rooms.activeRoomId ? roomMessages(rooms.activeRoomId) : []);
  const hasMore = $derived(
    rooms.activeRoomId ? (messages.hasMore[rooms.activeRoomId] ?? false) : false,
  );

  const typingNames = $derived(
    (directory.typingByRoom[rooms.activeRoomId ?? ""] ?? []).map(userName),
  );

  const online = $derived(!!room && room.type === "direct" && directPeerOnline(room, ownId));

  // In group rooms, place each reader's avatar on the newest of MY messages they
  // have read (WhatsApp-style "seen by"). messageId -> readers.
  const seenBy = $derived.by(() => {
    const map: Record<string, User[]> = {};
    if (!room || room.type !== "group") return map;
    const reads = receipts.readsByRoom[room.id] ?? {};
    const ownMessages = list.filter((m) => m.senderId === ownId);
    for (const [userId, pointer] of Object.entries(reads)) {
      if (userId === ownId) continue;
      const user = directory.users[userId];
      if (!user) continue;
      let target: (typeof ownMessages)[number] | undefined;
      for (const m of ownMessages) {
        if (m.createdAt <= pointer.createdAt) target = m;
        else break;
      }
      if (target) (map[target.id] ??= []).push(user);
    }
    return map;
  });

  const roomPins = $derived(room ? pinsForRoom(room.id) : []);
  const firstPin = $derived<PinnedMessage | undefined>(roomPins[0]);
  let pinsOpen = $state(false);

  function pinnedSnippet(p: PinnedMessage): string {
    if (p.messageType === "gif") return "GIF";
    if (p.messageType === "image") return "Image";
    if (p.messageType === "youtube") return "▶️ Video";
    if (p.messageType === "voice") return "🎤 Voice message";
    return p.content;
  }

  function jumpToPin(messageId: string) {
    pinsOpen = false;
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1200);
    }
  }

  let scroller = $state<HTMLDivElement>();
  let atBottom = true;

  function onScroll() {
    if (!scroller) return;
    const { scrollTop, scrollHeight, clientHeight } = scroller;
    atBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (scrollTop < 40 && hasMore && room) controller.loadOlder(room.id);
  }

  // Keep pinned to the newest message when appropriate.
  $effect(() => {
    void list.length;
    if (atBottom) {
      tick().then(() => {
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
    }
  });
</script>

{#if !room}
  <section class="chat empty-room">
    <p>Select a conversation to start chatting.</p>
  </section>
{:else}
  <section class="chat">
    <header class="head">
      <div class="title">
        <strong>{roomTitle(room, ownId)}</strong>
        <small>
          {#if room.type === "direct"}
            <span class="dot" class:online></span>{online ? "Online" : "Offline"}
          {:else}
            {roomSubtitle(room, ownId)}
          {/if}
        </small>
      </div>
    </header>

    {#if firstPin}
      <div class="pinned-bar">
        <button
          class="pinned-summary"
          aria-haspopup="menu"
          aria-expanded={pinsOpen}
          onclick={() => (pinsOpen = !pinsOpen)}
        >
          <span class="pin-icon"><Icon name="pin" size={13} /></span>
          <span class="pinned-text">
            <strong>{userName(firstPin.senderId)}</strong>
            <span class="pinned-snippet">{pinnedSnippet(firstPin)}</span>
          </span>
          {#if roomPins.length > 1}<span class="pinned-count">{roomPins.length}</span>{/if}
          <span class="chev" class:open={pinsOpen}><Icon name="chevronDown" size={15} /></span>
        </button>
        {#if pinsOpen}
          <div class="pinned-popover-anchor">
            <button class="menu-backdrop" aria-label="Close pinned messages" onclick={() => (pinsOpen = false)}></button>
            <div class="pinned-popover" role="menu">
              <div class="pinned-popover-label">Pinned messages</div>
              {#each roomPins as p (p.messageId)}
                <div class="pinned-row">
                  <button class="pinned-row-main" onclick={() => jumpToPin(p.messageId)}>
                    <strong>{userName(p.senderId)}</strong>
                    <span class="pinned-snippet">{pinnedSnippet(p)}</span>
                  </button>
                  <button
                    class="pinned-unpin"
                    aria-label="Unpin message"
                    title="Unpin"
                    onclick={() => controller.togglePin(p.messageId)}
                  ><Icon name="close" size={13} /></button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    {#if connection.status !== "connected"}
      <div class="banner">⚠ {connection.status === "connecting" ? "Connecting…" : "Reconnecting… messages will send when you're back online"}</div>
    {/if}

    <div class="messages" bind:this={scroller} onscroll={onScroll}>
      {#if list.length === 0}
        <div class="empty">
          <p>No messages yet.</p>
          <p class="wave">Say hello 👋</p>
        </div>
      {:else}
        {#each list as message, i (message.id)}
          <MessageBubble
            {message}
            own={message.senderId === ownId}
            senderName={userName(message.senderId)}
            showSender={room.type === "group" && list[i - 1]?.senderId !== message.senderId}
            seenBy={seenBy[message.id] ?? []}
          />
        {/each}
      {/if}

      {#if typingNames.length > 0}
        <div class="typing">
          {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
        </div>
      {/if}
    </div>

    <Composer />
  </section>
{/if}

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-width: 0;
  }
  .chat.empty-room { align-items: center; justify-content: center; color: var(--text-faint); }
  .head, .banner, .pinned-bar { flex: none; }
  .head {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  /* Pinned-messages strip: a Material-style summary row that expands into a
     card-elevated list, matching the app's existing popover conventions. */
  .pinned-bar { position: relative; background: var(--surface); border-bottom: 1px solid var(--border); }
  .pinned-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 20px;
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font-size: 12.5px;
  }
  .pinned-summary:hover { background: var(--hover); }
  .pin-icon { display: inline-flex; color: var(--accent); flex-shrink: 0; }
  .pinned-text { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; overflow: hidden; }
  .pinned-text strong { font-size: 12.5px; flex-shrink: 0; }
  .pinned-snippet {
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pinned-count {
    flex-shrink: 0;
    background: var(--active);
    color: var(--accent);
    font-weight: 700;
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 999px;
  }
  .chev { flex-shrink: 0; display: inline-flex; color: var(--text-faint); transition: transform 0.15s ease; }
  .chev.open { transform: rotate(180deg); }
  .pinned-popover-anchor { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; }
  .menu-backdrop { position: fixed; inset: 0; z-index: 1; border: 0; padding: 0; background: transparent; cursor: default; }
  .pinned-popover {
    position: relative;
    z-index: 2;
    margin: 6px 20px;
    max-height: 280px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 6px;
  }
  .pinned-popover-label {
    padding: 6px 10px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .pinned-row { display: flex; align-items: center; gap: 4px; border-radius: 8px; }
  .pinned-row:hover { background: var(--hover); }
  .pinned-row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 8px 10px;
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font-size: 13px;
  }
  .pinned-row-main strong { flex-shrink: 0; font-size: 12.5px; }
  .pinned-unpin {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    margin-right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }
  .pinned-unpin:hover { background: var(--active); color: var(--danger); }
  .title strong { font-size: 15px; }
  .title small {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-faint);
    font-size: 12px;
    margin-top: 2px;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); }
  .dot.online { background: var(--online); }
  .banner {
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 12px;
    padding: 6px 20px;
    text-align: center;
  }
  .messages { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 20px; }
  .empty { height: 100%; display: grid; place-content: center; text-align: center; color: var(--text-faint); }
  .wave { font-size: 18px; }
  .typing { color: var(--text-faint); font-size: 12px; padding: 6px 2px; }
</style>
