// Small WebAudio helpers for the pitch guide and the count-in click.
import { BEAT_SECONDS, MUSIC } from "@/lib/music";

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function tone(ctx: AudioContext, hz: number, at: number, dur: number, vol: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(vol, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Play the shared motif, one note per beat at the shared BPM. Returns its length in seconds. */
export function playMotif(ctx: AudioContext): number {
  const t0 = ctx.currentTime + 0.05;
  MUSIC.motif_midi.forEach((m, i) => tone(ctx, midiHz(m), t0 + i * BEAT_SECONDS, BEAT_SECONDS * 0.9, 0.2, "triangle"));
  return MUSIC.motif_midi.length * BEAT_SECONDS + 0.05;
}

/** Schedule the count-in clicks (accent on beat 1). */
export function playCountIn(ctx: AudioContext, startAt: number) {
  for (let i = 0; i < MUSIC.count_in_beats; i++) {
    tone(ctx, i === 0 ? 1568 : 1046, startAt + i * BEAT_SECONDS, 0.06, 0.25, "square");
  }
}

/** First MediaRecorder format this browser supports, or "" to let it choose. */
export function pickMimeType(): string {
  const options = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") {
    return "No working microphone was found. Connect one (or close apps using it) and try again.";
  }
  return "We couldn't start your microphone. Please try again.";
}
