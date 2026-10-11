"""Build the demo video. The scene is the single source of truth for timing: it
exposes its sound cues (window.__cues) and where the real song starts
(window.__song), and this script turns those into the soundtrack.

  python demo/master.py probe [t ...]   stills to demo/out/probe/, default one per line
  python demo/master.py build            full render -> demo/out/crowdchorus-demo.mp4
"""
import json, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))
from localserver import serve
import sfx

W, H, FPS, SS = 1920, 1080, 30, 2
OUT = HERE / "out"
AUDIO = HERE / "audio"


def page(pw, base):
    b = pw.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none"])
    pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=SS)
    errors = []
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/demo/scene.html")
    try:
        pg.wait_for_function("window.__ready === true", timeout=90000)
    except Exception:
        print("\n".join(errors)); raise
    return b, pg, errors


def probe(times):
    meta = json.loads((AUDIO / "manifest.json").read_text())
    times = [float(t) for t in times] or [l["start"] + min(1.5, (l["end"] - l["start"]) * .7) for l in meta["lines"]]
    d = OUT / "probe"; d.mkdir(parents=True, exist_ok=True)
    with serve(HERE.parent) as base, sync_playwright() as pw:
        b, pg, errors = page(pw, base)
        for t in times:
            pg.evaluate("t => window.seek(t)", t)
            pg.screenshot(path=str(d / f"{t:06.2f}.jpg"), type="jpeg", quality=80, scale="css")
        print("errors:", errors or "none")
        b.close()
    print(f"{len(times)} stills -> {d}")


def soundtrack(cues, song_at, duration):
    spec = {"events": [{"t": c["t"], "type": c["type"], **({"gain": c["gain"]} if "gain" in c else {})} for c in cues]}
    (AUDIO / "sfx.json").write_text(json.dumps(spec))
    sfx.build(AUDIO / "sfx.json", AUDIO / "manifest.json", AUDIO)
    (AUDIO / "song_at.txt").write_text(str(song_at))
    mix(song_at)


def mix(song_at):
    song = HERE / "capture" / "song.mp3"
    ms = int(song_at * 1000)
    # voice on top; the real song plays clean for the reveal, then ducks under the narration
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(AUDIO / "voice.wav"), "-i", str(AUDIO / "sfx.wav"), "-i", str(AUDIO / "bed.wav"), "-i", str(song),
        "-filter_complex",
        "[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[v][key0];"
        "[key0]asplit=3[k1][k2][k3];"
        "[1:a]aresample=48000,aformat=channel_layouts=stereo[s];"
        "[2:a]aresample=48000,aformat=channel_layouts=stereo[b];"
        f"[3:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:15,afade=t=out:st=12:d=3,adelay={ms}|{ms},apad,volume=0.5[m];"
        "[s][k1]sidechaincompress=threshold=0.05:ratio=4:attack=12:release=260[sd];"
        "[b][k2]sidechaincompress=threshold=0.03:ratio=9:attack=15:release=380[bd];"
        "[m][k3]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=500[md];"
        "[v][sd][bd][md]amix=inputs=4:duration=first:normalize=0[mx];"
        "[mx]loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:level=false[out]",
        "-map", "[out]", "-ar", "48000", "-ac", "2", str(AUDIO / "mix.wav"),
    ], check=True)


def build():
    meta = json.loads((AUDIO / "manifest.json").read_text())
    total = int(round(meta["duration"] * FPS))
    OUT.mkdir(exist_ok=True)
    silent = OUT / "_video.mp4"
    t0 = time.time()
    with serve(HERE.parent) as base, sync_playwright() as pw:
        b, pg, errors = page(pw, base)
        cues, song_at = pg.evaluate("window.__cues"), pg.evaluate("window.__song")
        soundtrack(cues, song_at, meta["duration"])
        ff = subprocess.Popen([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(FPS), "-i", "-",
            "-vf", f"scale={W}:{H}:flags=lanczos:out_range=tv,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "medium",
            "-pix_fmt", "yuv420p", str(silent)], stdin=subprocess.PIPE)
        for i in range(total):
            pg.evaluate("t => window.seek(t)", i / FPS)
            ff.stdin.write(pg.screenshot(type="jpeg", quality=93))
            if i % 300 == 0:
                print(f"  frame {i}/{total}  {time.time() - t0:.0f}s", flush=True)
        ff.stdin.close()
        if ff.wait():
            raise RuntimeError("ffmpeg failed")
        print("errors:", errors or "none")
        b.close()
    final = OUT / "crowdchorus-demo.mp4"
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(silent), "-i", str(AUDIO / "mix.wav"),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(final)], check=True)
    silent.unlink()
    print(f"-> {final}  ({time.time() - t0:.0f}s)")


def remix():
    """Re-mix the soundtrack onto an existing render without re-rendering frames."""
    mix(float((AUDIO / "song_at.txt").read_text()))
    final = OUT / "crowdchorus-demo.mp4"
    tmp = OUT / "_remix.mp4"
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(final), "-i", str(AUDIO / "mix.wav"), "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(tmp)], check=True)
    tmp.replace(final)


if __name__ == "__main__":
    {"probe": lambda: probe(sys.argv[2:]), "build": build, "remix": remix}[sys.argv[1]]()
