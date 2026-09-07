import { expect, test as base } from "@playwright/test";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d3";
const ACCESS_TOKEN = "synthetic-private-v1-access";
const PUBLISHABLE_KEY = "sb_publishable_synthetic_private_v1";
const NOW = "2026-09-04T10:00:00.000Z";
const CHECKSUM = "a".repeat(64);

export const KNOWN_TITLES = Object.freeze([
  Object.freeze({
    watchmode_id: 81001, titel: "Obsession - Du sollst mich lieben", originaltitel: "Obsession",
    jahr: 2024, typ: "movie", genres: ["Drama"], dienste: ["Netflix"],
  }),
  Object.freeze({ watchmode_id: 81002, titel: "Zulu Alt", jahr: 1989, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] }),
  Object.freeze({ watchmode_id: 81003, titel: "Alpha Neu", jahr: 2001, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] }),
  Object.freeze({
    watchmode_id: 81004, titel: "Datumserie", jahr: 2023, typ: "tv_series", genres: ["Crime"], dienste: ["Netflix"],
    staffeln_verfuegbar: 2, folgen_verfuegbar: 10, staffel_dienste: ["Netflix"],
    staffelstand_geprueft_am: "2026-09-04T08:00:00.000Z",
    letzte_folge: { season_number: 2, episode_number: 10, air_date: "2026-09-05" },
  }),
  Object.freeze({
    watchmode_id: 81005, titel: "Pinboardserie", jahr: 2023, typ: "tv_series", genres: ["Crime"], dienste: ["Netflix"],
    staffeln_verfuegbar: 2, folgen_verfuegbar: 10, staffel_dienste: ["Netflix"],
    staffelstand_geprueft_am: "2026-09-04T08:00:00.000Z",
    letzte_folge: { season_number: 2, episode_number: 10 },
  }),
  Object.freeze({ watchmode_id: 81006, titel: "Heute", jahr: 2023, typ: "movie", genres: ["Crime"], dienste: ["Netflix"] }),
]);

export const DISCOVER_TITLES = Object.freeze([
  Object.freeze({ watchmode_id: 82001, titel: "Zulu Fund", jahr: 1989, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] }),
  Object.freeze({ watchmode_id: 82002, titel: "Alpha Fund", jahr: 2001, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] }),
  Object.freeze({ watchmode_id: 82003, titel: "Neuer Fund", jahr: 2023, typ: "tv_series", genres: ["Crime"], dienste: ["Netflix"] }),
]);

const payload = (titel) => ({
  stand: NOW,
  region: "AT",
  dienste: ["Netflix"],
  titel,
});
const row = (value) => [{
  payload: value,
  updated_at: NOW,
  quelle: "synthetic-private-v1-fixture",
  stand: NOW,
  gueltig_bis: "2099-01-01T00:00:00.000Z",
}];

const radarFeed = Object.freeze({
  format: "kd-radar-pilot-feed-v2",
  revision: 1,
  checksum: CHECKSUM,
  reconciledAt: NOW,
  subscriptions: [Object.freeze({
    targetId: "work:tmdb:550", targetType: "work", title: "Fight Club",
    region: "AT", scope: "all", status: "active", updatedAt: NOW,
  })],
  events: [Object.freeze({
    eventId: "22222222-2222-4222-8222-222222222222",
    eventVersionId: "33333333-3333-4333-8333-333333333333",
    targetId: "work:tmdb:550", eventType: "streamingstart_at", date: "2026-09-05",
    region: "AT", platform: "Netflix", lifecycleStatus: "scheduled", verificationStatus: "confirmed",
    evidence: [
      { sourceId: "source:editorial", sourceDomain: "news.example.test", url: "https://news.example.test/fight-club", retrievedAt: NOW },
      { sourceId: "source:official", sourceDomain: "example.test", url: "https://example.test/fight-club", retrievedAt: NOW },
    ],
    title: "Fight Club",
  })],
  receipts: [],
  operationAcks: [],
  radarReview: true,
  personResults: [],
  searchStatuses: [{ targetId: "work:tmdb:550", status: "confirmed", checkedAt: NOW }],
  automation: { contractVersion: "radar-auto-v1", schedulerActive: false, intervalHours: 144 },
});

