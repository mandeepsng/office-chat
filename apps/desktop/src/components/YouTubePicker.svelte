<script lang="ts">
  import { searchVideos, youtubeEnabled, type Video } from "../lib/youtube";

  interface Props {
    onpick: (video: Video) => void;
    onclose: () => void;
  }
  let { onpick, onclose }: Props = $props();

  let query = $state("");
  let videos = $state<Video[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const enabled = youtubeEnabled();

  async function run() {
    if (!enabled || !query.trim()) {
      videos = [];
      return;
    }
    loading = true;
    error = null;
    try {
      videos = await searchVideos(query);
    } catch {
      error = "Could not load videos";
    } finally {
      loading = false;
    }
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(run, 400);
  }
</script>

<div class="popover" role="dialog" aria-label="YouTube picker">
  <button class="backdrop" aria-label="Close YouTube picker" onclick={onclose}></button>
  <div class="panel">
    {#if !enabled}
      <p class="hint">Set <code>VITE_YOUTUBE_API_KEY</code> to enable YouTube search.</p>
    {:else}
      <input
        bind:value={query}
        oninput={onInput}
        placeholder="Search YouTube"
        autocomplete="off"
      />
      {#if loading}
        <p class="hint">Loading…</p>
      {:else if error}
        <p class="hint">{error}</p>
      {:else if query.trim() && videos.length === 0}
        <p class="hint">No results</p>
      {:else if !query.trim()}
        <p class="hint">Type to search for a video.</p>
      {:else}
        <div class="list">
          {#each videos as video (video.id)}
            <button class="row" onclick={() => onpick(video)}>
              <img src={video.thumbnailUrl} alt="" loading="lazy" />
              <span class="info">
                <span class="title">{video.title}</span>
                <span class="channel">{video.channel}</span>
              </span>
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
    width: 360px;
    height: 380px;
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
  .list {
    margin-top: 8px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
  }
  .row:hover { background: var(--hover); }
  .row img { width: 100px; height: 56px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
  .info { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
  .title {
    font-size: 13px;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .channel { font-size: 11px; color: var(--text-faint); }
  .hint { color: var(--text-faint); font-size: 13px; padding: 8px; }
  code { background: var(--hover); padding: 1px 4px; border-radius: 4px; }
</style>
