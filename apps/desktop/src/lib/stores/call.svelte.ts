/** UI-facing state for the single active 1:1 call. Media objects (MediaStream,
 * RTCPeerConnection) live in CallManager, not here — they aren't meant to be
 * wrapped in a reactive proxy. */
export type CallPhase =
  | "idle"
  | "ringing-outgoing"
  | "ringing-incoming"
  | "connecting"
  | "connected";

export const call = $state<{
  phase: CallPhase;
  peerUserId: string | null;
  peerName: string;
  muted: boolean;
  screenSharing: boolean;
  /** True once the remote side has sent a video (screen-share) track. */
  remoteHasVideo: boolean;
  error: string | null;
  connectedAt: number | null;
}>({
  phase: "idle",
  peerUserId: null,
  peerName: "",
  muted: false,
  screenSharing: false,
  remoteHasVideo: false,
  error: null,
  connectedAt: null,
});
