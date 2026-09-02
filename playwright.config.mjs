import { defineConfig, devices } from "@playwright/test";

/* Parallele Codex-Worktrees dürfen nicht versehentlich den Dev-Server eines
   anderen Chats prüfen. CI bleibt auf dem festen Standardport; lokal kann ein
   isolierter Port über KD_TEST_PORT gewählt werden. */
const testPort = process.env.KD_TEST_PORT || "4174";
const testUrl = `http://127.0.0.1:${testPort}`;
const privateReleaseTests = ["kino-mobile-filter.spec.mjs", "private-release-login.spec.mjs"];
const testMatch = process.env.KD_LEGACY_PUBLIC_MOBILE === "1"
  ? ["mobile-layout.spec.mjs", ...privateReleaseTests]
  : privateReleaseTests;

export default defineConfig({
  testDir: "./tests",
  // Der historische Layout-Harness setzt den entfernten öffentlichen
  // Gast-Vollmodus voraus. Der Privat-Release hält stattdessen Login und den
  // unveränderten Kino-Filter in beiden Browsern im normalen CI-Gate.
  testMatch,
  fullyParallel: false,
  workers: 1,
  // GitHub-Runner verlieren WebKit gelegentlich komplett ("Target crashed").
  // Ein einzelner Wiederholungsversuch fängt nur diesen Infrastruktur-Flake ab;
  // reproduzierbare Layout- oder Funktionsfehler bleiben weiterhin rot.
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: testUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${testPort}`,
    url: testUrl,
    reuseExistingServer: !process.env.CI && !process.env.KD_TEST_PORT,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
