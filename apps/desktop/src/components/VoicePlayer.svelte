<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    src: string;
    /** Own messages sit on the accent-colored bubble, so the player needs a
     *  lighter palette to stay readable — same idiom as the ✓✓ read ticks. */
    own: boolean;
  }
  let { src, own }: Props = $props();

  let audio = $state<HTMLAudioElement>();
  let playing = $state(false);
  let duration = $state(0);
  let current = $state(0);

  function togglePlay() {
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play();
  }

  function onSeek(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (audio) audio.currentTime = value;
    current = value;
  }

  function format(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const progressPct = $derived(duration > 0 ? (current / duration) * 100 : 0);
  // WhatsApp-style: show the clip length until it's been played, then elapsed time.
  const label = $derived(format(playing || current > 0 ? current : duration));
</script>

<div class="voice" class:own>
  <audio
    bind:this={audio}
    {src}
    preload="metadata"
    onloadedmetadata={() => (duration = audio?.duration ?? 0)}
    ontimeupdate={() => (current = audio?.currentTime ?? 0)}
    onplay={() => (playing = true)}
    onpause={() => (playing = false)}
    onended={() => { playing = false; current = 0; }}
  ></audio>

  <button class="play-btn" onclick={togglePlay} aria-label={playing ? "Pause voice message" : "Play voice message"}>
    <Icon name={playing ? "pause" : "play"} size={15} />
  </button>

  <input
    class="seek"
    type="range"
    min="0"
    max={duration || 0}
    step="0.01"
    value={current}
    style={`--progress: ${progressPct}%`}
    oninput={onSeek}
    aria-label="Seek voice message"
  />

  <span class="time">{label}</span>
</div>

<style>
  .voice {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 220px;
    padding: 2px 0;
  }
  .play-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .voice.own .play-btn {
    background: rgba(255, 255, 255, 0.92);
    color: var(--bubble-own);
  }
  .seek {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      currentColor var(--progress, 0%),
      rgba(127, 127, 127, 0.3) var(--progress, 0%)
    );
    color: var(--accent);
    cursor: pointer;
  }
  .voice.own .seek { color: rgba(255, 255, 255, 0.95); }
  .seek::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    cursor: pointer;
  }
  .time {
    flex-shrink: 0;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);
    min-width: 30px;
    text-align: right;
  }
  .voice.own .time { color: rgba(255, 255, 255, 0.85); }
</style>
