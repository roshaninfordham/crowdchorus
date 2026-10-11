import { tx } from "@/lib/server/db";
import { HttpError, limit, route } from "@/lib/server/http";
import { logEvent, requireHost, roomByCode } from "@/lib/server/rooms";

type Ctx = { params: Promise<{ code: string }> };

/** Host only: one explicit retry, allowed when the latest job failed on attempt 1. */
export const POST = route("room.retry", async (req, { params }: Ctx) => {
  limit(req, "finalize", 10, 10);
  const { code } = await params;
  const job = await tx(async (db) => {
    const room = await roomByCode(code, db, "FOR UPDATE");
    requireHost(req, room);
    const latest = await db.query(
      "SELECT id, status, attempt FROM generation_jobs WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1",
      [room.id],
    );
    const last = latest.rows[0];
    if (!last || last.status !== "failed" || last.attempt >= 2) {
      throw new HttpError(409, "Retry is only available once, after a failed generation.", "retry_unavailable");
    }
    const ins = await db.query(
      `INSERT INTO generation_jobs (room_id, attempt) VALUES ($1, 2)
       ON CONFLICT (room_id) WHERE status <> 'failed' DO NOTHING RETURNING id, status`,
      [room.id],
    );
    await db.query("UPDATE rooms SET status = 'generating' WHERE id = $1", [room.id]);
    if (ins.rows[0]) await logEvent(db, room.id, "finalize_requested", { attempt: 2 });
    return ins.rows[0] ?? null;
  });
  return Response.json({ job });
});
