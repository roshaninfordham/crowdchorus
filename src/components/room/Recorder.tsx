"use client";
import { useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/client";
import { BEAT_SECONDS, MUSIC } from "@/lib/music";
import { micErrorMessage, pickMimeType, playCountIn, playMotif } from "./audio";

type Phase = "idle" | "arming" | "countin" | "recording" | "recorded" | "submitting";
type Take = { blob: Blob; url: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pitch guide, count-in, record, preview, consent, submit / retry / withdraw. */
export function Recorder({ code, submitted }: { code: string; submitted: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [beat, setBeat] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [guidePlaying, setGuidePlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const takeUrl = useRef<string | null>(null);

  // Never keep the mic open in the background: release it when leaving the page.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
      void ctxRef.current?.close();
    },
    [],
  );

  const audioCtx = async () => {
    const ctx = (ctxRef.current ??= new AudioContext());
    await ctx.resume();
    return ctx;
  };

  async function guide() {
    const ctx = await audioCtx();
    setGuidePlaying(true);
    setStatus("Playing the pitch guide.");
    await sleep(playMotif(ctx) * 1000);
    setGuidePlaying(false);
  }

  function drawWaveform(analyser: AnalyserNode, until: number) {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const data = new Uint8Array(analyser.fftSize);
    const frame = () => {
      analyser.getByteTimeDomainData(data);
      const { width: w, height: h } = canvas;
      g.clearRect(0, 0, w, h);
      let sum = 0;
      g.beginPath();
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
        const x = (i / (data.length - 1)) * w;
        const y = h / 2 + v * (h / 2) * 0.95;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.strokeStyle = "#ff8a5b";
      g.lineWidth = 2;
      g.stroke();
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
      g.fillStyle = "#7be0d0";
      g.fillRect(0, h - 4, w * level, 4);
      if (performance.now() < until) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  async function record() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(
        window.isSecureContext
          ? "This browser can't record audio. Try a recent Chrome, Safari or Firefox."
          : "Browsers only allow the microphone on secure pages. Ask the host for the https:// link (rake dev HTTPS=1).",
      );
      return;
    }
    setPhase("arming");
    setStatus("Asking for microphone access.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setError(micErrorMessage(err));
      setPhase(take ? "recorded" : "idle");
      return;
    }
    streamRef.current = stream;
    const ctx = await audioCtx();

    setPhase("countin");
    setStatus("Count-in: 1, 2, 3, 4.");
    const lead = 0.1;
    playCountIn(ctx, ctx.currentTime + lead);
    for (let i = 0; i < MUSIC.count_in_beats; i++) {
      setTimeout(() => setBeat(i + 1), (lead + i * BEAT_SECONDS) * 1000);
    }
    await sleep((lead + MUSIC.count_in_beats * BEAT_SECONDS) * 1000);

    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    setPhase("recording");
    setStatus(`Recording for ${MUSIC.record_seconds} seconds. Sing now.`);
    rec.start();
    drawWaveform(analyser, performance.now() + MUSIC.record_seconds * 1000);
    await sleep(MUSIC.record_seconds * 1000);
    rec.stop();
    await stopped;
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    const blob = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });
    takeUrl.current = URL.createObjectURL(blob);
    setTake({ blob, url: takeUrl.current });
    setBeat(0);
    setConsent(false);
    setPhase("recorded");
    setStatus("Recording finished. Listen back, then confirm and submit.");
  }

  async function submit() {
    if (!take || !consent) return;
    setPhase("submitting");
    setError(null);
    setStatus("Uploading your take.");
    const form = new FormData();
    const ext = take.blob.type.includes("mp4") ? "m4a" : take.blob.type.includes("ogg") ? "ogg" : "webm";
    form.set("audio", take.blob, `take.${ext}`);
    form.set("consent", "true");
    try {
      const res = await fetch(`/api/rooms/${code}/recordings`, { method: "POST", headers: authHeaders(code), body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Upload failed. Please try again.");
      setTake(null);
      setPhase("idle");
      setStatus("Submitted. Your voice is in the mix.");
    } catch (err) {
      setPhase("recorded");
      setError((err as Error).message);
    }
  }

  async function withdraw() {
    setError(null);
    const res = await fetch(`/api/rooms/${code}/recordings`, { method: "DELETE", headers: authHeaders(code) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "Could not withdraw.");
    else setStatus("Your recording was withdrawn and deleted.");
  }

  const busy = phase === "arming" || phase === "countin" || phase === "recording" || phase === "submitting";

  return (
    <section className="card space-y-5" aria-labelledby="rec-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="rec-h" className="text-lg font-semibold">
          Your take
        </h2>
        {submitted && phase !== "recorded" && (
          <span className="badge bg-cool/15 text-cool">✓ Submitted</span>
        )}
      </div>

      <p className="text-sm text-muted">
        Listen to the pitch guide, then press record. After a 4-beat count-in you have {MUSIC.record_seconds} seconds.
        Sing the line, hum, or improvise, as long as it&apos;s original.
      </p>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-ghost" onClick={guide} disabled={guidePlaying || busy}>
          ♪ {guidePlaying ? "Playing…" : "Play pitch guide"}
        </button>
        <button type="button" className="btn-primary" onClick={record} disabled={busy || guidePlaying}>
          ● {take || submitted ? "Record again" : "Record"}
        </button>
        {submitted && phase === "idle" && (
          <button type="button" className="btn-danger" onClick={withdraw}>
            Withdraw my recording
          </button>
        )}
      </div>

      {(phase === "countin" || phase === "recording") && (
        <div className="space-y-3">
          <div className="flex items-center gap-3" aria-hidden>
            {Array.from({ length: MUSIC.count_in_beats }, (_, i) => (
              <span
                key={i}
                className={`flex size-10 items-center justify-center rounded-full border font-mono text-lg transition ${
                  beat > i ? "border-accent bg-accent text-ink" : "border-line text-muted"
                }`}
              >
                {i + 1}
              </span>
            ))}
            {phase === "recording" && (
              <span className="ml-2 flex items-center gap-2 text-sm font-semibold text-danger">
                <span className="size-2.5 animate-pulse rounded-full bg-danger" /> Recording
              </span>
            )}
          </div>
          <canvas
            ref={canvasRef}
            width={640}
            height={96}
            className="h-24 w-full rounded-xl border border-line bg-ink/70"
            aria-label="Live microphone waveform"
            role="img"
          />
          {phase === "recording" && (
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full origin-left bg-accent"
                style={{ animation: `cc-progress ${MUSIC.record_seconds}s linear forwards` }}
              />
            </div>
          )}
        </div>
      )}

      {take && (phase === "recorded" || phase === "submitting") && (
        <div className="space-y-4 rounded-xl border border-line bg-ink/50 p-4">
          <div>
            <p className="label">Preview your take</p>
            <audio controls src={take.url} className="w-full" />
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 accent-accent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I understand my voice will be mixed into a shared recording; I sang original material or the shown line.
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={submit} disabled={!consent || phase === "submitting"}>
              {phase === "submitting" ? "Submitting…" : submitted ? "Replace my recording" : "Submit recording"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setTake(null);
                setPhase("idle");
              }}
              disabled={phase === "submitting"}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="min-h-5 text-sm text-muted" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
