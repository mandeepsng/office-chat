<script lang="ts">
  import { controller } from "../lib/controller";
  import type { Gif } from "../lib/giphy";
  import EmojiPicker from "./EmojiPicker.svelte";
  import GifPicker from "./GifPicker.svelte";

  let text = $state("");
  let open = $state<null | "emoji" | "gif">(null);
  let textarea = $state<HTMLTextAreaElement>();

  function send() {
    const value = text.trim();
    if (!value) return;
    controller.sendMessage(value);
    text = "";
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape") {
      open = null;
    } else {
      controller.handleTyping();
    }
  }

  function insertEmoji(emoji: string) {
    text += emoji;
    open = null;
    textarea?.focus();
  }

  function pickGif(gif: Gif) {
    controller.sendGif(gif.url);
    open = null;
  }
</script>

<footer class="composer">
  <div class="pickers">
    {#if open === "emoji"}
      <EmojiPicker onpick={insertEmoji} onclose={() => (open = null)} />
    {/if}
    {#if open === "gif"}
      <GifPicker onpick={pickGif} onclose={() => (open = null)} />
    {/if}
  </div>

  <button
    class="icon"
    title="Emoji"
    aria-label="Emoji"
    onclick={() => (open = open === "emoji" ? null : "emoji")}
  >😊</button>

  <textarea
    bind:this={textarea}
    bind:value={text}
    rows="1"
    placeholder="Type a message…"
    onkeydown={onKeydown}
  ></textarea>

  <button
    class="icon gif-btn"
    title="GIF"
    aria-label="GIF"
    onclick={() => (open = open === "gif" ? null : "gif")}
  >GIF</button>

  <button class="send" onclick={send} disabled={!text.trim()} aria-label="Send">➤</button>
</footer>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    position: relative;
  }
  .pickers { position: absolute; bottom: 100%; left: 12px; }
  textarea {
    flex: 1;
    resize: none;
    max-height: 140px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--input-bg);
    color: var(--text);
    outline: none;
    font-family: inherit;
    line-height: 1.4;
  }
  textarea:focus { border-color: var(--accent); }
  .icon {
    height: 40px;
    border: 0;
    border-radius: 10px;
    background: var(--hover);
    color: var(--text-muted);
    cursor: pointer;
    padding: 0 12px;
    font-size: 15px;
  }
  .gif-btn { font-weight: 700; font-size: 12px; }
  .send {
    height: 40px;
    width: 40px;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: var(--accent-contrast);
    cursor: pointer;
    font-size: 15px;
  }
  .send:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
