import { expect, it } from "vitest";
import { analyticsSourceLabel, credits, fallbackLabels } from "./labels";

it("credits come from providers, with local fallbacks named plainly", () => {
  const c = credits({ providers: { text: "gemini", image: "local", music: "lyria" }, fallback: { art: true } });
  expect(c).toEqual([
    { role: "Brief & lyrics", provider: "gemini" },
    { role: "Cover", provider: "local procedural" },
    { role: "Music", provider: "lyria" },
    { role: "Inspiration", provider: "unknown" },
  ]);
});

it("every fallback carries an explicit label", () => {
  const labels = fallbackLabels(
    { fallback: { brief: true, art: true, music: true, sources: true }, errors: { art: "timeout" } },
    "template",
  );
  expect(labels).toEqual([
    "Template chorus line: no text model configured",
    "Template brief: no text model configured",
    "Procedural cover: art step failed (timeout)",
    "Prepared demo backing: not generated for this room",
    "Inspiration search skipped: no search provider configured",
  ]);
  expect(fallbackLabels({}, "gemini")).toEqual([]);
});

it("analytics label follows the source field", () => {
  expect(analyticsSourceLabel("snowflake")).toBe("Source: snowflake");
  expect(analyticsSourceLabel("postgres-local")).toMatch(/Local Postgres/);
});
