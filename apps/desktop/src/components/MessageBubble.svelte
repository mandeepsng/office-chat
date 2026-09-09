<script lang="ts">
  import type { User } from "@office-chat/shared";
  import type { ChatMessage } from "../lib/types";

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

<div class="message" class:own>
  <div class="bubble" class:own class:failed={message.status === "failed"}>
    {#if showSender && !own}
      <span class="sender">{senderName}</span>
    {/if}

    {#if message.deletedAt}
      <span class="deleted">Message deleted</span>
    {:else if message.messageType === "gif"}
      <img class="gif" src={message.content} alt="GIF" loading="lazy" />
    {:else}
      <span class="text">{message.content}</span>
    {/if}

    <span class="meta">
      {#if message.status === "pending"}<span class="pending">Sending…</span>{/if}
      {#if message.status === "failed"}<span class="fail">Failed</span>{/if}
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
  .message { display: flex; flex-direction: column; align-items: flex-start; margin: 3px 0; }
  .message.own { align-items: flex-end; }
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
