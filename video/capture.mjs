// Real footage for the demo video: drives the running app (rake dev) with one
// desktop host and two phone-sized guests, each a separate Chrome with its own
// fake microphone. Saves 2x/3x screenshots plus the bounding box of every
// element the video's cursor will click, so zooms land on real UI.
//
// usage: node video/capture.mjs   (from the repo root, with rake dev running)
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("video/demo/capture");
const MICS = path.join(OUT, "mics");
mkdirSync(MICS, { recursive: true });
const shots = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DESKTOP = { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function launch(mic) {
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"];
  if (mic) args.push(`--use-file-for-fake-audio-capture=${mic}`);
  return chromium.launch({ args });
}
async function open(browser, device, state) {
  const ctx = await browser.newContext({ ...device, storageState: state, permissions: ["microphone"], colorScheme: "dark" });
  // hide the Next.js dev-mode badge; it is not part of the product
  await ctx.addInitScript(() => addEventListener("DOMContentLoaded", () =>
    document.head.append(Object.assign(document.createElement("style"), { textContent: "nextjs-portal{display:none!important}" }))));
  return ctx.newPage();
}
async function box(loc) {
  const b = await loc.first().boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}
// Screenshot plus named boxes. Boxes are CSS px relative to the page top when fullPage.
async function shot(page, name, targets = {}, fullPage = false) {
  await sleep(250);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage, animations: "disabled" });
  const boxes = {};
  for (const [k, loc] of Object.entries(targets)) boxes[k] = await box(loc);
  const size = await page.evaluate(() => ({ w: innerWidth, h: document.documentElement.scrollHeight }));
  shots[name] = { file, vw: page.viewportSize().width, vh: fullPage ? size.h : page.viewportSize().height, boxes };
  console.log("shot", name);
}

