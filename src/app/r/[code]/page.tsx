import { notFound } from "next/navigation";
import { RoomClient } from "@/components/room/RoomClient";
import { HttpError } from "@/lib/server/http";
import { roomByCode } from "@/lib/server/rooms";
import { baseUrl, qrSvg } from "@/lib/server/share";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const room = await roomByCode((await params).code).catch((err) => {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  });
  const shareUrl = `${await baseUrl()}/r/${room.join_code}`;
  return <RoomClient code={room.join_code} shareUrl={shareUrl} qrSvg={await qrSvg(shareUrl)} />;
}
