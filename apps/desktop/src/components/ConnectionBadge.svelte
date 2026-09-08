<script lang="ts">
  import { connection, statusLabel } from "../lib/stores/connection.svelte";
</script>

<span class="badge {connection.status}">
  <span class="dot"></span>
  {statusLabel[connection.status]}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); }
  .connected .dot { background: var(--online); }
  .connecting .dot { background: var(--warn); }
  .offline .dot, .error .dot { background: var(--danger); }
</style>
