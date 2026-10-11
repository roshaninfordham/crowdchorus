import { tx } from "@/lib/server/db";
import { HttpError, limit, readJson, route } from "@/lib/server/http";
import { MAX_ROOM_SIZE } from "@/lib/music";
import { logEvent, requireCollecting, roomByCode, sessionParticipant } from "@/lib/server/rooms";
import { participantBody } from "@/lib/server/schemas";
import { newToken, sha256Hex } from "@/lib/server/tokens";

type Ctx = { params: Promise<{ code: string }> };

/** Join with a nickname and mood. One browser (session token) = one participant. */
export const POST = route("room.join", async (req, { params }: Ctx) => {
  limit(req, "join", 20, 20);
  const body = participantBody.parse(await readJson(req));
  const result = await tx(async (db) => {
    const room = await roomByCode((await params).code, db, "FOR UPDATE");
    const existing = await sessionParticipant(req, room.id, db);
    if (existing) return { participantId: existing.id, sessionToken: null };
    requireCollecting(room);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM participants WHERE room_id = $1", [room.id]);
    if (rows[0].n >= MAX_ROOM_SIZE) throw new HttpError(409, "This room is full.", "room_full");
    const sessionToken = newToken();
    const p = await db.query(
      `INSERT INTO participants (room_id, nickname, session_token_hash, mood, theme_suggestion)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [room.id, body.nickname, sha256Hex(sessionToken), body.mood, body.theme],
    );
    await logEvent(db, room.id, "participant_joined", { mood: body.mood, has_theme: !!body.theme });
    return { participantId: p.rows[0].id as string, sessionToken };
  });
  return Response.json(result, { status: result.sessionToken ? 201 : 200 });
});
