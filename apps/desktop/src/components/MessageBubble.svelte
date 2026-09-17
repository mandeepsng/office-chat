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

  const parts = $derived(
    mentionParts(message.content, message.mentions ?? [], auth.identity?.userId ?? null),
  );

  // Only your own, non-deleted text messages can be edited.
  const editable = $derived(own && message.messageType === "text" && !message.deletedAt);
  // Any of your own, non-deleted messages can be deleted.
  const deletable = $derived(own && !message.deletedAt);

  // Any non-deleted text message can be copied (yours or others').
  const copyable = $derived(message.messageType === "text" && !message.deletedAt);

  let confirmingDelete = $state(false);
  let copied = $state(false);

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
  {#if !message.deletedAt}
    <div class="actions">
      {#if confirmingDelete}
        <button class="act-btn danger" aria-label="Confirm delete" title="Delete" onclick={confirmDelete}>✓</button>
        <button class="act-btn" aria-label="Cancel delete" title="Cancel" onclick={() => (confirmingDelete = false)}>✕</button>
      {:else}
        {#if copyable}
          <button class="act-btn" aria-label="Copy" title={copied ? "Copied!" : "Copy"} onclick={copyText}>{copied ? "✓" : "⧉"}</button>
        {/if}
        {#if editable}
          <button class="act-btn" aria-label="Edit" title="Edit" onclick={() => setEditTarget(message)}>✏️</button>
        {/if}
        <button class="act-btn" aria-label="Reply" title="Reply" onclick={() => setReplyTarget(message)}>↩</button>
        {#if deletable}
          <button class="act-btn" aria-label="Delete" title="Delete" onclick={() => (confirmingDelete = true)}>🗑️</button>
        {/if}
      {/if}
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
      <img class="gif" src={message.content} alt="GIF" loading="lazy" />
    {:else if message.messageType === "image"}
      <a href={message.content} target="_blank" rel="noreferrer">
        <img class="gif" src={message.content} alt="Shared attachment" loading="lazy" />
      </a>
    {:else}
      <span class="text">{#each parts as part}{#if part.mention}<span
            class="mention"
            class:self={part.self}>{part.text}</span>{:else}{part.text}{/if}{/each}</span>
    {/if}

    <span class="meta">
      {#if message.status === "pending"}<span class="pending">Sending…</span>{/if}
      {#if message.status === "failed"}<span class="fail">Failed</span>{/if}
      {#if message.updatedAt && !message.deletedAt}<span class="edited">edited</span>{/if}
      <time>{time}</time>
      {#if own && tick}<span class="tick" class:read={message.status === "read"}>{tick}</span>{/if}
    </span>
  </div>

  {#if own && seenBy.length > 0}
    <div class="seen" aria-label={`Seen by ${seenBy.map((u) => u.name).join(", ")}`}>
      {#each shownReaders as reader (reader.id)}
        <span class="seen-avatar" title={reader.name}>{reader.name.charAt(0).toUpperCase()}</span>
      {/each}
      {#if extraReaders > 0}<span class="seen-more">+{extraReaders}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .message { display: flex; flex-direction: column; align-items: flex-start; margin: 3px 0; position: relative; }
  .message.own { align-items: flex-end; }
  :global(.message.flash) { animation: flashPulse 1.2s ease; border-radius: 8px; }
  @keyframes flashPulse {
    0%, 100% { background: transparent; }
    30% { background: var(--hover); }
  }
  .actions {
    position: absolute;
    top: 2px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.12s ease;
    z-index: 2;
  }
  .message:not(.own) .actions { right: 6px; }
  .message.own .actions { left: 6px; }
  .message:hover .actions { opacity: 1; }
  .act-btn {
    width: 26px;
    height: 26px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }
  .act-btn:hover { background: var(--hover); }
  .act-btn.danger { color: var(--danger); border-color: var(--danger); }
  .edited { font-style: italic; opacity: 0.7; }
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
    max-width: 66%;
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
  .gif { max-width: 220px; border-radius: 10px; display: block; }
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
