import fs from "node:fs";
import { expect, expectTouchTarget, navigateMobile, test } from "./fixtures.mjs";

const fixture = JSON.parse(fs.readFileSync(
  new URL("./fixtures/streaming_dienst_diffs_v1.json", import.meta.url), "utf8",
));
const GUELTIG_BIS = "2099-01-01T00:00:00.000Z";
const BESTEHENDER_MASTER_TITEL = {
  watchmode_id: 81001, titel: "Obsession - Du sollst mich lieben", originaltitel: "Obsession",
  jahr: 2024, typ: "movie", genres: ["Drama"], dienste: ["Netflix"],
  dienst_diffs: [{
    dienst: "Netflix", vorher: false, nachher: true, erkannt_am: "2026-09-15T12:00:00.000Z",
  }],
};
const AMAZON_CHANNELS = [
  "Paramount+ (Via Amazon Prime)",
  "Crunchyroll Premium (Via Prime)",
];
const TEST_AUSWAHL = [...fixture.auswahl, ...AMAZON_CHANNELS];
const UI_TITEL = fixture.titel.map((entry) => entry.watchmode_id === 102 ? {
  ...entry,
  titel: "Neuer Auswahlzugang mit einem außergewöhnlich langen Serientitel",
  jahr: 2026,
  dienste: ["Netflix", ...AMAZON_CHANNELS],
  dienst_diffs: [
    ...entry.dienst_diffs,
    ...AMAZON_CHANNELS.map((dienst) => ({
      dienst, vorher: false, nachher: true, erkannt_am: fixture.stand,
    })),
  ],
} : entry);

const payload = (titel, katalogStand) => ({
  ...fixture,
  auswahl: TEST_AUSWAHL,
  stand_pro_quelle: Object.fromEntries(TEST_AUSWAHL.map((dienst) => [dienst, fixture.stand])),
  vergleich_stand_pro_quelle: Object.fromEntries(TEST_AUSWAHL.map((dienst) => [dienst, fixture.stand])),
  katalog_stand: katalogStand,
  titel,
});
const row = (value) => JSON.stringify([{
  payload: value,
  updated_at: fixture.stand,
  quelle: "synthetic-streaming-ansichten",
  stand: fixture.stand,
  gueltig_bis: GUELTIG_BIS,
}]);

test("Beliebte Titel klappt eine vorhandene Beschreibung per Titel auf", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  const description = "Eine ruhige Testbeschreibung, die erst nach dem Titelklick sichtbar wird.";
  const outerBanks = {
    watchmode_id: 92020, titel: "Outer Banks", jahr: 2020, typ: "tv_series",
    genres: ["Drama"], dienste: ["Netflix"], description,
  };
  await page.route("**/rest/v1/kd_catalog?*", async (route) => {
    const url = new URL(route.request().url());
    const name = String(url.searchParams.get("name") || "").replace(/^eq\./u, "");
    if (!["streaming_bekannt", "streaming_entdecken"].includes(name)) return route.fallback();
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: row({
        stand: fixture.stand, katalog_stand: fixture.stand, region: "AT",
        dienste: ["Netflix"], stand_pro_quelle: { Netflix: fixture.stand },
        vergleich_stand_pro_quelle: { Netflix: fixture.stand }, titel: [outerBanks],
      }),
    });
  });
  await page.reload();
  await page.setViewportSize({ width: 393, height: 852 });
  await navigateMobile(page, "Streaming");
  await page.getByRole("button", { name: /^Alles/u }).click();
  await expect(page.locator(".kd-entdecken-karte").filter({ hasText: "Outer Banks" })).toBeVisible();
  await navigateMobile(page, "Entdecken");

  const karte = page.locator(".kd-entdecken-neutral").filter({ hasText: "Outer Banks" });
  const toggle = karte.getByRole("button", { name: "Outer Banks", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(karte.getByText(description, { exact: true })).toHaveCount(0);
  await expectTouchTarget(toggle, "Beliebte-Titel-Beschreibung");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(karte.getByText(description, { exact: true })).toBeVisible();
  await expect(karte.getByRole("link", { name: "Quelle ansehen", exact: true })).toBeVisible();
  await karte.screenshot({ path: testInfo.outputPath("e15-entdecken-beliebt.png") });
  await toggle.click();
  await expect(karte.getByText(description, { exact: true })).toHaveCount(0);
});

