import { CALL, ClientEvents, ServerEvents } from "@office-chat/shared";
import type { WsClient } from "./ws/client";
import { call } from "./stores/call.svelte";
import { userName } from "./stores/directory.svelte";
import { settings } from "./stores/settings.svelte";
import { notifications } from "./notifications";
import { playRing } from "./sounds";
import { bringWindowToFront } from "./window";

// Google's public STUN server is enough for most office networks. A TURN
// server can be added here later if calls fail behind strict NATs/firewalls
// (see README) — the signaling and UI don't need to change either way.
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const RING_INTERVAL_MS = 2500;

/** Holds the current call's remote media so <audio>/<video> elements can bind
 * to it. Not reactive — components re-read `.stream` when `call.phase` changes. */
export const remoteMedia: { stream: MediaStream | null } = { stream: null };

/**
 * Owns the single active 1:1 call: WebRTC signaling relayed over the existing
 * WebSocket connection, the RTCPeerConnection, and local mic/screen-share
 * tracks. Only one call can be active at a time, mirroring the server's
 * busy/peer tracking in CallService.
 */
export class CallManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private ringTimer: ReturnType<typeof setInterval> | null = null;
  private ringOutTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly client: WsClient) {
    client.on(ServerEvents.CallIncoming, (p) => this.onIncoming(p as { fromUserId: string; fromName: string }));
    client.on(ServerEvents.CallAccepted, (p) => void this.onAccepted(p as { fromUserId: string }));
    client.on(ServerEvents.CallRejected, () => this.onRemoteEnd("Call declined"));
    client.on(ServerEvents.CallEnded, () => this.onRemoteEnd("Call ended"));
    client.on(ServerEvents.CallBusy, () => this.onRemoteEnd(`${call.peerName || "They"} are on another call`));
    client.on(ServerEvents.CallUnavailable, () => this.onRemoteEnd(`${call.peerName || "They"} are offline`));
    client.on(ServerEvents.CallOffer, (p) => void this.onOffer(p as { fromUserId: string; sdp: string }));
    client.on(ServerEvents.CallAnswer, (p) => void this.onAnswer(p as { fromUserId: string; sdp: string }));
    client.on(ServerEvents.CallIce, (p) =>
      void this.onIce(p as { fromUserId: string; candidate: RTCIceCandidateInit | null }),
    );
  }

  startCall(toUserId: string): void {
    if (call.phase !== "idle") return;
    call.peerUserId = toUserId;
    call.peerName = userName(toUserId);
    call.phase = "ringing-outgoing";
    call.error = null;
    this.client.send(ClientEvents.CallInvite, { toUserId });
    this.ringOutTimer = setTimeout(() => this.onNoAnswer(), CALL.RINGING_TIMEOUT_MS);
  }

  /** The callee never answered — cancel so neither side stays stuck "busy". */
  private onNoAnswer(): void {
    if (call.phase !== "ringing-outgoing") return;
    if (call.peerUserId) this.client.send(ClientEvents.CallEnd, { toUserId: call.peerUserId });
    this.reset();
    call.error = "No answer";
  }

  private onIncoming(p: { fromUserId: string; fromName: string }): void {
    if (call.phase !== "idle") {
      // Already on a call on this device — decline the second one immediately.
      this.client.send(ClientEvents.CallReject, { toUserId: p.fromUserId });
      return;
    }
    call.peerUserId = p.fromUserId;
    call.peerName = p.fromName;
    call.phase = "ringing-incoming";
    call.error = null;
    this.startRinging();
    // A call is a synchronous interruption — surface the app even if it's
    // minimized/in the tray, so the incoming-call screen is actually seen.
    void bringWindowToFront();
    if (!settings.dnd) {
      void notifications.notify({ title: "Incoming call", body: `${p.fromName} is calling…` });
    }
  }

  async accept(): Promise<void> {
    if (call.phase !== "ringing-incoming" || !call.peerUserId) return;
    this.stopRinging();
    const toUserId = call.peerUserId;
    call.phase = "connecting";
    this.startConnectWatchdog();
    try {
      await this.ensureLocalStream();
    } catch (err) {
      console.error("[call] failed to start local media", err);
      this.hangup();
      return;
    }
    this.client.send(ClientEvents.CallAccept, { toUserId });
  }

  reject(): void {
    if (call.phase !== "ringing-incoming" || !call.peerUserId) return;
    this.stopRinging();
    this.client.send(ClientEvents.CallReject, { toUserId: call.peerUserId });
    this.reset();
  }

  private async onAccepted(p: { fromUserId: string }): Promise<void> {
    if (call.phase !== "ringing-outgoing" || call.peerUserId !== p.fromUserId) return;
    this.clearRingOutTimer();
    call.phase = "connecting";
    this.startConnectWatchdog();
    try {
      await this.ensureLocalStream();
      await this.createOfferAndSend();
    } catch (err) {
      console.error("[call] failed to start/offer", err);
      this.hangup();
    }
  }

  private async ensureLocalStream(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      call.error = "Microphone permission denied";
      throw err;
    }
    this.setupPeerConnection();
  }

  private setupPeerConnection(): void {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    remoteMedia.stream = new MediaStream();

    for (const track of this.localStream!.getTracks()) pc.addTrack(track, this.localStream!);

    pc.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? []) {
        remoteMedia.stream?.addTrack(track);
        if (track.kind === "video") call.remoteHasVideo = true;
      }
    };
    pc.onicecandidate = (event) => {
      if (call.peerUserId) {
        this.client.send(ClientEvents.CallIce, {
          toUserId: call.peerUserId,
          candidate: event.candidate ? event.candidate.toJSON() : null,
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && call.phase === "connecting") {
        this.clearConnectWatchdog();
        call.phase = "connected";
        call.connectedAt = Date.now();
      } else if (pc.connectionState === "failed") {
        console.error("[call] RTCPeerConnection state: failed");
        this.onRemoteEnd("Call failed — check your connection");
      }
    };
  }

  private async createOfferAndSend(): Promise<void> {
    if (!this.pc || !call.peerUserId) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.client.send(ClientEvents.CallOffer, { toUserId: call.peerUserId, sdp: offer.sdp });
  }

  private async onOffer(p: { fromUserId: string; sdp: string }): Promise<void> {
    if (call.peerUserId !== p.fromUserId || !this.pc) return;
    try {
      await this.pc.setRemoteDescription({ type: "offer", sdp: p.sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.client.send(ClientEvents.CallAnswer, { toUserId: p.fromUserId, sdp: answer.sdp });
    } catch (err) {
      console.error("[call] failed to handle offer", err);
      this.onRemoteEnd("Call failed to connect");
    }
  }

  private async onAnswer(p: { fromUserId: string; sdp: string }): Promise<void> {
    if (call.peerUserId !== p.fromUserId || !this.pc) return;
    try {
      await this.pc.setRemoteDescription({ type: "answer", sdp: p.sdp });
    } catch (err) {
      console.error("[call] failed to handle answer", err);
      this.onRemoteEnd("Call failed to connect");
    }
  }

  private async onIce(p: { fromUserId: string; candidate: RTCIceCandidateInit | null }): Promise<void> {
    if (call.peerUserId !== p.fromUserId || !this.pc || !p.candidate) return;
    try {
      await this.pc.addIceCandidate(p.candidate);
    } catch {
      // Candidate arrived after teardown — safe to ignore.
    }
  }

  toggleMute(): void {
    if (!this.localStream) return;
    call.muted = !call.muted;
    for (const track of this.localStream.getAudioTracks()) track.enabled = !call.muted;
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.pc) return;
    if (this.screenTrack) {
      this.stopScreenShare();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      this.screenTrack = track;
      this.pc.addTrack(track, stream);
      call.screenSharing = true;
      // The browser's own "stop sharing" control ends the track directly.
      track.onended = () => this.stopScreenShare();
    } catch {
      // User cancelled the screen picker.
    }
  }

  private stopScreenShare(): void {
    if (!this.screenTrack) return;
    this.screenTrack.stop();
    const sender = this.pc?.getSenders().find((s) => s.track === this.screenTrack);
    if (sender) this.pc?.removeTrack(sender);
    this.screenTrack = null;
    call.screenSharing = false;
  }

  hangup(): void {
    if (call.phase === "idle") return;
    this.stopRinging();
    if (call.peerUserId) this.client.send(ClientEvents.CallEnd, { toUserId: call.peerUserId });
    this.reset();
  }

  private onRemoteEnd(reason: string): void {
    if (call.phase === "idle") return;
    this.stopRinging();
    this.reset();
    call.error = reason;
  }

  private startRinging(): void {
    if (settings.dnd || !settings.soundsEnabled) return;
    playRing();
    this.ringTimer = setInterval(playRing, RING_INTERVAL_MS);
  }

  private stopRinging(): void {
    if (this.ringTimer) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
  }

  private clearRingOutTimer(): void {
    if (this.ringOutTimer) {
      clearTimeout(this.ringOutTimer);
      this.ringOutTimer = null;
    }
  }

  /** Surface a clear error instead of leaving the UI stuck on "Connecting…"
   * forever if WebRTC never reaches "connected" (e.g. no TURN behind a
   * strict NAT, or ICE negotiation silently stalls). */
  private startConnectWatchdog(): void {
    this.connectTimer = setTimeout(() => {
      if (call.phase !== "connecting") return;
      console.error("[call] timed out waiting for the connection to establish");
      this.onRemoteEnd("Call failed to connect");
    }, CALL.CONNECT_TIMEOUT_MS);
  }

  private clearConnectWatchdog(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private reset(): void {
    this.stopRinging();
    this.clearRingOutTimer();
    this.clearConnectWatchdog();
    this.screenTrack?.stop();
    this.screenTrack = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.pc?.close();
    this.pc = null;
    remoteMedia.stream = null;
    call.phase = "idle";
    call.peerUserId = null;
    call.peerName = "";
    call.muted = false;
    call.screenSharing = false;
    call.remoteHasVideo = false;
    call.connectedAt = null;
  }
}
