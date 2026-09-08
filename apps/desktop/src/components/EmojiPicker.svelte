<script lang="ts">
  import { onMount } from "svelte";
  // Registers the <emoji-picker> custom element (open-source, framework-agnostic).
  import "emoji-picker-element";
  import { theme } from "../lib/stores/theme.svelte";

  interface Props {
    onpick: (emoji: string) => void;
    onclose: () => void;
  }
  let { onpick, onclose }: Props = $props();
  let host = $state<HTMLElement>();

  onMount(() => {
    const el = host?.querySelector("emoji-picker");
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ unicode?: string }>).detail;
      if (detail?.unicode) onpick(detail.unicode);
    };
    el?.addEventListener("emoji-click", handler as EventListener);
    return () => el?.removeEventListener("emoji-click", handler as EventListener);
  });
</script>

<div class="popover" bind:this={host} role="dialog" aria-label="Emoji picker">
  <button class="backdrop" aria-label="Close emoji picker" onclick={onclose}></button>
  <emoji-picker class={theme.value}></emoji-picker>
</div>

<style>
  .popover { position: relative; }
  .backdrop { position: fixed; inset: 0; z-index: 1; border: 0; padding: 0; background: transparent; cursor: default; }
  emoji-picker {
    position: absolute;
    bottom: 8px;
    left: 0;
    z-index: 2;
    --background: var(--surface);
    --border-color: var(--border);
    height: 340px;
  }
</style>
