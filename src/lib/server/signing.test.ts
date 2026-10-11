import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

process.env.MEDIA_SIGNING_SECRET = "test-secret";
const { signedMediaUrl, verifyMediaSignature } = await import("./signing");
const { publicMediaPath } = await import("./storage");

describe("media signing", () => {
  const now = Date.UTC(2026, 0, 1);

  it("matches the contract: HMAC_SHA256(secret, key + newline + exp)", () => {
    const url = new URL(signedMediaUrl("rooms/r1/cover.png", now), "http://x");
    const exp = url.searchParams.get("exp")!;
    const want = createHmac("sha256", "test-secret").update(`rooms/r1/cover.png\n${exp}`).digest("hex");
    expect(url.pathname).toBe("/api/media/rooms/r1/cover.png");
    expect(url.searchParams.get("sig")).toBe(want);
    expect(Number(exp)).toBe(now / 1000 + 7 * 24 * 3600);
  });

  it("verifies good signatures and rejects tampering and expiry", () => {
    const url = new URL(signedMediaUrl("rooms/r1/song.mp3", now), "http://x");
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(verifyMediaSignature("rooms/r1/song.mp3", exp, sig, now)).toBe(true);
    expect(verifyMediaSignature("rooms/r2/song.mp3", exp, sig, now)).toBe(false);
    expect(verifyMediaSignature("rooms/r1/song.mp3", String(Number(exp) + 1), sig, now)).toBe(false);
    expect(verifyMediaSignature("rooms/r1/song.mp3", exp, sig, Number(exp) * 1000 + 1)).toBe(false);
    expect(verifyMediaSignature("rooms/r1/song.mp3", exp, "zz", now)).toBe(false);
    expect(verifyMediaSignature("rooms/r1/song.mp3", null, sig, now)).toBe(false);
  });

  it("never signs vocals", () => {
    expect(() => signedMediaUrl("vocals/r1/c1.wav")).toThrow();
  });
});

describe("publicMediaPath", () => {
  const root = "/srv/storage";
  it("resolves public keys inside the root", () => {
    expect(publicMediaPath("rooms/r1/cover.png", root)).toBe("/srv/storage/rooms/r1/cover.png");
    expect(publicMediaPath("demo/instrumental.wav", root)).toBe("/srv/storage/demo/instrumental.wav");
  });
  it("refuses vocals, traversal and odd segments", () => {
    for (const key of [
      "vocals/r1/c1.wav",
      "rooms/../vocals/r1/c1.wav",
      "rooms/r1/../../etc/passwd",
      "rooms//cover.png",
      "rooms/./cover.png",
      "rooms/r1/cover.png\0",
      "rooms\\..\\x",
      "/etc/passwd",
      "other/file.png",
    ]) {
      expect(publicMediaPath(key, root), key).toBeNull();
    }
  });
});
