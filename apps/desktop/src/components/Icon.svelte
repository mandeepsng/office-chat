<script lang="ts">
  export type IconName =
    | "smile"
    | "reply"
    | "more"
    | "copy"
    | "edit"
    | "trash"
    | "pin"
    | "mic"
    | "image"
    | "send"
    | "play"
    | "pause"
    | "search"
    | "close"
    | "chevronDown"
    | "square"
    | "phone"
    | "phoneOff"
    | "screenShare"
    | "micOff";

  interface Props {
    name: IconName;
    size?: number;
  }
  let { name, size = 18 }: Props = $props();
</script>

<!--
  A small, hand-drawn icon set in the Material/Feather "outlined" visual
  language (stroke-based, rounded caps) — Google Chat uses this style for its
  message-hover toolbar (reply, react, more) instead of emoji glyphs.
-->
<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === "smile"}
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9.5" x2="9.01" y2="9.5" />
    <line x1="15" y1="9.5" x2="15.01" y2="9.5" />
  {:else if name === "reply"}
    <path d="M9 10 4 15l5 5" />
    <path d="M4 15h9a7 7 0 0 0 7-7v-2" />
  {:else if name === "more"}
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  {:else if name === "copy"}
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  {:else if name === "edit"}
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  {:else if name === "trash"}
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  {:else if name === "pin"}
    <path d="M21 10c0 6.5-9 12-9 12s-9-5.5-9-12a9 9 0 1 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  {:else if name === "mic"}
    <path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <path d="M12 18v4" />
    <path d="M8 22h8" />
  {:else if name === "image"}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  {:else if name === "send"}
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  {:else if name === "play"}
    <path d="M7 4v16l14-8L7 4z" fill="currentColor" stroke="none" />
  {:else if name === "pause"}
    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
  {:else if name === "search"}
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  {:else if name === "close"}
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  {:else if name === "chevronDown"}
    <path d="M6 9l6 6 6-6" />
  {:else if name === "square"}
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  {:else if name === "phone"}
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" />
  {:else if name === "phoneOff"}
    <path d="M10.7 5.2A2 2 0 0 1 12 4.6l.1.03a2 2 0 0 1 1.4 1.37c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L12.4 12l.2.2M17 15.5c.6.2 1.2.35 1.9.45a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.9 19.9 0 0 1-3.4-2.8M8 9.7a19.5 19.5 0 0 0 2.4 2.9" />
    <line x1="2" y1="2" x2="22" y2="22" />
  {:else if name === "screenShare"}
    <rect x="2" y="4" width="20" height="14" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M12 8v5" />
    <path d="M9.5 10.5 12 8l2.5 2.5" />
  {:else if name === "micOff"}
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M9 9v2a3 3 0 0 0 4.24 2.73" />
    <path d="M15 6.5V4a3 3 0 0 0-5.94-.6" />
    <path d="M19 10v1a7 7 0 0 1-9.8 6.4" />
    <path d="M5 10v1a7 7 0 0 0 .34 2.16" />
    <path d="M12 18v4" />
    <path d="M8 22h8" />
  {/if}
</svg>
