"""One original, singable chorus line for a room (Gemini, labelled template fallback)."""

import logging

from pydantic import BaseModel, field_validator

from . import gemini
from .config import music

log = logging.getLogger(__name__)

MAX_WORDS = 12

# Original lines, each fits 8 beats at the shared BPM.
TEMPLATES = {
    "joyful": "We light the sky with every voice tonight",
    "dreamy": "Floating on a hum the whole room shares",
    "anthemic": "Raise it up, we are louder all as one",
    "melancholy": "Even the quiet ones are singing home",
    "playful": "Clap it, hum it, bounce it round the room",
    "fierce": "Stamp the floor, we will not sing small",
}
THEMED = "{theme}, we sing it all together"

SYSTEM = (
    "You write one short chorus line for a crowd to sing together. "
    f"It must be completely original, at most {MAX_WORDS} words, one line, "
    "easy to sing over 8 beats. Never quote, adapt or reference lyrics, titles "
    "or artists of existing songs. No names of people."
)


class ChorusLine(BaseModel):
    line: str

    @field_validator("line")
    @classmethod
    def singable(cls, v: str) -> str:
        v = " ".join(v.split()).strip("\"'“”")
        if not v or "\n" in v or len(v.split()) > MAX_WORDS:
            raise ValueError(f"line must be 1..{MAX_WORDS} words on one line")
        return v


def template(mood: str, theme: str | None = None) -> str:
    if theme:
        themed = THEMED.format(theme=" ".join(theme.split()).capitalize())
        if len(themed.split()) <= MAX_WORDS:
            return themed
    return TEMPLATES.get(mood, TEMPLATES["joyful"])


def chorus_line(mood: str, theme: str | None = None) -> tuple[str, str]:
    """Return (line, source) where source is 'gemini' or 'template'."""
    m = music()
    prompt = (
        f"Mood: {mood}. Theme: {theme or 'none'}. Tempo {m['bpm']} BPM, key {m['key']}. "
        "Write the chorus line."
    )
    try:
        return gemini.generate_json(prompt, ChorusLine, SYSTEM, timeout=20).line, "gemini"
    except gemini.NoKey:
        pass
    except Exception as e:  # any API/validation failure -> labelled template
        log.warning("chorus line fell back to template: %s", type(e).__name__)
    return template(mood, theme), "template"
