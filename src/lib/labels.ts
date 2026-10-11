// Every user-visible credit and fallback label is derived from worker data;
// no vendor names are hardcoded here.

export type Providers = { text?: string; image?: string; music?: string; search?: string; analytics?: string };

export type GenerationMeta = {
  providers?: Providers;
  fallback?: { brief?: boolean; art?: boolean; music?: boolean; sources?: boolean };
  errors?: Record<string, string>;
};

const shown = (p: string | undefined, fallback: boolean | undefined, localName: string) =>
  !p ? (fallback ? localName : "unknown") : p === "local" ? localName : p;

/** "Cover: local procedural", "Music: lyria", ... */
export function credits(meta: GenerationMeta): { role: string; provider: string }[] {
  const p = meta.providers ?? {};
  const f = meta.fallback ?? {};
  return [
    { role: "Brief & lyrics", provider: shown(p.text, f.brief, "local template") },
    { role: "Cover", provider: shown(p.image, f.art, "local procedural") },
    { role: "Music", provider: shown(p.music, f.music, "prepared demo backing") },
    { role: "Inspiration", provider: shown(p.search, f.sources, "skipped") },
  ];
}

const why = (meta: GenerationMeta, step: string, unset: string) =>
  meta.errors?.[step] ? `${step} step failed (${meta.errors[step]})` : unset;

/** Explicit labels for every fallback artifact on the page. */
export function fallbackLabels(meta: GenerationMeta, chorusSource: string | null): string[] {
  const f = meta.fallback ?? {};
  const out: string[] = [];
  if (chorusSource === "template") out.push("Template chorus line: no text model configured");
  if (f.brief) out.push(`Template brief: ${why(meta, "brief", "no text model configured")}`);
  if (f.art) out.push(`Procedural cover: ${why(meta, "art", "image model not configured")}`);
  if (f.music) out.push("Prepared demo backing: not generated for this room");
  if (f.sources) out.push(`Inspiration search skipped: ${why(meta, "sources", "no search provider configured")}`);
  return out;
}

/** Analytics panel label from the CLI's own `source` field. */
export function analyticsSourceLabel(source: string): string {
  return source === "postgres-local" ? "Local Postgres fallback (no analytics warehouse configured)" : `Source: ${source}`;
}
