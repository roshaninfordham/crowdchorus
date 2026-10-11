"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ParticipantForm, type ParticipantInput } from "@/components/ParticipantForm";
import { api, hostKey, jsonBody, sessionKey, store } from "@/lib/client";

export function LandingActions() {
  const router = useRouter();
  const [code, setCode] = useState("");

  async function create(input: ParticipantInput) {
    const r = await api<{ code: string; hostToken: string; sessionToken: string }>("/api/rooms", jsonBody(input));
    store(hostKey(r.code), r.hostToken);
    store(sessionKey(r.code), r.sessionToken);
    router.push(`/r/${r.code}`);
  }

  const cleanCode = code.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);

  return (
    <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
      <section className="card" aria-labelledby="create-h">
        <h2 id="create-h" className="mb-1 text-lg font-semibold">
          Create a room
        </h2>
        <p className="mb-5 text-sm text-muted">You host. Share the code, everyone sings, you close the round.</p>
        <ParticipantForm submitLabel="Create room" onSubmit={create} />
      </section>
      <section className="card h-fit" aria-labelledby="join-h">
        <h2 id="join-h" className="mb-1 text-lg font-semibold">
          Join a room
        </h2>
        <p className="mb-5 text-sm text-muted">Got a 6-character code from the host?</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (cleanCode.length === 6) router.push(`/r/${cleanCode}`);
          }}
          className="space-y-4"
        >
          <label htmlFor="join-code" className="label">
            Room code
          </label>
          <input
            id="join-code"
            className="field text-center font-mono text-2xl tracking-[0.4em] uppercase"
            value={cleanCode}
            onChange={(e) => setCode(e.target.value)}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABC234"
            aria-describedby="join-code-hint"
          />
          <p id="join-code-hint" className="text-xs text-muted">
            Letters A–Z and digits 2–9.
          </p>
          <button type="submit" className="btn-ghost w-full" disabled={cleanCode.length !== 6}>
            Join room
          </button>
        </form>
      </section>
    </div>
  );
}
