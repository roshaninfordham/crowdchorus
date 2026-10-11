import { describe, expect, it } from "vitest";
import { JOIN_CODE_RE, newJoinCode, newToken, sha256Hex } from "./tokens";

describe("tokens", () => {
  it("join codes match [A-Z2-9]{6} and never use 0/1", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = newJoinCode();
      expect(code).toMatch(JOIN_CODE_RE);
      expect(code).not.toMatch(/[01]/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(1990);
  });

  it("tokens are 32 random bytes in base64url and hash to sha256 hex", () => {
    const t = newToken();
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(t).toMatch(/^[\w-]{43}$/);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
