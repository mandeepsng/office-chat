<script lang="ts">
  import { tick } from "svelte";
  import { auth } from "../lib/stores/auth.svelte";
  import { rooms } from "../lib/stores/rooms.svelte";
  import { connection } from "../lib/stores/connection.svelte";
  import { directory, userName } from "../lib/stores/directory.svelte";
  import { messages, roomMessages } from "../lib/stores/messages.svelte";
  import { controller } from "../lib/controller";
  import { roomSubtitle, roomTitle, directPeerId, directPeerOnline } from "../lib/roomDisplay";
  import MessageBubble from "./MessageBubble.svelte";
  import Composer from "./Composer.svelte";

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
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    height: 100vh;
    min-width: 0;
  }
  .chat.empty-room { place-items: center; color: var(--text-faint); }
  .head {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
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
  .messages { overflow-y: auto; padding: 18px 20px; }
  .empty { height: 100%; display: grid; place-content: center; text-align: center; color: var(--text-faint); }
  .wave { font-size: 18px; }
  .typing { color: var(--text-faint); font-size: 12px; padding: 6px 2px; }
</style>
