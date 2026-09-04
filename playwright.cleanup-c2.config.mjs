import { defineConfig, devices } from "@playwright/test";

const port = process.env.KD_C2_TEST_PORT || "4392";
const baseURL = `http://127.0.0.1:${port}`;
const projectURL = "https://abcdefghijklmnopqrst.supabase.co";

export default defineConfig({
  testDir: "./tests",
  testMatch: "cleanup-c2.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    /* Page-Routen muessen auch in WebKit die komplette lokale Backend-Naht
       besitzen; ein Service Worker duerfte Requests sonst am Harness vorbei
       uebernehmen. */
    serviceWorkers: "block",
  },
  webServer: {
    command: [
      "VITE_APP_ENV=staging",
      "VITE_APP_URL=https://staging.kinodreieck.test",
      `VITE_SUPABASE_URL=${projectURL}`,
      "VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_c2_test_1234567890",
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
