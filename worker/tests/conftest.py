"""Fixtures: a temp STORAGE_DIR, no integration keys, and throwaway rooms that are deleted afterwards.

Tests run against a separate database (`rake db:test_prepare`) so a live dev
worker can't claim their jobs; rows are still cleaned up on teardown.
"""

import json
import os

os.environ.setdefault("DATABASE_URL", "postgres://postgres:crowdchorus@localhost:5434/crowdchorus_test")
import random
import uuid
from pathlib import Path

import pytest

from worker.config import REPO_ROOT, music
from worker.db import connect
from worker.media import dsp

DSP_DEFAULT = REPO_ROOT / "dsp/target/release/chorus-dsp"
INTEGRATION_VARS = [
    "GEMINI_API_KEY", "NIMBLE_API_KEY", "SENTRY_DSN",
    "SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD", "SNOWFLAKE_WAREHOUSE",
]


@pytest.fixture
def storage(monkeypatch, tmp_path) -> Path:
    for v in INTEGRATION_VARS:
        monkeypatch.delenv(v, raising=False)
    bin_ = os.environ.get("CHORUS_DSP_BIN") or str(DSP_DEFAULT)
    assert Path(bin_).is_file(), f"build chorus-dsp or set CHORUS_DSP_BIN (looked at {bin_})"
    monkeypatch.setenv("CHORUS_DSP_BIN", bin_)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    return tmp_path / "storage"


@pytest.fixture
def conn():
    c = connect()
    yield c
    c.close()


@pytest.fixture
def make_room(conn, storage):
    created = []

    def make(voices: int = 3, theme: str | None = "city lights after rain") -> dict:
        code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))
        room = conn.execute(
            "INSERT INTO rooms (join_code, host_token_hash, theme, chorus_line, chorus_source, status) "
            "VALUES (%s, %s, %s, %s, 'template', 'generating') RETURNING *",
            (code, uuid.uuid4().hex, theme, "We light the sky with every voice tonight"),
        ).fetchone()
        created.append(room["id"])
        moods = music()["moods"]
        for i in range(voices):
            p = conn.execute(
                "INSERT INTO participants (room_id, nickname, session_token_hash, mood, is_simulated) "
                "VALUES (%s, %s, %s, %s, true) RETURNING id",
                (room["id"], f"Simulated {i + 1}", uuid.uuid4().hex, moods[i % 2]),
            ).fetchone()
            cid = uuid.uuid4()
            key = f"vocals/{room['id']}/{cid}.wav"
            path = storage / key
            path.parent.mkdir(parents=True, exist_ok=True)
            dsp("voice", i + 1, path)
            analysis = dsp("analyze", path)
            conn.execute(
                "INSERT INTO contributions (id, room_id, participant_id, audio_object_key, duration_ms, "
                "file_size_bytes, analysis, status, consent_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, 'accepted', now())",
                (cid, room["id"], p["id"], key, round(analysis["duration_s"] * 1000), path.stat().st_size,
                 json.dumps(analysis)),
            )
        return room

    yield make
    for rid in created:
        conn.execute("DELETE FROM session_events WHERE room_id = %s", (rid,))
        conn.execute("DELETE FROM rooms WHERE id = %s", (rid,))  # cascades to participants, clips, jobs


@pytest.fixture
def queue_job(conn):
    def queue(room_id) -> dict:
        return conn.execute("INSERT INTO generation_jobs (room_id) VALUES (%s) RETURNING *", (room_id,)).fetchone()

    return queue
