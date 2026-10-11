"""Subprocess wrappers: the chorus-dsp CLI and ffmpeg/ffprobe."""

import json
import subprocess
from pathlib import Path

from .config import dsp_bin


class MediaError(Exception):
    pass


def dsp(*args) -> dict:
    """Run chorus-dsp; it prints one JSON object, and `{"error"}` with exit 1 on failure."""
    p = subprocess.run([dsp_bin(), *map(str, args)], capture_output=True, text=True, timeout=180)
    try:
        out = json.loads(p.stdout)
    except json.JSONDecodeError:
        raise MediaError("chorus-dsp printed no JSON") from None
    if p.returncode:
        raise MediaError(str(out.get("error", "chorus-dsp failed"))[:200])
    return out


def _ffmpeg(*args) -> None:
    p = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)],
                       capture_output=True, text=True, timeout=300)
    if p.returncode:
        raise MediaError("ffmpeg failed")


def to_wav(src: Path, dst: Path) -> None:
    """Decode anything ffmpeg reads to the shared format: 44.1 kHz mono s16 WAV."""
    _ffmpeg("-i", src, "-ac", 1, "-ar", 44100, "-c:a", "pcm_s16le", dst)


def to_mp3(src: Path, dst: Path) -> None:
    # loudnorm upsamples internally to 192 kHz, so pin the output rate
    _ffmpeg("-i", src, "-af", "loudnorm=I=-14:TP=-1", "-ar", 44100, "-c:a", "libmp3lame", "-b:a", "192k", dst)


def duration_s(path: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, timeout=30)
    try:
        return float(p.stdout.strip())
    except ValueError:
        raise MediaError("ffprobe could not read duration") from None
