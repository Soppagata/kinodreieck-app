import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/* Vollständiger lokaler App-Boot mit synthetischem Konto und Katalog. Jeder
   nicht-lokale Request wird vor dem ersten Seitenaufruf gestubbt oder gesperrt. */
const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";
const NOW = "2026-09-07T16:00:00.000Z";
const SERVICES = ["Netflix", "Paramount+ (via Amazon Prime)", "Prime Video"];
const FILMS = [
  { id: "mw_no_country", watchmode_id: 83001, titel: "No Country for Old Men", jahr: 2007, dienste: [SERVICES[1]] },
  { id: "mw_eraserhead", watchmode_id: 83002, titel: "Eraserhead", jahr: 1977, dienste: [], im_besitz: true },
  { id: "mw_indiana_jones", watchmode_id: 83003, titel: "Indiana Jones and the Temple of Doom", jahr: 1984, dienste: [SERVICES[0]] },
  { id: "mw_jesse_james", watchmode_id: 83004, titel: "The Assassination of Jesse James by the Coward Robert Ford", jahr: 2007, dienste: SERVICES },
  { id: "mw_triangle", watchmode_id: 83005, titel: "Triangle of Sadness", jahr: 2022, dienste: SERVICES.slice(1), im_besitz: true },
];

async function boot(page, { theme, schrift }) {
  const unexpected = [];
  await page.clock.setFixedTime(new Date(NOW));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const json = (value) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.origin === PROJECT_URL) {
      if (url.pathname === "/rest/v1/kd_account_access") return json([{ role: "member", active: true, personal_ai: false }]);
      if (url.pathname === "/rest/v1/kd_personal") return json([]);
      if (url.pathname === "/rest/v1/kd_catalog") {
        const name = url.searchParams.get("name");
        let payload;
        if (name === "eq.programm") payload = { stand: NOW, filme: [] };
        if (name === "eq.streaming_bekannt") payload = {
          stand: NOW, region: "AT", dienste: SERVICES,
          titel: FILMS.map(({ watchmode_id, titel, jahr, dienste }) => ({ watchmode_id, titel, jahr, dienste, typ: "movie" })),
        };
        if (name === "eq.streaming_entdecken") payload = { stand: NOW, region: "AT", dienste: SERVICES, titel: [] };
        if (payload) return json([{ payload, updated_at: NOW, quelle: "synthetic-layout-fixture", stand: NOW, gueltig_bis: "2099-01-01T00:00:00.000Z" }]);
      }
      if (["/rest/v1/rpc/kd_flixpatrol_chart_read", "/rest/v1/rpc/kd_flixpatrol_titles_read"].includes(url.pathname)) return json([]);
      if (url.pathname === "/rest/v1/rpc/kd_radar_pilot_feed") return json({
        format: "kd-radar-pilot-feed-v2", revision: 1, checksum: "a".repeat(64), reconciledAt: NOW,
        subscriptions: [], events: [], receipts: [], operationAcks: [], radarReview: false, personResults: [], searchStatuses: [],
        automation: { contractVersion: "radar-auto-v1", schedulerActive: false, intervalHours: 144 },
      });
    }
    unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(({ theme, schrift, films, services, now, projectUrl }) => {
    const accountId = "00000000-0000-4000-8000-0000000000d4";
    localStorage.setItem("kd:auth:session", JSON.stringify({
      v: 1, access_token: "synthetic-layout-access", refresh_token: "synthetic-layout-refresh",
      gueltigBis: Date.parse("2099-01-01T00:00:00.000Z"), kontoId: accountId,
      mail: "layout@login.kinodreieck.test", benutzername: "layout",
    }));
    localStorage.setItem("kd:acct:owner", accountId);
    localStorage.setItem("kd:acct:epoch", JSON.stringify({ accountId, token: "synthetic-layout-epoch" }));
    localStorage.setItem("kd:acct:binding-schema", JSON.stringify({ v: 1, accountId }));
    localStorage.setItem("kd:acct:uebernommen", JSON.stringify({ accountId, t: now }));
    localStorage.setItem("kd:master", JSON.stringify({ filme: [], meta: {}, gespeichertAm: Date.parse(now) }));
    localStorage.setItem("kd:mustwatch", JSON.stringify({
      eintraege: films.map(({ id, watchmode_id, titel, jahr, im_besitz }) => ({
        id, titel, jahr, im_besitz: !!im_besitz, typ: "film", beschreibung: "", notiz: "",
        verknuepfung: { ziel: "streaming", id: watchmode_id },
      })), gespeichertAm: Date.parse(now),
    }));
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme, schrift, startTab: "start", modus: "" }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: services, heuristik: true }));
    localStorage.setItem("kd:katalog:url", projectUrl);
    localStorage.setItem("kd:katalog:key", "sb_publishable_synthetic_private_v1");
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "local-v1");
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: true, weg: "konto" }));
  }, { theme, schrift, films: FILMS, services: SERVICES, now: NOW, projectUrl: PROJECT_URL });
  await page.goto("/");
  await expect(page.locator(".kd-dash-mustwatch")).toHaveCount(FILMS.length);
  await expect(page.locator(".kd-dash-mustwatch .kd-dash-badge--neu")).toHaveCount(7);
  await page.evaluate(() => document.fonts.ready);
  return unexpected;
}

