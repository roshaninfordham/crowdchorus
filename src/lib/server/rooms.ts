import type { PoolClient } from "pg";
import { pool } from "./db";
import { HttpError } from "./http";
import { onlineIds } from "./live";
import { joinCode } from "./schemas";
import { signedMediaUrl } from "./signing";
import { sha256Hex } from "./tokens";

export type Room = {
  id: string;
  join_code: string;
  host_token_hash: string;
  status: "collecting" | "generating" | "ready" | "failed" | "waiting" | "closed";
  theme: string | null;
  chorus_line: string | null;
  chorus_source: string | null;
  created_at: Date;
};

export type Participant = {
  id: string;
  room_id: string;
  nickname: string;
  mood: string;
  is_host: boolean;
  is_simulated: boolean;
};

type Db = Pick<PoolClient, "query">;

export async function roomByCode(code: string, db: Db = pool, lock = ""): Promise<Room> {
  const parsed = joinCode.safeParse(code);
  if (!parsed.success) throw new HttpError(404, "No room with that code.", "not_found");
  const { rows } = await db.query<Room>(`SELECT * FROM rooms WHERE join_code = $1 ${lock}`, [parsed.data]);
  if (!rows[0]) throw new HttpError(404, "No room with that code.", "not_found");
  return rows[0];
}

export function isHost(req: Request, room: Room): boolean {
  const token = req.headers.get("x-cc-host");
  return !!token && sha256Hex(token) === room.host_token_hash;
}

export function requireHost(req: Request, room: Room) {
  if (!isHost(req, room)) throw new HttpError(403, "Only the host can do that.", "not_host");
}

export async function sessionParticipant(req: Request, roomId: string, db: Db = pool): Promise<Participant | null> {
  const token = req.headers.get("x-cc-session");
  if (!token) return null;
  const { rows } = await db.query<Participant>(
    "SELECT * FROM participants WHERE room_id = $1 AND session_token_hash = $2",
    [roomId, sha256Hex(token)],
  );
  return rows[0] ?? null;
}

export async function requireParticipant(req: Request, roomId: string, db: Db = pool): Promise<Participant> {
  const p = await sessionParticipant(req, roomId, db);
  if (!p) throw new HttpError(401, "Join the room first.", "no_session");
  return p;
}

export function requireCollecting(room: Pick<Room, "status">) {
  if (room.status !== "collecting") {
    throw new HttpError(409, "This room has closed its round.", "room_closed");
  }
}

/** session_events row. Metadata: counts, codes, flags only. Never names, themes or audio. */
export async function logEvent(
  db: Db,
  roomId: string,
  type: string,
  metadata: Record<string, string | number | boolean> = {},
  durationMs?: number,
) {
  await db.query(
    "INSERT INTO session_events (room_id, event_type, metadata, duration_ms) VALUES ($1, $2, $3, $4)",
    [roomId, type, metadata, durationMs ?? null],
  );
}

export type JobStatus = "pending" | "brief" | "generating_art" | "generating_music" | "mixing" | "completed" | "failed";

export type Snapshot = {
  code: string;
  status: Room["status"];
  chorusLine: string | null;
  chorusSource: Room["chorus_source"];
  createdAt: string;
  participants: {
    id: string;
    nickname: string;
    isHost: boolean;
    isSimulated: boolean;
    submitted: boolean;
    online: boolean;
  }[];
  submittedCount: number;
  job: {
    status: JobStatus;
    attempt: number;
    errorCode: string | null;
    coverUrl: string | null;
    durationsMs: Record<string, number>;
    errors: Record<string, string>;
  } | null;
};

export async function snapshot(room: Room): Promise<Snapshot> {
  const [people, jobs] = await Promise.all([
    pool.query(
      `SELECT p.id, p.nickname, p.is_host, p.is_simulated,
              EXISTS (SELECT 1 FROM contributions c WHERE c.participant_id = p.id
                      AND c.status IN ('accepted', 'processed')) AS submitted
       FROM participants p WHERE p.room_id = $1 ORDER BY p.created_at`,
      [room.id],
    ),
    pool.query(
      `SELECT status, attempt, error_code, cover_art_object_key, model_metadata
       FROM generation_jobs WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [room.id],
    ),
  ]);
  const online = onlineIds(room.id);
  const participants = people.rows.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    isHost: p.is_host,
    isSimulated: p.is_simulated,
    submitted: p.submitted,
    online: online.has(p.id), // connected SSE streams in this process
  }));
  const j = jobs.rows[0];
  return {
    code: room.join_code,
    status: room.status,
    chorusLine: room.chorus_line,
    chorusSource: room.chorus_source,
    createdAt: room.created_at.toISOString(),
    participants,
    submittedCount: participants.filter((p) => p.submitted).length,
    job: j
      ? {
          status: j.status,
          attempt: j.attempt,
          errorCode: j.error_code,
          coverUrl: j.cover_art_object_key ? signedMediaUrl(j.cover_art_object_key) : null,
          durationsMs: j.model_metadata?.durations_ms ?? {},
          errors: j.model_metadata?.errors ?? {},
        }
      : null,
  };
}

export async function snapshotById(roomId: string): Promise<Snapshot | null> {
  const { rows } = await pool.query<Room>("SELECT * FROM rooms WHERE id = $1", [roomId]);
  return rows[0] ? snapshot(rows[0]) : null;
}
