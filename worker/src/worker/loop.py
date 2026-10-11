"""Job loop: claim with SKIP LOCKED, wake on LISTEN job_queued or a 5 s poll, stop on SIGTERM."""

import logging
import signal

from . import analytics
from .db import connect
from .pipeline import fail, run_job

log = logging.getLogger(__name__)

POLL_S = 5
CLAIM_SQL = """
UPDATE generation_jobs SET locked_at = now(), started_at = now(), status = 'brief'
WHERE id = (
  SELECT id FROM generation_jobs
  WHERE status = 'pending' AND (%(room)s::uuid IS NULL OR room_id = %(room)s::uuid)
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
)
RETURNING *
"""
STALE_SQL = """
SELECT * FROM generation_jobs
WHERE status IN ('brief', 'generating_art', 'generating_music', 'mixing')
  AND locked_at < now() - interval '10 minutes'
"""


def claim(conn, room_id=None) -> dict | None:
    """Atomically take the oldest pending job. Moving it out of 'pending' in the same
    statement is what stops a second worker from claiming it after we commit.
    `room_id` scopes the claim (tests share the database with real jobs)."""
    return conn.execute(CLAIM_SQL, {"room": room_id}).fetchone()


def recover_stale(conn) -> int:
    stale = conn.execute(STALE_SQL).fetchall()
    for job in stale:
        fail(conn, job, job["status"], "worker_lost", job["model_metadata"] or {})
    if stale:
        log.warning("failed %d stale job(s) as worker_lost", len(stale))
    return len(stale)


def run_once(conn, room_id=None) -> str | None:
    """Claim and run at most one job, then export finished jobs. Returns the final status."""
    job = claim(conn, room_id)
    if not job:
        return None
    log.info("claimed job %s (attempt %d)", job["id"], job["attempt"])
    status = run_job(conn, job)
    analytics.export_pending(conn)
    return status


def serve() -> None:
    stop = False

    def on_term(signum, _frame):
        nonlocal stop
        stop = True
        log.info("signal %d: finishing current job, then exiting", signum)

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)

    work, listen = connect(), connect()
    listen.execute("LISTEN job_queued")
    recover_stale(work)
    analytics.export_pending(work)
    log.info("worker ready: LISTEN job_queued, poll every %d s", POLL_S)
    while not stop:
        try:
            while not stop and run_once(work):
                pass
        except Exception as e:  # keep serving; the job row already records its own failure
            log.error("job loop error: %s", type(e).__name__)
        if stop:
            break
        # wakes on the first notification or after the poll interval; drains extra notifies
        for _ in listen.notifies(timeout=POLL_S, stop_after=1):
            pass
    work.close()
    listen.close()
    log.info("worker stopped")
