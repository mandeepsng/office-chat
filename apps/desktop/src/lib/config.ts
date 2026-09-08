import type { Platform } from "@office-chat/shared";

export const config = {
  wsUrl: import.meta.env.VITE_WS_URL ?? "ws://localhost:8787",
  giphyApiKey: import.meta.env.VITE_GIPHY_API_KEY ?? "",
};

/** Best-effort platform detection for the device record. */
export function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}
