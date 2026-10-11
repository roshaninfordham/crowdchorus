"use client";
import { useEffect, useState } from "react";
import { api, hostKey, sessionKey, useStored } from "@/lib/client";
import type { Snapshot } from "@/lib/server/rooms";

export type RoomState = { snap: Snapshot; me: string | null; isHost: boolean };

/** Initial snapshot (with "who am I"), then live snapshots over SSE. */
export function useRoom(code: string) {
  const session = useStored(sessionKey(code));
  const host = useStored(hostKey(code));
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    api<Snapshot & { me: string | null; isHost: boolean }>(`/api/rooms/${code}`, { code })
      .then(({ me, isHost, ...snap }) => alive && setState({ snap, me, isHost }))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [code, session, host]);

  const me = state?.me ?? null;
  useEffect(() => {
    const es = new EventSource(`/api/rooms/${code}/events${me ? `?p=${me}` : ""}`);
    es.addEventListener("snapshot", (e) => {
      const snap = JSON.parse((e as MessageEvent).data) as Snapshot;
      setState((s) => (s ? { ...s, snap } : s));
    });
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [code, me]);

  return { state, error, live };
}
