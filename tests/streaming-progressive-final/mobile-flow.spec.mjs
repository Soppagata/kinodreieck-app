import { performance } from "node:perf_hooks";
import { test, expect } from "@playwright/test";
import {
  installNetworkFence,
  navigateMobile,
  seedAccount,
} from "../private-v1/fixtures.mjs";
import {
  loadSyntheticMaster,
  startStreamingProgressivePgHarness,
} from "../../tools/streaming-progressive-pg-harness.mjs";

let pg;
test.beforeAll(async () => { pg = await startStreamingProgressivePgHarness(); });
test.afterAll(async () => { pg?.stop(); });

test("progressiver PWA-Gesamtfluss gegen echte lokale SQL-Seiten", async ({ page, context }) => {
  const traffic = { nonLocal: [], contracts: [], unknownFixturePaths: [] };
  const events = [];
  const results = [];
  const master = loadSyntheticMaster();
  const catalogBodies = new Map([
    ["streaming_bekannt", JSON.stringify(pg.catalogRow("streaming_bekannt"))],
    ["streaming_entdecken", JSON.stringify(pg.catalogRow("streaming_entdecken"))],
  ]);
  let activeRpc = 0;
  let maxRpc = 0;
  const activeByQuery = new Map();
  let maxRpcPerQuery = 0;
  let delayNextRpcMs = 0;

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
      const response = pg.call(request, pg.accountId);
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
  await page.route(/\/rest\/v1\/(?:kd_catalog|rpc\/kd_streaming_catalog)\?/, async (route) => {
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
    await navigateMobile(page, "Streaming");
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
  expect(fullKnown.at).toBeGreaterThanOrEqual(firstPageResponse.at);
  const allCount = Number((await page.getByRole("button", { name: /^Alles/u }).textContent()).match(/\((\d+)\)/)?.[1]);
  expect(allCount).toBeGreaterThan(20);

  await step("serial preload stays behind a 20-card DOM window", async () => {
    await expect.poll(() => pg.calls.filter((entry) => entry.view === "all" && entry.cursor === "set").length).toBeGreaterThan(0);
    expect(maxRpcPerQuery).toBe(1);
    expect(pg.calls.filter((entry) => entry.cursor === "set").every((entry) => entry.limit <= 200)).toBe(true);
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(20);
    await page.getByRole("button", { name: "Weitere 20 anzeigen", exact: true }).click();
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(40);
  });

  await step("server filter reaches a title beyond the first page", async () => {
    await page.getByPlaceholder("Titel suchen …").fill("xXx");
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(1);
    await expect(page.locator(".kd-entdecken-karte")).toContainText("xXx");
    await expect(page.locator(".kd-streaming-page-summary strong")).toHaveText("1 Treffer");
  });

  await step("warm leave and return retains the filtered result", async () => {
    const before = pg.calls.length;
    await navigateMobile(page, "Mediathek");
    await navigateMobile(page, "Streaming");
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(1);
    await expect(page.locator(".kd-entdecken-karte")).toContainText("xXx");
    await page.waitForTimeout(250);
    expect(pg.calls.length).toBe(before);
  });

  await step("reload paints cached library before background refresh returns", async () => {
    delayNextRpcMs = 900;
    await page.reload();
    await expect(page.locator(".kd-app")).toBeVisible();
    await navigateMobile(page, "Streaming");
    await expect(page.locator('[data-streaming-suchtreffer^="programm:"]')).toHaveCount(20);
    expect(activeRpc, "Cachekarten sind sichtbar, während die echte Hintergrundantwort aussteht").toBe(1);
    await expect.poll(() => activeRpc).toBe(0);
  });

  await step("Entdecken keeps its existing portion and return flow", async () => {
    await navigateMobile(page, "Entdecken");
    await expect(page.getByTestId("entdecken-tab")).toBeVisible();
    const popularBefore = await page.locator(".kd-entdecken-neutral").count();
    const more = page.locator(".kd-entdecken-mehr");
    await expect(more).toBeVisible();
    await more.click();
    await expect.poll(() => page.locator(".kd-entdecken-neutral").count()).toBeGreaterThan(popularBefore);
    await navigateMobile(page, "Streaming");
    await expect(page.locator('[data-streaming-suchtreffer^="programm:"]')).toHaveCount(20);
    await navigateMobile(page, "Entdecken");
    await expect(page.locator(".kd-entdecken-neutral").count()).toBeGreaterThan(popularBefore);
  });

  const streamingText = await page.getByTestId("entdecken-tab").innerText();
  expect(streamingText).not.toMatch(/Movie of the Night|MotN|Watchmode|FlixPatrol|Anthropic|Stand:/iu);
  await navigateMobile(page, "Streaming");
  expect(await page.locator(".kd-streaming-tab").innerText())
    .not.toMatch(/Movie of the Night|MotN|Watchmode|FlixPatrol|Anthropic|Katalogstand|Datenstand|Stand:/iu);
  expect(traffic.unknownFixturePaths).toEqual([]);
  expect(traffic.nonLocal.every((entry) => ["mocked", "aborted"].includes(entry.kind))).toBe(true);
  console.log(`[PWA_FINAL] ${JSON.stringify({
    conditions: "production build, Chromium 393x852, CPU x4, service worker blocked, HTTP no-store, synthetic account, sanitized local catalog",
    projectionItems: pg.projectionCount,
    projectionMs: pg.projectionMs,
    totalRpcCalls: pg.calls.length,
    maxConcurrentRpcCalls: maxRpc,
    maxConcurrentRpcCallsPerQuery: maxRpcPerQuery,
    firstAllItems: firstAll.items,
    firstAllCount: allCount,
    fullKnownAfterFirstPage: fullKnown.at >= firstPageResponse.at,
    results,
  })}`);
});
