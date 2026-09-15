<script lang="ts">
  import {
    settings,
    settingsUi,
    saveSettings,
    type ToastSound,
  } from "../lib/stores/settings.svelte";
  import { playIncoming } from "../lib/sounds";

  function close() {
    settingsUi.open = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") close();
  }

  const toastSounds: ToastSound[] = ["IM", "Default", "Mail", "Silent"];
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="backdrop"
  role="button"
  tabindex="-1"
  aria-label="Close settings"
  onclick={close}
  onkeydown={(e) => e.key === "Enter" && close()}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Settings">
  <header>
    <h2>Settings</h2>
    <button class="close" aria-label="Close" onclick={close}>✕</button>
  </header>

  <section>
    <label class="row toggle">
      <div>
        <strong>Do Not Disturb</strong>
        <span>Silence all notifications, sounds and taskbar flashing.</span>
      </div>
      <input
        type="checkbox"
        bind:checked={settings.dnd}
        onchange={saveSettings}
      />
    </label>
  </section>

  <hr />

  <section class:disabled={settings.dnd}>
    <h3>Notifications</h3>
    <label class="row toggle">
      <div>
        <strong>Desktop notifications</strong>
        <span>Show a native toast for background messages.</span>
      </div>
      <input
        type="checkbox"
        bind:checked={settings.notificationsEnabled}
        onchange={saveSettings}
      />
    </label>

    <label class="row">
      <div>
        <strong>Notification sound</strong>
        <span>Windows only — other systems use the OS default.</span>
      </div>
      <select bind:value={settings.toastSound} onchange={saveSettings}>
        {#each toastSounds as s (s)}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </label>
  </section>

  <hr />

  <section class:disabled={settings.dnd}>
    <h3>In-app sounds</h3>
    <label class="row toggle">
      <div>
        <strong>Message sounds</strong>
        <span>Soft pop on receive, whoosh on send.</span>
      </div>
      <input
        type="checkbox"
        bind:checked={settings.soundsEnabled}
        onchange={saveSettings}
      />
    </label>

    <label class="row">
      <div>
        <strong>Volume</strong>
        <span>{Math.round(settings.volume * 100)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        bind:value={settings.volume}
        onchange={() => {
          saveSettings();
          if (settings.soundsEnabled && !settings.dnd) playIncoming();
        }}
      />
    </label>
  </section>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 40;
    border: 0;
  }
  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, calc(100vw - 48px));
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    z-index: 41;
    padding: 4px 20px 20px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0 8px;
    position: sticky;
    top: 0;
    background: var(--surface);
  }
  h2 { font-size: 16px; margin: 0; color: var(--text); }
  h3 {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 6px 0 4px;
  }
  .close {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 15px;
    opacity: 0.6;
  }
  .close:hover { opacity: 1; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 14px 0; }
  section.disabled { opacity: 0.45; pointer-events: none; }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
  }
  .row div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .row strong { font-size: 14px; color: var(--text); font-weight: 500; }
  .row span { font-size: 12px; color: var(--text-faint); }
  .toggle input { width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; }
  select {
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--input-bg);
    color: var(--text);
    cursor: pointer;
  }
  input[type="range"] { width: 130px; cursor: pointer; accent-color: var(--accent); }
</style>
