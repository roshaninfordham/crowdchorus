"""End to end: 3 simulated voices -> one pipeline pass with no API keys -> labelled fallbacks + a real song."""

import json

from PIL import Image

from worker.loop import run_once
from worker.media import duration_s


def test_pipeline_without_keys_completes_with_labelled_fallbacks(conn, storage, make_room, queue_job):
    room = make_room(voices=3)
    job = queue_job(room["id"])

    assert run_once(conn, room["id"]) == "completed"

    job = conn.execute("SELECT * FROM generation_jobs WHERE id = %s", (job["id"],)).fetchone()
    assert job["status"] == "completed" and job["error_code"] is None
    meta = job["model_metadata"]
    assert meta["fallback"] == {"brief": True, "art": True, "music": True, "sources": True}
    assert {"brief", "art", "music", "mix", "total"} <= meta["durations_ms"].keys()
    assert meta["providers"] == {"text": "local", "search": "local", "image": "local", "music": "local"}
    assert (meta["text_model"], meta["image_model"], meta["music_model"]) == ("local", "local", "local")
    assert job["sources"] == []
    assert job["brief"]["chorus_text"] == room["chorus_line"] and len(job["brief"]["palette"]) >= 3

    assert job["mix_report"]["included"] == 3
    song = storage / job["final_audio_object_key"]
    assert job["final_audio_object_key"] == f"rooms/{room['id']}/song.mp3"
    assert abs(duration_s(song) - 30) < 1.5
    with Image.open(storage / job["cover_art_object_key"]) as cover:
        assert cover.size[0] == cover.size[1]
    assert (storage / job["instrumental_object_key"]).is_file()

    statuses = conn.execute("SELECT status FROM contributions WHERE room_id = %s", (room["id"],)).fetchall()
    assert [s["status"] for s in statuses] == ["processed"] * 3
    room_after = conn.execute("SELECT status, title FROM rooms WHERE id = %s", (room["id"],)).fetchone()
    assert room_after["status"] == "ready" and room_after["title"] == job["brief"]["title"]

    events = conn.execute(
        "SELECT event_type, duration_ms, metadata FROM session_events WHERE room_id = %s ORDER BY occurred_at",
        (room["id"],),
    ).fetchall()
    types = [e["event_type"] for e in events]
    assert types == ["job_started", "brief_done", "art_done", "music_done", "mix_done", "job_completed"]
    assert all(e["duration_ms"] is not None for e in events[1:])
    safe = json.dumps([e["metadata"] for e in events])
    assert "Simulated" not in safe and room["theme"] not in safe


def test_missing_vocals_fail_the_job_and_room(conn, storage, make_room, queue_job):
    room = make_room(voices=2)
    for f in (storage / "vocals" / str(room["id"])).iterdir():
        f.unlink()
    job = queue_job(room["id"])

    assert run_once(conn, room["id"]) == "failed"

    job = conn.execute("SELECT * FROM generation_jobs WHERE id = %s", (job["id"],)).fetchone()
    assert (job["status"], job["error_code"]) == ("failed", "no_vocals")
    assert job["error_message"] and "vocals/" not in job["error_message"]
    assert job["cover_art_object_key"]  # earlier steps still left their artifacts
    assert conn.execute("SELECT status FROM rooms WHERE id = %s", (room["id"],)).fetchone()["status"] == "failed"
    last = conn.execute(
        "SELECT event_type, metadata FROM session_events WHERE room_id = %s ORDER BY occurred_at DESC LIMIT 1",
        (room["id"],),
    ).fetchone()
    assert last["event_type"] == "job_failed" and last["metadata"]["error_code"] == "no_vocals"
