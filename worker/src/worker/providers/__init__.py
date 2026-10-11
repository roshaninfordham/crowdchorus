"""Pluggable providers per capability, chosen by env (see README.md in this folder).

`<CAP>_PROVIDER=auto` (default) picks the first configured vendor, else `local`.
A failing vendor call reruns the step with `local` and reports the fallback.
"""

import logging

from ..config import env
from . import gemini, local, nimble, snowflake

log = logging.getLogger(__name__)

REGISTRY = {
    "text": {"local": local.LocalText, "gemini": gemini.GeminiText},
    "image": {"local": local.LocalImage, "nano-banana": gemini.NanoBananaImage},
    "music": {"local": local.LocalMusic, "lyria": gemini.LyriaMusic},
    "search": {"local": local.LocalSearch, "nimble": nimble.NimbleSearch},
    "analytics": {"local": local.LocalAnalytics, "snowflake": snowflake.SnowflakeSink},
}


def get(cap: str):
    """The provider selected by `<CAP>_PROVIDER` (auto | local | a registry name)."""
    options = REGISTRY[cap]
    choice = (env(f"{cap.upper()}_PROVIDER") or "auto").strip().lower()
    if choice == "auto":
        choice = next((n for n, cls in options.items() if n != "local" and cls.configured()), "local")
    elif choice not in options:
        log.warning("unknown %s_PROVIDER %r; using local", cap.upper(), choice)
        choice = "local"
    return options[choice]()


def model(cap: str, name: str) -> str:
    """The model id a provider reports (vendors expose `model`), else its name."""
    return getattr(REGISTRY[cap][name](), "model", name)


def attempt(cap: str, fn):
    """Run `fn(provider)` with the selected provider, falling back to local on any failure.

    Returns (result, provider_name, fallback, error_code). `fallback` is true whenever the
    local provider produced the result, so the UI labels it as template/demo output.
    """
    p, code = get(cap), None
    if p.name != "local":
        try:
            return fn(p), p.name, False, None
        except Exception as e:
            code = f"{cap}_invalid" if isinstance(e, ValueError) else f"{p.name}_error"
            log.warning("%s provider %s failed (%s); using local", cap, p.name, type(e).__name__)
    return fn(REGISTRY[cap]["local"]()), "local", True, code
