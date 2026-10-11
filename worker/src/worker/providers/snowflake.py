"""Snowflake analytics sink: one aggregate row per finished job (no nicknames, themes or audio)."""

from .. import analytics
from ..config import env

TABLE = "CROWDCHORUS_JOBS"


def ddl() -> str:
    return f"""CREATE TABLE IF NOT EXISTS {TABLE} (
  job_id STRING, session_id STRING, attempt INTEGER,
  participant_count INTEGER, submitted_clips INTEGER, total_retries INTEGER, mood STRING,
  {", ".join(f"{s}_ms INTEGER" for s in analytics.STEPS)},
  final_status STRING, error_code STRING,
  {", ".join(f"fallback_{f} BOOLEAN" for f in analytics.FLAGS)},
  finished_at TIMESTAMP_TZ
)"""


class SnowflakeSink:
    name = "snowflake"

    @classmethod
    def configured(cls) -> bool:
        return all(env(f"SNOWFLAKE_{k}") for k in ("ACCOUNT", "USER", "PASSWORD", "WAREHOUSE"))

    def _connect(self):
        import snowflake.connector  # slow import: only when used

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

    def export(self, rows):
        cols = list(rows[0])
        insert = f"INSERT INTO {TABLE} ({', '.join(cols)}) VALUES ({', '.join(f'%({c})s' for c in cols)})"
        with self._connect() as sf, sf.cursor() as cur:
            cur.execute(ddl())
            cur.executemany(insert, rows)
        return True

    def read(self, conn):
        # ponytail: aggregates in Python over all rows; move to SQL AVG/COUNT_IF past ~100k jobs
        with self._connect() as sf, sf.cursor() as cur:
            cur.execute(ddl())
            cur.execute(f"SELECT final_status, participant_count, total_ms FROM {TABLE}")
            return [{"final_status": s, "participant_count": p, "total_ms": t} for s, p, t in cur.fetchall()]
