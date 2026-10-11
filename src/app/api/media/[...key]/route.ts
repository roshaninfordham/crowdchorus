import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { route } from "@/lib/server/http";
import { verifyMediaSignature } from "@/lib/server/signing";
import { contentType, publicMediaPath } from "@/lib/server/storage";

type Ctx = { params: Promise<{ key: string[] }> };

const notFound = () => new Response("Not found", { status: 404 });

/** Stream a signed cover/song from STORAGE_DIR. Vocals and anything outside rooms/ or demo/ are refused. */
export const GET = route(null, async (req, { params }: Ctx) => {
  const key = (await params).key.join("/");
  const file = publicMediaPath(key);
  const url = new URL(req.url);
  if (!file || !verifyMediaSignature(key, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return notFound();

  const headers: Record<string, string> = {
    "Content-Type": contentType(file),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  // Single byte ranges, so audio can seek (Safari needs this to play at all).
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const size = info.size;
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(info.size) } });
});