async function seedAccount(page) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(({ accountId, accessToken, projectUrl, publishableKey, knownTitles, now }) => {
    localStorage.setItem("kd:auth:session", JSON.stringify({
      v: 1,
      access_token: accessToken,
      refresh_token: "synthetic-private-v1-refresh",
      gueltigBis: Date.parse("2099-01-01T00:00:00.000Z"),
      kontoId: accountId,
      mail: "private-v1@login.kinodreieck.test",
      benutzername: "private-v1",
    }));
    localStorage.setItem("kd:acct:owner", accountId);
    localStorage.setItem("kd:acct:epoch", JSON.stringify({ accountId, token: "synthetic-private-v1-epoch" }));
    localStorage.setItem("kd:acct:binding-schema", JSON.stringify({ v: 1, accountId }));
    localStorage.setItem("kd:acct:uebernommen", JSON.stringify({ accountId, t: now }));
    localStorage.setItem("kd:master", JSON.stringify({ filme: masterRowsForBrowser(), meta: { version: "private-v1" }, gespeichertAm: Date.parse(now) }));
    localStorage.setItem("kd:artikel", JSON.stringify({
      artikel: [{
        id: "private-v1-article", titel: "Privatrelease Artikel", autor: "Max",
        text: "Ein fokussierter Artikel für den netzgesperrten Browsernachweis.",
        geordnet: false, geteilt: false, liste: [], status: "freigegeben", herkunft: "eigen",
        erstellt_am: now,
      }],
      gespeichertAm: Date.parse(now),
    }));
    localStorage.setItem("kd:entdecken-status", "{}");
    localStorage.setItem("kd:mustwatch", JSON.stringify({
      eintraege: Array.from({ length: 5 }, (_, index) => ({
        id: `mw_private_${index + 1}`, titel: `Private Must-Watch ${index + 1}`,
        im_besitz: true, beschreibung: "", notiz: "", verknuepfung: null,
      })),
      gespeichertAm: Date.parse(now),
    }));
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix"], heuristik: true }));
    localStorage.setItem("kd:katalog:url", projectUrl);
    localStorage.setItem("kd:katalog:key", publishableKey);
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "local-v1");
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: true, weg: "konto" }));

    function masterRowsForBrowser() {
      return knownTitles.filter((entry) => entry.typ === "movie" && [81001, 81002, 81003].includes(entry.watchmode_id)).map((entry) => ({
        id: entry.watchmode_id === 81001 ? "obsession-2024" : `master-${entry.watchmode_id}`,
        watchmode_id: entry.watchmode_id,
        titel: entry.titel,
        originaltitel: entry.originaltitel || entry.titel,
        jahr: entry.jahr,
        typ: "film",
        quelle: "streaming", kategorie: "sehenswert", bewertet_von: "max",
        bewertung: { wie: 3, was: 3, warum: 3 }, genre: ["Drama"], tags: [], begruendung: "", notiz: "",
        ...(entry.watchmode_id === 81001 ? { zuletzt_ticker: 1, erstellt_am: "2026-09-04T07:15:00.000Z" } : {}),
      }));
    }
  }, {
    accountId: ACCOUNT_ID,
    accessToken: ACCESS_TOKEN,
    projectUrl: PROJECT_URL,
    publishableKey: PUBLISHABLE_KEY,
    knownTitles: KNOWN_TITLES,
    now: NOW,
  });
}

async function installNetworkFence(page, traffic) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();

    const record = (kind, detail = url.pathname) => traffic.nonLocal.push(Object.freeze({
      method: request.method(),
      origin: url.origin,
      path: url.pathname,
      kind,
      detail,
    }));
    if (url.origin !== PROJECT_URL) {
      record("aborted", "non-fixture-origin");
      return route.abort("blockedbyclient");
    }

    if (url.pathname === "/rest/v1/kd_account_access") {
      record("mocked", "account-access");
      traffic.contracts.push("account-access");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
        { role: "member", active: true, personal_ai: true },
      ]) });
    }
    if (url.pathname === "/rest/v1/kd_personal") {
      record("mocked", "personal-store");
      traffic.contracts.push(`personal-${request.method().toLowerCase()}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (url.pathname === "/rest/v1/kd_catalog") {
      const name = String(url.searchParams.get("name") || "").replace(/^eq\./u, "");
      record("mocked", `catalog:${name}`);
      traffic.contracts.push(`catalog:${name}`);
      if (name === "streaming_bekannt") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row(payload(KNOWN_TITLES))) });
      }
      if (name === "streaming_entdecken") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row(payload(DISCOVER_TITLES))) });
      }
      if (name === "programm") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row({ stand: "2026-09-04", filme: [] })) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (url.pathname === "/rest/v1/rpc/kd_radar_pilot_feed") {
      record("mocked", "radar-feed");
      traffic.contracts.push("radar-feed");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(radarFeed) });
    }

    record("aborted", "unknown-fixture-path");
    traffic.unknownFixturePaths.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
}

export async function navigateMobile(page, name) {
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name, exact: true }).click();
}

export async function expectTouchTarget(locator, label) {
  const box = await locator.boundingBox();
  expect(box, `${label}: Bounding Box vorhanden`).not.toBeNull();
  expect(box.width, `${label}: Breite`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label}: Hoehe`).toBeGreaterThanOrEqual(44);
  return Object.freeze({ width: Number(box.width.toFixed(1)), height: Number(box.height.toFixed(1)) });
}

export const test = base.extend({
  privateApp: async ({ page }, use, testInfo) => {
    const traffic = { nonLocal: [], contracts: [], unknownFixturePaths: [] };
    await page.setViewportSize({ width: 393, height: 852 });
    await seedAccount(page);
    await installNetworkFence(page, traffic);
    await page.goto("/");
    await expect(page.locator(".kd-app")).toBeVisible();
    await expect.poll(() => traffic.contracts.includes("account-access")).toBe(true);
    await use({ page, traffic });
    expect(traffic.unknownFixturePaths, "alle Fixture-Backendpfade sind explizit gestubbt").toEqual([]);
    expect(traffic.nonLocal.every((entry) => entry.kind === "mocked" || entry.kind === "aborted"),
      "kein Nicht-localhost-Request passiert das Routengate").toBe(true);
    console.log(`[PRIVATE_V1_NET] ${JSON.stringify({
      browser: testInfo.project.name,
      nonLocal: traffic.nonLocal.length,
      mocked: traffic.nonLocal.filter((entry) => entry.kind === "mocked").length,
      aborted: traffic.nonLocal.filter((entry) => entry.kind === "aborted").length,
      unknownFixturePaths: traffic.unknownFixturePaths.length,
    })}`);
  },
});

export { expect };
