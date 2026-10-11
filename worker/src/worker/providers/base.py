"""One small Protocol per capability. Vendor methods raise on any failure; the
pipeline then reruns the step with the `local` provider and flags the fallback."""

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from ..brief import Brief


class Provider(Protocol):
    name: str

    @classmethod
    def configured(cls) -> bool:
        """True when credentials are present; `auto` selection picks the first configured vendor."""
        ...


class TextProvider(Provider, Protocol):
    def chorus_line(self, mood: str, theme: str | None) -> str: ...

    def brief(self, inp: dict) -> "Brief":
        """`inp` is brief.gather() output: aggregates only, never nicknames."""
        ...


class ImageProvider(Provider, Protocol):
    def cover(self, brief: "Brief", seed: str) -> bytes:
        """Image bytes in any Pillow-readable format; the caller squares it into a PNG."""
        ...


class MusicProvider(Provider, Protocol):
    def instrumental(self, brief: "Brief", cover_png: bytes | None) -> bytes:
        """Audio bytes in any ffmpeg-readable format; the caller decodes and validates them."""
        ...


class SearchProvider(Provider, Protocol):
    def search(self, theme: str) -> list[dict]:
        """Up to 2 {title, url, snippet}; never song lyrics."""
        ...


class AnalyticsSink(Provider, Protocol):
    def export(self, rows: list[dict]) -> bool:
        """Store finished-job rows. True when they now live in the sink (marks them exported)."""
        ...

    def read(self, conn) -> list[dict]:
        """All rows with at least final_status, participant_count, total_ms."""
        ...
