"""Schema validation: bad briefs and bad chorus lines never reach the pipeline."""

import types

import pytest
from pydantic import ValidationError

from worker import gemini
from worker.brief import Brief, make_brief, template
from worker.chorus import TEMPLATES, ChorusLine, chorus_line

GOOD = {
    "title": "Blue Hour Chorus",
    "chorus_text": "Even the quiet ones are singing home",
    "musical_direction": "Instrumental only, slow pop in C major.",
    "image_prompt": "Abstract layered waves, no people.",
    "palette": ["#22333B", "#5E6472", "#A9BCD0"],
    "mood": "melancholy",
    "theme": None,
}
INPUTS = {"mood": "dreamy", "mood_counts": {"dreamy": 3}, "theme": "night sea", "theme_words": [],
          "participants": 3, "clips": 3, "median_pitch_hz": 220.0, "voiced_ratio": 0.7, "chorus_line": None}


@pytest.mark.parametrize("bad", [
    {"palette": ["#22333B", "blue", "#A9BCD0"]},
    {"palette": ["#22333B"]},
    {"mood": "angry"},
    {"title": ""},
    {"title": None},
])
def test_bad_brief_is_rejected(bad):
    assert Brief.model_validate(GOOD)
    with pytest.raises(ValidationError):
        Brief.model_validate({**GOOD, **bad})


def test_invalid_gemini_output_falls_back_to_labelled_template(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini, "_create", lambda **_: types.SimpleNamespace(output_text='{"title": "x"}'))

    brief, fallback, code = make_brief(INPUTS)

    assert fallback and code == "brief_invalid"
    assert brief == template(INPUTS)


def test_chorus_line_limits(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ValidationError):
        ChorusLine(line="one two three four five six seven eight nine ten eleven twelve thirteen")
    assert all(len(t.split()) <= 12 for t in TEMPLATES.values())
    assert chorus_line("playful") == (TEMPLATES["playful"], "template")
