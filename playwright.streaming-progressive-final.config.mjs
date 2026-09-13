import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.KD_STREAMING_FINAL_PORT || "4399";

export default defineConfig({
  testDir: "./tests/streaming-progressive-final",
  testMatch: "*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "line",
  outputDir: join(tmpdir(), "kd-streaming-progressive-final-results"),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 393, height: 852 },
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tools/streaming-progressive-final-server.mjs",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [{
    name: "chromium-iphone-width",
    use: { ...devices["Desktop Chrome"], viewport: { width: 393, height: 852 } },
  }],
});
