-- Timestamped session activity. Metadata must be safe and non-sensitive: no
-- audio, no nicknames, no free text. On TimescaleDB (local Docker, Tiger Data)
-- this becomes a hypertable; on plain Postgres it stays an ordinary table.
CREATE TABLE session_events (
  room_id uuid NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
    PERFORM create_hypertable('session_events', by_range('occurred_at'));
  END IF;
END $$;

CREATE INDEX session_events_room ON session_events (room_id, occurred_at DESC);
