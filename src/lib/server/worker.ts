import { z } from "zod";
import { cleanText } from "@/lib/sanitize";
import { pool } from "./db";
import { run } from "./audio";

/** Run a Python worker CLI and parse the JSON on its last stdout line. */
async function workerCli(args: string[], timeoutMs: number): Promise<unknown> {
  const out = await run("uv", ["run", "--project", "worker", "python", "-m", "worker", ...args], timeoutMs);
  return JSON.parse(out.trim().split("\n").pop() ?? "");
}

const chorusOut = z.object({ line: z.string().min(1), source: z.enum(["gemini", "template"]) });
export type Chorus = z.infer<typeof chorusOut>;

/** Chorus line from the worker (Gemini or its template); tiny TS template if the CLI is unavailable. */
export async function chorusLine(mood: string, theme: string | null): Promise<Chorus> {
  try {
    const args = ["chorus", "--mood", mood, ...(theme ? ["--theme", theme] : [])];
    const r = chorusOut.parse(await workerCli(args, 20_000));
    return { line: cleanText(r.line, 140), source: r.source };
  } catch {
    const subject = theme ? theme.toLowerCase() : "this room";
    return { line: `Sing it ${mood}, sing it loud, ${subject} in one sound`, source: "template" };
  }
}

const analyticsOut = z.object({
  source: z.string().min(1).max(40),
  completed_songs: z.number(),
  avg_participants: z.number().nullable(),
  success_rate: z.number().nullable(),
  avg_generation_ms: z.number().nullable(),
  rows: z.number(),
});
export type Analytics = z.infer<typeof analyticsOut>;

async function localAnalytics(): Promise<Analytics> {
  const { rows } = await pool.query(`
    SELECT count(*) FILTER (WHERE j.status = 'completed')::int AS completed_songs,
           avg(p.n) FILTER (WHERE j.status = 'completed')::float AS avg_participants,
           (count(*) FILTER (WHERE j.status = 'completed')::float
             / nullif(count(*) FILTER (WHERE j.status IN ('completed', 'failed')), 0)) AS success_rate,
           avg(extract(epoch FROM j.completed_at - j.started_at) * 1000)
             FILTER (WHERE j.status = 'completed')::float AS avg_generation_ms,
           count(*)::int AS rows
    FROM generation_jobs j
    CROSS JOIN LATERAL (
      SELECT count(DISTINCT c.participant_id) AS n FROM contributions c
      WHERE c.room_id = j.room_id AND c.status IN ('accepted', 'processed')
    ) p`);
  return { source: "postgres-local", ...rows[0] };
}

const g = globalThis as typeof globalThis & { __ccAnalytics?: { at: number; value: Analytics } };

/** Aggregate analytics from the worker (any warehouse) or local Postgres, cached 60 s per process. */
export async function analytics(now = Date.now()): Promise<Analytics> {
  if (g.__ccAnalytics && now - g.__ccAnalytics.at < 60_000) return g.__ccAnalytics.value;
  let value: Analytics;
  try {
    value = analyticsOut.parse(await workerCli(["analytics"], 20_000));
  } catch {
    value = await localAnalytics();
  }
  g.__ccAnalytics = { at: now, value };
  return value;
}
