import { pool } from "./db";
import type { JobStatus, Room } from "./rooms";
import { signedMediaUrl } from "./signing";

export type Brief = {
  title?: string;
  chorus_text?: string;
  musical_direction?: string;
  image_prompt?: string;
  palette?: string[];
  mood?: string;
  theme?: string;
};
export type Source = { title: string; url: string; snippet?: string };
export type ModelMetadata = {
  text_model?: string;
  image_model?: string;
  music_model?: string;
  fallback?: { brief?: boolean; art?: boolean; music?: boolean; sources?: boolean };
  durations_ms?: Record<string, number>;
  errors?: Record<string, string>;
};

export type Results = {
  code: string;
  roomStatus: Room["status"];
  chorusLine: string | null;
  chorusSource: Room["chorus_source"];
  job: {
    status: JobStatus;
    attempt: number;
    errorCode: string | null;
    brief: Brief | null;
    sources: Source[];
    modelMetadata: ModelMetadata;
    coverUrl: string | null;
    songUrl: string | null;
  } | null;
  metrics: {
    participants: number;
    submittedRecordings: number;
    successfulParticipants: number;
    retries: number;
    generationMs: number | null;
    contributionLatencyMs: number | null;
  };
};

const safeUrl = (u: unknown) => typeof u === "string" && /^https?:\/\//i.test(u);

/** Everything the reveal page needs. Signed URLs are minted fresh on each call. */
export async function results(room: Room): Promise<Results> {
  const [jobQ, metricQ] = await Promise.all([
    pool.query("SELECT * FROM generation_jobs WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1", [room.id]),
    pool.query(
      `SELECT
         (SELECT count(*)::int FROM participants WHERE room_id = $1) AS participants,
         count(*) FILTER (WHERE status IN ('accepted', 'processed'))::int AS submitted,
         count(DISTINCT participant_id) FILTER (WHERE status IN ('accepted', 'processed'))::int AS successful,
         count(*) FILTER (WHERE status = 'withdrawn')::int AS retries,
         max(created_at) FILTER (WHERE status IN ('accepted', 'processed')) AS last_submission
       FROM contributions WHERE room_id = $1`,
      [room.id],
    ),
  ]);
  const j = jobQ.rows[0];
  const m = metricQ.rows[0];
  const meta: ModelMetadata = j?.model_metadata ?? {};
  const generationMs =
    j?.status === "completed"
      ? (meta.durations_ms?.total ??
        (j.completed_at && j.started_at ? j.completed_at.getTime() - j.started_at.getTime() : null))
      : null;
  return {
    code: room.join_code,
    roomStatus: room.status,
    chorusLine: room.chorus_line,
    chorusSource: room.chorus_source,
    job: j
      ? {
          status: j.status,
          attempt: j.attempt,
          errorCode: j.error_code,
          brief: j.brief,
          // worker output, but still: only http(s) links reach an href
          sources: (Array.isArray(j.sources) ? j.sources : []).filter((s: Source) => safeUrl(s?.url)).slice(0, 2),
          modelMetadata: meta,
          coverUrl: j.cover_art_object_key ? signedMediaUrl(j.cover_art_object_key) : null,
          songUrl: j.status === "completed" && j.final_audio_object_key ? signedMediaUrl(j.final_audio_object_key) : null,
        }
      : null,
    metrics: {
      participants: m.participants,
      submittedRecordings: m.submitted,
      successfulParticipants: m.successful,
      retries: m.retries,
      generationMs,
      contributionLatencyMs: m.last_submission ? m.last_submission.getTime() - room.created_at.getTime() : null,
    },
  };
}
