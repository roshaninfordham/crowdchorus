"use client";
import { ParticipantForm, type ParticipantInput } from "@/components/ParticipantForm";
import { api, jsonBody, sessionKey, store } from "@/lib/client";
import { GenerationView } from "./GenerationView";
import { HostPanel } from "./HostPanel";
import { Recorder } from "./Recorder";
import { Roster } from "./Roster";
import { useRoom } from "./useRoom";

export function RoomClient({ code, shareUrl, qrSvg }: { code: string; shareUrl: string; qrSvg: string }) {
  const { state, error, live } = useRoom(code);

  if (error) return <p role="alert" className="card text-danger">{error}</p>;
  if (!state) return <p className="card text-muted" aria-busy="true">Loading the room…</p>;

  const { snap, me, isHost } = state;
  const collecting = snap.status === "collecting";
  const mine = snap.participants.find((p) => p.id === me);

  async function join(input: ParticipantInput) {
    const r = await api<{ sessionToken: string | null }>(`/api/rooms/${code}/join`, { ...jsonBody(input), code });
    if (r.sessionToken) store(sessionKey(code), r.sessionToken);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Room</p>
          <h1 className="font-mono text-4xl tracking-[0.25em]">{snap.code}</h1>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className={`size-2 rounded-full ${live ? "bg-cool" : "bg-line"}`} aria-hidden />
          {live ? "Live" : "Reconnecting…"}
        </p>
      </div>

      <section className="card" aria-labelledby="line-h">
        <h2 id="line-h" className="mb-3 text-sm font-medium tracking-widest text-muted uppercase">
          The line everyone sings
        </h2>
        <p className="font-display text-3xl leading-snug italic sm:text-4xl">“{snap.chorusLine}”</p>
        {snap.chorusSource === "template" && (
          <p className="fallback-label mt-4">Template chorus line: no text model configured</p>
        )}
      </section>

      {snap.job && <GenerationView code={code} job={snap.job} isHost={isHost} />}

      <div className={collecting ? "grid gap-6 lg:grid-cols-[1.3fr_1fr]" : "space-y-6"}>
        <div className="space-y-6">
          {collecting && !me && (
            <section className="card" aria-labelledby="join-h">
              <h2 id="join-h" className="mb-4 text-lg font-semibold">
                Join this room
              </h2>
              <ParticipantForm submitLabel="Join room" onSubmit={join} />
            </section>
          )}
          {collecting && me && <Recorder code={code} submitted={!!mine?.submitted} />}
          {!collecting && !snap.job && <p className="card text-muted">This room is closed.</p>}
          {isHost && collecting && (
            <HostPanel code={code} shareUrl={shareUrl} qrSvg={qrSvg} submittedCount={snap.submittedCount} />
          )}
        </div>
        <Roster snap={snap} me={me} />
      </div>
    </div>
  );
}
