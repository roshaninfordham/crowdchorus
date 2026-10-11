"""Inspiration links for the room theme via Nimble Search (POST /v2/search). Never blocks."""

import logging

import httpx

from .config import env

log = logging.getLogger(__name__)

URL = "https://sdk.nimbleway.com/v2/search"
LYRICS_SITES = ["genius.com", "azlyrics.com", "lyrics.com", "musixmatch.com", "songlyrics.com", "lyricsfreak.com"]


def search(theme: str) -> tuple[list[dict], bool, str | None]:
    """Return (sources, fallback, error_code). Up to 2 {title, url, snippet}, never lyrics."""
    key = env("NIMBLE_API_KEY")
    if not key:
        return [], True, None
    try:
        r = httpx.post(
            URL,
            headers={"Authorization": f"Bearer {key}"},
            json={
                "query": f"{theme} inspiration art culture",
                "max_results": 5,
                "search_depth": "lite",
                "output_format": "plain_text",
                "exclude_domains": LYRICS_SITES,
            },
            timeout=8,
        )
        r.raise_for_status()
        results = r.json().get("results") or []
    except (httpx.HTTPError, ValueError) as e:
        log.warning("nimble search failed: %s", type(e).__name__)
        return [], True, "nimble_error"
    out = []
    for res in results:
        title, url = str(res.get("title") or "").strip(), str(res.get("url") or "")
        if not title or not url.startswith("https://") or "lyric" in (title + url).lower():
            continue
        out.append({"title": title[:120], "url": url, "snippet": str(res.get("description") or "").strip()[:240]})
        if len(out) == 2:
            break
    return out, not out, None if out else "nimble_empty"
