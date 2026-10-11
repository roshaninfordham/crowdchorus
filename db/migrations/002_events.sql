-- Timestamped session activity as a TimescaleDB hypertable. Metadata must be
-- safe and non-sensitive: no audio, no nicknames, no free text.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE session_events (
  room_id uuid NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'
);
SELECT create_hypertable('session_events', by_range('occurred_at'));
CREATE INDEX session_events_room ON session_events (room_id, occurred_at DESC);
