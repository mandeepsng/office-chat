<script lang="ts">
  import { tick } from "svelte";
  import type { Room, User } from "@office-chat/shared";
  import { controller } from "../lib/controller";
  import { rooms } from "../lib/stores/rooms.svelte";
  import { auth } from "../lib/stores/auth.svelte";
  import { directory, isOnline } from "../lib/stores/directory.svelte";
  import { roomTitle } from "../lib/roomDisplay";
  import { messageSearch, clearSearch } from "../lib/stores/search.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    onclose: () => void;
  }
  let { onclose }: Props = $props();

  let query = $state("");
  let input = $state<HTMLInputElement>();
  let selected = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const ownId = $derived(auth.identity?.userId ?? "");
  const q = $derived(query.trim().toLowerCase());

  type Item =
    | { kind: "room"; key: string; room: Room }
    | { kind: "person"; key: string; user: User }
    | { kind: "message"; key: string; message: (typeof messageSearch.results)[number] };

  // Instant, client-side "jump to" — mirrors the sidebar's own filter, capped
  // so the panel stays short (Google-style: a few sharp matches, not a dump).
  const roomItems = $derived(
    q.length === 0
      ? []
      : rooms.list
          .filter((r) => roomTitle(r, ownId).toLowerCase().includes(q))
          .slice(0, 5)
          .map((room) => ({ kind: "room" as const, key: `r:${room.id}`, room })),
  );
  const peopleWithoutDm = $derived(
    Object.values(directory.users).filter(
      (u) => u.id !== ownId && !rooms.list.some((r) => r.type === "direct" && r.memberIds.includes(u.id)),
    ),
  );
  const personItems = $derived(
    q.length === 0
      ? []
      : peopleWithoutDm
          .filter((u) => u.name.toLowerCase().includes(q))
          .slice(0, 5)
          .map((user) => ({ kind: "person" as const, key: `p:${user.id}`, user })),
  );
  const messageItems = $derived(
    messageSearch.query.toLowerCase() === q
      ? messageSearch.results.map((message) => ({ kind: "message" as const, key: `m:${message.id}`, message }))
      : [],
  );
  const items = $derived<Item[]>([...roomItems, ...personItems, ...messageItems]);

  $effect(() => {
    void q;
    selected = 0;
  });

  function onInput() {
    clearTimeout(debounceTimer);
    if (q.length < 2) {
      clearSearch();
      return;
    }
    debounceTimer = setTimeout(() => controller.searchMessages(query), 300);
  }

  function roomNameFor(roomId: string): string {
    const room = rooms.list.find((r) => r.id === roomId);
    return room ? roomTitle(room, ownId) : "Unknown room";
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  }

  /** Bold the matched substring, Google-results style. */
  function highlight(text: string): string {
    if (!query.trim()) return escapeHtml(text);
    const safe = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text
      .split(new RegExp(`(${safe})`, "ig"))
      .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
      .join("");
  }

  /** A short window of context around the first match, not the whole message. */
  function snippet(text: string): string {
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1 || text.length <= 140) return text;
    const start = Math.max(0, idx - 50);
    const end = Math.min(text.length, idx + q.length + 70);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }

  function openItem(item: Item) {
    if (item.kind === "room") controller.openRoom(item.room.id);
    else if (item.kind === "person") controller.createDirect(item.user.id);
    else {
      controller.openRoom(item.message.roomId);
      const id = item.message.id;
      // Best-effort jump: works when the message is within the freshly loaded
      // window. Older history isn't paginated-to here (see brief §52 — keep it simple).
      void tick().then(() => {
        setTimeout(() => {
          const el = document.getElementById(`msg-${id}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("flash");
            setTimeout(() => el.classList.remove("flash"), 1200);
          }
        }, 250);
      });
    }
    close();
  }

  function close() {
    clearSearch();
    onclose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length > 0) selected = (selected + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length > 0) selected = (selected - 1 + items.length) % items.length;
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[selected];
      if (item) openItem(item);
    }
  }

  $effect(() => {
    void tick().then(() => input?.focus());
  });
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Search">
  <button class="backdrop" aria-label="Close search" onclick={close}></button>
  <div class="panel">
    <div class="search-field">
      <span class="search-icon"><Icon name="search" size={18} /></span>
      <input
        bind:this={input}
        bind:value={query}
        oninput={onInput}
        onkeydown={onKeydown}
        placeholder="Search people, rooms, and messages"
        autocomplete="off"
        spellcheck="false"
      />
      {#if query}
        <button class="clear" aria-label="Clear search" onclick={() => { query = ""; clearSearch(); input?.focus(); }}><Icon name="close" size={13} /></button>
      {/if}
    </div>

    {#if q.length > 0}
      <div class="results">
        {#if roomItems.length > 0 || personItems.length > 0}
          <div class="group-label">Jump to</div>
          {#each roomItems as item, i (item.key)}
            <button class="row" class:active={items.indexOf(item) === selected} onclick={() => openItem(item)}>
              <span class="avatar room-avatar">{item.room.type === "direct" ? "@" : "#"}</span>
              <span class="row-main">{@html highlight(roomTitle(item.room, ownId))}</span>
            </button>
          {/each}
          {#each personItems as item (item.key)}
            <button class="row" class:active={items.indexOf(item) === selected} onclick={() => openItem(item)}>
              <span class="avatar person-avatar">
                {item.user.name.charAt(0).toUpperCase()}
                <span class="dot" class:online={isOnline(item.user.id)}></span>
              </span>
              <span class="row-main">{@html highlight(item.user.name)}</span>
              <span class="row-hint">Start chat</span>
            </button>
          {/each}
        {/if}

        {#if q.length >= 2}
          <div class="group-label">Messages</div>
          {#if messageSearch.loading}
            <div class="status">Searching…</div>
          {:else if messageItems.length === 0}
            <div class="status">No messages found</div>
          {:else}
            {#each messageItems as item (item.key)}
              <button class="row message-row" class:active={items.indexOf(item) === selected} onclick={() => openItem(item)}>
                <span class="avatar room-avatar">#</span>
                <span class="row-text">
                  <span class="row-room">{roomNameFor(item.message.roomId)}</span>
                  <span class="row-main">{@html highlight(snippet(item.message.content))}</span>
                </span>
              </button>
            {/each}
          {/if}
        {:else}
          <div class="status hint">Keep typing to search messages…</div>
        {/if}
      </div>
    {:else}
      <div class="status hint">Search rooms, people, and message history.</div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    justify-content: center;
    padding-top: 12vh;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(15, 23, 42, 0.35);
    cursor: default;
  }
  .panel {
    position: relative;
    z-index: 1;
    width: min(560px, 92vw);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: 16px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .search-field {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }
  .search-icon { display: flex; color: var(--text-faint); flex-shrink: 0; }
  .search-field input {
    flex: 1;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 16px;
    outline: none;
  }
  .clear {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: var(--hover);
    color: var(--text-faint);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
  }
  .clear:hover { background: var(--active); color: var(--text); }
  .results { overflow-y: auto; padding: 6px; }
  .group-label {
    padding: 10px 12px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 9px 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 13.5px;
  }
  .row:hover, .row.active { background: var(--hover); }
  .avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
    position: relative;
  }
  .room-avatar { background: var(--active); color: var(--accent); }
  .person-avatar { background: var(--accent); color: var(--accent-contrast); }
  .dot {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
    border: 2px solid var(--surface);
  }
  .dot.online { background: var(--online); }
  .row-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-hint { flex-shrink: 0; font-size: 11px; color: var(--text-faint); }
  .message-row { align-items: flex-start; }
  .row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .row-room { font-size: 11px; color: var(--text-faint); }
  .message-row .row-main {
    white-space: normal;
    overflow: visible;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.35;
  }
  .row-main :global(mark) {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--text);
    border-radius: 3px;
    padding: 0 1px;
  }
  .status {
    padding: 14px 14px 18px;
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
  }
  .status.hint { padding-top: 22px; }
</style>
