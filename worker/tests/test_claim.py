"""Two workers racing for one job: exactly one processes it."""

import threading

from worker.db import connect
from worker.loop import claim, recover_stale, run_once


def test_concurrent_claims_process_a_job_once(conn, storage, make_room, queue_job):
    room = make_room(voices=1)
    queue_job(room["id"])
    barrier, results = threading.Barrier(2), []

    def worker():
        with connect() as c:
            barrier.wait()
            results.append(run_once(c, room["id"]))

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results, key=str) == [None, "completed"]
    assert claim(conn, room["id"]) is None
    started = conn.execute(
        "SELECT count(*) AS n FROM session_events WHERE room_id = %s AND event_type = 'job_started'", (room["id"],)
    ).fetchone()
    assert started["n"] == 1


def test_stale_job_fails_as_worker_lost(conn, storage, make_room, queue_job):
    room = make_room(voices=1)
    job = queue_job(room["id"])
    conn.execute(
        "UPDATE generation_jobs SET status = 'generating_music', locked_at = now() - interval '11 minutes' WHERE id = %s",
        (job["id"],),
    )

    assert recover_stale(conn, room["id"]) == 1

    job = conn.execute("SELECT status, error_code FROM generation_jobs WHERE id = %s", (job["id"],)).fetchone()
    assert (job["status"], job["error_code"]) == ("failed", "worker_lost")
    assert conn.execute("SELECT status FROM rooms WHERE id = %s", (room["id"],)).fetchone()["status"] == "failed"
