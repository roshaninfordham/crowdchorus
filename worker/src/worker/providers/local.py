"""Local providers: no keys, no network. Their output is always labelled as a fallback
(template text, procedural cover, prepared demo backing, no sources, Postgres analytics)."""

# module imports (not names): these modules import the providers package themselves
from .. import analytics, art, brief, chorus, music


class LocalText:
    name = "local"

    @classmethod
    def configured(cls) -> bool:
        return True

    def chorus_line(self, mood, theme):
        return chorus.template(mood, theme)

    def brief(self, inp):
        return brief.template(inp)


class LocalImage:
    name = "local"

    @classmethod
    def configured(cls) -> bool:
        return True

    def cover(self, b, seed):
        return art.procedural(b.palette, seed)


class LocalMusic:
    name = "local"

    @classmethod
    def configured(cls) -> bool:
        return True

    def instrumental(self, b, cover_png):
        return music.demo_backing().read_bytes()


class LocalSearch:
    name = "local"

    @classmethod
    def configured(cls) -> bool:
        return True

    def search(self, theme):
        return []


class LocalAnalytics:
    name = "local"

    @classmethod
    def configured(cls) -> bool:
        return True

    def export(self, rows):
        return False  # rows already live in Postgres; nothing to mark exported

    def read(self, conn):
        return analytics.rows(conn)
