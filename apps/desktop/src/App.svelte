<script lang="ts">
  import { onMount } from "svelte";
  import { controller } from "./lib/controller";
  import { auth } from "./lib/stores/auth.svelte";
  import JoinScreen from "./components/JoinScreen.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import ChatView from "./components/ChatView.svelte";

  let sidebar = $state<Sidebar>();

  onMount(() => controller.init());

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
    <div class="spinner"></div>
    <p>Connecting to OfficeChat…</p>
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
</style>
