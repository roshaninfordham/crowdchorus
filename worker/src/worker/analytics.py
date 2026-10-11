"""Aggregate job analytics: one row per finished job to the analytics sink, and the `analytics` summary.

Rows hold counts, durations, mood, status and fallback flags only: no nicknames,
themes, lyrics or audio.
"""

import logging
from datetime import UTC, datetime

from . import providers

log = logging.getLogger(__name__)

STEPS = ("brief", "sources", "art", "music", "mix", "total")
FLAGS = ("brief", "art", "music", "sources")

ROWS_SQL = """
SELECT j.id, j.room_id, j.attempt, j.status, j.error_code, j.brief->>'mood' AS mood,
       j.model_metadata, coalesce(j.completed_at, now()) AS finished_at,
       (SELECT count(*) FROM participants p WHERE p.room_id = j.room_id) AS participant_count,
       (SELECT count(*) FROM contributions c WHERE c.room_id = j.room_id
          AND c.status IN ('accepted', 'processed', 'failed')) AS submitted_clips,
       (SELECT count(*) FROM contributions c WHERE c.room_id = j.room_id AND c.status = 'withdrawn') AS total_retries
FROM generation_jobs j
WHERE j.status IN ('completed', 'failed') {extra}
ORDER BY j.created_at
"""


def rows(conn, extra: str = "") -> list[dict]:
    out = []
    for r in conn.execute(ROWS_SQL.format(extra=extra)).fetchall():
        meta = r["model_metadata"] or {}
        durations, fallback = meta.get("durations_ms") or {}, meta.get("fallback") or {}
        row = {
            "job_id": str(r["id"]), "session_id": str(r["room_id"]), "attempt": r["attempt"],
            "participant_count": r["participant_count"], "submitted_clips": r["submitted_clips"],
            "total_retries": r["total_retries"], "mood": r["mood"],
            "final_status": r["status"], "error_code": r["error_code"], "finished_at": r["finished_at"],
        }
        row.update({f"{s}_ms": durations.get(s) for s in STEPS})
        row.update({f"fallback_{f}": bool(fallback.get(f)) for f in FLAGS})
        out.append(row)
    return out


def export_pending(conn) -> int:
    """Export finished jobs not yet exported. A failed export is retried after the next job."""
    sink = providers.get("analytics")
    if sink.name == "local":
        return 0  # rows already live in Postgres
    pending = rows(conn, "AND j.analytics_exported_at IS NULL")
    if not pending:
        return 0
    try:
        if not sink.export(pending):
            return 0
    except Exception as e:
        log.warning("%s export failed: %s", sink.name, type(e).__name__)
        return 0
    conn.execute("UPDATE generation_jobs SET analytics_exported_at = %s WHERE id = ANY(%s::uuid[])",
                 (datetime.now(UTC), [r["job_id"] for r in pending]))
    return len(pending)


def summarize(source: str, data: list[dict]) -> dict:
    done = [r for r in data if r["final_status"] == "completed"]
    times = [r["total_ms"] for r in done if r["total_ms"] is not None]
    return {
        "source": source,
        "completed_songs": len(done),
        "avg_participants": round(sum(r["participant_count"] for r in done) / len(done), 2) if done else 0,
        "success_rate": round(len(done) / len(data), 3) if data else 0,
        "avg_generation_ms": round(sum(times) / len(times)) if times else 0,
        "rows": len(data),
    }


def report(conn) -> dict:
    data, name, _, _ = providers.attempt("analytics", lambda p: p.read(conn))
    return summarize("postgres-local" if name == "local" else name, data)
