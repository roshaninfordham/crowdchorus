import { tx } from "@/lib/server/db";
import { HttpError, limit, route } from "@/lib/server/http";
import { logEvent, requireHost, roomByCode } from "@/lib/server/rooms";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Host only: close the round and queue one generation job. Idempotent:
 * duplicate clicks hit ON CONFLICT DO NOTHING and return the live job.
 */
export const POST = route("room.finalize", async (req, { params }: Ctx) => {
  limit(req, "finalize", 10, 10);
  const { code } = await params;
  const result = await tx(async (db) => {
    const room = await roomByCode(code, db, "FOR UPDATE");
    requireHost(req, room);
    if (room.status === "failed") throw new HttpError(409, "Generation failed. Use retry instead.", "use_retry");
    if (room.status === "collecting") {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n, count(DISTINCT participant_id)::int AS people
         FROM contributions WHERE room_id = $1 AND status = 'accepted'`,
        [room.id],
      );
      if (rows[0].n < 1) throw new HttpError(422, "At least one recording is needed first.", "no_recordings");
      const ins = await db.query(
        `INSERT INTO generation_jobs (room_id) VALUES ($1)
         ON CONFLICT (room_id) WHERE status <> 'failed' DO NOTHING RETURNING id`,
        [room.id],
      );
      await db.query("UPDATE rooms SET status = 'generating' WHERE id = $1", [room.id]);
      if (ins.rows[0]) {
        await logEvent(db, room.id, "finalize_requested", { contributions: rows[0].n, participants: rows[0].people });
      }
    }
    const job = await db.query(
      "SELECT id, status FROM generation_jobs WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1",
      [room.id],
    );
    return job.rows[0] ?? null;
  });
  return Response.json({ job: result });
});