// ---- host creates the room
let hostB = await launch();
let host = await open(hostB, DESKTOP);
await host.goto(BASE);
await shot(host, "01-landing", {
  nick: host.getByLabel("Your nickname").first(),
  mood: host.getByText("anthemic", { exact: true }).first(),
  theme: host.getByLabel(/Theme idea/).first(),
  create: host.getByRole("button", { name: "Create room" }),
});
await host.getByLabel("Your nickname").first().fill("Ava");
await host.getByText("anthemic", { exact: true }).first().click();
await host.getByLabel(/Theme idea/).first().fill("city lights");
await shot(host, "02-landing-filled", { create: host.getByRole("button", { name: "Create room" }) });
await host.getByRole("button", { name: "Create room" }).click();
await host.waitForURL(/\/r\/[A-Z2-9]{6}$/);
const code = host.url().split("/").pop();
await host.getByRole("heading", { name: "Host controls" }).waitFor();
const line = (await host.locator("section[aria-labelledby=line-h]").innerText()).match(/[“"]([^”"]+)[”"]/)[1];
console.log("room", code, "line:", line);

// ---- stand-in singers read that line; relaunch the host with its own mic
execFileSync("video/.venv/bin/python", ["video/voices.py", line, MICS], { stdio: "inherit" });
const state = await host.context().storageState();
await hostB.close();
hostB = await launch(path.join(MICS, "host.wav"));
host = await open(hostB, DESKTOP, state);
await host.goto(`${BASE}/r/${code}`);
await host.getByRole("heading", { name: "Host controls" }).waitFor();
await shot(host, "03-room-host", {
  code: host.locator("h1").first(),
  qr: host.getByRole("img", { name: /QR code/ }),
  line: host.locator("section[aria-labelledby=line-h]"),
  roster: host.locator("section[aria-labelledby=roster-h]"),
  guide: host.getByRole("button", { name: /pitch guide/ }),
  record: host.getByRole("button", { name: /^● Record/ }),
  host: host.locator("section[aria-labelledby=host-h]"),
});
await shot(host, "03b-room-host-full", {}, true);

// ---- guests join from phones
const guests = [];
for (const [i, name] of ["Theo", "Mira"].entries()) {
  const b = await launch(path.join(MICS, `guest${i + 1}.wav`));
  const g = await open(b, PHONE);
  guests.push({ b, g });
  await g.goto(BASE);
  await g.getByLabel("Room code").fill(code);
  if (i === 0) await shot(g, "10-phone-code", { join: g.getByRole("button", { name: "Join room" }).last() });
  await g.getByRole("button", { name: "Join room" }).last().click();
  await g.waitForURL(`**/r/${code}`);
  await g.getByLabel("Your nickname").fill(name);
  await g.getByText(i === 0 ? "dreamy" : "joyful", { exact: true }).click();
  if (i === 0) await shot(g, "11-phone-join", { join: g.getByRole("button", { name: "Join room" }) });
  await g.getByRole("button", { name: "Join room" }).click();
  await g.getByRole("heading", { name: "Your take" }).waitFor();
  if (i === 0) {
    await shot(g, "12-phone-take", { line: g.locator("section[aria-labelledby=line-h]"), record: g.getByRole("button", { name: /^● Record/ }) });
    await shot(g, "12b-phone-take-full", {}, true);
  }
  await shot(host, `04-host-roster-${i + 1}`, { roster: host.locator("section[aria-labelledby=roster-h]") });
}

// ---- everyone records; capture the first phone's take in detail
async function record(page, detail) {
  const rec = page.locator("section[aria-labelledby=rec-h]");
  await page.getByRole("button", { name: /^● Record/ }).click();
  if (detail) {
    await sleep(900);
    await shot(page, "13-phone-countin", { rec });
    await sleep(1900);
    await shot(page, "14-phone-recording", { rec, wave: page.getByLabel("Live microphone waveform") });
    await sleep(700);
    await shot(page, "14b-phone-recording", { rec, wave: page.getByLabel("Live microphone waveform") });
  }
  const consent = page.getByRole("checkbox", { name: /mixed into a shared recording/ });
  await consent.waitFor({ timeout: 20_000 });
  if (detail) await shot(page, "15-phone-consent", { rec, consent, submit: page.getByRole("button", { name: "Submit recording" }) });
  await consent.check();
  await page.getByRole("button", { name: "Submit recording" }).click();
  await page.getByText("Submitted. Your voice is in the mix.").waitFor({ timeout: 20_000 });
  if (detail) await shot(page, "16-phone-submitted", { rec });
}
await Promise.all([record(guests[0].g, true), record(guests[1].g, false), record(host, false)]);
await host.getByTestId("submitted-count").filter({ hasText: /3\s*of 3/ }).waitFor({ timeout: 15_000 });
await shot(host, "05-host-ready", {
  roster: host.locator("section[aria-labelledby=roster-h]"),
  count: host.getByTestId("submitted-count"),
  finalize: host.getByRole("button", { name: "Finalize and generate" }),
  host: host.locator("section[aria-labelledby=host-h]"),
});

// ---- finalize (double click, like an impatient host) and film generation
await host.getByRole("button", { name: "Finalize and generate" }).dblclick();
const t0 = Date.now();
for (let n = 0; Date.now() - t0 < 60_000; n++) {
  const gen = host.locator("section[aria-labelledby=gen-h]");
  if (await gen.count()) {
    await shot(host, `06-gen-${String(n).padStart(2, "0")}`, { gen });
    if (await host.getByRole("link", { name: /Open the reveal/ }).count()) break;
  } else await sleep(100);
}
await shot(host, "07-gen-done", { reveal: host.getByRole("link", { name: /Open the reveal/ }), gen: host.locator("section[aria-labelledby=gen-h]") });
await shot(guests[1].g, "17-phone-gen-done", {}, true);

// ---- the reveal
await host.getByRole("link", { name: /Open the reveal/ }).click();
await host.waitForURL(`**/s/${code}`);
await host.getByTestId("analytics-source").waitFor({ timeout: 20_000 });
await shot(host, "08-reveal", {
  cover: host.locator("img[alt^='Album cover']"),
  title: host.locator("h1"),
  play: host.getByRole("button", { name: /^Play / }),
  labels: host.getByRole("list", { name: "Fallback assets used" }),
});
await shot(host, "08b-reveal-full", {
  metrics: host.locator("section[aria-labelledby=metrics-h]"),
  insp: host.locator("section[aria-labelledby=insp-h]"),
  analytics: host.locator("section[aria-labelledby=analytics-h]"),
  labels: host.getByRole("list", { name: "Fallback assets used" }),
}, true);
await host.getByRole("button", { name: /^Play / }).click();
await sleep(1500);
await shot(host, "09-reveal-playing", { play: host.getByRole("button", { name: /^Pause / }) });
await guests[0].g.goto(`${BASE}/s/${code}`);
await shot(guests[0].g, "18-phone-reveal", {}, true);

// ---- the actual song and cover for this room, straight from storage
const roomId = execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "crowdchorus", "-Atc",
  `SELECT id FROM rooms WHERE join_code = '${code}'`]).toString().trim();
copyFileSync(`storage/rooms/${roomId}/song.mp3`, path.join(OUT, "song.mp3"));
copyFileSync(`storage/rooms/${roomId}/cover.png`, path.join(OUT, "cover.png"));
const job = execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "crowdchorus", "-Atc",
  `SELECT row_to_json(j) FROM (SELECT status, brief, mix_report, model_metadata FROM generation_jobs WHERE room_id = '${roomId}') j`]).toString().trim();
const jobs = execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "crowdchorus", "-Atc",
  `SELECT count(*) FROM generation_jobs WHERE room_id = '${roomId}'`]).toString().trim();

writeFileSync(path.join(OUT, "shots.json"), JSON.stringify({ code, line, roomId, jobsCreated: Number(jobs), job: JSON.parse(job), shots }, null, 2));
for (const x of [hostB, ...guests.map((g) => g.b)]) await x.close();
console.log("done", code, "jobs:", jobs);
