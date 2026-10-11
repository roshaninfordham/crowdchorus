"""Postgres helpers. Every write autocommits so triggers NOTIFY the UI immediately."""

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import env

JSON_COLUMNS = {"brief", "sources", "model_metadata", "mix_report"}


def connect() -> psycopg.Connection:
    return psycopg.connect(env("DATABASE_URL"), autocommit=True, row_factory=dict_row)


def event(conn, room_id, event_type: str, duration_ms: int | None = None, **metadata) -> None:
    """Append a session event. Callers pass only counts, model names and error codes."""
    conn.execute(
        # clock_timestamp, not now(): events written in one transaction keep their real order
        "INSERT INTO session_events (room_id, event_type, occurred_at, duration_ms, metadata) "
        "VALUES (%s, %s, clock_timestamp(), %s, %s)",
        (room_id, event_type, duration_ms, Jsonb(metadata)),
    )


def update_job(conn, job_id, **fields) -> None:
    cols = ", ".join(f"{k} = %s" for k in fields)
    vals = [Jsonb(v) if k in JSON_COLUMNS else v for k, v in fields.items()]
    conn.execute(f"UPDATE generation_jobs SET {cols} WHERE id = %s", (*vals, job_id))


def set_room_status(conn, room_id, status: str) -> None:
    conn.execute("UPDATE rooms SET status = %s WHERE id = %s", (status, room_id))
