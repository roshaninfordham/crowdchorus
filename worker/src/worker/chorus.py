"""One original, singable chorus line for a room (text provider, labelled template fallback)."""

from pydantic import BaseModel, field_validator

from . import providers
from .config import music

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


def prompt(mood: str, theme: str | None) -> str:
    m = music()
    return f"Mood: {mood}. Theme: {theme or 'none'}. Tempo {m['bpm']} BPM, key {m['key']}. Write the chorus line."


def template(mood: str, theme: str | None = None) -> str:
    if theme:
        themed = THEMED.format(theme=" ".join(theme.split()).capitalize())
        if len(themed.split()) <= MAX_WORDS:
            return themed
    return TEMPLATES.get(mood, TEMPLATES["joyful"])


def chorus_line(mood: str, theme: str | None = None) -> tuple[str, str]:
    """Return (line, source): source is the provider name, 'template' for the local one."""
    line, name, _, _ = providers.attempt(
        "text", lambda p: ChorusLine(line=p.chorus_line(mood, theme)).line  # re-validate every provider's output
    )
    return line, "template" if name == "local" else name
