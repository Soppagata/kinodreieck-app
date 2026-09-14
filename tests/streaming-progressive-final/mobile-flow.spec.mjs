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
  let unfilteredAllFollowRequests = 0;
  let slowOldFollowId = null;
  let nextRpcId = 0;
  const abortWaiters = new WeakMap();
  let automaticPortionCount = null;
  let returnedAllCount = null;
  let zFilterCount = null;

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

  page.on("requestfailed", (failed) => {
    const url = new URL(failed.url());
    if (url.pathname !== "/rest/v1/rpc/kd_streaming_page") return;
    const body = failed.postDataJSON()?.p_request || {};
    events.push({
      kind: "rpc-abort",
      view: body.view,
      limit: body.limit,
      cursor: body.cursor ? "set" : "initial",
      letter: body.filters?.buchstabe || null,
      at: performance.now(),
    });
    abortWaiters.get(failed)?.();
  });

  await page.route("**/rest/v1/rpc/kd_streaming_page", async (route) => {
    const networkRequest = route.request();
    const request = networkRequest.postDataJSON()?.p_request;
    const started = performance.now();
    const querySignature = JSON.stringify([request.view, request.filters, request.library, request.personal]);
    const id = ++nextRpcId;
    const letter = request.filters?.buchstabe || null;
    const cursor = request.cursor ? "set" : "initial";
    if (request.view === "all" && cursor === "set" && letter == null) unfilteredAllFollowRequests += 1;
    const isSlowOldFollow = request.view === "all" && cursor === "set" && letter == null
      && unfilteredAllFollowRequests === 2;
    if (isSlowOldFollow) slowOldFollowId = id;
    let resolveAbort;
    const aborted = new Promise((resolve) => { resolveAbort = resolve; });
    abortWaiters.set(networkRequest, resolveAbort);
    activeRpc += 1;
    maxRpc = Math.max(maxRpc, activeRpc);
    activeByQuery.set(querySignature, (activeByQuery.get(querySignature) || 0) + 1);
    maxRpcPerQuery = Math.max(maxRpcPerQuery, activeByQuery.get(querySignature));
    events.push({ kind: "rpc-start", id, view: request.view, limit: request.limit, cursor,
      letter, slowOldFollow: isSlowOldFollow, at: started });
    try {
      const response = await pg.callAsync(request, pg.accountId);
      if (isSlowOldFollow) {
        const outcome = await Promise.race([
          aborted.then(() => "aborted"),
          new Promise((resolve) => setTimeout(() => resolve("released"), 3000)),
        ]);
        if (outcome === "aborted") {
          events.push({ kind: "rpc-stale-response-discarded", id, at: performance.now() });
          return;
        }
      }
      events.push({ kind: "rpc-response", id, view: request.view, limit: request.limit, cursor,
        letter, items: response.items?.length || 0, total: response.total, at: performance.now() });
      try {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
      } catch (error) {
        if (!networkRequest.failure()) throw error;
      }
    } finally {
      abortWaiters.delete(networkRequest);
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
  const firstPageResponse = events.find((entry) => entry.kind === "rpc-response"
    && entry.view === "all" && entry.cursor === "initial" && entry.limit === 20 && entry.letter == null);
  const fullKnown = events.find((entry) => entry.kind === "full-catalog" && entry.name === "streaming_bekannt");
  expect(firstAll?.items).toBe(20);
  expect(firstAll?.limit).toBe(20);
  expect(firstAll?.total).toBe(firstAll?.counts?.all);
  expect(firstPageResponse).toBeTruthy();
  expect(fullKnown, "vollständiger Known-Read folgt bewusst nach der ersten Seite").toBeTruthy();
  const fullKnownAfterFirstPage = fullKnown.at >= firstPageResponse.at;
  const allCount = Number((await page.getByRole("button", { name: /^Alles/u }).textContent()).match(/\((\d+)\)/)?.[1]);
  expect(allCount).toBe(firstAll.counts.all);
  expect(allCount).toBeGreaterThan(1020);

  await step("one 1000-title background page stays behind a 20-card DOM window", async () => {
    await expect.poll(() => events.find((entry) => entry.kind === "rpc-response"
      && entry.view === "all" && entry.cursor === "set" && entry.limit === 1000
      && entry.letter == null && entry.items === 1000)).toBeTruthy();
    expect(maxRpcPerQuery).toBe(1);
    expect(pg.calls.find((entry) => entry.view === "all" && entry.cursor === "set")?.limit).toBe(1000);
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(20);
    await page.getByTestId("streaming-page-more").scrollIntoViewIfNeeded();
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(40);
    automaticPortionCount = await page.locator(".kd-entdecken-karte").count();
    await expect.poll(() => slowOldFollowId).not.toBeNull();
  });

  let gestureTiming = null;
  const gestureEventStart = events.length;
  await step("rapid A-to-Z gesture aborts the stale follow-up and sends only Z", async () => {
    const alphabet = page.getByRole("slider", { name: "Entdecken: Anfangsbuchstaben filtern" });
    gestureTiming = await alphabet.evaluate(async (element) => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      const started = performance.now();
      let previousInputAt = started;
      let maxInputGapMs = 0;
      for (const value of ["1", "5", "10", "15", "20", "26"]) {
        const inputAt = performance.now();
        maxInputGapMs = Math.max(maxInputGapMs, inputAt - previousInputAt);
        previousInputAt = inputAt;
        setValue.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      return { totalMs: performance.now() - started, maxInputGapMs };
    });
    expect(gestureTiming.maxInputGapMs).toBeLessThan(80);
    await expect(alphabet).toHaveAttribute("aria-valuetext", "Buchstabe Z");
    await expect.poll(() => events.find((entry) => entry.kind === "rpc-response"
      && entry.view === "all" && entry.cursor === "initial" && entry.letter === "Z")).toBeTruthy();
    const zResponse = events.find((entry) => entry.kind === "rpc-response"
      && entry.view === "all" && entry.cursor === "initial" && entry.letter === "Z");
    const summary = page.locator(".kd-streaming-page-summary strong");
    zFilterCount = zResponse.total;
    expect(zFilterCount).toBeGreaterThan(0);
    expect(zFilterCount).toBeLessThan(allCount);
    await expect(summary).toHaveText(`${zFilterCount} Treffer`);
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(Math.min(20, zFilterCount));
    await expect.poll(() => events.some((entry) => entry.kind === "rpc-abort"
      && entry.view === "all" && entry.cursor === "set" && entry.letter == null)).toBe(true);
    await expect.poll(() => events.some((entry) => entry.kind === "rpc-stale-response-discarded"
      && entry.id === slowOldFollowId)).toBe(true);
  });
  const gestureRequests = events.slice(gestureEventStart)
    .filter((entry) => entry.kind === "rpc-start" && entry.view === "all" && entry.cursor === "initial");
  expect(gestureRequests.map((entry) => entry.letter)).toEqual(["Z"]);
  expect(events.some((entry) => entry.kind === "rpc-response" && entry.id === gestureRequests[0].id
    && entry.letter === "Z")).toBe(true);

  await step("session return restores the loaded Z record without a cursor-null restart", async () => {
    const zInitialBefore = events.filter((entry) => entry.kind === "rpc-start"
      && entry.view === "all" && entry.cursor === "initial" && entry.letter === "Z").length;
    await navigateMobile(page, "Mediathek");
    await navigateMobile(page, "Streaming");
    await expect(page.getByRole("slider", { name: "Entdecken: Anfangsbuchstaben filtern" }))
      .toHaveAttribute("aria-valuetext", "Buchstabe Z");
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(Math.min(20, zFilterCount));
    await expect(page.locator(".kd-streaming-page-summary strong")).toHaveText(`${zFilterCount} Treffer`);
    await page.waitForTimeout(250);
    const zInitialAfter = events.filter((entry) => entry.kind === "rpc-start"
      && entry.view === "all" && entry.cursor === "initial" && entry.letter === "Z").length;
    expect(zInitialAfter).toBe(zInitialBefore);
    returnedAllCount = await page.locator(".kd-entdecken-karte").count();
  });

  const streamingText = await page.locator(".kd-streaming-tab").innerText();
  expect(streamingText).not.toMatch(/Movie of the Night|MotN|Watchmode|FlixPatrol|Anthropic|Katalogstand|Datenstand|Stand:|\b\d+(?:[.,]\d+)?\s*(?:ms|Millisekunden|Sekunden)\b/iu);
  expect(events.filter((entry) => entry.kind === "full-catalog" && entry.name === "streaming_entdecken"),
    "ein erfolgreicher Seiten-RPC darf nicht durch den Missing-RPC-Legacyfallback maskiert werden").toEqual([]);
  expect(traffic.unknownFixturePaths).toEqual([]);
  expect(traffic.nonLocal.every((entry) => ["mocked", "aborted"].includes(entry.kind))).toBe(true);
  await expect.poll(() => activeRpc, { timeout: 30_000 }).toBe(0);
  console.log(`[PWA_FINAL] ${JSON.stringify({
    conditions: "production build, direct Streaming start, Chromium 393x852, CPU x4, service worker blocked, synthetic account, sanitized local catalog, real disposable PostgreSQL",
    projectionItems: pg.projectionCount,
    projectionMs: pg.projectionMs,
    totalRpcCalls: pg.calls.length,
    maxConcurrentRpcCalls: maxRpc,
    maxConcurrentRpcCallsPerQuery: maxRpcPerQuery,
    firstAllItems: firstAll.items,
    firstAllCount: allCount,
    backgroundPageLimit: 1000,
    automaticPortionCount,
    returnedAllCount,
    zFilterCount,
    gestureTotalMs: Math.round(gestureTiming.totalMs),
    gestureMaxInputGapMs: Math.round(gestureTiming.maxInputGapMs),
    abortedSlowFollow: true,
    filterRequestsDuringGesture: gestureRequests.map((entry) => entry.letter),
    fullKnownAfterFirstPage,
    knownDelayAfterFirstPageMs: Math.round(fullKnown.at - firstPageResponse.at),
    results,
  })}`);
  expect(automaticPortionCount, "Scrollen erweitert die 20er-DOM-Portion automatisch genau auf 40").toBe(40);
  expect(returnedAllCount, "querygebundene Z-Rückkehr bewahrt den geladenen Sitzungsrecord")
    .toBe(Math.min(20, zFilterCount));
  expect(fullKnownAfterFirstPage,
    "vollständiger Known-Read mit MotN-Anhang muss nach der ersten Seitenantwort beginnen").toBe(true);
});
