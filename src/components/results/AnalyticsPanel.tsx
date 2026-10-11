"use client";
import { useEffect, useState } from "react";
import { analyticsSourceLabel } from "@/lib/labels";
import type { Analytics } from "@/lib/server/worker";

export function AnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const rows: [string, string][] = data
    ? [
        ["Completed songs", String(data.completed_songs)],
        ["Avg participants", data.avg_participants == null ? "–" : data.avg_participants.toFixed(1)],
        ["Success rate", data.success_rate == null ? "–" : `${Math.round(data.success_rate * 100)}%`],
        ["Avg generation", data.avg_generation_ms == null ? "–" : `${(data.avg_generation_ms / 1000).toFixed(1)} s`],
      ]
    : [];

  return (
    <section className="card" aria-labelledby="analytics-h" aria-busy={!data && !failed}>
      <h2 id="analytics-h" className="text-lg font-semibold">
        Across all rooms
      </h2>
      {data && <p className="mb-4 text-xs text-muted" data-testid="analytics-source">{analyticsSourceLabel(data.source)}</p>}
      {failed && <p className="text-sm text-muted">Aggregate analytics are unavailable right now.</p>}
      {!data && !failed && <p className="text-sm text-muted">Loading…</p>}
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-ink/60 p-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-mono text-xl">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
