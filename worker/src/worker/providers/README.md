# Providers

Every external service the worker uses sits behind one small Protocol
(`base.py`). The pipeline only ever talks to these, so any vendor can be swapped in.

| Capability | Protocol | Env selector | `local` (labelled fallback) | Vendors |
|---|---|---|---|---|
| text | `TextProvider.chorus_line`, `.brief` | `TEXT_PROVIDER` | template line and brief | `gemini` |
| image | `ImageProvider.cover` | `IMAGE_PROVIDER` | seeded Pillow abstract cover | `nano-banana` |
| music | `MusicProvider.instrumental` | `MUSIC_PROVIDER` | prepared demo backing | `lyria` |
| search | `SearchProvider.search` | `SEARCH_PROVIDER` | no sources | `nimble` |
| analytics | `AnalyticsSink.export`, `.read` | `ANALYTICS_PROVIDER` | Postgres (`postgres-local`) | `snowflake` |

Selectors take `auto` (the default), `local`, or a vendor name. `auto` picks the
first vendor whose `configured()` is true, which means its keys are set, and
otherwise picks `local`. When a vendor call raises, the step reruns with `local`.
The job then records `fallback.<step> = true` and an error code
(`<cap>_invalid` for bad output, `<vendor>_error` for anything else). The
provider that actually ran is stored in `model_metadata.providers`, and its
model id in `text_model`, `image_model` and `music_model`.

Monitoring is not a provider: `observe.py` turns on Sentry only when
`SENTRY_DSN` is set.

## Adding a vendor

1. Create one file here, for example `acme.py`, with a class that has:
   - `name = "acme"`
   - a `configured()` classmethod that checks its env vars
   - an optional `model` attribute
   - the capability's methods from `base.py`

   Raise on any failure. Never return a half-result: the fallback depends on the exception.
2. Add one dict entry in `__init__.py`, for example `REGISTRY["music"]["acme"] = acme.AcmeMusic`.
3. Set `MUSIC_PROVIDER=acme`, or leave it on `auto` and set its key.

Some rules apply to every vendor:

- Never send nicknames or raw vocals anywhere.
- Keep timeouts short.
- Return the formats `base.py` describes: any Pillow-readable image, any
  ffmpeg-readable audio, or a pydantic `Brief`. The pipeline normalises and
  validates all output, so the cover always ends up a square PNG and the backing
  a 44.1 kHz mono WAV of at least 10 s that is not silent.
