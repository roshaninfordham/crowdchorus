"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { Snapshot } from "@/lib/server/rooms";
import { STEPS, stepStates } from "@/lib/steps";

const ICON = { done: "✓", active: "", failed: "!", todo: "" };

export function GenerationView({ code, job, isHost }: { code: string; job: NonNullable<Snapshot["job"]>; isHost: boolean }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const states = stepStates(job.status, job.durationsMs);
  const current = STEPS[states.findIndex((s) => s === "active" || s === "failed")];

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      await api(`/api/rooms/${code}/retry`, { method: "POST", code });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section className="card grid gap-6 md:grid-cols-[1fr_16rem]" aria-labelledby="gen-h">
      <div>
        <h2 id="gen-h" className="mb-1 text-lg font-semibold">
          {job.status === "completed" ? "Your collective single is ready" : "Generating the collective single"}
        </h2>
        <p className="mb-5 text-sm text-muted" aria-live="polite">
          {job.status === "completed"
            ? "All steps finished."
            : job.status === "failed"
              ? `Stopped at: ${current}.`
              : `Now: ${current}…`}
        </p>
        <ol className="space-y-2.5">
          {STEPS.map((label, i) => {
            const s = states[i];
            return (
              <li key={label} className="flex items-center gap-3" data-state={s}>
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    s === "done"
                      ? "border-cool bg-cool text-ink"
                      : s === "active"
                        ? "animate-pulse border-accent text-accent"
                        : s === "failed"
                          ? "border-danger bg-danger text-ink"
                          : "border-line text-muted"
                  }`}
                  aria-hidden
                >
                  {ICON[s] || i + 1}
                </span>
                <span className={s === "todo" ? "text-muted" : ""}>
                  {label}
                  <span className="sr-only"> ({s === "todo" ? "not started" : s})</span>
                </span>
              </li>
            );
          })}
        </ol>
        {job.status === "failed" && (
          <div className="mt-5 space-y-3 rounded-xl border border-danger/40 bg-danger/10 p-4" role="alert">
            <p className="text-sm">
              Generation failed{job.errorCode ? ` (${job.errorCode})` : ""}. Your recordings are safe.
            </p>
            {isHost && job.attempt < 2 && (
              <button type="button" className="btn-primary" onClick={retry} disabled={retrying}>
                {retrying ? "Retrying…" : "Retry generation"}
              </button>
            )}
            {isHost && job.attempt >= 2 && <p className="text-sm text-muted">The one retry has been used.</p>}
            {!isHost && <p className="text-sm text-muted">The host can retry once.</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
        {job.status === "completed" && (
          <Link href={`/s/${code}`} className="btn-primary mt-6">
            Open the reveal →
          </Link>
        )}
      </div>
      <div className="aspect-square w-full overflow-hidden rounded-xl border border-line bg-ink/60">
        {job.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived media URL
          <img src={job.coverUrl} alt="Album cover for this room" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted">
            The cover appears here as soon as it exists.
          </div>
        )}
      </div>
    </section>
  );
}
