import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_ROOM_SIZE } from "@/lib/music";
import { analyze, synthVoice } from "@/lib/server/audio";
import { pool, tx } from "@/lib/server/db";
import { HttpError, limit, route } from "@/lib/server/http";
import { logEvent, requireCollecting, requireHost, roomByCode } from "@/lib/server/rooms";
import { storagePath, vocalKey } from "@/lib/server/storage";
import { newToken, sha256Hex } from "@/lib/server/tokens";

type Ctx = { params: Promise<{ code: string }> };

/** Host only: add a labelled simulated participant singing a synthesized voice. */
export const POST = route("room.simulate", async (req, { params }: Ctx) => {
  limit(req, "simulate", 10, 20);
  const room = await roomByCode((await params).code);
  requireHost(req, room);
  requireCollecting(room);

  const { rows } = await pool.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE is_simulated)::int AS simulated,
            (SELECT mood FROM participants WHERE room_id = $1 AND is_host LIMIT 1) AS host_mood
     FROM participants WHERE room_id = $1`,
    [room.id],
  );
  if (rows[0].total >= MAX_ROOM_SIZE) throw new HttpError(409, "This room is full.", "room_full");
  const n = rows[0].simulated + 1;

  const contributionId = randomUUID();
  const key = vocalKey(room.id, contributionId);
  const wav = storagePath(key);
  await mkdir(path.dirname(wav), { recursive: true });
  try {
    await synthVoice(n, wav);
    const analysis = await analyze(wav);
    const size = (await stat(wav)).size;
    const participantId = await tx(async (db) => {
      const r = await db.query("SELECT status FROM rooms WHERE id = $1 FOR UPDATE", [room.id]);
      requireCollecting(r.rows[0]);
      const p = await db.query(
        `INSERT INTO participants (room_id, nickname, session_token_hash, mood, is_simulated, status)
         VALUES ($1, $2, $3, $4, true, 'submitted') RETURNING id`,
        [room.id, `Simulated ${n}`, sha256Hex(newToken()), rows[0].host_mood ?? "joyful"],
      );
      await db.query(
        `INSERT INTO contributions
           (id, room_id, participant_id, audio_object_key, duration_ms, file_size_bytes, analysis, status, consent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted', now())`,
        [contributionId, room.id, p.rows[0].id, key, Math.round(analysis.duration_s * 1000), size, analysis],
      );
      await logEvent(db, room.id, "participant_joined", { simulated: true });
      await logEvent(db, room.id, "recording_submitted", { simulated: true });
      return p.rows[0].id as string;
    });
    return Response.json({ participantId }, { status: 201 });
  } catch (err) {
    await rm(wav, { force: true });
    throw err;
  }
});
