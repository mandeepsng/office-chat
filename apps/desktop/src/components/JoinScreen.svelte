<script lang="ts">
  import { controller } from "../lib/controller";
  import { auth } from "../lib/stores/auth.svelte";

  let name = $state("");
  let officeCode = $state("");

  const canSubmit = $derived(name.trim().length > 0 && officeCode.trim().length > 0);

  function join() {
    if (canSubmit) controller.register(name, officeCode);
  }
</script>

<main class="join">
  <form class="card" onsubmit={(e) => { e.preventDefault(); join(); }}>
    <div class="logo">💬</div>
    <h1>Welcome to OfficeChat</h1>
    <p>Private team chat. No account required.</p>

    <label>
      Your name
      <input bind:value={name} placeholder="Mandeep" autocomplete="off" />
    </label>

    <label>
      Office Code
      <input bind:value={officeCode} placeholder="ABC123" autocomplete="off" />
    </label>

    <button type="submit" disabled={!canSubmit || auth.phase === "connecting"}>
      {auth.phase === "connecting" ? "Joining…" : "Join Office"}
    </button>

    {#if auth.authError}
      <p class="error">{auth.authError}</p>
    {/if}
  </form>
</main>

<style>
  .join {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    width: min(400px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 36px;
    box-shadow: var(--shadow);
  }
  .logo { font-size: 42px; }
  h1 { margin: 10px 0 4px; font-size: 22px; }
  p { color: var(--text-muted); margin: 0 0 8px; }
  label {
    display: block;
    margin-top: 18px;
    font-size: 13px;
    color: var(--text-muted);
  }
  input {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--input-bg);
    color: var(--text);
    outline: none;
  }
  input:focus { border-color: var(--accent); }
  button {
    width: 100%;
    margin-top: 24px;
    padding: 12px;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  .error { color: var(--danger); margin-top: 14px; font-size: 13px; }
</style>
