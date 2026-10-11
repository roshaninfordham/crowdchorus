"""One generation job: brief -> sources -> art -> music -> mix, with real per-step status."""

import logging
import os
import tempfile
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

import sentry_sdk

from . import art, brief, media, music, providers, sources
from .config import storage_path
from .db import event, set_room_status, update_job
from .observe import span

log = logging.getLogger(__name__)

# Short, fixed, user-safe messages: no paths, secrets or upstream error text.
MESSAGES = {
    "no_vocals": "No usable vocal recordings were found for this room.",
    "mix_failed": "The voices could not be mixed into the backing track.",
    "encode_failed": "The final song could not be encoded.",
    "room_missing": "The room for this job no longer exists.",
    "worker_lost": "The worker stopped while generating; please retry.",
    "internal_error": "Something went wrong while generating the song.",
}


class StepError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@contextmanager
def timed(meta: dict, step: str):
    t = time.monotonic()
    yield
    meta["durations_ms"][step] = round((time.monotonic() - t) * 1000)


CAPABILITY = {"brief": "text", "sources": "search", "art": "image", "music": "music"}
MODEL_KEY = {"brief": "text_model", "art": "image_model", "music": "music_model"}


def record(meta: dict, step: str, provider: str, fallback: bool, code: str | None) -> None:
    cap = CAPABILITY[step]
    meta["providers"][cap] = provider
    if step in MODEL_KEY:
        meta[MODEL_KEY[step]] = providers.model(cap, provider)
    meta["fallback"][step] = fallback
    if code:
        meta["errors"][step] = code


def mixdown(conn, room_id: str, instrumental: Path, song: Path) -> tuple[dict, dict[str, str]]:
    """Mix accepted vocals over the backing and encode the MP3. Returns (mix_report, {contribution_id: status})."""
    clips = conn.execute(
        "SELECT id, audio_object_key FROM contributions WHERE room_id = %s AND status = 'accepted' "
        "ORDER BY created_at, id",
        (room_id,),
    ).fetchall()
    present = [c for c in clips if c["audio_object_key"] and storage_path(c["audio_object_key"]).is_file()]
    if not present:
        raise StepError("no_vocals")
    outcome = {str(c["id"]): "failed" for c in clips}  # missing files count as failed clips
    with tempfile.TemporaryDirectory(dir=song.parent) as tmp:
        mixed, mp3 = Path(tmp) / "mixed.wav", Path(tmp) / "song.mp3"
        try:
            report = media.dsp("mix", instrumental, mixed, *(storage_path(c["audio_object_key"]) for c in present))
        except media.MediaError:
            raise StepError("mix_failed") from None
        try:
            media.to_mp3(mixed, mp3)
        except media.MediaError:
            raise StepError("encode_failed") from None
        os.replace(mp3, song)
    for v in report["voices"]:
        outcome[str(present[v["index"]]["id"])] = "processed" if v["included"] else "failed"
    return report, outcome


