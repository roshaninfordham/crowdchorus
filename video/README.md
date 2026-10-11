# Demo video

A three-minute walkthrough, built from a real run of the app. Nothing is mocked:
the footage is screenshots of three separate Chrome sessions (one desktop host, two
phones) using the running app, and the song in the reveal is that room's actual mix.

Pipeline, adapted from an open-source ad-video toolkit:

1. `capture.mjs` drives `rake dev` with Playwright. Each browser gets its own fake
   microphone, fed by `voices.py` (Kokoro TTS reading the room's chorus line).
   It saves 2x/3x screenshots, the boxes of every element the cursor clicks, and
   the room's `song.mp3`, `cover.png` and job record.
2. `demo/prep.py` computes waveform peaks for the song and the mic takes.
3. `scripts/tts.py demo/script.json demo/audio` synthesizes the narration line by
   line and writes the measured timings to `manifest.json`.
4. `demo/scene.html` is a GSAP timeline keyed to those timings. Every frame is a
   pure function of time.
5. `demo/master.py build` seeks the scene frame by frame, mixes voice, the real
   song and procedural sound effects (loudness −14 LUFS), and writes
   `demo/out/crowdchorus-demo.mp4`.

```bash
uv venv --python 3.12 video/.venv
uv pip install --python video/.venv/bin/python kokoro soundfile numpy playwright pedalboard \
  https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
rake dev                                   # in another terminal
node video/capture.mjs
video/.venv/bin/python video/demo/prep.py
video/.venv/bin/python video/scripts/tts.py video/demo/script.json video/demo/audio
video/.venv/bin/python video/demo/master.py probe   # stills, look at them
video/.venv/bin/python video/demo/master.py build
```

With vendor keys in `.env.local`, re-run from step 1: the capture then shows the real
Gemini, Nano Banana and Lyria output. Then update the `p_honest` line in
`demo/script.json`, which says that no keys were set.
