import { describe, expect, it } from "vitest";
import { rateLimit } from "./ratelimit";

describe("rateLimit", () => {
  it("allows a burst up to capacity then refills over time", () => {
    const t0 = 1_000_000;
    const take = (t: number) => rateLimit("test:burst", 3, 6, t);
    expect([take(t0), take(t0), take(t0), take(t0)]).toEqual([true, true, true, false]);
    expect(take(t0 + 5_000)).toBe(false); // half a token
    expect(take(t0 + 10_000)).toBe(true); // 6/min = one per 10 s
    expect(take(t0 + 10_000)).toBe(false);
  });

  it("keeps separate buckets per key", () => {
    expect(rateLimit("test:a", 1, 1, 0)).toBe(true);
    expect(rateLimit("test:a", 1, 1, 0)).toBe(false);
    expect(rateLimit("test:b", 1, 1, 0)).toBe(true);
  });
});
