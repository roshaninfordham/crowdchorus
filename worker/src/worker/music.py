"""Instrumental: Lyria clip decoded to the shared WAV format, else the prepared demo backing."""

import logging
import os
import shutil
import tempfile
from pathlib import Path

from . import gemini, media
from .brief import Brief
from .config import music, storage_path

log = logging.getLogger(__name__)

MIN_SECONDS = 10
SILENCE_DB = -50


class InvalidAudio(Exception):
    pass


def prompt(brief: Brief) -> str:
    m = music()
    return (
        "Instrumental only: no vocals, no singing, no humming, no spoken words. "
        f"An original {brief.mood} track in {m['key']} at {m['bpm']} BPM, 4/4, with the chord "
        f"progression {' - '.join(m['progression'])} repeating one chord per bar throughout. "
        f"Direction: {brief.musical_direction} "
        f"Leave space in the mid range for a crowd chorus entering at bars {m['chorus_entry_bars']}. "
        "Use the attached album cover only as a mood reference. "
        "Do not imitate any existing song or artist."
    )


def validate(wav: Path) -> None:
    if media.duration_s(wav) < MIN_SECONDS:
        raise InvalidAudio("too short")
    if media.dsp("analyze", wav)["rms_db"] < SILENCE_DB:
        raise InvalidAudio("silent")


def demo_backing() -> Path:
    """The prepared demo asset; rendered by chorus-dsp if `rake demo:assets` hasn't run."""
    demo = storage_path("demo/instrumental.wav")
    if not demo.exists():
        demo.parent.mkdir(parents=True, exist_ok=True)
        media.dsp("instrumental", demo)
    return demo


def make_instrumental(brief: Brief, cover_png: bytes | None, out: Path) -> tuple[bool, str | None]:
    """Write the backing to `out`; return (fallback, error_code)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    code = None
    with tempfile.TemporaryDirectory(dir=out.parent) as tmp:
        raw, wav = Path(tmp) / "lyria.bin", Path(tmp) / "instrumental.wav"
        try:
            raw.write_bytes(gemini.generate_music(prompt(brief), cover_png))
            media.to_wav(raw, wav)
            validate(wav)
            os.replace(wav, out)
            return False, None
        except gemini.NoKey:
            pass
        except (InvalidAudio, media.MediaError) as e:
            log.warning("lyria output unusable: %s", type(e).__name__)
            code = "music_invalid"
        except Exception as e:
            log.warning("lyria failed: %s", type(e).__name__)
            code = "lyria_error"
        shutil.copyfile(demo_backing(), wav)
        os.replace(wav, out)
    return True, code
