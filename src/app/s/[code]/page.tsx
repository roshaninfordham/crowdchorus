import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CopyButton } from "@/components/CopyButton";
import { AnalyticsPanel } from "@/components/results/AnalyticsPanel";
import { Player } from "@/components/results/Player";
import { credits, fallbackLabels } from "@/lib/labels";
import { span } from "@/lib/monitoring";
import { HttpError } from "@/lib/server/http";
import { results } from "@/lib/server/results";
import { roomByCode } from "@/lib/server/rooms";
import { baseUrl } from "@/lib/server/share";

type Props = { params: Promise<{ code: string }> };

const load = cache(async (code: string) => {
  const room = await roomByCode(code).catch((err) => {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  });
  return span("artifact.retrieve", () => results(room));
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).code);
  return { title: `${r.job?.brief?.title ?? "A collective single"} · CrowdChorus` };
}

const seconds = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);

export default async function ResultsPage({ params }: Props) {
  const r = await load((await params).code);
  const job = r.job;
  const shareUrl = `${await baseUrl()}/s/${r.code}`;

  if (!job || job.status !== "completed" || !job.songUrl) {
    return (
      <div className="card mx-auto mt-10 max-w-xl space-y-4 text-center">
        <h1 className="font-display text-4xl">Not ready yet</h1>
        <p className="text-muted">
          {job?.status === "failed"
            ? "Generation for this room failed. The host can retry once from the room."
            : job
              ? "This room's single is still being generated."
              : "This room hasn't closed its round yet."}
        </p>
        <Link href={`/r/${r.code}`} className="btn-primary">
          Go to the room
        </Link>
      </div>
    );
  }

  const title = job.brief?.title ?? "Untitled collective single";
  const labels = fallbackLabels(job.modelMetadata, r.chorusSource);
  const m = r.metrics;
  const metrics: [string, string][] = [
    ["Submitted recordings", String(m.submittedRecordings)],
    ["Successful participants", String(m.successfulParticipants)],
    ["Retries", String(m.retries)],
    ["Generation time", seconds(m.generationMs)],
    ["Contribution latency", seconds(m.contributionLatencyMs)],
  ];

  return (
    <div className="space-y-8 pt-4">
      <section className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="relative">
          <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-accent/20 blur-3xl" />
          {job.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived media URL
            <img
              src={job.coverUrl}
              alt={`Album cover for “${title}”`}
              className="relative aspect-square w-full rounded-2xl border border-line object-cover shadow-2xl"
            />
          ) : (
            <div className="relative aspect-square w-full rounded-2xl border border-line bg-panel" />
          )}
        </div>
        <div className="space-y-5">
          <p className="text-sm font-medium tracking-widest text-accent uppercase">
            A collective single by {m.successfulParticipants} {m.successfulParticipants === 1 ? "voice" : "voices"}
          </p>
          <h1 className="font-display text-5xl leading-tight sm:text-6xl">{title}</h1>
          {job.brief?.chorus_text && <p className="font-display text-2xl text-muted italic">“{job.brief.chorus_text}”</p>}
          <Player src={job.songUrl} title={title} downloadName={`crowdchorus-${r.code}.mp3`} />
          <div className="flex flex-wrap items-center gap-2">
            <code className="truncate rounded-md bg-ink/70 px-2 py-1 text-xs">{shareUrl}</code>
            <CopyButton text={shareUrl} label="Copy share link" />
          </div>
          {labels.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Fallback assets used">
              {labels.map((l) => (
                <li key={l} className="fallback-label">
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card" aria-labelledby="metrics-h">
          <h2 id="metrics-h" className="mb-4 text-lg font-semibold">
            Measured for this room
          </h2>
          <dl className="space-y-2">
            {metrics.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 text-sm">
                <dt className="text-muted">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-5 mb-2 text-sm font-semibold">Made with</h3>
          <ul className="space-y-1 text-sm">
            {credits(job.modelMetadata).map((c) => (
              <li key={c.role} className="flex justify-between gap-3">
                <span className="text-muted">{c.role}</span>
                <span>{c.provider}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="insp-h">
          <h2 id="insp-h" className="mb-4 text-lg font-semibold">
            Inspiration
          </h2>
          {job.sources.length ? (
            <ul className="space-y-4">
              {job.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-medium text-accent-2 underline-offset-4 hover:underline"
                  >
                    {s.title}
                  </a>
                  {s.snippet && <p className="mt-1 text-sm text-muted">{s.snippet}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No inspiration sources for this song.</p>
          )}
        </section>

        <AnalyticsPanel />
      </div>
    </div>
  );
}