/* Prüft die tatsächlichen Text-Fragmente nach dem Browserumbruch. Eine bloße
   scrollWidth-Prüfung würde Ellipsis, Clipping oder überdeckte Titel übersehen. */
async function assertReadableRows(page, schrift) {
  const measurements = await page.locator(".kd-dash-mustwatch").evaluateAll((rows) => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const textBoxes = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    };
    return rows.map((row) => {
      const title = row.querySelector(".kd-dash-ztitel");
      const badges = [...row.querySelectorAll(".kd-dash-badge")];
      return {
        row: box(row), card: box(row.closest(".kd-dash-karte")), rank: box(row.querySelector(".kd-dash-rang")),
        title: box(title), titleText: title.textContent, titleFragments: textBoxes(title),
        titleFont: parseFloat(getComputedStyle(title).fontSize),
        badges: badges.map((badge) => ({ ...box(badge), text: badge.textContent, fragments: textBoxes(badge) })),
      };
    });
  });
  const tolerance = 1;
  for (const measure of measurements) {
    const film = FILMS.find((entry) => `${entry.titel} (${entry.jahr})` === measure.titleText);
    expect(film, "vollständiger Titel und Jahr bleiben erhalten").toBeTruthy();
    expect(measure.title.width).toBeGreaterThan(150);
    expect(measure.titleFont).toBeCloseTo(22 * (schrift === "gross" ? 1.12 : 1), 1);
    expect(measure.title.left).toBeGreaterThan(measure.rank.right);
    expect(measure.row.height).toBeGreaterThanOrEqual(44);
    expect(measure.badges.map((badge) => badge.text).sort()).toEqual([
      ...film.dienste, ...(film.im_besitz ? ["IM BESITZ"] : []),
    ].sort());
    for (const fragment of measure.titleFragments) {
      expect(fragment.left).toBeGreaterThanOrEqual(measure.title.left - tolerance);
      expect(fragment.right).toBeLessThanOrEqual(measure.title.right + tolerance);
      expect(fragment.top).toBeGreaterThanOrEqual(measure.title.top - tolerance);
      expect(fragment.bottom).toBeLessThanOrEqual(measure.title.bottom + tolerance);
    }
    for (const [index, badge] of measure.badges.entries()) {
      expect(badge.top, "Verfügbarkeit beginnt unter dem vollständigen Titel").toBeGreaterThan(measure.title.bottom);
      expect(badge.left).toBeGreaterThanOrEqual(measure.title.left - tolerance);
      expect(badge.right).toBeLessThanOrEqual(measure.row.right + tolerance);
      expect(badge.bottom).toBeLessThanOrEqual(measure.row.bottom + tolerance);
      for (const fragment of badge.fragments) {
        expect(fragment.left).toBeGreaterThanOrEqual(badge.left - tolerance);
        expect(fragment.right).toBeLessThanOrEqual(badge.right + tolerance);
        expect(fragment.top).toBeGreaterThanOrEqual(badge.top - tolerance);
        expect(fragment.bottom).toBeLessThanOrEqual(badge.bottom + tolerance);
      }
      for (const other of measure.badges.slice(index + 1)) {
        expect(badge.right <= other.left || other.right <= badge.left
          || badge.bottom <= other.top || other.bottom <= badge.top, "Anbieterchips überdecken einander nicht").toBe(true);
      }
    }
    expect(measure.row.left).toBeGreaterThanOrEqual(measure.card.left);
    expect(measure.row.right).toBeLessThanOrEqual(measure.card.right);
  }
  expect(measurements.some((measure) => measure.titleFragments.length > 1), "lange Titel umbrechen wirklich").toBe(true);
}

