"""Google Gemini API providers via the google-genai Interactions API:
text (Gemini), image (Nano Banana) and music (Lyria).

Shapes follow ai.google.dev/gemini-api/docs (structured-output, image-generation,
music-generation), which document `client.interactions.create`.
"""

import base64
from typing import TypeVar

from pydantic import BaseModel

from .. import brief, chorus, music
from ..config import env

M = TypeVar("M", bound=BaseModel)


def _create(**body):
    from google import genai

    # keep the client referenced for the whole call: a dropped Client closes its transport
    with genai.Client(api_key=env("GEMINI_API_KEY")) as client:
        return client.interactions.create(**body)


def _json(prompt: str, schema: type[M], system: str, timeout: float) -> M:
    interaction = _create(
        model=env("GEMINI_TEXT_MODEL"),
        system_instruction=system,
        input=prompt,
        response_format={"type": "text", "mime_type": "application/json", "schema": schema.model_json_schema()},
        timeout=timeout,
    )
    return schema.model_validate_json(interaction.output_text or "")


class _Keyed:
    model_env = ""

    @classmethod
    def configured(cls) -> bool:
        return bool(env("GEMINI_API_KEY"))

    @property
    def model(self) -> str:
        return env(self.model_env)


class GeminiText(_Keyed):
    name = "gemini"
    model_env = "GEMINI_TEXT_MODEL"

    def chorus_line(self, mood, theme):
        return _json(chorus.prompt(mood, theme), chorus.ChorusLine, chorus.SYSTEM, timeout=20).line

    def brief(self, inp):
        return _json(brief.prompt(inp), brief.Brief, brief.SYSTEM, timeout=45)


class NanoBananaImage(_Keyed):
    name = "nano-banana"
    model_env = "GEMINI_IMAGE_MODEL"

    def cover(self, b, seed):
        interaction = _create(
            model=env("GEMINI_IMAGE_MODEL"),
            input=b.cover_prompt(),
            response_format={"type": "image", "aspect_ratio": "1:1"},
            timeout=90,
        )
        if not interaction.output_image or not interaction.output_image.data:
            raise RuntimeError("no image in response")
        return base64.b64decode(interaction.output_image.data)


class LyriaMusic(_Keyed):
    name = "lyria"
    model_env = "LYRIA_MODEL"

    def instrumental(self, b, cover_png):
        """Lyria clip (~30 s, MP3). The cover goes in as image input when we have one."""
        content = [{"type": "text", "text": music.prompt(b)}]
        if cover_png:
            content.append({"type": "image", "mime_type": "image/png", "data": base64.b64encode(cover_png).decode()})
        interaction = _create(model=env("LYRIA_MODEL"), input=content, timeout=180)
        if not interaction.output_audio or not interaction.output_audio.data:
            raise RuntimeError("no audio in response")
        return base64.b64decode(interaction.output_audio.data)
