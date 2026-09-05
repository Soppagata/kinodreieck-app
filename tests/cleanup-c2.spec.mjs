import { test, expect } from "@playwright/test";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000c2";
const PUBLISHABLE_KEY = "sb_publishable_c2_test_1234567890";
const ACCESS_TOKEN = "synthetic-c2-access-token";

const knownTitles = [
  { watchmode_id: 61001, titel: "Zulu Alt", jahr: 1989, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] },
  { watchmode_id: 61002, titel: "Alpha Neu", jahr: 2001, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] },
  { watchmode_id: 61003, titel: "Heute", jahr: 2023, typ: "tv_series", genres: ["Crime"], dienste: ["Netflix"] },
];
const discoverTitles = [
  { watchmode_id: 62001, titel: "Zulu Fund", jahr: 1989, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] },
  { watchmode_id: 62002, titel: "Alpha Fund", jahr: 2001, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] },
  { watchmode_id: 62003, titel: "Neuer Fund", jahr: 2023, typ: "tv_series", genres: ["Crime"], dienste: ["Netflix"] },
];
const knownPayload = {
  stand: "2026-09-04T08:00:00.000Z",
  region: "AT",
  dienste: ["Netflix"],
  titel: knownTitles,
};
const discoverPayload = {
  stand: "2026-09-04T08:00:00.000Z",
  region: "AT",
  dienste: ["Netflix"],
  titel: discoverTitles,
};
const row = (payload) => [{
  payload,
  updated_at: "2026-09-04T08:00:00.000Z",
  quelle: "cleanup-c2-fixture",
  stand: "2026-09-04T08:00:00.000Z",
  gueltig_bis: "2099-01-01T00:00:00.000Z",
}];

async function seedAccount(page) {
  await page.addInitScript(({ accountId, token, projectUrl, key, titles }) => {
    const master = titles.map((entry) => ({
      id: `master-${entry.watchmode_id}`,
      watchmode_id: entry.watchmode_id,
      titel: entry.titel,
      originaltitel: entry.titel,
      jahr: entry.jahr,
      typ: entry.typ === "tv_series" ? "serie" : "film",
      quelle: "streaming",
      kategorie: "sehenswert",
      bewertet_von: "max",
      bewertung: { wie: 3, was: 3, warum: 3 },
      genre: entry.genres,
      tags: [],
      begruendung: "",
      notiz: "",
    }));
    localStorage.setItem("kd:auth:session", JSON.stringify({
      v: 1,
      access_token: token,
      refresh_token: "synthetic-c2-refresh-token",
      gueltigBis: Date.now() + 60 * 60 * 1000,
      kontoId: accountId,
      mail: "c2@login.kinodreieck.at",
      benutzername: "c2",
    }));
    localStorage.setItem("kd:acct:owner", accountId);
    localStorage.setItem("kd:acct:epoch", JSON.stringify({ accountId, token: "c2-epoch" }));
    localStorage.setItem("kd:acct:binding-schema", JSON.stringify({ v: 1, accountId }));
    localStorage.setItem("kd:acct:uebernommen", JSON.stringify({ accountId, t: "2026-09-04T08:00:00.000Z" }));
    localStorage.setItem("kd:master", JSON.stringify({ filme: master, meta: { version: "c2" }, gespeichertAm: Date.now() }));
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix"], heuristik: true }));
    localStorage.setItem("kd:katalog:url", projectUrl);
    localStorage.setItem("kd:katalog:key", key);
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "local-v1");
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: true, weg: "konto" }));
  }, {
    accountId: ACCOUNT_ID,
    token: ACCESS_TOKEN,
    projectUrl: PROJECT_URL,
    key: PUBLISHABLE_KEY,
    titles: knownTitles,
  });
}

