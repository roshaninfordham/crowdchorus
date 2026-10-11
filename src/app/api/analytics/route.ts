import { route } from "@/lib/server/http";
import { analytics } from "@/lib/server/worker";

/** Aggregate analytics; the `source` field names where they came from. Cached 60 s. */
export const GET = route(null, async () => {
  return Response.json(await analytics(), { headers: { "Cache-Control": "public, max-age=60" } });
});
