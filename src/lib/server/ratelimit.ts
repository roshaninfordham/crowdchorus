// ponytail: in-memory token buckets, single-process ceiling. Behind more than
// one server process, move the buckets to Postgres or Redis.
type Bucket = { tokens: number; at: number };
const g = globalThis as typeof globalThis & { __ccBuckets?: Map<string, Bucket> };
const buckets = (g.__ccBuckets ??= new Map());

/** Take one token from `key`'s bucket; false when empty. */
export function rateLimit(key: string, capacity: number, refillPerMinute: number, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 60_000) * refillPerMinute);
  b.at = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) buckets.clear(); // crude bound on memory
  return ok;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
