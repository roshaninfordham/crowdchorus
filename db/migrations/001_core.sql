-- Core room model. Binary audio never lives here, only object keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code text NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z2-9]{6}$'),
  host_token_hash text NOT NULL,
  title text,
  theme text CHECK (char_length(theme) <= 80),
  chorus_line text,
  chorus_source text CHECK (chorus_source IN ('gemini', 'template')),
  status text NOT NULL DEFAULT 'collecting'
    CHECK (status IN ('waiting', 'collecting', 'generating', 'ready', 'failed', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 24),
  -- hash of a per-browser session token: one browser = one participant per room
  session_token_hash text NOT NULL,
  mood text NOT NULL,
  theme_suggestion text CHECK (char_length(theme_suggestion) <= 40),
  is_simulated boolean NOT NULL DEFAULT false,
  is_host boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'joined'
    CHECK (status IN ('joined', 'recording', 'submitted', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, session_token_hash)
);
CREATE INDEX participants_room ON participants (room_id);

CREATE TABLE contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  audio_object_key text,
  duration_ms integer CHECK (duration_ms > 0),
  file_size_bytes integer CHECK (file_size_bytes > 0),
  analysis jsonb,
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'accepted', 'processed', 'failed', 'withdrawn')),
  consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- at most one live contribution per participant; a retry withdraws the old one
CREATE UNIQUE INDEX contributions_one_live
  ON contributions (participant_id) WHERE status IN ('uploaded', 'accepted');
CREATE INDEX contributions_room ON contributions (room_id);

CREATE TABLE generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'brief', 'generating_art', 'generating_music', 'mixing', 'completed', 'failed')),
  attempt integer NOT NULL DEFAULT 1,
  brief jsonb,
  sources jsonb,
  model_metadata jsonb NOT NULL DEFAULT '{}',
  mix_report jsonb,
  error_code text,
  error_message text,
  cover_art_object_key text,
  instrumental_object_key text,
  final_audio_object_key text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  analytics_exported_at timestamptz
);
-- duplicate finalize clicks cannot create a second live job for a room
CREATE UNIQUE INDEX generation_jobs_one_live
  ON generation_jobs (room_id) WHERE status <> 'failed';
CREATE INDEX generation_jobs_pending ON generation_jobs (created_at) WHERE status = 'pending';
