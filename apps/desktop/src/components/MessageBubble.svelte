<script lang="ts">
  import type { User } from "@office-chat/shared";
  import type { ChatMessage } from "../lib/types";
  import { auth } from "../lib/stores/auth.svelte";
  import { mentionParts } from "../lib/mentions";
  import { findMessage } from "../lib/stores/messages.svelte";
  import { userName } from "../lib/stores/directory.svelte";
  import { setReplyTarget } from "../lib/stores/reply.svelte";
  import { setEditTarget } from "../lib/stores/edit.svelte";
  import { controller } from "../lib/controller";
  import { reactionGroups, type ReactionGroup } from "../lib/stores/reactions.svelte";
  import { emojiHtml } from "../lib/twemoji";
  import { splitBlocks, renderInline } from "../lib/markdown";
  import { embedUrl, videoIdFromContent } from "../lib/youtube";
  import { firstUrl, ensurePreview, previewOf } from "../lib/linkPreview.svelte";
  import { isPinned as messageIsPinned } from "../lib/stores/pins.svelte";
  import type { Gif } from "../lib/giphy";
  import EmojiPicker from "./EmojiPicker.svelte";
  import GifPicker from "./GifPicker.svelte";
  import Icon from "./Icon.svelte";
  import VoicePlayer from "./VoicePlayer.svelte";

  interface Props {
    message: ChatMessage;
    own: boolean;
    senderName: string;
    showSender: boolean;
    /** Group "seen by" — members who have read up to this message. */
    seenBy?: User[];
  }
  let { message, own, senderName, showSender, seenBy = [] }: Props = $props();

  const MAX_AVATARS = 5;
  const shownReaders = $derived(seenBy.slice(0, MAX_AVATARS));
  const extraReaders = $derived(Math.max(0, seenBy.length - MAX_AVATARS));

  // Message body split into fenced code blocks and rich-text runs; text runs are
  // further split into @mention tokens so both mentions and markdown can render.
  const blocks = $derived(
    splitBlocks(message.content).map((b) =>
      b.kind === "code"
        ? b
        : {
            kind: "text" as const,
            parts: mentionParts(b.text, message.mentions ?? [], auth.identity?.userId ?? null),
          },
    ),
  );

  // For youtube messages, the embeddable video id (null → render as a link).
  const ytId = $derived(
    message.messageType === "youtube" ? videoIdFromContent(message.content) : null,
  );

  // Link-preview card for text messages that contain a URL.
  const linkUrl = $derived(
    message.messageType === "text" && !message.deletedAt ? firstUrl(message.content) : null,
  );
  $effect(() => {
    if (linkUrl) ensurePreview(linkUrl);
  });
  const linkPreview = $derived(linkUrl ? previewOf(linkUrl) : undefined);

  // Only your own, non-deleted text messages can be edited.
  const editable = $derived(own && message.messageType === "text" && !message.deletedAt);
  // Any of your own, non-deleted messages can be deleted.
  const deletable = $derived(own && !message.deletedAt);

  // Any non-deleted text message can be copied (yours or others').
  const copyable = $derived(message.messageType === "text" && !message.deletedAt);

  // Any non-deleted message can be pinned (or unpinned) by any room member.
  const pinnable = $derived(!message.deletedAt);
  const pinned = $derived(messageIsPinned(message.roomId, message.id));

  const ownId = $derived(auth.identity?.userId ?? "");
  const groups = $derived(reactionGroups(message.id, ownId));

  // Teams-style one-tap reactions shown in the hover toolbar.
  const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];
  const mineEmojis = $derived(new Set(groups.filter((g) => g.mine).map((g) => g.emoji)));

  /** A GIF reaction stores the GIF's URL in place of an emoji glyph. */
  function isGifReaction(value: string): boolean {
    return value.startsWith("http://") || value.startsWith("https://");
  }

  let confirmingDelete = $state(false);
  let copied = $state(false);
  let reacting = $state(false);
  let givingGif = $state(false);
  let menuOpen = $state(false);
  // URL of the image/GIF currently open in the full-screen viewer.
  let viewer = $state<string | null>(null);

  function react(emoji: string) {
    controller.toggleReaction(message.id, emoji);
    reacting = false;
    givingGif = false;
  }

  function reactGif(gif: Gif) {
    react(gif.url);
  }

  function togglePin() {
    controller.togglePin(message.id);
    menuOpen = false;
  }

  /** Names of everyone who reacted with an emoji, "You" first (Teams-style). */
  function reactorNames(g: ReactionGroup): string {
    const names = g.userIds.map((id) => (id === ownId ? "You" : userName(id)));
    // Put "You" first if present.
    names.sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : 0));
    if (names.length <= 1) return names.join("");
    const last = names[names.length - 1];
    return `${names.slice(0, -1).join(", ")} and ${last}`;
  }

  function closeMenus() {
    menuOpen = false;
    reacting = false;
    givingGif = false;
    confirmingDelete = false;
  }

  function confirmDelete() {
    controller.deleteMessage(message.id);
    confirmingDelete = false;
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.content);
      copied = true;
      setTimeout(() => (copied = false), 1200);
    } catch {
      // Clipboard unavailable — ignore.
    }
  }

  // The message this one replies to (if it's still loaded in the room).
  const repliedTo = $derived(
    message.replyToId ? findMessage(message.roomId, message.replyToId) : undefined,
  );

  function quoteText(m: NonNullable<typeof repliedTo>): string {
    if (m.deletedAt) return "Message deleted";
    if (m.messageType === "gif") return "GIF";
    if (m.messageType === "image") return "Image";
    if (m.messageType === "youtube") return "▶️ Video";
    if (m.messageType === "voice") return "🎤 Voice message";
    return m.content;
  }

  /** Scroll to the original message when its quote is clicked. */
  function jumpToOriginal() {
    if (!message.replyToId) return;
    const el = document.getElementById(`msg-${message.replyToId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1200);
    }
  }

  const time = $derived(
    new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  // ✓ sent · ✓✓ delivered/read (read is coloured).
  const tick = $derived(
    message.status === "pending" || message.status === "failed"
      ? ""
      : message.status === "sent"
        ? "✓"
        : "✓✓",
  );
</script>

<div class="message" class:own id={`msg-${message.id}`}>
  <div class="bubble-wrap">
  {#if !message.deletedAt}
    <div class="actions">
      {#each QUICK_REACTIONS as emoji (emoji)}
        <button
          class="quick reaction"
          class:active={mineEmojis.has(emoji)}
          aria-label={`React ${emoji}`}
          title={`React ${emoji}`}
          onclick={() => react(emoji)}
        >{@html emojiHtml(emoji)}</button>
      {/each}
      <button
        class="quick"
        aria-label="More emoji"
        title="More emoji"
        onclick={() => { reacting = !reacting; givingGif = false; menuOpen = false; }}
      ><Icon name="smile" size={17} /></button>
      <button
        class="quick gif-react"
        aria-label="React with GIF"
        title="React with GIF"
        onclick={() => { givingGif = !givingGif; reacting = false; menuOpen = false; }}
      >GIF</button>
      <span class="divider"></span>
      <button
        class="quick"
        aria-label="Reply"
        title="Reply"
        onclick={() => setReplyTarget(message)}
      ><Icon name="reply" size={17} /></button>
      {#if copyable || editable || deletable || pinnable}
        <button
          class="quick"
          aria-label="More actions"
          title="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onclick={() => { menuOpen = !menuOpen; reacting = false; givingGif = false; confirmingDelete = false; }}
        ><Icon name="more" size={17} /></button>
      {/if}
    </div>
  {/if}

  {#if menuOpen}
    <div class="menu-anchor" class:own>
      <button class="menu-backdrop" aria-label="Close menu" onclick={closeMenus}></button>
      <div class="menu" role="menu">
        {#if confirmingDelete}
          <div class="menu-confirm">Delete this message?</div>
          <button class="menu-item danger" role="menuitem" onclick={confirmDelete}><Icon name="trash" size={15} /> Delete</button>
          <button class="menu-item" role="menuitem" onclick={() => (confirmingDelete = false)}>Cancel</button>
        {:else}
          {#if copyable}
            <button class="menu-item" role="menuitem" onclick={() => { copyText(); menuOpen = false; }}><Icon name="copy" size={15} /> {copied ? "Copied!" : "Copy"}</button>
          {/if}
          {#if pinnable}
            <button class="menu-item" role="menuitem" onclick={togglePin}><Icon name="pin" size={15} /> {pinned ? "Unpin" : "Pin"}</button>
          {/if}
          {#if editable}
            <button class="menu-item" role="menuitem" onclick={() => { setEditTarget(message); menuOpen = false; }}><Icon name="edit" size={15} /> Edit</button>
          {/if}
          {#if deletable}
            <button class="menu-item danger" role="menuitem" onclick={() => (confirmingDelete = true)}><Icon name="trash" size={15} /> Delete</button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if reacting}
    <div class="react-anchor" class:own>
      <EmojiPicker onpick={react} onclose={() => (reacting = false)} />
    </div>
  {/if}
  {#if givingGif}
    <div class="react-anchor" class:own>
      <GifPicker onpick={reactGif} onclose={() => (givingGif = false)} />
    </div>
  {/if}

  <div class="bubble" class:own class:failed={message.status === "failed"}>
    {#if showSender && !own}
      <span class="sender">{senderName}</span>
    {/if}

    {#if repliedTo}
      <button class="quote" onclick={jumpToOriginal}>
        <span class="quote-sender">{userName(repliedTo.senderId)}</span>
        <span class="quote-text">{quoteText(repliedTo)}</span>
      </button>
    {:else if message.replyToId}
      <div class="quote quote-missing">Original message</div>
    {/if}

    {#if message.deletedAt}
      <span class="deleted">Message deleted</span>
    {:else if message.messageType === "gif"}
      <button class="media-btn" aria-label="Open GIF" onclick={() => (viewer = message.content)}>
        <img class="gif" src={message.content} alt="GIF" loading="lazy" />
      </button>
    {:else if message.messageType === "image"}
      <button class="media-btn" aria-label="Open image" onclick={() => (viewer = message.content)}>
        <img class="gif" src={message.content} alt="Shared attachment" loading="lazy" />
      </button>
    {:else if message.messageType === "youtube"}
      {#if ytId}
        <div class="yt">
          <iframe
            src={embedUrl(ytId)}
            title="YouTube video player"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      {:else}
        <a class="md-link" href={message.content} target="_blank" rel="noreferrer">{message.content}</a>
      {/if}
    {:else if message.messageType === "voice"}
      <VoicePlayer src={message.content} {own} />
    {:else}
      <div class="text">{#each blocks as block}{#if block.kind === "code"}<pre
            class="code-block"><code>{block.text}</code></pre>{:else}{#each block.parts as part}{#if part.mention}<span
                class="mention"
                class:self={part.self}>{part.text}</span>{:else}{@html renderInline(part.text)}{/if}{/each}{/if}{/each}</div>
    {/if}

    {#if linkPreview?.status === "done"}
      <a class="link-card" href={linkPreview.data.url} target="_blank" rel="noreferrer">
        {#if linkPreview.data.image}
          <img class="link-img" src={linkPreview.data.image} alt="" loading="lazy" />
        {/if}
        <span class="link-body">
          {#if linkPreview.data.siteName}<span class="link-site">{linkPreview.data.siteName}</span>{/if}
          {#if linkPreview.data.title}<span class="link-title">{linkPreview.data.title}</span>{/if}
          {#if linkPreview.data.description}<span class="link-desc">{linkPreview.data.description}</span>{/if}
        </span>
      </a>
    {/if}

    <span class="meta">
      {#if message.status === "pending"}<span class="pending">Sending…</span>{/if}
      {#if message.status === "failed"}<span class="fail">Failed</span>{/if}
      {#if message.updatedAt && !message.deletedAt}<span class="edited">edited</span>{/if}
      <time>{time}</time>
      {#if own && tick}<span class="tick" class:read={message.status === "read"}>{tick}</span>{/if}
    </span>
  </div>
  </div>

  {#if groups.length > 0}
    <div class="reactions">
      {#each groups as g (g.emoji)}
        <button
          class="reaction-chip"
          class:mine={g.mine}
          onclick={() => react(g.emoji)}
        >
          {#if isGifReaction(g.emoji)}
            <img class="reaction-gif" src={g.emoji} alt="GIF reaction" loading="lazy" />
          {:else}
            <span class="reaction-emoji">{@html emojiHtml(g.emoji)}</span>
          {/if}
          <span class="reaction-count">{g.count}</span>
          <span class="reactor-tip" role="tooltip">
            {#if isGifReaction(g.emoji)}
              <img class="reactor-gif" src={g.emoji} alt="" />
            {:else}
              <span class="reactor-emoji">{@html emojiHtml(g.emoji)}</span>
            {/if}
            {reactorNames(g)}
          </span>
        </button>
      {/each}
    </div>
  {/if}

  {#if own && seenBy.length > 0}
    <div class="seen" aria-label={`Seen by ${seenBy.map((u) => u.name).join(", ")}`}>
      {#each shownReaders as reader (reader.id)}
        <span class="seen-avatar" title={reader.name}>{reader.name.charAt(0).toUpperCase()}</span>
      {/each}
      {#if extraReaders > 0}<span class="seen-more">+{extraReaders}</span>{/if}
    </div>
  {/if}
</div>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && viewer) viewer = null; }} />

{#if viewer}
  <div class="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
    <button class="lightbox-backdrop" aria-label="Close image" onclick={() => (viewer = null)}></button>
    <img class="lightbox-img" src={viewer} alt="Full size" />
    <button class="lightbox-close" aria-label="Close" onclick={() => (viewer = null)}><Icon name="close" size={16} /></button>
  </div>
{/if}

<style>
  .message { display: flex; flex-direction: column; align-items: flex-start; margin: 3px 0; position: relative; }
  .message.own { align-items: flex-end; }
  :global(.message.flash) { animation: flashPulse 1.2s ease; border-radius: 8px; }
  @keyframes flashPulse {
    0%, 100% { background: transparent; }
    30% { background: var(--hover); }
  }
  /* Wrapper sized to the bubble so the hover toolbar can anchor to its edges. */
  .bubble-wrap { position: relative; display: inline-block; max-width: 66%; }

  /* Google Chat-style floating hover toolbar sitting just above the bubble.
     It overlaps the bubble's top edge by a couple px (rather than floating
     with a gap above it) so the cursor never crosses "dead" empty space
     while moving from the bubble up into the toolbar — a gap there would
     drop :hover mid-transition and make the toolbar vanish before it's reached. */
  .actions {
    position: absolute;
    bottom: calc(100% - 2px);
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
    z-index: 5;
  }
  .message:not(.own) .actions { left: 0; }
  .message.own .actions { right: 0; }
  .message:hover .actions,
  .actions:focus-within {
    opacity: 1;
    pointer-events: auto;
  }
  .quick {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    display: grid;
    place-items: center;
    transition: background 0.1s ease, transform 0.1s ease;
  }
  .quick:hover { background: var(--hover); }
  /* Not circular — "GIF" is a short word, not a glyph. */
  .quick.gif-react { width: auto; border-radius: 8px; padding: 0 8px; font-size: 10px; font-weight: 700; }
  /* Emoji reactions render larger and with a real colour-emoji font. */
  .quick.reaction {
    font-size: 20px;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif;
  }
  .quick.reaction:hover { transform: scale(1.25); }
  .quick.reaction.active { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .divider { width: 1px; height: 18px; background: var(--border); margin: 0 3px; }

  /* "More actions" dropdown menu, opening below the toolbar. */
  .menu-anchor { position: absolute; bottom: calc(100% + 38px); z-index: 60; }
  .message:not(.own) .menu-anchor { left: 0; }
  .message.own .menu-anchor { right: 0; }
  .menu-backdrop { position: fixed; inset: 0; z-index: 1; border: 0; padding: 0; background: transparent; cursor: default; }
  .menu {
    position: relative;
    z-index: 2;
    min-width: 156px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
    display: flex;
    flex-direction: column;
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    text-align: left;
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    padding: 8px 10px;
    border-radius: 7px;
    font-size: 13px;
  }
  .menu-item:hover { background: var(--hover); }
  .menu-item.danger { color: var(--danger); }
  .menu-confirm { padding: 8px 10px 4px; font-size: 12px; color: var(--text-muted); }
  .edited { font-style: italic; opacity: 0.7; }
  .react-anchor { position: absolute; bottom: calc(100% + 38px); z-index: 50; }
  .message:not(.own) .react-anchor { left: 0; }
  .message.own .react-anchor { right: 0; }
  .reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .message.own .reactions { justify-content: flex-end; }
  .reaction-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    line-height: 18px;
  }
  .reaction-chip:hover { background: var(--hover); }
  /* Teams-style tooltip: who reacted, on hover. */
  .reactor-tip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) translateY(3px);
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    max-width: 240px;
    padding: 5px 9px;
    border-radius: 8px;
    background: var(--tooltip-bg, #1f2430);
    color: #fff;
    font-size: 12px;
    line-height: 1.3;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s ease;
    z-index: 40;
  }
  .reaction-chip:hover .reactor-tip { opacity: 1; transform: translateX(-50%) translateY(0); }
  .reactor-tip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--tooltip-bg, #1f2430);
  }
  .reactor-emoji { flex-shrink: 0; }
  .reaction-chip.mine { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--text); }
  .reaction-emoji {
    font-size: 16px;
    line-height: 1;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif;
  }
  .reaction-gif { width: 26px; height: 18px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
  .reactor-gif { width: 22px; height: 16px; object-fit: cover; border-radius: 3px; flex-shrink: 0; }
  .reaction-count { font-weight: 600; }
  .quote {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    text-align: left;
    border: 0;
    border-left: 3px solid var(--accent);
    background: rgba(127, 127, 127, 0.12);
    border-radius: 6px;
    padding: 4px 8px;
    margin-bottom: 4px;
    cursor: pointer;
  }
  .bubble.own .quote { border-left-color: currentColor; background: rgba(255, 255, 255, 0.16); }
  .quote-sender { font-size: 11px; font-weight: 600; color: var(--accent); }
  .bubble.own .quote-sender { color: inherit; }
  .quote-text {
    font-size: 12px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bubble.own .quote-text { color: inherit; opacity: 0.85; }
  .quote-missing { font-style: italic; cursor: default; }
  .bubble {
    max-width: 100%;
    padding: 8px 11px;
    border-radius: 14px;
    background: var(--bubble);
    color: var(--text);
    border-top-left-radius: 4px;
  }
  .bubble.own {
    background: var(--bubble-own);
    color: var(--bubble-own-text);
    border-top-left-radius: 14px;
    border-top-right-radius: 4px;
  }
  .bubble.failed { outline: 1px solid var(--danger); }
  .sender { display: block; font-size: 12px; font-weight: 600; color: var(--accent); margin-bottom: 2px; }
  .text { white-space: pre-wrap; word-break: break-word; }
  .code-block {
    margin: 4px 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(127, 127, 127, 0.16);
    font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
    font-size: 12.5px;
    line-height: 1.45;
    white-space: pre;
    overflow-x: auto;
  }
  .code-block code { font-family: inherit; }
  .mention { color: var(--accent); font-weight: 600; }
  .bubble.own .mention { color: inherit; font-weight: 700; text-decoration: underline; }
  .mention.self {
    background: var(--accent);
    color: var(--accent-contrast);
    border-radius: 4px;
    padding: 0 3px;
    font-weight: 700;
    text-decoration: none;
  }
  .deleted { font-style: italic; color: var(--text-faint); }
  .media-btn {
    border: 0;
    padding: 0;
    background: transparent;
    cursor: zoom-in;
    display: block;
    border-radius: 10px;
    line-height: 0;
  }
  .gif { max-width: 220px; border-radius: 10px; display: block; }
  .yt {
    position: relative;
    width: min(360px, 60vw);
    aspect-ratio: 16 / 9;
    border-radius: 10px;
    overflow: hidden;
    background: #000;
  }
  .yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }

  /* Link-preview (unfurl) card. */
  .link-card {
    display: flex;
    flex-direction: column;
    width: min(320px, 100%);
    margin-top: 6px;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: rgba(127, 127, 127, 0.08);
    text-decoration: none;
    color: inherit;
  }
  .link-card:hover { background: rgba(127, 127, 127, 0.16); }
  .link-img { width: 100%; max-height: 160px; object-fit: cover; display: block; }
  .link-body { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; min-width: 0; }
  .link-site { font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.02em; }
  .link-title { font-size: 13px; font-weight: 600; line-height: 1.3; }
  .link-desc {
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .bubble.own .link-site,
  .bubble.own .link-desc { color: inherit; opacity: 0.8; }

  /* Full-screen image viewer. */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 32px;
  }
  .lightbox-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.8);
    cursor: zoom-out;
  }
  .lightbox-img {
    position: relative;
    z-index: 1;
    max-width: 92vw;
    max-height: 88vh;
    border-radius: 8px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  }
  .lightbox-close {
    position: absolute;
    top: 18px;
    right: 22px;
    z-index: 2;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 16px;
    cursor: pointer;
  }
  .lightbox-close:hover { background: rgba(0, 0, 0, 0.8); }
  .meta {
    display: flex;
    align-items: center;
    gap: 5px;
    justify-content: flex-end;
    margin-top: 3px;
    font-size: 10px;
    opacity: 0.75;
  }
  .pending, .fail { margin-right: auto; }
  .fail { color: var(--danger); }
  .tick.read { color: var(--read); opacity: 1; }
  .seen {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 2px;
    margin-top: 3px;
    padding-right: 2px;
  }
  .seen-avatar {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    font-size: 9px;
    font-weight: 700;
    border: 1px solid var(--surface);
    margin-left: -4px;
  }
  .seen-avatar:first-child { margin-left: 0; }
  .seen-more { font-size: 10px; color: var(--text-faint); margin-left: 2px; }
</style>
