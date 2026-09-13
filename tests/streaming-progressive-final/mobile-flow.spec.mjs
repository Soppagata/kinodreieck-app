import { performance } from "node:perf_hooks";
import { test, expect } from "@playwright/test";
import { navigateMobile } from "../private-v1/fixtures.mjs";
import {
  loadSyntheticMaster,
  startStreamingProgressivePgHarness,
} from "../../tools/streaming-progressive-pg-harness.mjs";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";

async function seedAccount(page) {
  await page.addInitScript(({ projectUrl, now }) => {
    const accountId = "00000000-0000-4000-8000-0000000000d3";
    localStorage.setItem("kd:auth:session", JSON.stringify({
      v: 1,
      access_token: "synthetic-progressive-final-access",
      refresh_token: "synthetic-progressive-final-refresh",
      gueltigBis: Date.parse("2099-01-01T00:00:00.000Z"),
      kontoId: accountId,
      mail: "progressive-final@login.kinodreieck.test",
      benutzername: "progressive-final",
    }));
    localStorage.setItem("kd:acct:owner", accountId);
    localStorage.setItem("kd:acct:epoch", JSON.stringify({ accountId, token: "synthetic-progressive-final-epoch" }));
    localStorage.setItem("kd:acct:binding-schema", JSON.stringify({ v: 1, accountId }));
    localStorage.setItem("kd:acct:uebernommen", JSON.stringify({ accountId, t: now }));
    localStorage.setItem("kd:artikel", JSON.stringify({ artikel: [], gespeichertAm: Date.parse(now) }));
    localStorage.setItem("kd:entdecken-status", "{}");
    localStorage.setItem("kd:mustwatch", JSON.stringify({ eintraege: [], gespeichertAm: Date.parse(now) }));
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "streaming", schrift: "normal", modus: "" }));
    localStorage.setItem("kd:katalog:url", projectUrl);
    localStorage.setItem("kd:katalog:key", "sb_publishable_synthetic_progressive_final");
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "local-v1");
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: true, weg: "konto" }));
  }, { projectUrl: PROJECT_URL, now: "2026-09-13T12:00:00.000Z" });
}

async function installNetworkFence(page, traffic) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const record = (kind, detail = url.pathname) => traffic.nonLocal.push({
      method: request.method(), origin: url.origin, path: url.pathname, kind, detail,
    });
    if (url.origin !== PROJECT_URL) {
      record("aborted", "non-fixture-origin");
      return route.abort("blockedbyclient");
    }
    if (url.pathname === "/rest/v1/kd_account_access") {
      record("mocked", "account-access");
      traffic.contracts.push("account-access");
      return route.fulfill({ status: 200, contentType: "application/json", body: "[{\"role\":\"member\",\"active\":true,\"personal_ai\":true}]" });
    }
    if (url.pathname === "/rest/v1/kd_personal") {
      record("mocked", "personal-store");
      traffic.contracts.push(`personal-${request.method().toLowerCase()}`);
      const rows = request.method() === "GET" ? [{
        key: "kd:einstellungen",
        value: JSON.stringify({ theme: "dunkel", startTab: "streaming", schrift: "normal", modus: "" }),
        revision: 1,
      }] : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
    }
    if (url.pathname === "/rest/v1/rpc/kd_radar_pilot_feed") {
      record("mocked", "radar-feed");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        format: "kd-radar-pilot-feed-v2", revision: 1, checksum: "a".repeat(64),
        reconciledAt: "2026-09-13T12:00:00.000Z", subscriptions: [], events: [], receipts: [],
        operationAcks: [], radarReview: true, personResults: [], searchStatuses: [],
        automation: { contractVersion: "radar-auto-v1", schedulerActive: false, intervalHours: 144 },
      }) });
    }
    if (["/rest/v1/rpc/kd_flixpatrol_chart_read", "/rest/v1/rpc/kd_flixpatrol_titles_read"].includes(url.pathname)) {
      record("mocked", "neutral-facts");
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    record("aborted", "unknown-fixture-path");
    traffic.unknownFixturePaths.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
}

