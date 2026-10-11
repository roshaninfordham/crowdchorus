"""Thin wrappers over the google-genai Interactions API (text JSON, image, music).

Each call raises on any failure; callers decide the labelled fallback.
Shapes follow ai.google.dev/gemini-api/docs (structured-output, image-generation,
music-generation), which document `client.interactions.create`.
"""

import base64
from typing import TypeVar

from pydantic import BaseModel

from .config import env

M = TypeVar("M", bound=BaseModel)


class NoKey(Exception):
    """GEMINI_API_KEY unset: use the template path."""


def _create(**body):
    key = env("GEMINI_API_KEY")
    if not key:
        raise NoKey
    from google import genai

    # keep the client referenced for the whole call: a dropped Client closes its transport
    with genai.Client(api_key=key) as client:
        return client.interactions.create(**body)


def generate_json(prompt: str, schema: type[M], system: str, timeout: float = 45) -> M:
    interaction = _create(
        model=env("GEMINI_TEXT_MODEL"),
        system_instruction=system,
        input=prompt,
        response_format={"type": "text", "mime_type": "application/json", "schema": schema.model_json_schema()},
        timeout=timeout,
    )
    return schema.model_validate_json(interaction.output_text or "")


def generate_image(prompt: str, timeout: float = 90) -> bytes:
    interaction = _create(
        model=env("GEMINI_IMAGE_MODEL"),
        input=prompt,
        response_format={"type": "image", "aspect_ratio": "1:1"},
        timeout=timeout,
    )
    if not interaction.output_image or not interaction.output_image.data:
        raise ValueError("no image in response")
    return base64.b64decode(interaction.output_image.data)


def generate_music(prompt: str, image_png: bytes | None, timeout: float = 180) -> bytes:
    """Lyria clip (~30 s, MP3). The cover goes in as image input when we have one."""
    content = [{"type": "text", "text": prompt}]
    if image_png:
        content.append({"type": "image", "mime_type": "image/png", "data": base64.b64encode(image_png).decode()})
    interaction = _create(model=env("LYRIA_MODEL"), input=content, timeout=timeout)
    if not interaction.output_audio or not interaction.output_audio.data:
        raise ValueError("no audio in response")
    return base64.b64decode(interaction.output_audio.data)
