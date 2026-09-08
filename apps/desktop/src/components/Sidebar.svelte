<script lang="ts">
  import type { Room } from "@office-chat/shared";
  import { controller } from "../lib/controller";
  import { auth } from "../lib/stores/auth.svelte";
  import { rooms } from "../lib/stores/rooms.svelte";
  import { directory, isOnline } from "../lib/stores/directory.svelte";
  import { toggleTheme, theme } from "../lib/stores/theme.svelte";
  import { roomTitle } from "../lib/roomDisplay";
  import ConnectionBadge from "./ConnectionBadge.svelte";

  let search = $state("");
  let creatingGroup = $state(false);
  let groupName = $state("");
  let searchInput = $state<HTMLInputElement>();

  const ownId = $derived(auth.identity?.userId ?? "");

  const directRooms = $derived(
    rooms.list.filter((r) => r.type === "direct"),
  );
  const groupRooms = $derived(rooms.list.filter((r) => r.type === "group"));

  const matches = (label: string) =>
    label.toLowerCase().includes(search.trim().toLowerCase());

  const visibleDirect = $derived(directRooms.filter((r) => matches(roomTitle(r, ownId))));
  const visibleGroups = $derived(groupRooms.filter((r) => matches(r.name)));

  // People without an existing direct room yet, so you can start one.
  const otherPeople = $derived(
    Object.values(directory.users)
      .filter((u) => u.id !== ownId && matches(u.name))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  function submitGroup() {
    if (groupName.trim()) {
      controller.createGroup(groupName.trim(), []);
      groupName = "";
      creatingGroup = false;
    }
  }

  export function focusSearch() {
    searchInput?.focus();
  }
</script>

<aside class="sidebar">
  <header class="me">
    <div class="avatar">{(auth.user?.name ?? "?").charAt(0).toUpperCase()}</div>
    <div class="me-info">
      <strong>{auth.user?.name}</strong>
      <ConnectionBadge />
    </div>
    <button class="icon-btn" title="Toggle theme" onclick={toggleTheme}>
      {theme.value === "dark" ? "☀️" : "🌙"}
    </button>
  </header>

  <input
    class="search"
    bind:this={searchInput}
    bind:value={search}
    placeholder="Search (Ctrl/Cmd+K)"
  />

  <nav class="scroll">
    <section>
      <h4>Direct</h4>
      {#each visibleDirect as room (room.id)}
        {@render roomRow(room)}
      {/each}
      {#if visibleDirect.length === 0}
        <p class="empty">No direct chats yet</p>
      {/if}
    </section>

    <section>
      <div class="section-head">
        <h4>Groups</h4>
        <button class="icon-btn" title="New group" onclick={() => (creatingGroup = !creatingGroup)}>＋</button>
      </div>
      {#if creatingGroup}
        <form class="new-group" onsubmit={(e) => { e.preventDefault(); submitGroup(); }}>
          <input bind:value={groupName} placeholder="Group name" />
        </form>
      {/if}
      {#each visibleGroups as room (room.id)}
        {@render roomRow(room)}
      {/each}
    </section>

    <section>
      <h4>People</h4>
      {#each otherPeople as person (person.id)}
        <button
          class="row"
          onclick={() => controller.createDirect(person.id)}
        >
          <span class="dot" class:online={isOnline(person.id)}></span>
          {person.name}
        </button>
      {/each}
    </section>
  </nav>

  <footer>
    <button class="link" onclick={() => controller.resetIdentity()}>Reset identity</button>
  </footer>
</aside>

{#snippet roomRow(room: Room)}
  <button
    class="row"
    class:active={rooms.activeRoomId === room.id}
    onclick={() => controller.openRoom(room.id)}
  >
    <span class="room-avatar">{room.type === "direct" ? "@" : "#"}</span>
    {roomTitle(room, ownId)}
  </button>
{/snippet}

<style>
  .sidebar {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    height: 100vh;
    background: var(--surface);
    border-right: 1px solid var(--border);
  }
  .me {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    font-weight: 700;
  }
  .me-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .me-info strong { font-size: 14px; }
  .search {
    margin: 12px;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--input-bg);
    color: var(--text);
    outline: none;
  }
  .scroll { overflow-y: auto; padding: 0 8px 8px; }
  section { margin-top: 14px; }
  .section-head { display: flex; align-items: center; justify-content: space-between; }
  h4 {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 0 8px 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
  }
  .row:hover { background: var(--hover); }
  .row.active { background: var(--active); color: var(--text); }
  .room-avatar { color: var(--text-faint); }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--text-faint);
  }
  .dot.online { background: var(--online); }
  .empty { color: var(--text-faint); font-size: 12px; margin: 4px 10px; }
  .new-group input {
    width: calc(100% - 20px);
    margin: 4px 10px 8px;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--input-bg);
    color: var(--text);
    outline: none;
  }
  footer { padding: 12px 16px; border-top: 1px solid var(--border); }
  .icon-btn {
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 16px;
    color: var(--text-muted);
  }
  .link {
    border: 0;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }
  .link:hover { color: var(--text-muted); }
</style>
