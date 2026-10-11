# CrowdChorus architecture contract

One repo, one Postgres, no services talking HTTP to each other. Languages meet
at **Postgres rows**, **files under `STORAGE_DIR`**, and **CLIs that print JSON**.

| Layer | Language | Owns |
|---|---|---|
| Web (`src/`) | TypeScript, Next.js 16 | UI, mic recording, API routes, upload validation, SSE fan-out, signed media URLs |
| Audio core (`dsp/`) | Rust + C (YIN) + C++ (Freeverb) | `chorus-dsp` CLI: synth, analyze, mix |
| Media I/O | C (FFmpeg/ffprobe) | probe, decode to WAV, final MP3 encode + loudnorm |
| Worker (`worker/`) | Python 3.12 (uv) | generation jobs, Gemini, Nano Banana, Lyria, Nimble, Snowflake, chorus-line CLI, analytics CLI |
| Ops (`Rakefile`, `ops/`) | Ruby | migrations, dev orchestration, retention sweep |

Schema lives only in `db/migrations/*.sql`, applied by `rake db:migrate`.
Shared musical constants live only in `music.json`.

## Storage (`STORAGE_DIR`, default `./storage`, never served statically)

| Key | Written by | Notes |
|---|---|---|
| `vocals/{room_id}/{contribution_id}.wav` | web on upload | 44.1 kHz mono s16 WAV; private; deleted by retention |
| `rooms/{room_id}/cover.png` | worker | square album art |
| `rooms/{room_id}/instrumental.wav` | worker | backing as received, decoded to 44.1 kHz mono |
| `rooms/{room_id}/song.mp3` | worker | final mix, `loudnorm` I=-14 |
| `demo/instrumental.wav` | `rake demo:assets` | **prepared demo asset**, never shown as generated |

The browser only ever sees `/api/media/<key>?exp=<unix>&sig=<hex>` where
`sig = HMAC_SHA256(MEDIA_SIGNING_SECRET, key + "\n" + exp)`. Vocals are never
given a signed URL. Covers and songs are signed for 7 days on each page load.

## Identity

* Host token: 32 random bytes, base64url, returned once on room creation,
  kept in `localStorage["cc_host_<CODE>"]`, sent as `x-cc-host`. DB stores
  `sha256` hex in `rooms.host_token_hash`.
* Session token: same shape, `localStorage["cc_session_<CODE>"]`, sent as
  `x-cc-session`, stored hashed in `participants.session_token_hash`.
  Unique per room, so one browser is one participant.
* The host is also a participant (`is_host = true`).

## Room and job state machines

`rooms.status`: `collecting` → `generating` → `ready` | `failed` (→ `generating` on retry).

`generation_jobs.status` (worker-owned after insert):
`pending` → `brief` → `generating_art` → `generating_music` → `mixing` → `completed` | `failed`.

* Web inserts the job on finalize:
  `INSERT … ON CONFLICT (room_id) WHERE status <> 'failed' DO NOTHING` so
  duplicate clicks are no-ops, and sets `rooms.status = 'generating'`.
* Retry: host only, allowed when the latest job is `failed` and `attempt < 2`;
  inserts a new row with `attempt = 2`.
* Worker claims with `UPDATE … SET locked_at = now() … WHERE id = (SELECT id
  FROM generation_jobs WHERE status = 'pending' ORDER BY created_at FOR UPDATE
  SKIP LOCKED LIMIT 1) RETURNING *`. It wakes on `LISTEN job_queued` and
  polls every 5 s as a fallback. On startup it fails jobs stuck in a
  non-terminal state with `locked_at` older than 10 min (`error_code = 'worker_lost'`).
* Every status change fires `NOTIFY room_changed, '<room_id>'` via triggers.

`contributions.status`: `accepted` on successful upload → `processed` after
the mix → `withdrawn` (participant) / `failed`.

## `generation_jobs` JSON columns

* `brief`: `{title, chorus_text, musical_direction, image_prompt, palette: [hex…], mood, theme}`
  validated with pydantic before use.
* `sources`: `[{title, url, snippet}]` from Nimble, `[]` when skipped/failed.
* `model_metadata`: `{text_model, image_model, music_model,
  fallback: {brief, art, music, sources}: bool, durations_ms: {brief, art,
  music, mix, total}, errors: {step: code}}`.
  A `true` fallback means the UI must label that artifact as a prepared/demo
  or template asset.
* `mix_report`: the JSON printed by `chorus-dsp mix`.

## `session_events.event_type`

`room_created, participant_joined, recording_submitted, recording_withdrawn,
recording_rejected, finalize_requested, job_started, brief_done, art_done,
music_done, mix_done, job_completed, job_failed, retention_sweep`.
`metadata` holds counts, model names, error codes. Never nicknames, themes,
lyrics, or audio.

## CLIs

```
chorus-dsp instrumental <out.wav>
chorus-dsp voice <n> <out.wav>        # simulated participant (labelled in UI)
chorus-dsp analyze <in.wav>           # {duration_s, rms_db, peak, onset_s, median_pitch_hz, voiced_ratio}
chorus-dsp mix <inst.wav> <out.wav> <voice.wav>...   # MixReport JSON; exit 1 + {"error"} on failure

uv run --project worker python -m worker               # run the job loop
uv run --project worker python -m worker chorus --mood M [--theme T]
    # {"line": str, "source": "gemini"|"template"}
uv run --project worker python -m worker analytics
    # {"source": "snowflake"|"postgres-local", "completed_songs", "avg_participants",
    #  "success_rate", "avg_generation_ms", "rows": int}
```

## Environment

| Var | Used by | Default / behaviour when unset |
|---|---|---|
| `DATABASE_URL` | all | `postgres://postgres:crowdchorus@localhost:5434/crowdchorus` |
| `STORAGE_DIR` | all | `./storage` |
| `CHORUS_DSP_BIN` | web, worker | `dsp/target/release/chorus-dsp` |
| `MEDIA_SIGNING_SECRET` | web | dev-only random per process (logs a warning) |
| `PUBLIC_BASE_URL` | web | request origin; used for QR/share links |
| `GEMINI_API_KEY` | worker | template chorus + template brief (labelled) |
| `GEMINI_TEXT_MODEL` | worker | `gemini-2.5-flash` |
| `GEMINI_IMAGE_MODEL` | worker | `gemini-nano-banana-2.1` |
| `LYRIA_MODEL` | worker | `lyria-3-clip-preview` |
| `NIMBLE_API_KEY` | worker | sources skipped |
| `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA` | worker | analytics from local Postgres, labelled `postgres-local` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | worker / web | Sentry disabled |
| `RETENTION_HOURS` | rake | 24 |
