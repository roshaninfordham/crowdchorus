import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Non-default port so it never collides with another dev server.
const PORT = Number(process.env.E2E_PORT ?? 3218);
export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? "storage");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      STORAGE_DIR,
      MEDIA_SIGNING_SECRET: "e2e-media-secret",
      CHORUS_DSP_BIN: process.env.CHORUS_DSP_BIN ?? path.resolve("dsp/target/release/chorus-dsp"),
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    },
  },
});
