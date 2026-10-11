"""Instrumental: music provider output decoded to the shared WAV format, else the prepared demo backing."""

import os
import tempfile
from pathlib import Path

from . import media, providers
from .config import music, storage_path

MIN_SECONDS = 10
SILENCE_DB = -50


class InvalidAudio(ValueError):
    pass


def prompt(brief) -> str:
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


def install(audio: bytes, out: Path) -> None:
    """Decode any provider's audio to 44.1 kHz mono WAV, validate it, then atomically place it."""
    with tempfile.TemporaryDirectory(dir=out.parent) as tmp:
        raw, wav = Path(tmp) / "provider.bin", Path(tmp) / "instrumental.wav"
        raw.write_bytes(audio)
        try:
            media.to_wav(raw, wav)
        except media.MediaError:
            raise InvalidAudio("undecodable") from None
        validate(wav)
        os.replace(wav, out)


def make_instrumental(brief, cover_png: bytes | None, out: Path) -> tuple[None, str, bool, str | None]:
    """Write the backing to `out`; return (None, provider, fallback, error_code)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    return providers.attempt("music", lambda p: install(p.instrumental(brief, cover_png), out))
