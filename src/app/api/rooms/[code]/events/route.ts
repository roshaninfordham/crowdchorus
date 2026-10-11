import { route } from "@/lib/server/http";
import { subscribe } from "@/lib/server/live";
import { roomByCode, snapshotById } from "@/lib/server/rooms";
import { uuid } from "@/lib/server/schemas";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Server-sent events: a fresh snapshot whenever Postgres announces the room on
 * `room_changed` (or presence changes), plus a heartbeat comment every 15 s.
 * `?p=<participant id>` marks that participant online while the stream is open.
 */
export const GET = route(null, async (req, { params }: Ctx) => {
  const room = await roomByCode((await params).code);
  const first = await snapshotById(room.id);
  const p = new URL(req.url).searchParams.get("p");
  const participantId =
    p && uuid.safeParse(p).success && first?.participants.some((x) => x.id === p) ? p : null;

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      let sending = false;
      let again = false;
      const push = async () => {
        if (sending) return void (again = true);
        sending = true;
        try {
          do {
            again = false;
            const snap = await snapshotById(room.id);
            if (snap) write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
          } while (again);
        } catch (err) {
          console.error("snapshot push failed", err);
        } finally {
          sending = false;
        }
      };
      write("retry: 3000\n\n");
      const unsubscribe = subscribe(room.id, participantId, () => void push());
      const heartbeat = setInterval(() => write(": hb\n\n"), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
