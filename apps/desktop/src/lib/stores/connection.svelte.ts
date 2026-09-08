import type { ConnectionStatus } from "@office-chat/shared";

export const connection = $state<{ status: ConnectionStatus }>({
  status: "offline",
});

export const statusLabel: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  offline: "Reconnecting…",
  error: "Offline",
};
