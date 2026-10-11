"""Provider selection by env, vendor-failure fallback, and import order independence."""

import json
import subprocess
import sys

import pytest

from worker import providers
from worker.chorus import TEMPLATES, chorus_line
from worker.providers import gemini


def test_auto_picks_configured_vendor_else_local(storage, monkeypatch):
    assert {cap: providers.get(cap).name for cap in providers.REGISTRY} == dict.fromkeys(providers.REGISTRY, "local")
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setenv("NIMBLE_API_KEY", "k")
    assert [providers.get(c).name for c in ("text", "image", "music", "search")] == \
        ["gemini", "nano-banana", "lyria", "nimble"]
    monkeypatch.setenv("TEXT_PROVIDER", "local")
    monkeypatch.setenv("IMAGE_PROVIDER", "no-such-vendor")
    assert (providers.get("text").name, providers.get("image").name) == ("local", "local")


def test_failing_vendor_falls_back_to_local_with_flag(storage, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k")

    def boom(**_):
        raise ConnectionError("down")

    monkeypatch.setattr(gemini, "_create", boom)
    line, name, fallback, code = providers.attempt("text", lambda p: p.chorus_line("fierce", None))
    assert (line, name, fallback, code) == (TEMPLATES["fierce"], "local", True, "gemini_error")
    assert chorus_line("fierce") == (TEMPLATES["fierce"], "template")


@pytest.mark.parametrize("module", ["chorus", "brief", "art", "music", "sources", "analytics", "pipeline",
                                    "loop", "providers", "providers.local", "providers.gemini"])
def test_every_module_imports_first(module):
    """Circular imports only bite when a given module is imported first."""
    subprocess.run([sys.executable, "-c", f"import worker.{module}"], check=True)


def test_chorus_cli_prints_one_json_object(storage):
    out = subprocess.run([sys.executable, "-m", "worker", "chorus", "--mood", "dreamy", "--theme", "night sea"],
                         check=True, capture_output=True, text=True).stdout
    assert json.loads(out) == {"line": "Night sea, we sing it all together", "source": "template"}
