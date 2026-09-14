import { expect, test } from "@playwright/test";
import { navigateMobile } from "../private-v1/fixtures.mjs";
import { startStreamingProgressivePgHarness } from "../../tools/streaming-progressive-pg-harness.mjs";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d3";
const NOW = "2026-09-14T10:00:00.000Z";
const STREAMING_ID = "901258";

let pg;
test.beforeAll(async () => { pg = await startStreamingProgressivePgHarness({ mustwatchFixture: true }); });
test.afterAll(async () => { pg?.stop(); });

async function seed(page) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(({ accountId, now, projectUrl, streamingId }) => {
    localStorage.setItem("kd:auth:session", JSON.stringify({
      v: 1, access_token: "synthetic-mustwatch-final-access",
      refresh_token: "synthetic-mustwatch-final-refresh",
      gueltigBis: Date.parse("2099-01-01T00:00:00.000Z"), kontoId: accountId,
      mail: "mustwatch-final@login.kinodreieck.test", benutzername: "mustwatch-final",
    }));
    localStorage.setItem("kd:acct:owner", accountId);
    localStorage.setItem("kd:acct:epoch", JSON.stringify({ accountId, token: "synthetic-mustwatch-final-epoch" }));
    localStorage.setItem("kd:acct:binding-schema", JSON.stringify({ v: 1, accountId }));
    localStorage.setItem("kd:acct:uebernommen", JSON.stringify({ accountId, t: now }));
    localStorage.setItem("kd:master", JSON.stringify({
      filme: [{
        id: "dvd-besitz", titel: "DVD Besitz", originaltitel: "DVD Besitz", jahr: 1984,
        typ: "film", quelle: "dvd", kategorie: null, bewertet_von: null, bewertung: null,
        genre: [], tags: [], begruendung: "", notiz: "", status: "gesetzt",
      }, {
        id: "linked-no-id", titel: "Lokaler Titel ohne Fremdkennung", originaltitel: "Needle Original Search", jahr: 2022,
        typ: "film", quelle: "apple", kategorie: null, bewertet_von: null, bewertung: null,
        genre: [], tags: [], begruendung: "", notiz: "", status: "gesetzt",
      }],
      meta: { version: "mustwatch-final" }, gespeichertAm: Date.parse(now),
    }));
    localStorage.setItem("kd:mustwatch", JSON.stringify({
      eintraege: [
        { id: "mw_dvd", titel: "DVD Besitz", jahr: 1984, typ: "film", im_besitz: false,
          notiz: "", beschreibung: "", verknuepfung: { ziel: "master", id: "dvd-besitz" }, erstellt_am: now },
        { id: "mw_notiz", titel: "Needle Original Search", jahr: 2022, typ: "film", im_besitz: true,
          notiz: "bleibt unter Alle", beschreibung: "", verknuepfung: null, erstellt_am: now },
        { id: "mw_stream", titel: "Gewählter Stream", jahr: 2026, typ: "film", im_besitz: false,
          notiz: "", beschreibung: "", verknuepfung: { ziel: "streaming", id: streamingId }, erstellt_am: now },
        { id: "mw_search", titel: "Explizite Streamsuche", jahr: 2026, typ: "film", im_besitz: false,
          notiz: "", beschreibung: "", verknuepfung: null, erstellt_am: now },
        { id: "mw_kino", titel: "Kino ohne Vorbesuch", jahr: 2026, typ: "film", im_besitz: false,
          notiz: "", beschreibung: "", verknuepfung: null, erstellt_am: now },
        { id: "mw_linked", titel: "Masterref ohne Fremdkennung", jahr: 2022, typ: "film", im_besitz: false,
          notiz: "", beschreibung: "", verknuepfung: { ziel: "master", id: "linked-no-id" }, erstellt_am: now },
        { id: "mw_linked_duplicate", titel: "Doppelte explizite Masterref", jahr: 2022, typ: "film", im_besitz: false,
          notiz: "", beschreibung: "", verknuepfung: { ziel: "master", id: "linked-no-id" }, erstellt_am: now },
      ],
      gespeichertAm: Date.parse(now),
    }));
    localStorage.setItem("kd:artikel", JSON.stringify({ artikel: [], gespeichertAm: Date.parse(now) }));
    localStorage.setItem("kd:entdecken-status", "{}");
    localStorage.setItem("kd:einstellungen", JSON.stringify({
      theme: "dunkel", startTab: "mediathek", schrift: "normal", modus: "",
    }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix"], heuristik: true }));
    localStorage.setItem("kd:katalog:url", projectUrl);
    localStorage.setItem("kd:katalog:key", "sb_publishable_synthetic_mustwatch_final");
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "local-v1");
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: true, weg: "konto" }));
    window.__kdMustwatchBadgeHistory = [];
    document.addEventListener("DOMContentLoaded", () => {
      const record = () => {
        for (const button of document.querySelectorAll("button")) {
          if (/^Must-Watch/u.test(button.textContent || "")) window.__kdMustwatchBadgeHistory.push(button.textContent.trim());
        }
      };
      new MutationObserver(record).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      record();
    }, { once: true });
  }, { accountId: ACCOUNT_ID, now: NOW, projectUrl: PROJECT_URL, streamingId: STREAMING_ID });
}

