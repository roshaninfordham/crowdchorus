"""Waveform peaks for the scene: the real song from the captured room and the
three stand-in mic takes. Writes demo/capture/peaks.json."""
import json, subprocess, numpy as np
from pathlib import Path
cap = Path(__file__).parent / "capture"

def peaks(path, n, start=0.0, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(path)] + (["-t", str(dur)] if dur else []) + ["-ac", "1", "-ar", "8000", "-f", "f32le", "-"]
    a = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)
    p = np.abs(a[: len(a) // n * n]).reshape(n, -1).max(1)
    return [round(float(x), 3) for x in p / (p.max() or 1)]

out = {"song": peaks(cap / "song.mp3", 480),
       "mics": [peaks(cap / "mics" / f"{m}.wav", 160, 2.6, 6.0) for m in ("host", "guest1", "guest2")]}
(cap / "peaks.json").write_text(json.dumps(out))
print("peaks ok")
import shutil; shutil.copy(cap.parent.parent.parent / "music.json", cap / "music.json")
