"""Sentry, enabled only by SENTRY_DSN. Events are scrubbed of anything audio- or person-shaped."""

import re

import sentry_sdk

from .config import env

SENSITIVE = re.compile(r"nick|name|audio|voice|vocal|clip|wav|theme|prompt|lyric|chorus|line|"
                       r"token|key|secret|password|dsn|auth|cookie", re.I)
PATHISH = re.compile(r"\S*(vocals/|\.wav|\.mp3)\S*")


def _scrub(obj):
    if isinstance(obj, dict):
        return {k: _scrub(v) for k, v in obj.items() if not SENSITIVE.search(str(k))}
    if isinstance(obj, list):
        return [_scrub(v) for v in obj]
    if isinstance(obj, str):
        return PATHISH.sub("[redacted]", obj)
    return obj


def before_send(event, _hint):
    for k in ("request", "user", "server_name"):
        event.pop(k, None)
    for k in ("extra", "tags"):
        if k in event:
            event[k] = _scrub(event[k])
    for exc in (event.get("exception") or {}).get("values", []):
        if isinstance(exc.get("value"), str):
            exc["value"] = PATHISH.sub("[redacted]", exc["value"])[:200]
        for frame in (exc.get("stacktrace") or {}).get("frames", []):
            frame.pop("vars", None)
    crumbs = event.get("breadcrumbs") or {}
    for c in crumbs.get("values", []) if isinstance(crumbs, dict) else []:
        c.pop("data", None)
        if isinstance(c.get("message"), str):
            c["message"] = PATHISH.sub("[redacted]", c["message"])
    return event


def init() -> bool:
    dsn = env("SENTRY_DSN")
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        send_default_pii=False,
        include_local_variables=False,
        traces_sample_rate=1.0,
        before_send=before_send,
        before_send_transaction=before_send,
    )
    return True


def span(op: str, name: str):
    """No-op unless Sentry is initialised and a job transaction is active."""
    return sentry_sdk.start_span(op=op, name=name)
