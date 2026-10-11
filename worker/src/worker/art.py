"""Album cover: Nano Banana image, else a procedural abstract cover from the brief palette."""

import io
import logging
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from . import gemini
from .brief import Brief

log = logging.getLogger(__name__)

SIZE = 1024


def square_png(data: bytes) -> bytes:
    """Whatever the model returned (JPEG, PNG, any aspect) becomes a square PNG."""
    img = ImageOps.fit(Image.open(io.BytesIO(data)).convert("RGB"), (SIZE, SIZE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def procedural(palette: list[str], seed: str) -> bytes:
    """Deterministic abstract cover: palette gradient, blurred orbs and arcs, seeded by room id."""
    rng = random.Random(seed)
    colors = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in palette]
    top, bottom = colors[0], colors[-1]
    img = Image.linear_gradient("L").resize((SIZE, SIZE))
    img = ImageOps.colorize(img, top, bottom).convert("RGBA")

    orbs = Image.new("RGBA", (SIZE, SIZE))
    d = ImageDraw.Draw(orbs)
    for _ in range(rng.randint(5, 9)):
        r = rng.randint(SIZE // 8, SIZE // 2)
        x, y = rng.randint(-r // 2, SIZE), rng.randint(-r // 2, SIZE)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(*rng.choice(colors), rng.randint(90, 180)))
    img.alpha_composite(orbs.filter(ImageFilter.GaussianBlur(SIZE // 14)))

    arcs = Image.new("RGBA", (SIZE, SIZE))
    d = ImageDraw.Draw(arcs)
    for _ in range(rng.randint(3, 6)):
        r = rng.randint(SIZE // 5, SIZE)
        cx, cy = rng.randint(0, SIZE), rng.randint(0, SIZE)
        start = rng.randint(0, 360)
        d.arc((cx - r, cy - r, cx + r, cy + r), start, start + rng.randint(60, 200),
              fill=(*rng.choice(colors), 200), width=rng.randint(4, 18))
    img.alpha_composite(arcs.filter(ImageFilter.GaussianBlur(2)))

    buf = io.BytesIO()
    img.convert("RGB").save(buf, "PNG")
    return buf.getvalue()


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def make_cover(brief: Brief, room_id: str, path: Path) -> tuple[bytes, bool, str | None]:
    """Write the cover to `path`; return (png, fallback, error_code)."""
    prompt = (
        f"{brief.image_prompt}\nSquare 1:1 abstract album cover for an original song titled "
        f"'{brief.title}'. Use this palette: {', '.join(brief.palette)}. "
        "Abstract only: no people, faces, portraits, hands, logos, words or letters."
    )
    png, fallback, code = None, True, None
    try:
        png, fallback = square_png(gemini.generate_image(prompt)), False
    except gemini.NoKey:
        pass
    except Exception as e:
        log.warning("cover fell back to procedural art: %s", type(e).__name__)
        code = "image_error"
    if png is None:
        png = procedural(brief.palette, room_id)
    write_atomic(path, png)
    return png, fallback, code
