import type { Platform } from "@office-chat/shared";

/** HTTP base for uploads/file serving, derived from the WS URL unless overridden. */
function toHttpUrl(ws: string): string {
  return ws.replace(/^ws(s?):\/\//, "http$1://").replace(/\/+$/, "");
}

const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:8787";

export const config = {
  wsUrl,
  httpUrl: import.meta.env.VITE_HTTP_URL ?? toHttpUrl(wsUrl),
  giphyApiKey: import.meta.env.VITE_GIPHY_API_KEY ?? "",
};

/** Best-effort platform detection for the device record. */
export function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}
