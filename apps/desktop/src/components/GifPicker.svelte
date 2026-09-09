<script lang="ts">
  import { searchGifs, giphyEnabled, type Gif } from "../lib/giphy";

  interface Props {
    onpick: (gif: Gif) => void;
    onclose: () => void;
  }
  let { onpick, onclose }: Props = $props();

  let query = $state("");
  let gifs = $state<Gif[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const enabled = giphyEnabled();

  async function run() {
    if (!enabled) return;
    loading = true;
    error = null;
    try {
      gifs = await searchGifs(query);
    } catch {
      error = "Could not load GIFs";
    } finally {
      loading = false;
    }
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(run, 350);
  }

  $effect(() => {
    if (enabled) run();
  });
</script>

<div class="popover" role="dialog" aria-label="GIF picker">
  <button class="backdrop" aria-label="Close GIF picker" onclick={onclose}></button>
  <div class="panel">
    {#if !enabled}
      <p class="hint">Set <code>VITE_GIPHY_API_KEY</code> to enable GIFs.</p>
    {:else}
      <input
        bind:value={query}
        oninput={onInput}
        placeholder="Search GIFs"
        autocomplete="off"
      />
      {#if loading}
        <p class="hint">Loading…</p>
      {:else if error}
        <p class="hint">{error}</p>
      {:else}
        <div class="grid">
          {#each gifs as gif (gif.id)}
            <button class="tile" onclick={() => onpick(gif)}>
              <img src={gif.previewUrl} alt="GIF" loading="lazy" />
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .popover { position: static; }
  .backdrop { position: fixed; inset: 0; z-index: 1; border: 0; padding: 0; background: transparent; cursor: default; }
  .panel {
    position: relative;
    z-index: 2;
    width: 320px;
    height: 360px;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px;
    box-shadow: var(--shadow);
  }
  input {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--input-bg);
    color: var(--text);
    outline: none;
  }
  .grid {
    margin-top: 8px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .tile { border: 0; padding: 0; background: transparent; cursor: pointer; }
  .tile img { width: 100%; height: 90px; object-fit: cover; border-radius: 8px; }
  .hint { color: var(--text-faint); font-size: 13px; padding: 8px; }
  code { background: var(--hover); padding: 1px 4px; border-radius: 4px; }
</style>
