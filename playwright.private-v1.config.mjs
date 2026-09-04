import { defineConfig, devices } from "@playwright/test";

const port = process.env.KD_PRIVATE_V1_TEST_PORT || "4397";
const baseURL = `http://127.0.0.1:${port}`;
const projectURL = "https://abcdefghijklmnopqrst.supabase.co";

export default defineConfig({
  testDir: "./tests/private-v1",
  testMatch: "*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 50_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: [
      "VITE_APP_ENV=staging",
      "VITE_APP_URL=https://staging.kinodreieck.test",
      `VITE_SUPABASE_URL=${projectURL}`,
      "VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_private_v1",
      "VITE_RADAR_PILOT_CLIENT_ENABLED=true",
      `npm run dev -- --host 127.0.0.1 --port ${port}`,
    ].join(" "),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
