import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHmac, randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { STORAGE_DIR } from "../../playwright.config";
import { cleanupRoom, db } from "./db";

const DSP = process.env.CHORUS_DSP_BIN ?? path.resolve("dsp/target/release/chorus-dsp");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
let roomId: string;
let code: string;

// A finished room written straight to Postgres + STORAGE_DIR, so no worker is involved.
test.beforeAll(async () => {
  code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const room = await db.query(
    `INSERT INTO rooms (join_code, host_token_hash, chorus_line, chorus_source, status, created_at)
     VALUES ($1, 'x', 'We light the city up', 'template', 'ready', now() - interval '3 minutes') RETURNING id`,
    [code],
  );
  roomId = room.rows[0].id;
  const dir = path.join(STORAGE_DIR, "rooms", roomId);
  mkdirSync(dir, { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=512x512:d=1", "-frames:v", "1", path.join(dir, "cover.png")]);
  execFileSync(DSP, ["instrumental", path.join(dir, "instrumental.wav")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(dir, "instrumental.wav"), "-c:a", "libmp3lame", "-b:a", "128k", path.join(dir, "song.mp3")]);

  for (const [i, sim] of [false, false, true].entries()) {
    const p = await db.query(
      `INSERT INTO participants (room_id, nickname, session_token_hash, mood, is_simulated, is_host, status)
       VALUES ($1, $2, $3, 'joyful', $4, $5, 'submitted') RETURNING id`,
      [roomId, `P${i}`, `h${i}`, sim, i === 0],
    );
    await db.query(
      `INSERT INTO contributions (room_id, participant_id, status, consent_at, created_at)
       VALUES ($1, $2, 'processed', now(), now() - interval '1 minute')`,
      [roomId, p.rows[0].id],
    );
  }
  await db.query(
    `INSERT INTO generation_jobs (room_id, status, brief, sources, model_metadata, cover_art_object_key,
       instrumental_object_key, final_audio_object_key, started_at, completed_at)
     VALUES ($1, 'completed', $2, $3, $4, $5, $6, $7, now() - interval '40 seconds', now())`,
    [
      roomId,
      { title: "Neon Choir", chorus_text: "We light the city up", musical_direction: "bright", image_prompt: "abstract", palette: ["#ff8a5b"] },
      JSON.stringify([{ title: "City lights essay", url: "https://example.org/lights", snippet: "On night and neon." }]),
      {
        providers: { text: "local", image: "local", music: "local", search: "nimble", analytics: "local" },
        fallback: { brief: true, art: true, music: true, sources: false },
        durations_ms: { brief: 1, art: 2, music: 3, mix: 4, total: 12345 },
      },
      `rooms/${roomId}/cover.png`,
      `rooms/${roomId}/instrumental.wav`,
      `rooms/${roomId}/song.mp3`,
    ],
  );
});

test.afterAll(async () => {
  await cleanupRoom(roomId);
});

test("results page shows cover, song, labelled fallbacks and metrics, and survives refresh", async ({ page, request }) => {
  await page.goto(`/s/${code}`);
  for (let pass = 0; pass < 2; pass++) {
    await expect(page.getByRole("heading", { name: "Neon Choir" })).toBeVisible();
    const cover = page.getByRole("img", { name: /Album cover/ });
    await expect(cover).toBeVisible();
    expect(await cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(512);
    await expect(page.getByText("A collective single by 3 voices")).toBeVisible();
    await expect(page.getByText("Prepared demo backing: not generated for this room")).toBeVisible();
    await expect(page.getByText("Procedural cover: image model not configured")).toBeVisible();
    await expect(page.getByText("Template chorus line: no text model configured")).toBeVisible();
    await expect(page.getByRole("link", { name: "City lights essay" })).toHaveAttribute("href", "https://example.org/lights");
    const measured = page.getByRole("region", { name: "Measured for this room" });
    await expect(measured.getByText("12.3 s")).toBeVisible(); // generation time from durations_ms.total
    await expect(page.getByTestId("analytics-source")).toHaveText(/Source:|Local Postgres/);
    await page.reload();
  }

  const songUrl = await page.locator("audio").getAttribute("src");
  const song = await request.get(songUrl!);
  expect(song.status()).toBe(200);
  expect(song.headers()["content-type"]).toBe("audio/mpeg");
  const ranged = await request.get(songUrl!, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);

  await page.getByRole("button", { name: /^Play / }).click();
  await expect(page.getByRole("button", { name: /^Pause / })).toBeVisible();

  // vocals are never served, even with a valid signature
  const key = `vocals/${roomId}/x.wav`;
  const exp = Math.floor(Date.now() / 1000) + 60;
  const sig = createHmac("sha256", "e2e-media-secret").update(`${key}\n${exp}`).digest("hex");
  expect((await request.get(`/api/media/${key}?exp=${exp}&sig=${sig}`)).status()).toBe(403);
  // tampered signature on a real file
  const tampered = songUrl!.replace(/sig=([0-9a-f])/, (_, c) => `sig=${c === "0" ? "1" : "0"}`);
  expect((await request.get(tampered)).status()).toBe(403);

  await page.screenshot({ path: test.info().outputPath("results.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("results-mobile.png"), fullPage: true });
});
