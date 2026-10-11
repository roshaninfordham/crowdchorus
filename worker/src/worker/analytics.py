"""Aggregate job analytics: one row per finished job to Snowflake, and the `analytics` summary.

Rows hold counts, durations, mood, status and fallback flags only: no nicknames,
themes, lyrics or audio.
"""

import logging
from datetime import UTC, datetime

from .config import env

log = logging.getLogger(__name__)

TABLE = "CROWDCHORUS_JOBS"
STEPS = ("brief", "sources", "art", "music", "mix", "total")
FLAGS = ("brief", "art", "music", "sources")
DDL = f"""CREATE TABLE IF NOT EXISTS {TABLE} (
  job_id STRING, session_id STRING, attempt INTEGER,
  participant_count INTEGER, submitted_clips INTEGER, total_retries INTEGER, mood STRING,
  {", ".join(f"{s}_ms INTEGER" for s in STEPS)},
  final_status STRING, error_code STRING,
  {", ".join(f"fallback_{f} BOOLEAN" for f in FLAGS)},
  finished_at TIMESTAMP_TZ
)"""

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


def snowflake_configured() -> bool:
    return all(env(f"SNOWFLAKE_{k}") for k in ("ACCOUNT", "USER", "PASSWORD", "WAREHOUSE"))


def _snowflake():
    import snowflake.connector  # slow import: only when configured

    return snowflake.connector.connect(
        account=env("SNOWFLAKE_ACCOUNT"),
        user=env("SNOWFLAKE_USER"),
        password=env("SNOWFLAKE_PASSWORD"),
        warehouse=env("SNOWFLAKE_WAREHOUSE"),
        database=env("SNOWFLAKE_DATABASE") or "CROWDCHORUS",
        schema=env("SNOWFLAKE_SCHEMA") or "PUBLIC",
        login_timeout=15,
        network_timeout=30,
        application="crowdchorus-worker",
    )


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
    if not snowflake_configured():
        return 0
    pending = rows(conn, "AND j.analytics_exported_at IS NULL")
    if not pending:
        return 0
    cols = list(pending[0])
    insert = f"INSERT INTO {TABLE} ({', '.join(cols)}) VALUES ({', '.join(f'%({c})s' for c in cols)})"
    try:
        with _snowflake() as sf, sf.cursor() as cur:
            cur.execute(DDL)
            for row in pending:
                cur.execute(insert, row)
                conn.execute("UPDATE generation_jobs SET analytics_exported_at = %s WHERE id = %s",
                             (datetime.now(UTC), row["job_id"]))
    except Exception as e:
        log.warning("snowflake export failed: %s", type(e).__name__)
        return 0
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
    if snowflake_configured():
        try:
            # ponytail: aggregates in Python over all rows; move to SQL AVG/COUNT_IF past ~100k jobs
            with _snowflake() as sf, sf.cursor() as cur:
                cur.execute(DDL)
                cur.execute(f"SELECT final_status, participant_count, total_ms FROM {TABLE}")
                data = [{"final_status": s, "participant_count": p, "total_ms": t} for s, p, t in cur.fetchall()]
            return summarize("snowflake", data)
        except Exception as e:
            log.warning("snowflake analytics failed, using local: %s", type(e).__name__)
    return summarize("postgres-local", rows(conn))
