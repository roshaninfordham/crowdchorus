import { describe, expect, it } from "vitest";
import { cleanText } from "./sanitize";

describe("cleanText", () => {
  it("trims, collapses whitespace and strips control/bidi chars", () => {
    expect(cleanText("  hi\n\tthere  ", 24)).toBe("hi there");
    expect(cleanText("a\u0000b‮c​d", 24)).toBe("abcd");
    expect(cleanText("\u0007\u0008", 24)).toBe("");
  });

  it("caps by code points, not UTF-16 units", () => {
    expect(cleanText("🎤".repeat(30), 24)).toBe("🎤".repeat(24));
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText("ab   cd", 3)).toBe("ab");
  });
});