def run_job(conn, job: dict) -> str:
    """Run a claimed job to `completed` or `failed`; returns the final status."""
    jid, rid = job["id"], str(job["room_id"])
    keys = {k: f"rooms/{rid}/{f}" for k, f in (("cover", "cover.png"), ("inst", "instrumental.wav"), ("song", "song.mp3"))}
    meta = {
        "text_model": None,
        "image_model": None,
        "music_model": None,
        "providers": {},
        "fallback": {"brief": False, "art": False, "music": False, "sources": False},
        "durations_ms": {},
        "errors": {},
    }
    t0 = time.monotonic()
    step = "brief"
    event(conn, rid, "job_started", attempt=job["attempt"])
    with sentry_sdk.start_transaction(op="job", name="generation_job"):
        sentry_sdk.set_tag("job_id", str(jid))
        try:
            room = conn.execute("SELECT * FROM rooms WHERE id = %s", (rid,)).fetchone()
            if not room:
                raise StepError("room_missing")

            with timed(meta, "brief"), span("provider.text", "brief"):
                inp = brief.gather(conn, room)
                b, *outcome = brief.make_brief(inp)
            record(meta, "brief", *outcome)
            srcs = []
            if b.theme:
                with timed(meta, "sources"), span("provider.search", "sources"):
                    srcs, *outcome = sources.search(b.theme)
                record(meta, "sources", *outcome)
            update_job(conn, jid, brief=b.model_dump(), sources=srcs, model_metadata=meta)
            event(conn, rid, "brief_done", meta["durations_ms"]["brief"], participants=inp["participants"],
                  clips=inp["clips"], model=meta["text_model"], fallback=meta["fallback"]["brief"],
                  sources=len(srcs), sources_fallback=meta["fallback"]["sources"])

            step = "art"
            update_job(conn, jid, status="generating_art")
            with timed(meta, "art"), span("provider.image", "cover"):
                png, *outcome = art.make_cover(b, rid, storage_path(keys["cover"]))
            record(meta, "art", *outcome)
            # cover lands before music starts so the UI can reveal it early
            update_job(conn, jid, cover_art_object_key=keys["cover"], model_metadata=meta)
            event(conn, rid, "art_done", meta["durations_ms"]["art"], model=meta["image_model"],
                  fallback=meta["fallback"]["art"])

            step = "music"
            update_job(conn, jid, status="generating_music")
            with timed(meta, "music"), span("provider.music", "instrumental"):
                _, *outcome = music.make_instrumental(b, png, storage_path(keys["inst"]))
            record(meta, "music", *outcome)
            update_job(conn, jid, instrumental_object_key=keys["inst"], model_metadata=meta)
            event(conn, rid, "music_done", meta["durations_ms"]["music"], model=meta["music_model"],
                  fallback=meta["fallback"]["music"])

            step = "mix"
            update_job(conn, jid, status="mixing")
            with timed(meta, "mix"), span("audio.mix", "chorus-dsp mix"):
                report, outcome = mixdown(conn, rid, storage_path(keys["inst"]), storage_path(keys["song"]))
            meta["durations_ms"]["total"] = round((time.monotonic() - t0) * 1000)
            with conn.transaction():
                for cid, status in outcome.items():
                    conn.execute("UPDATE contributions SET status = %s WHERE id = %s", (status, cid))
                update_job(conn, jid, status="completed", completed_at=datetime.now(UTC), mix_report=report,
                           final_audio_object_key=keys["song"], model_metadata=meta)
                conn.execute("UPDATE rooms SET status = 'ready', title = %s WHERE id = %s", (b.title, rid))
                event(conn, rid, "mix_done", meta["durations_ms"]["mix"], included=report["included"],
                      voices=len(report["voices"]))
                event(conn, rid, "job_completed", meta["durations_ms"]["total"], attempt=job["attempt"],
                      fallback=meta["fallback"])
            log.info("job %s completed in %d ms", jid, meta["durations_ms"]["total"])
            return "completed"
        except Exception as e:
            code = e.code if isinstance(e, StepError) else "internal_error"
            if not isinstance(e, StepError):
                sentry_sdk.capture_exception(e)
            log.error("job %s failed at %s: %s (%s)", jid, step, code, type(e).__name__)
            fail(conn, job, step, code, meta, round((time.monotonic() - t0) * 1000))
            return "failed"


def fail(conn, job: dict, step: str, code: str, meta: dict, total_ms: int | None = None) -> None:
    meta.setdefault("errors", {})[step] = code
    if total_ms is not None:
        meta.setdefault("durations_ms", {})["total"] = total_ms
    with conn.transaction():
        update_job(conn, job["id"], status="failed", error_code=code,
                   error_message=MESSAGES.get(code, MESSAGES["internal_error"]), model_metadata=meta)
        set_room_status(conn, job["room_id"], "failed")
        event(conn, job["room_id"], "job_failed", total_ms, step=step, error_code=code, attempt=job["attempt"])
