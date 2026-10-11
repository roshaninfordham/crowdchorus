# Contributing to CrowdChorus

Thanks for helping. A few ground rules keep the project small and honest.

## Scope
CrowdChorus has exactly three user-facing features: join and contribute,
generate the collective single, share the result. Improvements to those are
welcome; new top-level features need an issue and discussion first.

## Where things live
| Path | Language | What |
|---|---|---|
| `src/` | TypeScript | Next.js pages and API routes |
| `dsp/` | Rust, C, C++ | `chorus-dsp` audio engine |
| `worker/` | Python | generation pipeline and providers |
| `db/migrations/` | SQL | the only source of schema |
| `Rakefile`, `ops/` | Ruby | tasks and retention |
| `music.json` | JSON | tempo, key, motif, shared by every language |

The cross-language contract is `docs/ARCHITECTURE.md`. If you change a storage
key, a status, a JSON shape or a CLI, update that file in the same PR.

## Adding a provider
A new text, image, music, search or analytics vendor is one file in
`worker/providers/` plus one registry entry. Providers must:
- fall back to `local` on any failure and set the fallback flag,
- never send raw audio, nicknames or free-text themes to monitoring/analytics,
- keep keys server-side.

## Before opening a PR
```bash
rake test        # Rust, Python and TypeScript suites
pnpm lint
```
One logical change per commit. Don't claim an integration works unless you
exercised it against the real API, and say which in the PR.

## Privacy is a feature
Don't add anything that records in the background, clones or identifies
voices, or keeps raw recordings past the retention window.
