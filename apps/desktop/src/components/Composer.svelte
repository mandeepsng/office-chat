<script lang="ts">
  import { tick } from "svelte";
  import type { User } from "@office-chat/shared";
  import { controller } from "../lib/controller";
  import { rooms } from "../lib/stores/rooms.svelte";
  import { auth } from "../lib/stores/auth.svelte";
  import { directory, userName } from "../lib/stores/directory.svelte";
  import { replyState, clearReplyTarget } from "../lib/stores/reply.svelte";
  import { editState, clearEditTarget } from "../lib/stores/edit.svelte";
  import { uploadImage } from "../lib/upload";
  import type { Gif } from "../lib/giphy";
  import { youtubeIdFromUrl, type Video } from "../lib/youtube";
  import EmojiPicker from "./EmojiPicker.svelte";
  import GifPicker from "./GifPicker.svelte";
  import YouTubePicker from "./YouTubePicker.svelte";

  let text = $state("");
  let open = $state<null | "emoji" | "gif" | "youtube">(null);
  let textarea = $state<HTMLTextAreaElement>();
  let fileInput = $state<HTMLInputElement>();

  // Image upload state (shared by paste and gallery picker).
  let uploading = $state(false);
  let uploadError = $state(false);

  /** Upload one image file and send it as an image message. */
  async function uploadAndSend(file: File) {
    uploading = true;
    uploadError = false;
    try {
      const url = await uploadImage(file);
      controller.sendImage(url);
    } catch (err) {
      console.error("Image upload failed", err);
      uploadError = true;
      setTimeout(() => (uploadError = false), 3000);
    } finally {
      uploading = false;
    }
  }

  async function onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;
    const image = Array.from(items).find((i) => i.type.startsWith("image/"));
    if (!image) return; // let normal text paste proceed

    event.preventDefault();
    const file = image.getAsFile();
    if (file) await uploadAndSend(file);
  }

  /** Pick one or more images from the gallery/file system and send them. */
  async function onPickFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      await uploadAndSend(file);
    }
    input.value = ""; // allow picking the same file again
  }

  // @mention autocomplete state.
  let mentionOpen = $state(false);
  let mentionQuery = $state("");
  let mentionAt = $state(0);
  let mentionIndex = $state(0);
  // Users chosen via the picker, so we can resolve names → ids on send.
  let picked = $state<{ id: string; name: string }[]>([]);

  type Candidate =
    | { kind: "user"; id: string; name: string }
    | { kind: "broadcast"; name: "everyone" | "here"; desc: string };

  // Room members (minus yourself) plus @everyone/@here (group rooms only).
  const candidates = $derived.by<Candidate[]>(() => {
    const room = rooms.list.find((r) => r.id === rooms.activeRoomId);
    const ownId = auth.identity?.userId;
    if (!room) return [];
    const users: Candidate[] = room.memberIds
      .filter((id) => id !== ownId)
      .map((id) => directory.users[id])
      .filter((u): u is User => !!u)
      .map((u) => ({ kind: "user", id: u.id, name: u.name }));
    const broadcasts: Candidate[] =
      room.type === "group"
        ? [
            { kind: "broadcast", name: "everyone", desc: "Notify everyone in this room" },
            { kind: "broadcast", name: "here", desc: "Notify online members" },
          ]
        : [];
    return [...broadcasts, ...users];
  });

  const matches = $derived(
    mentionOpen
      ? candidates
          .filter((c) => c.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : [],
  );

  /** Detect an in-progress "@token" immediately before the cursor. */
  function mentionContext(value: string, cursor: number) {
    const upto = value.slice(0, cursor);
    const at = upto.lastIndexOf("@");
    if (at === -1) return null;
    const before = at === 0 ? " " : (upto[at - 1] ?? " ");
    if (!/\s/.test(before)) return null; // '@' must start a new token
    const query = upto.slice(at + 1);
    if (/\s/.test(query)) return null; // whitespace ends the token
    return { at, query };
  }

  function updateMention() {
    if (!textarea) return;
    const ctx = mentionContext(text, textarea.selectionStart);
    if (ctx) {
      mentionOpen = true;
      mentionQuery = ctx.query;
      mentionAt = ctx.at;
      mentionIndex = 0;
    } else {
      mentionOpen = false;
    }
  }

  async function acceptMention(c: Candidate) {
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const before = text.slice(0, mentionAt);
    const after = text.slice(cursor);
    const insert = `@${c.name} `;
    text = before + insert + after;
    // Broadcast pings are expanded server-side, so only real users go in `picked`.
    if (c.kind === "user") picked = [...picked, { id: c.id, name: c.name }];
    mentionOpen = false;
    const pos = (before + insert).length;
    await tick();
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }

  // Entering edit mode loads the message text into the composer (and drops any
  // in-progress reply, since both modes share this input).
  $effect(() => {
    const target = editState.target;
    if (target) {
      clearReplyTarget();
      text = target.content;
      void tick().then(() => {
        textarea?.focus();
        const end = text.length;
        textarea?.setSelectionRange(end, end);
      });
    }
  });

  function cancelEdit() {
    clearEditTarget();
    text = "";
  }

  function send() {
    const value = text.trim();
    if (!value) return;

    // Editing an existing message reuses the composer input.
    if (editState.target) {
      controller.editMessage(editState.target.id, value);
      text = "";
      clearEditTarget();
      return;
    }

    // A message that is nothing but a YouTube link auto-embeds as a video.
    if (!/\s/.test(value) && youtubeIdFromUrl(value)) {
      controller.sendYoutube(value);
      text = "";
      picked = [];
      mentionOpen = false;
      clearReplyTarget();
      return;
    }

    // Only keep mentions whose "@Name" survived edits, deduped by id.
    const ids = [
      ...new Set(picked.filter((m) => value.includes(`@${m.name}`)).map((m) => m.id)),
    ];
    controller.sendMessage(value, "text", ids, replyState.target?.id ?? null);
    text = "";
    picked = [];
    mentionOpen = false;
    clearReplyTarget();
  }

  /** Short preview of the message being replied to. */
  function replyPreview(): string {
    const t = replyState.target;
    if (!t) return "";
    if (t.messageType === "gif") return "GIF";
    if (t.messageType === "image") return "Image";
    if (t.messageType === "youtube") return "▶️ Video";
    return t.content;
  }

  function onKeydown(event: KeyboardEvent) {
    if (mentionOpen && matches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        mentionIndex = (mentionIndex + 1) % matches.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        mentionIndex = (mentionIndex - 1 + matches.length) % matches.length;
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const choice = matches[mentionIndex];
        if (choice) void acceptMention(choice);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        mentionOpen = false;
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape") {
      open = null;
      clearReplyTarget();
      if (editState.target) cancelEdit();
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

  function pickVideo(video: Video) {
    controller.sendYoutube(video.url);
    open = null;
  }
</script>

<footer class="composer">
  {#if editState.target}
    <div class="reply-bar editing">
      <div class="reply-info">
        <span class="reply-to">✏️ Editing message</span>
      </div>
      <button class="reply-cancel" aria-label="Cancel edit" onclick={cancelEdit}>✕</button>
    </div>
  {:else if replyState.target}
    <div class="reply-bar">
      <div class="reply-info">
        <span class="reply-to">Replying to <strong>{userName(replyState.target.senderId)}</strong></span>
        <span class="reply-preview">{replyPreview()}</span>
      </div>
      <button class="reply-cancel" aria-label="Cancel reply" onclick={clearReplyTarget}>✕</button>
    </div>
  {/if}

  {#if open === "emoji"}
    <div class="picker-anchor emoji">
      <EmojiPicker onpick={insertEmoji} onclose={() => (open = null)} />
    </div>
  {/if}
  {#if open === "gif"}
    <div class="picker-anchor gif">
      <GifPicker onpick={pickGif} onclose={() => (open = null)} />
    </div>
  {/if}
  {#if open === "youtube"}
    <div class="picker-anchor gif">
      <YouTubePicker onpick={pickVideo} onclose={() => (open = null)} />
    </div>
  {/if}

  {#if mentionOpen && matches.length > 0}
    <div class="mention-list" role="listbox">
      {#each matches as c, i (c.kind === "user" ? c.id : c.name)}
        <button
          type="button"
          class="mention-item"
          class:active={i === mentionIndex}
          role="option"
          aria-selected={i === mentionIndex}
          onmousedown={(e) => {
            e.preventDefault();
            void acceptMention(c);
          }}
        >
          {#if c.kind === "broadcast"}
            <span class="mention-avatar broadcast">📣</span>
            <span class="mention-main">
              <span class="mention-name">@{c.name}</span>
              <span class="mention-desc">{c.desc}</span>
            </span>
          {:else}
            <span class="mention-avatar">{c.name.charAt(0).toUpperCase()}</span>
            {c.name}
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <button
    class="icon"
    title="Emoji"
    aria-label="Emoji"
    onclick={() => (open = open === "emoji" ? null : "emoji")}
  >😊</button>

  <input
    bind:this={fileInput}
    class="file-input"
    type="file"
    accept="image/*"
    multiple
    onchange={onPickFiles}
  />
  <button
    class="icon"
    title="Upload image"
    aria-label="Upload image from gallery"
    onclick={() => fileInput?.click()}
    disabled={uploading}
  >🖼️</button>

  <textarea
    bind:this={textarea}
    bind:value={text}
    rows="1"
    placeholder="Type a message… (@ to mention)"
    onkeydown={onKeydown}
    oninput={updateMention}
    onclick={updateMention}
    onpaste={onPaste}
  ></textarea>

  {#if uploading}
    <span class="upload-status" role="status">Uploading image…</span>
  {:else if uploadError}
    <span class="upload-status error" role="status">Upload failed</span>
  {/if}

  <button
    class="icon gif-btn"
    title="GIF"
    aria-label="GIF"
    onclick={() => (open = open === "gif" ? null : "gif")}
  >GIF</button>

  <button
    class="icon yt-btn"
    title="YouTube"
    aria-label="Search YouTube"
    onclick={() => (open = open === "youtube" ? null : "youtube")}
  >▶️</button>

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
  .picker-anchor {
    position: absolute;
    bottom: calc(100% + 8px);
    z-index: 50;
  }
  .picker-anchor.emoji { left: 12px; }
  .picker-anchor.gif { right: 12px; }
  .mention-list {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 12px;
    min-width: 200px;
    max-height: 220px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
    padding: 4px;
    z-index: 50;
  }
  .mention-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 7px 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
  }
  .mention-item.active,
  .mention-item:hover { background: var(--hover); }
  .mention-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .mention-avatar.broadcast { background: transparent; font-size: 15px; }
  .mention-main { display: flex; flex-direction: column; min-width: 0; }
  .mention-name { font-weight: 600; }
  .mention-desc { font-size: 11px; color: var(--text-faint); }
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
  .icon:disabled { opacity: 0.5; cursor: not-allowed; }
  .file-input { display: none; }
  .reply-bar {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-left: 3px solid var(--accent);
  }
  .reply-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .reply-to { font-size: 12px; color: var(--text-muted); }
  .reply-to strong { color: var(--accent); }
  .reply-preview {
    font-size: 12px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .reply-cancel {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    opacity: 0.6;
    flex-shrink: 0;
  }
  .reply-cancel:hover { opacity: 1; }
  .upload-status {
    position: absolute;
    top: -22px;
    left: 16px;
    font-size: 12px;
    color: var(--text-faint);
    background: var(--surface);
    padding: 1px 8px;
    border-radius: 6px;
  }
  .upload-status.error { color: var(--danger); }
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
