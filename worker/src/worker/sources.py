"""Inspiration links for the room theme via the search provider. Never blocks the job."""

from . import providers


def search(theme: str) -> tuple[list[dict], str, bool, str | None]:
    """Return (sources, provider, fallback, error_code): up to 2 {title, url, snippet}."""
    return providers.attempt("search", lambda p: p.search(theme)[:2])