for (const theme of ["dunkel", "hell"]) {
  for (const schrift of ["normal", "gross"]) {
    test(`Must-Watch: vollständige Titel und Anbieter bei ${theme}/${schrift}`, async ({ page }, testInfo) => {
      const unexpected = await boot(page, { theme, schrift });
      await expect(page.locator("html")).toHaveAttribute("data-kd-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("data-kd-schrift", schrift);
      for (const width of [320, 393, 430]) {
      await page.setViewportSize({ width, height: 852 });
      await assertReadableRows(page, schrift);
      const anbieter = page.locator(".kd-dash-mustwatch .kd-dash-badge--neu").first();
      await expect(anbieter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect(parseFloat(await anbieter.evaluate((element) => getComputedStyle(element).fontSize)))
        .toBeCloseTo(12 * (schrift === "gross" ? 1.12 : 1), 1);
        if (width === 393 && process.env.KD_DESIGN_EVIDENCE_DIR) {
          await mkdir(process.env.KD_DESIGN_EVIDENCE_DIR, { recursive: true });
          const block = page.locator(".kd-dash-modul").filter({ has: page.getByText("Must-Watch", { exact: true }) });
          await block.screenshot({ path: join(process.env.KD_DESIGN_EVIDENCE_DIR, `mustwatch-${testInfo.project.name}-${theme}-${schrift}-393.png`) });
        }
      }
      expect(unexpected, "kein unbekannter externer Request passiert die Netzsperre").toEqual([]);
    });
  }
}

test("Must-Watch: ein Tastaturziel pro Eintrag und unveränderter Mediatheksprung", async ({ page, browserName }) => {
  const unexpected = await boot(page, { theme: "dunkel", schrift: "gross" });
  await page.setViewportSize({ width: 320, height: 852 });
  const first = page.locator(".kd-dash-mustwatch").first();
  await expect(first.locator("button, a, input, [tabindex]")).toHaveCount(0);
  const title = await first.locator(".kd-dash-ztitel").textContent();
  // macOS-WebKit erreicht native Buttons mit Option-Tab, unabhängig von der
  // systemweiten Einstellung für vollständige Tastaturnavigation.
  const modifier = browserName === "webkit" && process.platform === "darwin" ? "Alt+" : "";
  await first.focus();
  await page.keyboard.press(`${modifier}Tab`);
  await expect(page.locator(".kd-dash-mustwatch").nth(1)).toBeFocused();
  await page.keyboard.press(`${modifier}Shift+Tab`);
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".kd-dash")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mediathek", exact: true })).toBeVisible();
  const film = FILMS.find((entry) => `${entry.titel} (${entry.jahr})` === title);
  await expect(page.locator(`#mw-${film.id}`)).toBeVisible();
  expect(unexpected).toEqual([]);
});
