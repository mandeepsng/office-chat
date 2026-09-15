//! Lightweight in-app message sounds, synthesized with the Web Audio API so we
//! don't have to ship or decode any audio files. These play only inside the app
//! (e.g. when the chat is already open); background message sounds come from the
//! native OS toast instead (see `notify.rs`).

let ctx: AudioContext | null = null;

/** Lazily create the shared AudioContext, resuming it if the browser suspended it. */
function audioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Play a short pitched blip.
 * @param from  start frequency (Hz)
 * @param to    end frequency (Hz) — sweeps up or down
 * @param peak  peak gain (0–1)
 * @param dur   duration in seconds
 */
function blip(from: number, to: number, peak: number, dur: number): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + dur);

  // Fast attack, exponential decay — reads as a soft "pop" rather than a beep.
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Soft downward pop for an incoming message while the chat is focused. */
export function playIncoming(): void {
  blip(660, 440, 0.18, 0.18);
}

/** Subtle upward blip ("whoosh") for a message you just sent. */
export function playSend(): void {
  blip(320, 560, 0.1, 0.14);
}
