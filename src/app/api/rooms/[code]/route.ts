import { route } from "@/lib/server/http";
import { isHost, roomByCode, sessionParticipant, snapshot } from "@/lib/server/rooms";

type Ctx = { params: Promise<{ code: string }> };

/** Room snapshot, plus who "me" is for the caller's session/host token. */
export const GET = route(null, async (req, { params }: Ctx) => {
  const room = await roomByCode((await params).code);
  const [snap, me] = await Promise.all([snapshot(room), sessionParticipant(req, room.id)]);
  return Response.json({ ...snap, me: me?.id ?? null, isHost: isHost(req, room) });
});
