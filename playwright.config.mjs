import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "mobile-layout.spec.mjs",
  fullyParallel: false,
  workers: 1,
  // GitHub-Runner verlieren WebKit gelegentlich komplett ("Target crashed").
  // Ein einzelner Wiederholungsversuch fängt nur diesen Infrastruktur-Flake ab;
  // reproduzierbare Layout- oder Funktionsfehler bleiben weiterhin rot.
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
