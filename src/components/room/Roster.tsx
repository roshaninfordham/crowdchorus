import type { Snapshot } from "@/lib/server/rooms";

export function Roster({ snap, me }: { snap: Snapshot; me: string | null }) {
  const total = snap.participants.length;
  return (
    <section className="card" aria-labelledby="roster-h">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="roster-h" className="text-lg font-semibold">
          Roster
        </h2>
        <p className="text-sm text-muted" aria-live="polite" data-testid="submitted-count">
          <span className="font-mono text-xl text-fg">{snap.submittedCount}</span> of {total} submitted
        </p>
      </div>
      <ul className="divide-y divide-line">
        {snap.participants.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <span
              className={`size-2.5 shrink-0 rounded-full ${p.online ? "bg-cool" : "bg-line"}`}
              title={p.online ? "Online" : "Offline"}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">
              {p.nickname}
              {p.id === me && <span className="text-muted"> (you)</span>}
              <span className="sr-only">{p.online ? ", online" : ", offline"}</span>
            </span>
            {p.isHost && <span className="badge bg-accent-2/15 text-accent-2">Host</span>}
            {p.isSimulated && <span className="badge bg-panel-2 text-muted ring-1 ring-line">Simulated</span>}
            {p.submitted ? (
              <span className="badge bg-cool/15 text-cool">✓ Submitted</span>
            ) : (
              <span className="badge text-muted">Waiting</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
