import { randomUUID } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MUSIC } from "@/lib/music";
import { analyze, isNearSilent, probe, toWav } from "@/lib/server/audio";
import { pool, tx } from "@/lib/server/db";
import { HttpError, limit, route } from "@/lib/server/http";
import { logEvent, requireCollecting, requireParticipant, roomByCode, type Room } from "@/lib/server/rooms";
import { storagePath, vocalKey } from "@/lib/server/storage";

type Ctx = { params: Promise<{ code: string }> };
const MAX_SECONDS = MUSIC.max_clip_seconds + 0.5;

async function reject(room: Room, reason: string, status: number, message: string): Promise<never> {
  await logEvent(pool, room.id, "recording_rejected", { reason });
  throw new HttpError(status, message, reason);
}

/** Withdraw the caller's live contributions (inside `db`'s transaction). Returns their storage keys. */
async function withdrawLive(db: Pick<typeof pool, "query">, participantId: string): Promise<string[]> {
  const { rows } = await db.query(
    `UPDATE contributions SET status = 'withdrawn'
     WHERE participant_id = $1 AND status IN ('uploaded', 'accepted') RETURNING audio_object_key`,
    [participantId],
  );
  return rows.map((r) => r.audio_object_key).filter(Boolean);
}

const deleteKeys = (keys: string[]) => Promise.all(keys.map((k) => rm(storagePath(k), { force: true })));

/**
 * Submit a recording (multipart: `audio` file + `consent=true`). Validated,
 * decoded to 44.1 kHz mono WAV, analyzed; a retry withdraws the previous take.
 */
export const POST = route("recording.submit", async (req, { params }: Ctx) => {
  limit(req, "upload", 6, 12);
  const room = await roomByCode((await params).code);
  const me = await requireParticipant(req, room.id);
  requireCollecting(room);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MUSIC.max_clip_bytes + 64_000) {
    return reject(room, "too_large", 413, "That recording is too large.");
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected a multipart upload.", "invalid");
  });
  if (form.get("consent") !== "true") {
    throw new HttpError(400, "Please confirm consent before submitting.", "consent_required");
  }
  const file = form.get("audio");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "No audio attached.", "invalid");
  if (file.size > MUSIC.max_clip_bytes) return reject(room, "too_large", 413, "That recording is too large.");

  const contributionId = randomUUID();
  const key = vocalKey(room.id, contributionId);
  const wav = storagePath(key);
  const tmp = path.join(os.tmpdir(), `cc-${contributionId}.upload`);
  const started = Date.now();
  let accepted = false;
  try {
    await writeFile(tmp, Buffer.from(await file.arrayBuffer()));
    const info = await probe(tmp).catch(() => null);
    if (!info?.hasAudio) return await reject(room, "no_audio", 422, "We couldn't read any audio in that recording.");
    if (info.duration !== null && info.duration > MAX_SECONDS) {
      return await reject(room, "too_long", 422, `Recordings can be at most ${MUSIC.max_clip_seconds} seconds.`);
    }
    await mkdir(path.dirname(wav), { recursive: true });
    await toWav(tmp, wav);
    const analysis = await analyze(wav);
    if (analysis.duration_s > MAX_SECONDS) {
      return await reject(room, "too_long", 422, `Recordings can be at most ${MUSIC.max_clip_seconds} seconds.`);
    }
    if (isNearSilent(analysis)) {
      return await reject(
        room,
        "silent",
        422,
        "We couldn't hear you in that take. Move a little closer to the mic and try again.",
      );
    }
    const size = (await stat(wav)).size;
    const old = await tx(async (db) => {
      const r = await db.query("SELECT status FROM rooms WHERE id = $1 FOR SHARE", [room.id]);
      requireCollecting(r.rows[0]);
      // serialize concurrent takes from one participant
      await db.query("SELECT 1 FROM participants WHERE id = $1 FOR UPDATE", [me.id]);
      const withdrawn = await withdrawLive(db, me.id);
      await db.query(
        `INSERT INTO contributions
           (id, room_id, participant_id, audio_object_key, duration_ms, file_size_bytes, analysis, status, consent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted', now())`,
        [contributionId, room.id, me.id, key, Math.round(analysis.duration_s * 1000), size, analysis],
      );
      await db.query("UPDATE participants SET status = 'submitted' WHERE id = $1", [me.id]);
      await logEvent(
        db,
        room.id,
        "recording_submitted",
        { retry: withdrawn.length > 0, duration_ms: Math.round(analysis.duration_s * 1000) },
        Date.now() - started,
      );
      return withdrawn;
    });
    accepted = true;
    await deleteKeys(old);
    return Response.json({ contributionId, analysis: { duration_s: analysis.duration_s } }, { status: 201 });
  } finally {
    await rm(tmp, { force: true });
    if (!accepted) await rm(wav, { force: true });
  }
});

/** Withdraw the caller's live recording while the round is open. */
export const DELETE = route("recording.withdraw", async (req, { params }: Ctx) => {
  const room = await roomByCode((await params).code);
  const me = await requireParticipant(req, room.id);
  const keys = await tx(async (db) => {
    const r = await db.query("SELECT status FROM rooms WHERE id = $1 FOR SHARE", [room.id]);
    requireCollecting(r.rows[0]);
    const withdrawn = await withdrawLive(db, me.id);
    if (!withdrawn.length) throw new HttpError(404, "You have no recording to withdraw.", "nothing_to_withdraw");
    await db.query("UPDATE participants SET status = 'joined' WHERE id = $1", [me.id]);
    await logEvent(db, room.id, "recording_withdrawn", { count: withdrawn.length });
    return withdrawn;
  });
  await deleteKeys(keys);
  return Response.json({ ok: true });
});
