export const STEPS = [
  "Collecting the crowd's sound",
  "Crafting the collective identity",
  "Creating album artwork",
  "Composing the music",
  "Mixing the voices",
  "Finishing the collective single",
] as const;

export type StepState = "done" | "active" | "failed" | "todo";

// job.status while each step runs; the single is finished only at "completed".
const RUNNING = ["pending", "brief", "generating_art", "generating_music", "mixing"];
// model_metadata.durations_ms key written when a step succeeded
const DONE_KEY = [null, "brief", "art", "music", "mix"];

/** A step is done only once the job has moved past it. */
export function stepStates(
  status: string,
  durationsMs: Record<string, number> = {},
  errors: Record<string, string> = {},
): StepState[] {
  if (status === "completed") return STEPS.map(() => "done");
  if (status === "failed") {
    // errors also holds codes of steps that fell back and carried on, so the
    // failed step is the latest one named; else the first step with no duration
    const named = DONE_KEY.reduce((at, k, i) => (k !== null && k in errors ? i : at), -1);
    let failedAt = named > 0 ? named : DONE_KEY.findIndex((k, i) => i > 0 && !(k! in durationsMs));
    if (failedAt < 0) failedAt = 5;
    return STEPS.map((_, i) => (i < failedAt ? "done" : i === failedAt ? "failed" : "todo"));
  }
  const at = RUNNING.indexOf(status);
  return STEPS.map((_, i) => (i < at ? "done" : i === at ? "active" : "todo"));
}
