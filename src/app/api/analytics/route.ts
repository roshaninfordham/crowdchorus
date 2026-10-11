import { route } from "@/lib/server/http";
import { analytics } from "@/lib/server/worker";

/** Aggregate analytics (Snowflake via the worker, else labelled local Postgres), cached 60 s. */
export const GET = route(null, async () => {
  return Response.json(await analytics(), { headers: { "Cache-Control": "public, max-age=60" } });
});
