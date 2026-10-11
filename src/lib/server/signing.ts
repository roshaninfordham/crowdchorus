import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MEDIA_TTL_SECONDS = 7 * 24 * 3600;

// Dev fallback lives on globalThis so the page that signs and the route that
// verifies (separate bundles, same process) agree on it.
const g = globalThis as typeof globalThis & { __ccMediaSecret?: string };
function secret(): string {
  if (process.env.MEDIA_SIGNING_SECRET) return process.env.MEDIA_SIGNING_SECRET;
  if (!g.__ccMediaSecret) {
    console.warn("MEDIA_SIGNING_SECRET unset: using a random per-process secret (dev only)");
    g.__ccMediaSecret = randomBytes(32).toString("hex");
  }
  return g.__ccMediaSecret;
}

export function mediaSignature(key: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${key}\n${exp}`).digest("hex");
}

/** Signed browser URL for a storage key. Vocals are never signed. */
export function signedMediaUrl(key: string, now = Date.now()): string {
  if (key.startsWith("vocals/")) throw new Error("vocals are never given a signed URL");
  const exp = Math.floor(now / 1000) + MEDIA_TTL_SECONDS;
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `/api/media/${path}?exp=${exp}&sig=${mediaSignature(key, exp)}`;
}

export function verifyMediaSignature(
  key: string,
  exp: string | null,
  sig: string | null,
  now = Date.now(),
): boolean {
  if (!exp || !sig || !/^\d+$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Number(exp) * 1000 < now) return false;
  const expected = Buffer.from(mediaSignature(key, Number(exp)), "hex");
  return timingSafeEqual(expected, Buffer.from(sig, "hex"));
}
