"""Nimble Search (POST https://sdk.nimbleway.com/v2/search) for theme inspiration links."""

import httpx

from ..config import env

URL = "https://sdk.nimbleway.com/v2/search"
LYRICS_SITES = ["genius.com", "azlyrics.com", "lyrics.com", "musixmatch.com", "songlyrics.com", "lyricsfreak.com"]


class NimbleSearch:
    name = "nimble"

    @classmethod
    def configured(cls) -> bool:
        return bool(env("NIMBLE_API_KEY"))

    def search(self, theme):
        r = httpx.post(
            URL,
            headers={"Authorization": f"Bearer {env('NIMBLE_API_KEY')}"},
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
        out = []
        for res in r.json().get("results") or []:
            title, url = str(res.get("title") or "").strip(), str(res.get("url") or "")
            if not title or not url.startswith("https://") or "lyric" in (title + url).lower():
                continue
            out.append({"title": title[:120], "url": url, "snippet": str(res.get("description") or "").strip()[:240]})
            if len(out) == 2:
                break
        if not out:
            raise ValueError("no usable results")
        return out