test("Streaming zeigt vollständige Auswahlunion, producerbelegtes Neu und ehrliche Settings-Stände", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await page.setViewportSize({ width: 393, height: 852 });
  let knownReads = 0;
  await page.route("**/rest/v1/kd_catalog?*", async (route) => {
    const url = new URL(route.request().url());
    const name = String(url.searchParams.get("name") || "").replace(/^eq\./u, "");
    if (name === "streaming_bekannt") {
      knownReads += 1;
      const stand = knownReads === 1 ? "2026-09-14T12:00:00.000Z" : fixture.stand;
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: row(payload([BESTEHENDER_MASTER_TITEL, fixture.titel[0]], stand)),
      });
    }
    if (name === "streaming_entdecken") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: row(payload(UI_TITEL, fixture.stand)),
      });
    }
    return route.fallback();
  });
  await page.clock.setFixedTime(new Date("2026-09-16T11:00:00.000Z"));
  await page.evaluate((selected) => {
    const master = JSON.parse(localStorage.getItem("kd:master") || "{}");
    const ohneExterneIds = (master.filme || []).map((film) => {
      if (film.id !== "obsession-2024") return film;
      const { watchmode_id: _watchmodeId, imdb_id: _imdbId, tmdb_id: _tmdbId, ...rest } = film;
      return rest;
    });
    localStorage.setItem("kd:master", JSON.stringify({ ...master, filme: ohneExterneIds }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: selected, heuristik: true }));
  }, TEST_AUSWAHL);
  await page.reload();

  await navigateMobile(page, "Settings");
  const quellenSuche = page.getByPlaceholder("Quelle suchen (z. B. Hayu, MUBI, Joyn) …");
  for (const dienst of AMAZON_CHANNELS) {
    await quellenSuche.fill(dienst);
    await page.getByTitle(`„${dienst}“ zur Auswahl hinzufügen`).click();
  }
  await navigateMobile(page, "Streaming");

  const views = page.locator(".kd-streaming-tab .kd-seg-control");
  await expect(views.filter({ hasText: /^Mein Programm/u })).toContainText("(1)");
  await views.filter({ hasText: /^Alles/u }).click();
  await expect.poll(() => knownReads).toBe(2);
  await expect(views.filter({ hasText: /^Alles/u })).toContainText("(4)");
  await expect(page.locator(".kd-entdecken-karte")).toHaveCount(4);
  await expect(page.getByText("Bestehender Auswahlzugang", { exact: false })).toBeVisible();
  await expect(page.getByText("Unveränderter Altbestand", { exact: false })).toBeVisible();
  const bekanntOhneIds = page.locator(".kd-entdecken-karte").filter({ hasText: "Obsession - Du sollst mich lieben" });
  await expect(bekanntOhneIds).toContainText("in deiner Mediathek");
  await bekanntOhneIds.click();
  await expect(bekanntOhneIds.getByRole("button", { name: /Eintrag erstellen|In Mediathek übernehmen/u })).toHaveCount(0);
  await bekanntOhneIds.getByRole("button", { name: "Als gesehen markieren" }).click();
  await expect(bekanntOhneIds).toContainText("gesehen · in deiner Mediathek");
  await expect(page.getByText("Auch als unbewerteten Eintrag in die Mediathek übernehmen?", { exact: true })).toHaveCount(0);

  await views.filter({ hasText: /^Neu/u }).click();
  await expect(views.filter({ hasText: /^Neu/u })).toContainText("(3)");
  await expect(page.locator(".kd-entdecken-karte").filter({ hasText: "Obsession - Du sollst mich lieben" }))
    .toContainText("in deiner Mediathek");
  await expect(page.getByText("Bestehender Auswahlzugang", { exact: false })).toBeVisible();
  const neuKarte = page.locator(".kd-streaming-neu-karte").filter({ hasText: "Neuer Auswahlzugang" });
  await expect(neuKarte).toBeVisible();
  await expect(neuKarte).toContainText("Paramount+ (Prime)");
  await expect(neuKarte).toContainText("Crunchyroll (Prime)");
  await expect(neuKarte).not.toContainText("Amazon Channel");
  const reihenfolge = await neuKarte.evaluate((karte) => {
    const box = (selector) => karte.querySelector(selector)?.getBoundingClientRect();
    return {
      titel: box(".kd-entdecken-titel")?.top,
      dienste: box(".kd-streaming-neu-dienste")?.top,
      aktionen: box(".kd-entdecken-aktionen")?.top,
    };
  });
  expect(reihenfolge.titel).toBeLessThan(reihenfolge.dienste);
  expect(reihenfolge.dienste).toBeLessThan(reihenfolge.aktionen);
  for (const [index, aktion] of ["Pin", "Merken", "Gesehen"].entries()) {
    await expectTouchTarget(neuKarte.locator(".kd-entdecken-aktionen button").nth(index), `Neu-Karte ${aktion}`);
  }
  expect(await neuKarte.evaluate((karte) => karte.scrollWidth <= karte.clientWidth + 1)).toBe(true);
  await neuKarte.screenshot({ path: testInfo.outputPath("e15-streaming-neu-neutral.png") });

  await neuKarte.click();
  await expect(neuKarte.getByRole("button", { name: "Eintrag erstellen", exact: true })).toBeVisible();
  await neuKarte.click();
  const pin = neuKarte.locator(".kd-entdecken-pin");
  await expect(pin).toHaveAttribute("aria-label", /am Pinboard anpinnen/u);
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await neuKarte.getByRole("button", { name: "Auf die Merkliste" }).click();
  await expect(neuKarte.getByRole("button", { name: "Von der Merkliste nehmen" })).toBeVisible();
  await neuKarte.getByRole("button", { name: "Als gesehen markieren" }).click();
  await expect(page.getByText("Auch als unbewerteten Eintrag in die Mediathek übernehmen?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nur als gesehen markieren", exact: true }).click();
  await expect(neuKarte.getByRole("button", { name: "Gesehen-Markierung entfernen" })).toBeVisible();
  await neuKarte.screenshot({ path: testInfo.outputPath("e15-streaming-neu.png") });
  await expect(page.getByText("Unveränderter Altbestand", { exact: false })).toHaveCount(0);

  await views.filter({ hasText: /^Alles/u }).click();
  await bekanntOhneIds.getByRole("button", { name: /in deiner Mediathek · Zum Eintrag/u }).click();
  await expect(page.locator("#film-obsession-2024")).toBeVisible();
  await expect(page.getByRole("slider", { name: /Mediathek: Anfangsbuchstaben filtern/u })).toBeVisible();
  await expect(page.getByRole("slider", { name: /Mediathek: Jahrzehnt filtern/u })).toBeVisible();
  await page.locator("#film-obsession-2024").screenshot({ path: testInfo.outputPath("ui-mediathek-verlinkt.png") });

  await navigateMobile(page, "Settings");
  await page.getByText("Streaming-Katalogbestand", { exact: true }).click();
  const audit = page.getByTestId("streaming-catalog-audit");
  await expect(audit).toContainText("Vollständiger geladener Streaming-Katalog");
  await expect(audit).toContainText("Gesamtbestand");
  await expect(audit).toContainText("4 Titel im geladenen Stand");
  await expect(audit).toContainText("Mein Programm");
  await expect(audit).toContainText("Netflix · Paramount+ (Via Amazon Prime) · Crunchyroll Premium (Via Prime) · 4 Titel");
  await expect(audit).toContainText("alle 48 Stunden");
  await expect(audit).toContainText("15.09.2026");
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 852 });
    const sources = audit.locator(".kd-katalog-quellenkarte");
    expect(await sources.count()).toBeGreaterThan(0);
    for (const source of await sources.all()) {
      expect(await source.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      for (const value of await source.locator("dd").all()) {
        expect(await value.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await audit.screenshot({ path: testInfo.outputPath("ui-quellenstaende-mobile.png") });
});
