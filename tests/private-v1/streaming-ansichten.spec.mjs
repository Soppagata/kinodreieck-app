import fs from "node:fs";
import { expect, navigateMobile, test } from "./fixtures.mjs";

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

const payload = (titel, katalogStand) => ({
  ...fixture,
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

test("Streaming zeigt vollständige Auswahlunion, producerbelegtes Neu und ehrliche Settings-Stände", async ({ privateApp }) => {
  const { page } = privateApp;
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
        body: row(payload(fixture.titel, fixture.stand)),
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
  }, fixture.auswahl);
  await page.reload();
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
  await expect(page.getByText("Neuer Auswahlzugang", { exact: false })).toBeVisible();
  await expect(page.getByText("Unveränderter Altbestand", { exact: false })).toHaveCount(0);

  await views.filter({ hasText: /^Alles/u }).click();
  const echterDiscoverTitel = page.locator(".kd-entdecken-karte").filter({ hasText: "Neuer Auswahlzugang" });
  await echterDiscoverTitel.click();
  await expect(echterDiscoverTitel.getByRole("button", { name: "Eintrag erstellen", exact: true })).toBeVisible();

  await navigateMobile(page, "Settings");
  await page.getByText("Streaming-Katalogbestand", { exact: true }).click();
  const audit = page.getByTestId("streaming-catalog-audit");
  await expect(audit).toContainText("Vollständiger geladener Streaming-Katalog");
  await expect(audit).toContainText("Gesamtbestand");
  await expect(audit).toContainText("4 Titel im geladenen Stand");
  await expect(audit).toContainText("Mein Programm");
  await expect(audit).toContainText("Netflix · 4 Titel");
  await expect(audit).toContainText("alle 48 Stunden");
  await expect(audit).toContainText("15.09.2026");
});
