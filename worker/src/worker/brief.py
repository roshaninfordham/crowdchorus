"""Creative brief: aggregate the room, ask Gemini for structured JSON, else a labelled template."""

import json
import logging
import statistics
from collections import Counter
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from . import gemini
from .chorus import template as template_line
from .config import music, storage_path
from .media import MediaError, dsp

log = logging.getLogger(__name__)

Hex = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]


class Brief(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    chorus_text: str = Field(min_length=1, max_length=120)
    musical_direction: str = Field(min_length=1, max_length=500)
    image_prompt: str = Field(min_length=1, max_length=500)
    palette: list[Hex] = Field(min_length=3, max_length=5)
    mood: str
    theme: str | None = None

    @field_validator("mood")
    @classmethod
    def known_mood(cls, v: str) -> str:
        if v not in music()["moods"]:
            raise ValueError("mood must be one of music.json moods")
        return v


SYSTEM = (
    "You write the creative brief for one original song sung by a crowd. "
    "Everything you write must be original: never quote, paraphrase or reference "
    "lyrics, titles or artists of existing songs. The title is short and new. "
    "The image prompt describes a square, abstract album cover: shapes, light, "
    "texture and colour only, no people, faces, portraits, logos or text. "
    "The palette is 3 to 5 hex colours like #1A2B3C that fit the mood."
)

PALETTES = {
    "joyful": ["#FFB703", "#FB8500", "#FFD6A5", "#219EBC"],
    "dreamy": ["#CDB4DB", "#A2D2FF", "#BDE0FE", "#3A2E5C"],
    "anthemic": ["#D62828", "#F77F00", "#FCBF49", "#003049"],
    "melancholy": ["#22333B", "#5E6472", "#A9BCD0", "#EAE0D5"],
    "playful": ["#FF70A6", "#70D6FF", "#FFD670", "#E9FF70"],
    "fierce": ["#0B0B0B", "#9D0208", "#E85D04", "#FAA307"],
}
TITLES = {
    "joyful": "Sunlight in Unison",
    "dreamy": "A Hum Between Clouds",
    "anthemic": "All Our Voices Rise",
    "melancholy": "Blue Hour Chorus",
    "playful": "Bounce of the Room",
    "fierce": "Thunder We Made",
}


def gather(conn, room: dict) -> dict:
    """Aggregate room inputs. Counts and audio statistics only, never nicknames."""
    people = conn.execute("SELECT mood, theme_suggestion FROM participants WHERE room_id = %s", (room["id"],)).fetchall()
    clips = conn.execute(
        "SELECT audio_object_key, analysis FROM contributions WHERE room_id = %s AND status = 'accepted'",
        (room["id"],),
    ).fetchall()
    moods = Counter(p["mood"] for p in people if p["mood"] in music()["moods"])
    # tie-break by music.json order so the dominant mood is deterministic
    mood = max(music()["moods"], key=lambda m: (moods[m], -music()["moods"].index(m))) if moods else "joyful"
    suggestions = Counter(p["theme_suggestion"].strip() for p in people if (p["theme_suggestion"] or "").strip())
    theme = (room.get("theme") or "").strip() or (suggestions.most_common(1)[0][0] if suggestions else None)

    pitches, voiced = [], []
    for c in clips:
        a = c["analysis"]
        if not a and c["audio_object_key"]:
            try:
                a = dsp("analyze", storage_path(c["audio_object_key"]))
            except MediaError:
                a = None
        if a:
            if a.get("median_pitch_hz"):
                pitches.append(a["median_pitch_hz"])
            voiced.append(a.get("voiced_ratio") or 0.0)
    return {
        "mood": mood,
        "mood_counts": dict(moods),
        "theme": theme,
        "theme_words": sorted(suggestions),
        "participants": len(people),
        "clips": len(clips),
        "median_pitch_hz": round(statistics.median(pitches), 1) if pitches else None,
        "voiced_ratio": round(statistics.fmean(voiced), 2) if voiced else None,
        "chorus_line": room.get("chorus_line"),
    }


def template(inp: dict) -> Brief:
    m, mood = music(), inp["mood"]
    palette = PALETTES[mood]
    voice = f"{inp['clips']} crowd voices"
    if inp["median_pitch_hz"]:
        voice += f" centred near {inp['median_pitch_hz']:.0f} Hz"
    return Brief(
        title=TITLES[mood],
        chorus_text=inp["chorus_line"] or template_line(mood, inp["theme"]),
        musical_direction=(
            f"{mood.capitalize()} pop in {m['key']} at {m['bpm']} BPM over {'-'.join(m['progression'])}; "
            f"warm, steady groove that leaves room for {voice} on the chorus."
        ),
        image_prompt=(
            f"Square abstract album cover, {mood} energy: layered flowing shapes and soft light "
            f"in {', '.join(palette)}. No people, no faces, no text."
        ),
        palette=palette,
        mood=mood,
        theme=inp["theme"],
    )


def make_brief(inp: dict) -> tuple[Brief, bool, str | None]:
    """Return (brief, fallback, error_code)."""
    m = music()
    facts = {k: inp[k] for k in ("mood", "mood_counts", "theme", "theme_words", "participants",
                                 "median_pitch_hz", "voiced_ratio")}
    facts.update(key=m["key"], bpm=m["bpm"], progression=m["progression"], allowed_moods=m["moods"])
    prompt = (
        "Room facts (JSON):\n" + json.dumps(facts) + "\n"
        + (f"The crowd sang this line; use it verbatim as chorus_text: {inp['chorus_line']}\n" if inp["chorus_line"] else
           "Write an original chorus_text of at most 12 words, singable over 8 beats.\n")
        + "musical_direction must say instrumental only and keep the key, tempo and progression."
    )
    try:
        brief = gemini.generate_json(prompt, Brief, SYSTEM)
    except gemini.NoKey:
        return template(inp), True, None
    except Exception as e:  # API error or schema-invalid output -> labelled template
        code = "brief_invalid" if isinstance(e, ValueError) else "gemini_error"
        log.warning("brief fell back to template: %s", code)
        return template(inp), True, code
    # the crowd already sang chorus_line and the theme is the room's own: keep them authoritative
    brief.chorus_text = inp["chorus_line"] or brief.chorus_text
    brief.theme = inp["theme"]
    return brief, False, None
