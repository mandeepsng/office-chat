<script lang="ts">
  import { onMount } from "svelte";
  import { controller } from "./lib/controller";
  import { auth } from "./lib/stores/auth.svelte";
  import { connection } from "./lib/stores/connection.svelte";
  import { config } from "./lib/config";
  import { runAutoUpdate } from "./lib/updater";
  import { initAutostart } from "./lib/stores/autostart.svelte";
  import JoinScreen from "./components/JoinScreen.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import ChatView from "./components/ChatView.svelte";

  // While loading a saved identity, a dropped/failed socket surfaces as
  // "offline" — show the reason instead of spinning forever.
  const stalled = $derived(connection.status === "offline");

  let sidebar = $state<Sidebar>();

  onMount(() => {
    controller.init();
    // Fire-and-forget: check GitHub Releases for a newer signed build.
    void runAutoUpdate();
    // Register launch-at-login (on by default, user-toggleable in the sidebar).
    void initAutostart();
  });

  function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      sidebar?.focusSearch();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if auth.phase === "join"}
  <JoinScreen />
{:else if auth.phase === "connecting" && !auth.user}
  <main class="loading">
    {#if stalled}
      <p class="warn">⚠ Can't reach the server</p>
      <p class="sub">Retrying <code>{config.wsUrl}</code>…</p>
      <button class="link" onclick={() => controller.resetIdentity()}>Reset identity</button>
    {:else}
      <div class="spinner"></div>
      <p>Connecting to OfficeChat…</p>
    {/if}
  </main>
{:else}
  <div class="app">
    <Sidebar bind:this={sidebar} />
    <ChatView />
  </div>
{/if}

<style>
  .app { display: grid; grid-template-columns: 264px 1fr; height: 100vh; }
  .loading {
    height: 100vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 16px;
    color: var(--text-muted);
  }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .warn { color: var(--warn-text, #b45309); font-weight: 600; }
  .sub { color: var(--text-faint); font-size: 13px; }
  .sub code { background: var(--hover); padding: 1px 5px; border-radius: 4px; }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 13px;
    text-decoration: underline;
  }
</style>
