"""Stand-in singers for the demo capture: Kokoro reads the room's chorus line in
three different voices. Each WAV is fed to one headless Chrome as its fake mic,
padded so the line lands inside the 6 s take that follows the 4-beat count-in.

usage: voices.py "<chorus line>" <out_dir>"""
import sys, warnings, numpy as np, soundfile as sf
from pathlib import Path
warnings.filterwarnings("ignore")
from kokoro import KPipeline

SR = 24000
VOICES = {"host": "af_heart", "guest1": "am_michael", "guest2": "bf_emma"}
LEAD, TOTAL = 3.0, 12.0   # count-in is ~2.6 s after the mic opens

line, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
pipes = {"a": KPipeline(lang_code="a"), "b": KPipeline(lang_code="b")}
for name, voice in VOICES.items():
    audio = np.concatenate([np.asarray(a, np.float32) for _, _, a in pipes[voice[0]](line, voice=voice, speed=0.9)])
    clip = np.zeros(int(TOTAL * SR), np.float32)
    clip[int(LEAD * SR):int(LEAD * SR) + len(audio)] = audio[: int((TOTAL - LEAD) * SR)]
    sf.write(out / f"{name}.wav", clip / (np.abs(clip).max() or 1) * 0.8, SR, subtype="PCM_16")
    print(name, f"{len(audio) / SR:.2f}s")
