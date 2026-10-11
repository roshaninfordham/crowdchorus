import { isUniqueViolation, tx } from "@/lib/server/db";
import { HttpError, limit, readJson, route } from "@/lib/server/http";
import { logEvent } from "@/lib/server/rooms";
import { participantBody } from "@/lib/server/schemas";
import { newJoinCode, newToken, sha256Hex } from "@/lib/server/tokens";
import { chorusLine } from "@/lib/server/worker";

/** Create a room. The host token is returned exactly once; the host also joins. */
export const POST = route("room.create", async (req) => {
  limit(req, "create", 5, 5);
  const body = participantBody.parse(await readJson(req));
  const chorus = await chorusLine(body.mood, body.theme);
  const hostToken = newToken();
  const sessionToken = newToken();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newJoinCode();
    try {
      const participantId = await tx(async (db) => {
        const room = await db.query(
          `INSERT INTO rooms (join_code, host_token_hash, theme, chorus_line, chorus_source)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [code, sha256Hex(hostToken), body.theme, chorus.line, chorus.source],
        );
        const roomId = room.rows[0].id;
        const p = await db.query(
          `INSERT INTO participants (room_id, nickname, session_token_hash, mood, theme_suggestion, is_host)
           VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
          [roomId, body.nickname, sha256Hex(sessionToken), body.mood, body.theme],
        );
        await logEvent(db, roomId, "room_created", { mood: body.mood, chorus_template: chorus.source === "template", has_theme: !!body.theme });
        await logEvent(db, roomId, "participant_joined", { host: true });
        return p.rows[0].id as string;
      });
      return Response.json({ code, hostToken, sessionToken, participantId }, { status: 201 });
    } catch (err) {
      if (!isUniqueViolation(err, "rooms_join_code_key")) throw err;
    }
  }
  throw new HttpError(503, "Could not allocate a room code. Please try again.", "code_exhausted");
});
