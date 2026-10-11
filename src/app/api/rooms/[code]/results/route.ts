import { route } from "@/lib/server/http";
import { results } from "@/lib/server/results";
import { roomByCode } from "@/lib/server/rooms";

type Ctx = { params: Promise<{ code: string }> };

/** The reveal: signed cover/song URLs, brief, sources, model metadata, measured metrics. */
export const GET = route("artifact.retrieve", async (_req, { params }: Ctx) => {
  const room = await roomByCode((await params).code);
  return Response.json(await results(room));
});
