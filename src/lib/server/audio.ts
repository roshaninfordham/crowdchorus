import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const DSP_BIN = process.env.CHORUS_DSP_BIN ?? path.join(process.cwd(), "dsp/target/release/chorus-dsp");

export async function run(cmd: string, args: string[], timeoutMs = 20_000): Promise<string> {
  const { stdout } = await execFileP(cmd, args, { timeout: timeoutMs, maxBuffer: 1 << 20 });
  return stdout;
}

/** ffprobe: does the file hold an audio stream, and how long is it (null if unknown)? */
export async function probe(file: string): Promise<{ hasAudio: boolean; duration: number | null }> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type",
    "-of", "json",
    file,
  ]);
  const info = JSON.parse(out) as { streams?: { codec_type?: string }[]; format?: { duration?: string } };
  const duration = Number(info.format?.duration);
  return {
    hasAudio: (info.streams ?? []).some((s) => s.codec_type === "audio"),
    duration: Number.isFinite(duration) ? duration : null,
  };
}

/** Decode anything ffmpeg reads to the contract's 44.1 kHz mono s16 WAV. */
export async function toWav(input: string, output: string): Promise<void> {
  await run("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", output]);
}

export type Analysis = {
  duration_s: number;
  rms_db: number;
  peak: number;
  onset_s: number | null;
  median_pitch_hz: number | null;
  voiced_ratio: number;
};

export async function analyze(wav: string): Promise<Analysis> {
  return JSON.parse(await run(DSP_BIN, ["analyze", wav])) as Analysis;
}

/** A clip the mixer would treat as silent. Mirrors chorus-dsp's own onset gate. */
export function isNearSilent(a: Analysis): boolean {
  return a.onset_s === null || a.peak < 0.01;
}

export async function synthVoice(n: number, out: string): Promise<void> {
  await run(DSP_BIN, ["voice", String(n), out]);
}
