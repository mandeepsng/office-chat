<script lang="ts">
  import { call } from "../lib/stores/call.svelte";
  import { remoteMedia } from "../lib/call";
  import { controller } from "../lib/controller";
  import Icon from "./Icon.svelte";

  let audioEl = $state<HTMLAudioElement>();
  let videoEl = $state<HTMLVideoElement>();

  // remoteMedia.stream isn't reactive, so re-bind whenever the phase changes
  // into or within an active-media state (a fresh MediaStream is created per call).
  $effect(() => {
    void call.phase;
    if (audioEl) audioEl.srcObject = remoteMedia.stream;
    if (videoEl) videoEl.srcObject = remoteMedia.stream;
  });

  let elapsed = $state("0:00");
  $effect(() => {
    if (call.phase !== "connected" || !call.connectedAt) return;
    const start = call.connectedAt;
    const tick = () => {
      const total = Math.floor((Date.now() - start) / 1000);
      elapsed = `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });

  // Transient error banners (declined / busy / offline / failed) self-dismiss.
  $effect(() => {
    if (!call.error) return;
    const id = setTimeout(() => (call.error = null), 4000);
    return () => clearTimeout(id);
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && call.phase === "ringing-incoming") controller.rejectCall();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<audio bind:this={audioEl} autoplay style="display:none"></audio>

{#if call.phase === "ringing-incoming"}
  <div class="incoming-backdrop">
    <div class="incoming-card" role="alertdialog" aria-label="Incoming call">
      <div class="avatar">{call.peerName.charAt(0).toUpperCase() || "?"}</div>
      <strong>{call.peerName}</strong>
      <span class="sub">Incoming call…</span>
      <div class="actions">
        <button class="round decline" onclick={() => controller.rejectCall()} aria-label="Decline">
          <Icon name="phoneOff" size={22} />
        </button>
        <button class="round accept" onclick={() => controller.acceptCall()} aria-label="Accept">
          <Icon name="phone" size={22} />
        </button>
      </div>
    </div>
  </div>
{:else if call.phase !== "idle"}
  <div class="bar">
    {#if call.remoteHasVideo}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={videoEl} autoplay class="remote-video"></video>
    {/if}
    <div class="bar-info">
      <strong>{call.peerName}</strong>
      <span class="status">
        {#if call.phase === "ringing-outgoing"}Calling…
        {:else if call.phase === "connecting"}Connecting…
        {:else}{elapsed}{/if}
      </span>
    </div>
    <div class="bar-actions">
      {#if call.phase === "connected"}
        <button
          class="icon-btn"
          class:active={call.muted}
          onclick={() => controller.toggleCallMute()}
          aria-label={call.muted ? "Unmute" : "Mute"}
          title={call.muted ? "Unmute" : "Mute"}
        >
          <Icon name={call.muted ? "micOff" : "mic"} size={16} />
        </button>
        <button
          class="icon-btn"
          class:active={call.screenSharing}
          onclick={() => controller.toggleCallScreenShare()}
          aria-label="Share screen"
          title="Share screen"
        >
          <Icon name="screenShare" size={16} />
        </button>
      {/if}
      <button class="icon-btn hangup" onclick={() => controller.hangupCall()} aria-label="Hang up" title="Hang up">
        <Icon name="phoneOff" size={16} />
      </button>
    </div>
  </div>
{/if}

{#if call.error}
  <div class="toast">{call.error}</div>
{/if}

<style>
  .incoming-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.35);
    display: grid;
    place-content: center;
  }
  .incoming-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow);
    padding: 28px 36px;
    min-width: 240px;
  }
  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--active);
    color: var(--accent);
    display: grid;
    place-content: center;
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .incoming-card strong { font-size: 16px; }
  .incoming-card .sub { color: var(--text-faint); font-size: 13px; margin-bottom: 10px; }
  .actions { display: flex; gap: 20px; }
  .round {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 0;
    display: grid;
    place-content: center;
    cursor: pointer;
    color: #fff;
  }
  .round.decline { background: var(--danger, #dc2626); }
  .round.accept { background: var(--online, #16a34a); }

  .bar {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 150;
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    box-shadow: var(--shadow);
    padding: 6px 8px 6px 16px;
  }
  .remote-video {
    width: 64px;
    height: 40px;
    border-radius: 8px;
    object-fit: cover;
    background: #000;
  }
  .bar-info { display: flex; flex-direction: column; line-height: 1.2; min-width: 72px; }
  .bar-info strong { font-size: 13px; }
  .bar-info .status { font-size: 11px; color: var(--text-faint); }
  .bar-actions { display: flex; gap: 6px; }
  .icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 0;
    background: var(--hover);
    color: var(--text);
    display: grid;
    place-content: center;
    cursor: pointer;
  }
  .icon-btn.active { background: var(--accent); color: #fff; }
  .icon-btn.hangup { background: var(--danger, #dc2626); color: #fff; }

  .toast {
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 150;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 12.5px;
    padding: 8px 16px;
    border-radius: 8px;
    box-shadow: var(--shadow);
  }
</style>
