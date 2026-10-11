"""Album cover: image provider, else a procedural abstract cover from the brief palette."""

import io
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from . import providers

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


def make_cover(brief, room_id: str, path: Path) -> tuple[bytes, str, bool, str | None]:
    """Write the cover to `path`; return (png, provider, fallback, error_code)."""
    png, *rest = providers.attempt("image", lambda p: square_png(p.cover(brief, room_id)))
    write_atomic(path, png)
    return png, *rest
