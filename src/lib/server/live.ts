import { Client } from "pg";
import { DATABASE_URL } from "./db";

// ponytail: presence and fan-out live in this process's memory. Several web
// processes would each see only their own connections; move presence to
// Postgres if the web tier is ever scaled out.
type Send = () => void;
type Hub = {
  subs: Map<string, Set<Send>>;
  presence: Map<string, Map<string, number>>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  client: Client | null;
  connecting: boolean;
};
const g = globalThis as typeof globalThis & { __ccHub?: Hub };
const hub = (g.__ccHub ??= { subs: new Map(), presence: new Map(), timers: new Map(), client: null, connecting: false });

export function onlineIds(roomId: string): Set<string> {
  return new Set(hub.presence.get(roomId)?.keys() ?? []);
}

/** Coalesce bursts of notifications into one push per room. */
export function touch(roomId: string) {
  if (!hub.subs.has(roomId) || hub.timers.has(roomId)) return;
  hub.timers.set(
    roomId,
    setTimeout(() => {
      hub.timers.delete(roomId);
      hub.subs.get(roomId)?.forEach((send: Send) => send());
    }, 80),
  );
}

/** One shared LISTEN connection for the whole process; reconnects on error. */
async function ensureListener() {
  if (hub.client || hub.connecting) return;
  hub.connecting = true;
  const client = new Client({ connectionString: DATABASE_URL });
  const drop = () => {
    if (hub.client !== client) return;
    hub.client = null;
    client.end().catch(() => {});
    if (hub.subs.size) setTimeout(ensureListener, 1000);
  };
  client.on("error", drop);
  client.on("end", drop);
  client.on("notification", (msg) => msg.payload && touch(msg.payload));
  try {
    await client.connect();
    await client.query("LISTEN room_changed");
    hub.client = client;
    // anything that changed while we were disconnected
    hub.subs.forEach((_, roomId) => touch(roomId));
  } catch (err) {
    console.error("room_changed listener failed, retrying", err);
    client.end().catch(() => {});
    setTimeout(ensureListener, 2000);
  } finally {
    hub.connecting = false;
  }
}

/** Subscribe a stream to a room; `participantId` (if any) shows as online while connected. */
export function subscribe(roomId: string, participantId: string | null, send: Send): () => void {
  void ensureListener();
  const set = hub.subs.get(roomId) ?? new Set();
  set.add(send);
  hub.subs.set(roomId, set);
  const present = hub.presence.get(roomId) ?? new Map<string, number>();
  if (participantId) present.set(participantId, (present.get(participantId) ?? 0) + 1);
  hub.presence.set(roomId, present);
  touch(roomId);

  return () => {
    set.delete(send);
    if (!set.size) hub.subs.delete(roomId);
    if (participantId) {
      const n = (present.get(participantId) ?? 1) - 1;
      if (n > 0) present.set(participantId, n);
      else present.delete(participantId);
    }
    if (!present.size) hub.presence.delete(roomId);
    touch(roomId);
  };
}
