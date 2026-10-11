"""Environment and shared constants. Read at call time so tests can monkeypatch env."""

import json
import os
from functools import cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

DEFAULTS = {
    "DATABASE_URL": "postgres://postgres:crowdchorus@localhost:5434/crowdchorus",
    "STORAGE_DIR": "./storage",
    "CHORUS_DSP_BIN": "dsp/target/release/chorus-dsp",
    "GEMINI_TEXT_MODEL": "gemini-2.5-flash",
    "GEMINI_IMAGE_MODEL": "gemini-nano-banana-2.1",
    "LYRIA_MODEL": "lyria-3-clip-preview",
}


def env(name: str) -> str:
    """Env var, falling back to the contract default; '' when unset with no default."""
    return os.environ.get(name) or DEFAULTS.get(name, "")


def storage_path(key: str) -> Path:
    return Path(env("STORAGE_DIR")) / key


def dsp_bin() -> str:
    return env("CHORUS_DSP_BIN")


@cache
def music() -> dict:
    return json.loads((REPO_ROOT / "music.json").read_text())