test("Must-Watch-Nutzerweg nutzt schmale SQL-Kandidaten ohne versteckte Nachladepfade", async ({ page }) => {
  const traffic = [];
  const unknown = [];
  const candidateRequests = [];
  const pageRequests = [];
  const catalogRequests = [];
  const catalogEvents = [];
  let personalReads = 0;
  let heldPersonalRead = null;
  let delayInitialReconciliation = true;
  const heldReconciliation = [];
  let candidateMode = "sql";
  let phase = "setup";

  await page.setViewportSize({ width: 393, height: 852 });
  await seed(page);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    traffic.push({ method: request.method(), origin: url.origin, path: url.pathname });
    if (url.origin !== PROJECT_URL) return route.abort("blockedbyclient");
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/rest/v1/kd_account_access") return json([{ role: "member", active: true, personal_ai: false }]);
    if (url.pathname === "/rest/v1/kd_personal") {
      personalReads += 1;
      if (personalReads === 1) { heldPersonalRead = route; return; }
      return json([]);
    }
    if (url.pathname === "/rest/v1/rpc/kd_radar_pilot_feed") return json({
      format: "kd-radar-pilot-feed-v2", revision: 1, checksum: "a".repeat(64), reconciledAt: NOW,
      subscriptions: [], events: [], receipts: [], operationAcks: [], radarReview: false,
      personResults: [], searchStatuses: [],
      automation: { contractVersion: "radar-auto-v1", schedulerActive: false, intervalHours: 144 },
    });
    if (["/rest/v1/rpc/kd_flixpatrol_chart_read", "/rest/v1/rpc/kd_flixpatrol_titles_read"].includes(url.pathname)) return json([]);
    if (url.pathname === "/rest/v1/rpc/kd_title_facts_lookup") return json({ ok: true, schemaVersion: "title-facts-projection-v1", items: [] });
    unknown.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.route("**/rest/v1/rpc/kd_mustwatch_streaming_candidates", async (route) => {
    const request = route.request();
    const payload = request.postDataJSON()?.p_request;
    candidateRequests.push({
      payload, authorization: request.headers().authorization || "", mode: candidateMode,
    });
    if (candidateMode === "unavailable") return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        format: 1, status: "unavailable", version: "expired-fixture",
        expiresAt: new Date(Date.now() - 1000).toISOString(), items: [],
      }),
    });
    const body = await pg.callMustwatchAsync(payload, ACCOUNT_ID);
    if (delayInitialReconciliation) {
      heldReconciliation.push({ route, body });
      return;
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/rest/v1/rpc/kd_streaming_page", async (route) => {
    const request = route.request();
    const payload = request.postDataJSON()?.p_request;
    pageRequests.push({ payload, authorization: request.headers().authorization || "", phase });
    const body = await pg.callAsync(payload, ACCOUNT_ID);
    if (delayInitialReconciliation) {
      heldReconciliation.push({ route, body });
      return;
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route(/\/rest\/v1\/(?:kd_catalog|rpc\/kd_streaming_catalog)(?:\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const name = String(url.searchParams.get("p_name") || url.searchParams.get("name") || "").replace(/^eq\./u, "");
    catalogRequests.push(name);
    catalogEvents.push({ name, phase });
    if (name === "programm") return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([{
        payload: { stand: NOW, filme: [{ film_at_id: "kino-final-1", t: "Kino Ziel", ot: "Cinema Target", j: 2026 }] },
        updated_at: NOW, quelle: "synthetic-mustwatch-final", stand: NOW, gueltig_bis: null,
      }]),
    });
    if (name === "streaming_bekannt") return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([{
        payload: { stand: NOW, katalog_stand: NOW, region: "AT", dienste: ["Netflix"], titel: [] },
        updated_at: NOW, quelle: "synthetic-mustwatch-final", stand: NOW, gueltig_bis: null,
      }]),
    });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  phase = "cold-medithek";
  await page.goto("/");
  await expect.poll(() => personalReads).toBe(1);
  expect(candidateRequests).toHaveLength(0);
  expect(pageRequests).toHaveLength(0);
  await heldPersonalRead.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  await expect(page.getByRole("heading", { name: "Mediathek", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Must-Watch (7)", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__kdMustwatchBadgeHistory)).not.toContain("Must-Watch (0)");
  await expect.poll(() => candidateRequests.length).toBe(1);
  await expect.poll(() => pageRequests.length).toBe(1);
  await expect.poll(() => heldReconciliation.length).toBe(2);
  await page.getByRole("button", { name: /^Must-Watch/u }).click();
  await expect(page.locator(".kd-mustwatch-karte")).toHaveCount(7);
  await page.getByRole("button", { name: "Jetzt verfügbar", exact: true }).click();
  await expect(page.locator(".kd-mustwatch-karte")).toHaveCount(0);
  await expect(page.getByText(/0 von 7 vorgemerkt/u)).toHaveCount(0);
  await expect(page.getByText(/Keine Treffer für diese Auswahl/u)).toHaveCount(0);
  delayInitialReconciliation = false;
  await Promise.all(heldReconciliation.map(({ route, body }) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(body),
  })));
  await expect(page.locator("#mw-mw_dvd")).toBeVisible();
  await expect(page.locator("#mw-mw_stream")).toBeVisible();
  await expect(page.locator("#mw-mw_linked")).toBeVisible();
  await expect(page.locator("#mw-mw_linked_duplicate")).toBeVisible();
  await page.getByRole("button", { name: "Alle", exact: true }).click();
  expect(pageRequests[0].payload.view).toBe("library");
  expect(pageRequests[0].payload.limit).toBe(1000);
  expect(pageRequests[0].payload.library).toHaveLength(2);
  const noIdTarget = pageRequests[0].payload.library.find((item) => item.id === "master:linked-no-id");
  expect(noIdTarget).toMatchObject({
    watchmode_id: null, streaming_id: null, imdb_id: null, tmdb_id: null,
    titel: "Lokaler Titel ohne Fremdkennung", originaltitel: "Needle Original Search", jahr: 2022, typ: "film",
  });
  expect(pageRequests[0].payload.personal).toEqual({
    seenIds: [], mustWatchIds: [], ratedIds: [], newEntries: [], legacyNew: [],
  });
  expect(JSON.stringify(pageRequests[0].payload)).not.toMatch(/bleibt unter Alle|bewertung|notiz/iu);
  await expect.poll(() => catalogRequests.filter((name) => name === "programm").length).toBe(1);
  await expect.poll(() => catalogRequests.filter((name) => name === "streaming_bekannt").length).toBe(1);
  expect(catalogRequests.filter((name) => name === "streaming_entdecken")).toEqual([]);
  const coldCatalogRequestCount = catalogRequests.length;
  const coldCandidateRequestCount = candidateRequests.length;
  const coldPageRequestCount = pageRequests.length;

  phase = "mustwatch";
  await expect(page.locator(".kd-mustwatch-karte")).toHaveCount(7);
  expect(candidateRequests).toHaveLength(coldCandidateRequestCount);
  expect(pageRequests).toHaveLength(coldPageRequestCount);
  expect(candidateRequests[0].payload.ids).toEqual([STREAMING_ID]);
  expect(candidateRequests[0].authorization).toBe("Bearer synthetic-mustwatch-final-access");
  await expect.poll(() => pg.mustwatchCalls.some((call) => call.mode === "ids"
    && call.ids === 1 && call.status === "ready")).toBe(true);
  expect(catalogRequests).toHaveLength(coldCatalogRequestCount);

  await page.getByRole("button", { name: "Jetzt verfügbar", exact: true }).click();
  await expect(page.locator("#mw-mw_dvd")).toBeVisible();
  await expect(page.locator("#mw-mw_stream")).toBeVisible();
  await expect(page.locator("#mw-mw_linked")).toBeVisible();
  await expect(page.locator("#mw-mw_linked_duplicate")).toBeVisible();
  await expect(page.locator("#mw-mw_notiz")).toHaveCount(0);
  await expect(page.locator("#mw-mw_search")).toHaveCount(0);

  await page.getByRole("button", { name: "Alle", exact: true }).click();
  await expect(page.locator("#mw-mw_notiz")).toContainText("bleibt unter Alle");
  const searchCard = page.locator("#mw-mw_search");
  await searchCard.click();
  await searchCard.getByRole("button", { name: "Verknüpfen …", exact: true }).click();
  await expect.poll(() => catalogRequests.filter((name) => name === "programm").length).toBe(1);
  await searchCard.getByPlaceholder(/Titel suchen/u).fill("Needle Original Search");
  await searchCard.getByRole("button", { name: /^Verborgener Katalogtreffer/u }).click();
  await expect(searchCard).toContainText("Streaming: Verborgener Katalogtreffer");
  await expect(searchCard).not.toContainText(STREAMING_ID);
  expect(pg.mustwatchCalls.some((call) => call.mode === "query"
    && call.query === "Needle Original Search" && call.items === 1)).toBe(true);
  await searchCard.getByRole("button", { name: "Verknüpfung lösen", exact: true }).click();
  await expect(searchCard.getByRole("button", { name: "Verknüpfen …", exact: true })).toBeVisible();

  const kinoCard = page.locator("#mw-mw_kino");
  await kinoCard.click();
  await kinoCard.getByRole("button", { name: "Verknüpfen …", exact: true }).click();
  await kinoCard.getByPlaceholder(/Titel suchen/u).fill("Kino Ziel");
  await kinoCard.getByRole("button", { name: /^Kino Ziel/u }).click();
  await expect(kinoCard).toContainText("Kinoprogramm: Kino Ziel");
  expect(catalogRequests.filter((name) => name === "programm")).toHaveLength(1);

  await page.getByRole("button", { name: "Jetzt verfügbar", exact: true }).click();
  await expect(page.locator("#mw-mw_dvd")).toBeVisible();
  await expect(page.locator("#mw-mw_stream")).toBeVisible();
  await expect(page.locator("#mw-mw_linked")).toBeVisible();
  await expect(page.locator("#mw-mw_linked_duplicate")).toBeVisible();
  await expect(page.locator("#mw-mw_kino")).toBeVisible();
  await expect(page.locator("#mw-mw_notiz")).toHaveCount(0);

  phase = "settings";
  await navigateMobile(page, "Settings");
  phase = "service-change";
  await page.getByTitle("„Netflix“ abwählen").click();
  phase = "mediathek-return";
  await navigateMobile(page, "Mediathek");
  await page.getByRole("button", { name: /^Must-Watch/u }).click();
  await page.getByRole("button", { name: "Jetzt verfügbar", exact: true }).click();
  await expect(page.locator("#mw-mw_dvd")).toBeVisible();
  await expect(page.locator("#mw-mw_kino")).toBeVisible();
  await expect(page.locator("#mw-mw_stream")).toHaveCount(0);
  await expect(page.locator("#mw-mw_linked")).toHaveCount(0);
  await expect(page.locator("#mw-mw_linked_duplicate")).toHaveCount(0);

  const beforeServiceRestoreCandidates = candidateRequests.length;
  const beforeServiceRestorePages = pageRequests.length;
  phase = "service-restore";
  await navigateMobile(page, "Settings");
  await page.getByPlaceholder(/Quelle suchen/u).fill("Netflix");
  await page.getByTitle("„Netflix“ zur Auswahl hinzufügen").click();
  phase = "mediathek-restored";
  await navigateMobile(page, "Mediathek");
  expect(candidateRequests).toHaveLength(beforeServiceRestoreCandidates);
  await expect.poll(() => pageRequests.length).toBe(beforeServiceRestorePages + 1);

  let simulatedVisibility = "hidden";
  await page.evaluate(() => {
    window.__kdMustwatchVisibility = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true, get: () => window.__kdMustwatchVisibility,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const beforeHiddenExpiry = candidateRequests.length;
  const beforeHiddenPageExpiry = pageRequests.length;
  const beforeHiddenTime = await page.evaluate(() => Date.now());
  candidateMode = "unavailable";
  await page.clock.fastForward(6 * 60 * 1000);
  expect(await page.evaluate(() => Date.now())).toBeGreaterThanOrEqual(beforeHiddenTime + 6 * 60 * 1000);
  expect(candidateRequests).toHaveLength(beforeHiddenExpiry);
  expect(pageRequests).toHaveLength(beforeHiddenPageExpiry);
  simulatedVisibility = "visible";
  await page.evaluate((state) => {
    window.__kdMustwatchVisibility = state;
    document.dispatchEvent(new Event("visibilitychange"));
  }, simulatedVisibility);
  await expect.poll(() => candidateRequests.length).toBe(beforeHiddenExpiry + 1);
  await expect.poll(() => pageRequests.length).toBe(beforeHiddenPageExpiry + 1);
  await page.clock.fastForward(60 * 1000);
  expect(candidateRequests).toHaveLength(beforeHiddenExpiry + 1);
  expect(pageRequests).toHaveLength(beforeHiddenPageExpiry + 1);

  phase = "start";
  await navigateMobile(page, "Start");
  const dailyRows = page.locator(".kd-dash-mustwatch");
  await expect(dailyRows).toHaveCount(2);
  await expect(dailyRows).toContainText(["DVD Besitz", "Kino ohne Vorbesuch"]);
  await expect(page.locator(".kd-dash-modul", { has: page.getByText("Must-Watch", { exact: true }) }))
    .not.toContainText("Unverknüpfte Besitznotiz");

  const mustwatchText = await page.locator("body").innerText();
  expect(mustwatchText).not.toMatch(/\bready\b|unavailable|ungeprüft|motn:|901258/iu);
  expect(mustwatchText).not.toMatch(/Streamingkatalog nicht ladbar/iu);
  expect(catalogEvents.filter(({ name }) => name === "streaming_bekannt")).toEqual([
    { name: "streaming_bekannt", phase: "cold-medithek" },
  ]);
  expect(catalogRequests.filter((name) => name === "streaming_entdecken")).toEqual([]);
  expect(candidateRequests.every((entry) => entry.payload.ids.length <= 500)).toBe(true);
  expect(unknown).toEqual([]);
  expect(traffic.every((entry) => entry.origin === PROJECT_URL)).toBe(true);
  console.log(`[MUSTWATCH_FINAL] ${JSON.stringify({
    conditions: "production build, cold Mediathek start, Chromium 393x852, foreign network fenced, real disposable PostgreSQL candidate RPC",
    candidateRequests: candidateRequests.map((entry) => ({
      mode: entry.payload.ids.length ? "ids" : "query", ids: entry.payload.ids.length,
      query: entry.payload.query, resultMode: entry.mode,
    })),
    sqlCalls: pg.mustwatchCalls,
    pageSqlCalls: pg.calls.filter((call) => call.view === "library"),
    catalogEvents,
    programReads: catalogRequests.filter((name) => name === "programm").length,
    fullStreamingReads: catalogRequests.filter((name) => name === "streaming_entdecken").length,
  })}`);
});
