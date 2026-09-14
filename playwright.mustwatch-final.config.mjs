import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.KD_MUSTWATCH_FINAL_PORT || "4401";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "streaming-progressive-final/mustwatch-flow.spec.mjs",
    "private-v1/start-mustwatch-layout.spec.mjs",
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "line",
  outputDir: join(tmpdir(), "kd-mustwatch-final-results"),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 393, height: 852 },
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tools/streaming-progressive-final-server.mjs",
    env: { KD_STREAMING_FINAL_PORT: port },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [{
    name: "chromium-iphone-width",
    use: { ...devices["Desktop Chrome"], viewport: { width: 393, height: 852 } },
  }],
});
