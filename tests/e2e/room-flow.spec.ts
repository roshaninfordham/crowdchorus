import { expect, test, type Browser, type Page } from "@playwright/test";
import { cleanupRoom, db } from "./db";

let code: string | null = null;
test.afterAll(async () => {
  if (!code) return;
  const r = await db.query("SELECT id FROM rooms WHERE join_code = $1", [code]);
  if (r.rows[0]) await cleanupRoom(r.rows[0].id);
});

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.grantPermissions(["microphone"]);
  return context.newPage();
}

async function recordAndSubmit(page: Page) {
  await page.getByRole("button", { name: /^● Record/ }).click();
  // 4-beat count-in at 96 BPM + 6 s take
  await page.getByRole("checkbox", { name: /mixed into a shared recording/ }).check({ timeout: 20_000 });
  await page.getByRole("button", { name: "Submit recording" }).click();
  await expect(page.getByText("Submitted. Your voice is in the mix.")).toBeVisible({ timeout: 20_000 });
}

test("three browsers join, record, submit; double finalize makes one job", async ({ browser }) => {
  const host = await newPage(browser);
  await host.goto("/");
  await host.getByLabel("Your nickname").first().fill("Host");
  await host.getByText("anthemic", { exact: true }).first().click();
  await host.getByLabel(/Theme idea/).first().fill("city lights");
  await host.getByRole("button", { name: "Create room" }).click();
  await host.waitForURL(/\/r\/[A-Z2-9]{6}$/);
  code = host.url().split("/").pop()!;
  const roomId = (await db.query("SELECT id FROM rooms WHERE join_code = $1", [code])).rows[0].id;
  await expect(host.getByRole("heading", { name: "Host controls" })).toBeVisible();
  await host.setViewportSize({ width: 390, height: 844 });
  await host.screenshot({ path: test.info().outputPath("host-mobile.png"), fullPage: true });
  await host.setViewportSize({ width: 1280, height: 720 });

  const guests = [await newPage(browser), await newPage(browser)];
  for (const [i, g] of guests.entries()) {
    await g.goto("/");
    await g.getByLabel("Room code").fill(code);
    await g.getByRole("button", { name: "Join room" }).click();
    await g.waitForURL(`**/r/${code}`);
    await g.getByLabel("Your nickname").fill(`Guest ${i + 1}`);
    await g.getByRole("button", { name: "Join room" }).click();
    await expect(g.getByRole("heading", { name: "Your take" })).toBeVisible();
  }
  // live roster: the host sees both guests arrive without reloading
  await expect(host.getByText("Guest 2")).toBeVisible();

  for (const p of [host, ...guests]) await recordAndSubmit(p);

  for (const p of [host, ...guests]) {
    await expect(p.getByTestId("submitted-count")).toHaveText(/3\s*of 3 submitted/, { timeout: 15_000 });
  }
  const live = await db.query("SELECT count(*)::int AS n FROM contributions WHERE room_id = $1 AND status = 'accepted'", [roomId]);
  expect(live.rows[0].n).toBe(3);

  // a double click in the UI, plus two raced requests straight at the API
  await host.getByRole("button", { name: "Finalize and generate" }).dblclick();
  await host.evaluate(async (c) => {
    const headers = { "x-cc-host": localStorage.getItem(`cc_host_${c}`)! };
    await Promise.all([1, 2].map(() => fetch(`/api/rooms/${c}/finalize`, { method: "POST", headers })));
  }, code);

  const jobs = await db.query("SELECT count(*)::int AS n FROM generation_jobs WHERE room_id = $1", [roomId]);
  expect(jobs.rows[0].n).toBe(1);
  for (const [i, p] of [host, ...guests].entries()) {
    await expect(p.getByRole("heading", { name: /collective single/ })).toBeVisible();
    await expect(p.getByRole("listitem").filter({ hasText: "Collecting the crowd's sound" })).toBeVisible();
    await p.screenshot({ path: test.info().outputPath(`room-${i}.png`), fullPage: true });
  }
});