let pg;
test.beforeAll(async () => { pg = await startStreamingProgressivePgHarness(); });
test.afterAll(async () => { pg?.stop(); });

test("progressiver PWA-Gesamtfluss gegen echte lokale SQL-Seiten", async ({ page, context }) => {
  const traffic = { nonLocal: [], contracts: [], unknownFixturePaths: [] };
  const events = [];
  const results = [];
  const master = loadSyntheticMaster();
  const catalogBodies = new Map([
    ["programm", "[]"],
    ["streaming_bekannt", JSON.stringify(pg.catalogRow("streaming_bekannt"))],
    ["streaming_entdecken", JSON.stringify(pg.catalogRow("streaming_entdecken"))],
  ]);
  let activeRpc = 0;
  let maxRpc = 0;
  const activeByQuery = new Map();
  let maxRpcPerQuery = 0;
  let delayNextRpcMs = 0;
  let automaticPortionCount = null;
  let returnedAllCount = null;
  let filteredXCount = null;

  await page.setViewportSize({ width: 393, height: 852 });
  await seedAccount(page);
  await page.clock.setFixedTime(new Date("2026-09-13T12:00:00.000Z"));
  await page.addInitScript(({ films }) => {
    localStorage.setItem("kd:master", JSON.stringify({
      filme: films,
      meta: { version: "synthetic-progressive-final" },
      gespeichertAm: Date.parse("2026-09-13T12:00:00.000Z"),
    }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({
      quellen: ["Netflix", "Disney+", "Prime Video"], heuristik: true,
    }));
  }, { films: master });
  await installNetworkFence(page, traffic);

  await page.route("**/rest/v1/rpc/kd_streaming_page", async (route) => {
    const request = route.request().postDataJSON()?.p_request;
    const started = performance.now();
    const querySignature = JSON.stringify([request.view, request.filters, request.library, request.personal]);
    activeRpc += 1;
    maxRpc = Math.max(maxRpc, activeRpc);
    activeByQuery.set(querySignature, (activeByQuery.get(querySignature) || 0) + 1);
    maxRpcPerQuery = Math.max(maxRpcPerQuery, activeByQuery.get(querySignature));
    events.push({ kind: "rpc-start", view: request.view, limit: request.limit, at: started });
    try {
      const response = await pg.callAsync(request, pg.accountId);
      const delay = delayNextRpcMs;
      delayNextRpcMs = 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      events.push({ kind: "rpc-response", view: request.view, limit: request.limit,
        items: response.items?.length || 0, at: performance.now() });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    } finally {
      activeRpc -= 1;
      activeByQuery.set(querySignature, activeByQuery.get(querySignature) - 1);
    }
  });
  await page.route(/\/rest\/v1\/(?:kd_catalog|rpc\/kd_streaming_catalog)(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const name = String(url.searchParams.get("p_name") || url.searchParams.get("name") || "").replace(/^eq\./u, "");
    if (!catalogBodies.has(name)) return route.fallback();
    events.push({ kind: "full-catalog", name, at: performance.now() });
    return route.fulfill({ status: 200, contentType: "application/json", body: catalogBodies.get(name) });
  });
  await page.route("**/rest/v1/rpc/kd_title_facts_lookup", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, schemaVersion: "title-facts-projection-v1", items: [] }),
  }));
  await page.route("**/functions/v1/entdecken-daily-task", (route) => route.abort("blockedbyclient"));
  await page.addInitScript(() => {
    window.__kdFinalLongTasks = [];
    new PerformanceObserver((list) => {
      window.__kdFinalLongTasks.push(...list.getEntries().map((entry) => entry.duration));
    }).observe({ type: "longtask", buffered: true });
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics
    .map((metric) => [metric.name, metric.value]));
  const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function step(name, action) {
    const before = await metrics();
    const started = performance.now();
    const rpcBefore = pg.calls.length;
    await action();
    await frame();
    const after = await metrics();
    const longTasks = await page.evaluate(() => {
      const values = window.__kdFinalLongTasks || [];
      window.__kdFinalLongTasks = [];
      return values;
    });
    const delta = (key) => Math.round(Math.max(0, (after[key] - before[key]) * 1000));
    const result = {
      name,
      wallMs: Math.round(performance.now() - started),
      taskMs: delta("TaskDuration"),
      scriptMs: delta("ScriptDuration"),
      layoutMs: delta("LayoutDuration"),
      longestTaskMs: Math.round(Math.max(0, ...longTasks)),
      rpcCalls: pg.calls.length - rpcBefore,
    };
    results.push(result);
    console.log(`[PWA_FINAL_STEP] ${JSON.stringify(result)}`);
  }

  await step("cold shell to first 20 Alles cards", async () => {
    await page.goto("/");
    await expect(page.locator(".kd-app")).toBeVisible();
    await page.getByRole("button", { name: /^Alles/u }).click();
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(20);
    await expect(page.locator(".kd-streaming-page-summary strong")).toContainText("Treffer");
  });

  const firstAll = pg.calls.find((entry) => entry.view === "all" && entry.cursor === "initial");
  const firstPageResponse = events.find((entry) => entry.kind === "rpc-response" && entry.limit === 20);
  const fullKnown = events.find((entry) => entry.kind === "full-catalog" && entry.name === "streaming_bekannt");
  expect(firstAll?.items).toBe(20);
  expect(firstAll?.limit).toBe(20);
  expect(firstPageResponse).toBeTruthy();
  expect(fullKnown, "vollständiger Known-Read folgt bewusst nach der ersten Seite").toBeTruthy();
  const fullKnownAfterFirstPage = fullKnown.at >= firstPageResponse.at;
  const allCount = Number((await page.getByRole("button", { name: /^Alles/u }).textContent()).match(/\((\d+)\)/)?.[1]);
  expect(allCount).toBeGreaterThan(20);

  await step("serial 20-title fetch stays behind a 20-card DOM window", async () => {
    await expect.poll(() => pg.calls.filter((entry) => entry.view === "all" && entry.cursor === "set").length).toBeGreaterThan(0);
    expect(maxRpcPerQuery).toBe(1);
    expect(pg.calls.filter((entry) => entry.cursor === "set").every((entry) => entry.limit === 20)).toBe(true);
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(20);
    await page.getByTestId("streaming-page-more").scrollIntoViewIfNeeded();
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(40);
    automaticPortionCount = await page.locator(".kd-entdecken-karte").count();
  });

  await step("warm Alles to Neu keeps a 20-card portion", async () => {
    await page.getByRole("button", { name: /^Neu(?:\s|$)/u }).click();
    await expect(page.locator(".kd-streaming-neu-karte").first()).toBeVisible();
    expect(await page.locator(".kd-entdecken-karte").count()).toBeLessThanOrEqual(20);
  });

  await step("warm Neu to Alles restores its query-bound portion", async () => {
    await page.getByRole("button", { name: /^Alles/u }).click();
    await expect(page.locator(".kd-entdecken-karte").first()).toBeVisible();
    returnedAllCount = await page.locator(".kd-entdecken-karte").count();
  });

  await step("server filter reaches a title beyond the first page", async () => {
    const alphabet = page.getByRole("slider", { name: "Entdecken: Anfangsbuchstaben filtern" });
    await alphabet.fill("24");
    await expect(alphabet).toHaveAttribute("aria-valuetext", "Buchstabe X");
    const summary = page.locator(".kd-streaming-page-summary strong");
    await expect(summary).not.toHaveText(`${allCount} Treffer`);
    filteredXCount = Number((await summary.textContent()).match(/(\d+)/u)?.[1]);
    expect(filteredXCount).toBeGreaterThan(0);
    expect(filteredXCount).toBeLessThan(allCount);
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(Math.min(20, filteredXCount));
    await expect(page.locator(".kd-entdecken-karte").filter({ hasText: "xXx" })).toHaveCount(1);
  });

  await step("warm leave and return retains the filtered result", async () => {
    const before = pg.calls.length;
    await navigateMobile(page, "Mediathek");
    await navigateMobile(page, "Streaming");
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(Math.min(20, filteredXCount));
    await expect(page.locator(".kd-streaming-page-summary strong")).toHaveText(`${filteredXCount} Treffer`);
    await page.waitForTimeout(250);
    expect(pg.calls.length).toBe(before);
  });

  await step("reload paints cached library before background refresh returns", async () => {
    delayNextRpcMs = 900;
    await page.reload();
    await expect(page.locator(".kd-app")).toBeVisible();
    await expect(page.locator('[data-streaming-suchtreffer^="programm:"]')).toHaveCount(20);
    expect(activeRpc, "Cachekarten sind sichtbar, während die echte Hintergrundantwort aussteht").toBe(1);
    await expect.poll(() => activeRpc).toBe(0);
  });

  await step("Entdecken keeps its existing portion and return flow", async () => {
    await navigateMobile(page, "Entdecken");
    await expect(page.getByTestId("entdecken-tab")).toBeVisible();
    const popularBefore = await page.locator(".kd-entdecken-neutral").count();
    expect(popularBefore).toBe(20);
    const sentinel = page.locator(".kd-entdecken-weitere").getByTestId("streaming-page-more");
    await sentinel.scrollIntoViewIfNeeded();
    await expect(page.locator(".kd-entdecken-neutral")).toHaveCount(40);
    await navigateMobile(page, "Streaming");
    await expect(page.locator('[data-streaming-suchtreffer^="programm:"]')).toHaveCount(20);
    await navigateMobile(page, "Entdecken");
    await expect(page.locator(".kd-entdecken-neutral")).toHaveCount(40);
  });

  const streamingText = await page.getByTestId("entdecken-tab").innerText();
  expect(streamingText).not.toMatch(/Movie of the Night|MotN|Watchmode|FlixPatrol|Anthropic|Stand:/iu);
  await navigateMobile(page, "Streaming");
  expect(await page.locator(".kd-streaming-tab").innerText())
    .not.toMatch(/Movie of the Night|MotN|Watchmode|FlixPatrol|Anthropic|Katalogstand|Datenstand|Stand:/iu);
  expect(traffic.unknownFixturePaths).toEqual([]);
  expect(traffic.nonLocal.every((entry) => ["mocked", "aborted"].includes(entry.kind))).toBe(true);
  console.log(`[PWA_FINAL] ${JSON.stringify({
    conditions: "production build, direct Streaming start, Chromium 393x852, CPU x4, service worker blocked, HTTP no-store, synthetic account, sanitized local catalog",
    projectionItems: pg.projectionCount,
    projectionMs: pg.projectionMs,
    totalRpcCalls: pg.calls.length,
    maxConcurrentRpcCalls: maxRpc,
    maxConcurrentRpcCallsPerQuery: maxRpcPerQuery,
    firstAllItems: firstAll.items,
    firstAllCount: allCount,
    automaticPortionCount,
    returnedAllCount,
    filteredXCount,
    fullKnownAfterFirstPage,
    knownDelayAfterFirstPageMs: Math.round(fullKnown.at - firstPageResponse.at),
    results,
  })}`);
  expect(automaticPortionCount, "Scrollen erweitert die 20er-DOM-Portion automatisch genau auf 40").toBe(40);
  expect(returnedAllCount, "querygebundene Alles-Rückkehr bewahrt genau die gewählte DOM-Portion")
    .toBe(automaticPortionCount);
  expect(fullKnownAfterFirstPage,
    "vollständiger Known-Read mit MotN-Anhang muss nach der ersten Seitenantwort beginnen").toBe(true);
});
