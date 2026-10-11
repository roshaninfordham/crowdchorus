# CrowdChorus — product requirements

**Tagline:** One room. Many voices. One original song.

A group joins a browser room, sings one short original chorus line, and the
app produces one original track containing their real voices over an
AI-generated instrumental, plus unique album art and a shareable results page.
No accounts, no installs. Microphone needed only to sing; a presenter can
demo with clearly labelled simulated participants.

Lyria cannot take crowd recordings as input. Lyria makes the instrumental;
we mix the human vocals in ourselves (`chorus-dsp`).

## Exactly three user-facing features

### A. Join and contribute
* Host creates a room with a 6-character join code (`[A-Z2-9]`), shares URL or QR code.
* Participants join on desktop/mobile with a nickname (no account), pick one
  mood (from `music.json` moods) and optionally suggest a short theme.
* Gemini writes one original short chorus line for the room (template fallback, labelled).
* Everyone sees the same line, a pitch guide (the `music.json` motif played
  with WebAudio) and a 4-beat count-in at the shared BPM.
* Record 5–8 s via `getUserMedia` + `MediaRecorder` (format chosen with
  `isTypeSupported`). Singing, humming or the shown line are all fine.
* Preview playback, retry, and explicit consent + submit before it counts.
  Withdraw is possible until the host finalizes.
* Live roster: nickname, submitted status, contribution count.
* Host can add simulated participants (labelled "Simulated").
* Room size 2–20.

### B. Generate the collective single (host closes the round)
1. Creative brief from moods, theme words, participant count and aggregate
   audio characteristics (median pitch, voiced ratio from `chorus-dsp analyze`).
2. Gemini structured output: title, chorus text, musical direction, image prompt. Schema-validated.
3. Optional Nimble search on the theme: 1–2 source links shown in an
   "Inspiration" panel. Failure never blocks.
4. Album cover via Nano Banana: square, abstract, no portraits.
5. Instrumental via Lyria, instrumental-only prompt, cover passed as image
   input where supported, at the shared key/BPM/progression.
6. Mix human vocals into the instrumental (`chorus-dsp mix`, FFmpeg encode).
7. Save audio, art, title, metadata. Show real per-step status; a step shows
   complete only when it succeeded. Show the cover as soon as it exists.
* On failure: a recoverable failure state and one explicit retry. A prepared
  demo instrumental may be used as fallback, always labelled
  "prepared demo backing — not generated for this room".

### C. Share the result
* Cover, title, participant count, audio player (play/pause), download, share URL.
* Measured metrics only: submitted recordings, successful participants,
  retries, generation time, contribution latency (room open → last submission).
* Aggregate analytics panel from Snowflake (or labelled local fallback).
* Never show invented listen counts or impact claims.
* Refreshing never loses a finished result.

## Pages
* `/` landing: big headline, short explanation, "Create a room" primary,
  "Join a room" (code input) secondary.
* `/r/[code]` room: roster, recording control, chorus line, count-in, counter;
  host controls (simulate participant, finalize). Becomes the generation view
  (the six steps: Collecting the crowd's sound → Crafting the collective
  identity → Creating album artwork → Composing the music → Mixing the voices
  → Finishing the collective single) once generating.
* `/s/[code]` results: the reveal. Big cover, title, player, metrics, sources, analytics.

Visual style: polished, accessible music-studio aesthetic, dark-first.

## Privacy and abuse
* Ask before recording; say voices will be mixed into a shared recording.
* Never record in the background. No voice cloning, no identity inference.
* Raw clips are private and deleted after `RETENTION_HOURS`.
* Host actions require the host token. Validate every payload. Sanitize text.
* Rate-limit room creation, upload and generation endpoints.
* No user-supplied URLs fetched server-side.
* Ask people to sing original material or the shown line, not copyrighted lyrics.
* Never send raw audio, nicknames or themes to Sentry or Snowflake.

## Acceptance criteria
1. Host creates a room and shares a working URL/code.
2. 3+ separate browser sessions join the same room and see live updates.
3. 3+ participants record and submit successfully.
4. Finalize; duplicate clicks do not create duplicate jobs.
5. Gemini produces a valid chorus and brief (or labelled template when no key).
6. A unique cover is generated and saved.
7. Lyria produces an instrumental, or the UI says why it failed.
8. The final audio contains the human contributions over the instrumental.
9. Cover, song and metadata appear together on a shareable results page.
10. Refresh keeps completed results.
11. Postgres/Tiger Data holds room, contributions, job, events.
12. Snowflake analytics returns real data (when configured).
13. Nimble returns a source link, and its failure doesn't block.
14. Sentry receives a test exception (when configured).
15. No API key or private audio reaches browser code or logs.
16. The main flow can be demoed in under 3 minutes using the prepared fallback.