async function installLocalBackend(page, requests) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    if (url.origin !== PROJECT_URL) return route.abort();

    if (url.pathname === "/rest/v1/kd_account_access") {
      requests.push("account-access");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
        { role: "member", active: true, personal_ai: false },
      ]) });
    }
    if (url.pathname === "/rest/v1/kd_personal") {
      requests.push("personal-read");
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (url.pathname === "/rest/v1/kd_catalog") {
      const name = String(url.searchParams.get("name") || "").replace(/^eq\./, "");
      requests.push(`catalog:${name}`);
      if (name === "streaming_bekannt") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row(knownPayload)) });
      }
      if (name === "streaming_entdecken") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row(discoverPayload)) });
      }
      if (name === "programm") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row({
          stand: "2026-09-04", filme: [],
        })) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.abort();
  });
}

async function navigateMobile(page, name) {
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" })
    .getByRole("button", { name, exact: true }).click();
}

test("C2: Entdecken bleibt leicht; beide Streaming-Regler erzwingen Jahr aufsteigend", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const requests = [];
  await seedAccount(page);
  await installLocalBackend(page, requests);
  await page.goto("/");
  await expect(page.locator(".kd-app")).toBeVisible();
  await expect.poll(() => requests.filter((entry) => entry === "catalog:streaming_bekannt").length).toBe(1);
  expect(requests.filter((entry) => entry === "catalog:streaming_entdecken")).toHaveLength(0);

  const coldStarted = await page.evaluate(() => performance.now());
  await navigateMobile(page, "Entdecken");
  await expect(page.getByTestId("entdecken-tab")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diese Woche beliebt" })).toBeVisible();
  await expect(page.locator(".kd-entdecken-neutral")).toHaveCount(6);
  const coldReady = await page.evaluate(() => performance.now());
  const lightRequests = [...requests];
  expect(lightRequests.filter((entry) => entry === "catalog:streaming_entdecken")).toHaveLength(0);

  await navigateMobile(page, "Start");
  const warmStarted = await page.evaluate(() => performance.now());
  await navigateMobile(page, "Entdecken");
  await expect(page.locator(".kd-entdecken-neutral")).toHaveCount(6);
  const warmReady = await page.evaluate(() => performance.now());
  expect(requests.filter((entry) => entry === "catalog:streaming_entdecken")).toHaveLength(0);

  const knownResponseBytes = Buffer.byteLength(JSON.stringify(row(knownPayload)));
  console.log(`[C2_METRIC] ${JSON.stringify({
    browser: testInfo.project.name,
    viewport: "393x852",
    requestChain: lightRequests,
    knownResponseBytes,
    fullCatalogRequests: 0,
    fullCatalogBytes: 0,
    fullCatalogParseMs: 0,
    fullCatalogProjectionMs: 0,
    mountedPopularCards: 6,
    coldRenderMs: Number((coldReady - coldStarted).toFixed(2)),
    warmRenderMs: Number((warmReady - warmStarted).toFixed(2)),
  })}`);

  await navigateMobile(page, "Streaming");
  expect(requests.filter((entry) => entry === "catalog:streaming_entdecken")).toHaveLength(0);
  await expect(page.getByRole("button", { name: /^Alles/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Entdecken/ })).toHaveCount(0);

  const programmCards = page.locator('[data-streaming-suchtreffer^="programm:"]');
  await expect(programmCards).toHaveCount(3);
  await page.locator(".kd-streamfilter-knopf").click();
  const programSort = page.getByRole("combobox", { name: "Mein Programm: Sortierfeld" });
  const programDirection = page.getByRole("combobox", { name: "Mein Programm: Sortierrichtung" });
  await programSort.selectOption("titel");
  await programDirection.selectOption("ab");
  const programDecade = page.getByRole("slider", { name: "Mein Programm: Jahrzehnt filtern" });
  await expect(programDecade).toHaveValue("0");
  await expect(page.locator(".kd-streamfilter-dekade .kd-streamfilter-abc-kopf strong").first())
    .toHaveText("Alle");
  await expect(programDecade).toHaveAttribute("aria-valuetext", "Alle Jahrzehnte");
  await expect(page.locator(".kd-streamfilter-regler .kd-streamfilter-abc-kopf button")).toHaveCount(0);
  expect(await page.locator(".kd-streamfilter-regler .kd-streamfilter-abc-kopf").evaluateAll((koepfe) => (
    koepfe.every((kopf) => getComputedStyle(kopf).gridTemplateColumns.trim().split(/\s+/).length === 2)
  ))).toBe(true);
  await programDecade.fill("2");
  await expect(programSort).toHaveValue("jahr");
  await expect(programDirection).toHaveValue("auf");
  await expect(programDecade).toHaveAttribute("aria-valuetext", "1990er: 1988 bis 2002");
  await expect(page.locator(".kd-streamfilter-dekade .kd-streamfilter-abc-kopf strong").first())
    .toHaveText("1990er");
  await expect(programmCards).toHaveCount(2);
  await expect(programmCards.first()).toContainText("Zulu Alt");

  await page.getByRole("button", { name: /^Alles/ }).click();
  await expect.poll(() => requests.filter((entry) => entry === "catalog:streaming_entdecken").length).toBe(1);
  const discoverCards = page.locator(".kd-entdecken-karte");
  await expect(discoverCards).toHaveCount(3);
  const discoverSort = page.getByRole("combobox", { name: "Entdecken: Sortierfeld" });
  const discoverDirection = page.getByRole("combobox", { name: "Entdecken: Sortierrichtung" });
  await discoverSort.selectOption("titel");
  await discoverDirection.selectOption("ab");
  const discoverDecade = page.getByRole("slider", { name: "Entdecken: Jahrzehnt filtern" });
  await expect(discoverDecade).toHaveValue("0");
  await expect(page.locator(".kd-streamfilter-dekade .kd-streamfilter-abc-kopf strong").last())
    .toHaveText("Alle");
  await expect(discoverDecade).toHaveAttribute("aria-valuetext", "Alle Jahrzehnte");
  await expect(page.locator(".kd-streamfilter-regler .kd-streamfilter-abc-kopf button")).toHaveCount(0);
  expect(await page.locator(".kd-streamfilter-regler .kd-streamfilter-abc-kopf").evaluateAll((koepfe) => (
    koepfe.every((kopf) => getComputedStyle(kopf).gridTemplateColumns.trim().split(/\s+/).length === 2)
  ))).toBe(true);
  await discoverDecade.fill("2");
  await expect(discoverSort).toHaveValue("jahr");
  await expect(discoverDirection).toHaveValue("auf");
  await expect(discoverDecade).toHaveAttribute("aria-valuetext", "1990er: 1988 bis 2002");
  await expect(page.locator(".kd-streamfilter-dekade .kd-streamfilter-abc-kopf strong").last())
    .toHaveText("1990er");
  await expect(discoverCards).toHaveCount(2);
  await expect(discoverCards.first()).toContainText("Zulu Fund");
});

test("C2: Globale Suche lädt den Vollkatalog erst auf ausdrückliche Anfrage", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const requests = [];
  await seedAccount(page);
  await installLocalBackend(page, requests);
  await page.goto("/");
  await expect(page.locator(".kd-app")).toBeVisible();
  await expect.poll(() => requests.filter((entry) => entry === "catalog:streaming_bekannt").length).toBe(1);
  expect(requests.filter((entry) => entry === "catalog:streaming_entdecken")).toHaveLength(0);

  const globaleSuche = page.getByRole("search", { name: "Globale Suche in allen Bereichen" });
  await globaleSuche.getByRole("textbox", { name: "Sucheingabe" }).fill("Zulu Fund");
  await globaleSuche.getByRole("button", { name: "Suchen" }).click();

  await expect.poll(() => requests.filter((entry) => entry === "catalog:streaming_entdecken").length).toBe(1);
  const dialog = globaleSuche.getByRole("dialog", { name: /Suchergebnisse für Zulu Fund/ });
  await expect(dialog.getByRole("button", { name: /Streaming Zulu Fund 1989/ })).toBeVisible();
});
