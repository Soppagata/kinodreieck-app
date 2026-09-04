import { test, expect } from "@playwright/test";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d2";
const PUBLISHABLE_KEY = "sb_publishable_d2_test_1234567890";
const ACCESS_TOKEN = "synthetic-d2-access-token";

const knownPayload = {
  stand: "2026-09-04T08:05:00.000Z",
  region: "AT",
  dienste: ["Netflix"],
  titel: [{ watchmode_id: 71001, titel: "Datumsfilm", jahr: 2024, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] }],
};
const row = (payload) => [{
  payload,
  updated_at: "2026-09-04T08:05:00.000Z",
  quelle: "cleanup-d2-fixture",
  stand: "2026-09-04T08:05:00.000Z",
  gueltig_bis: "2099-01-01T00:00:00.000Z",
}];

async function seedAccount(page) {
  await page.addInitScript(({ accountId, token, projectUrl, key }) => {
    localStorage.setItem("kd:auth:session", JSON.stringify({
      v: 1,
      access_token: token,
      refresh_token: "synthetic-d2-refresh-token",
      gueltigBis: Date.now() + 60 * 60 * 1000,
      kontoId: accountId,
      mail: "d2@login.kinodreieck.at",
      benutzername: "d2",
    }));
    localStorage.setItem("kd:acct:owner", accountId);
    localStorage.setItem("kd:acct:epoch", JSON.stringify({ accountId, token: "d2-epoch" }));
    localStorage.setItem("kd:acct:binding-schema", JSON.stringify({ v: 1, accountId }));
    localStorage.setItem("kd:acct:uebernommen", JSON.stringify({ accountId, t: "2026-09-04T08:00:00.000Z" }));
    localStorage.setItem("kd:master", JSON.stringify({
      filme: [{
        id: "master-d2", watchmode_id: 71001, titel: "Datumsfilm", originaltitel: "Datumsfilm",
        jahr: 2024, typ: "film", quelle: "streaming", kategorie: "sehenswert",
        bewertet_von: "max", bewertung: { wie: 3, was: 3, warum: 3 }, genre: ["Drama"], tags: [],
        begruendung: "", notiz: "", erstellt_am: "2026-09-04T07:00:00.000Z",
      }],
      meta: { version: "d2" },
      gespeichertAm: Date.now(),
    }));
    localStorage.setItem("kd:artikel", JSON.stringify({
      artikel: [{
        id: "artikel-d2", titel: "D2 Artikel", autor: "Max", text: "Ein fokussierter Artikel für den Browservertrag.",
        geordnet: false, geteilt: false, liste: [], status: "freigegeben", herkunft: "eigen",
        erstellt_am: "2026-09-04T08:00:00.000Z",
      }],
      gespeichertAm: Date.now(),
    }));
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix"], heuristik: true }));
    localStorage.setItem("kd:katalog:url", projectUrl);
    localStorage.setItem("kd:katalog:key", key);
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "local-v1");
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: true, weg: "konto" }));
  }, { accountId: ACCOUNT_ID, token: ACCESS_TOKEN, projectUrl: PROJECT_URL, key: PUBLISHABLE_KEY });
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
      if (name === "programm") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row({ stand: "2026-09-04", filme: [] })) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.abort();
  });
}

async function boot(page, width = 393) {
  const requests = [];
  await page.setViewportSize({ width, height: width < 600 ? 852 : 900 });
  await seedAccount(page);
  await installLocalBackend(page, requests);
  await page.goto("/");
  await expect(page.locator(".kd-app")).toBeVisible();
  await expect.poll(() => requests.includes("account-access")).toBe(true);
  return requests;
}

async function openMobileMenu(page) {
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  return page.getByRole("dialog", { name: "Menü" });
}

async function navigateMobile(page, name) {
  const menu = await openMobileMenu(page);
  await menu.getByRole("button", { name, exact: true }).click();
}

async function expectTouchBox(locator, label) {
  const box = await locator.boundingBox();
  expect(box, `${label}: Bounding Box vorhanden`).not.toBeNull();
  expect(box.width, `${label}: Breite`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label}: Höhe`).toBeGreaterThanOrEqual(44);
  return { width: Number(box.width.toFixed(1)), height: Number(box.height.toFixed(1)) };
}

test("D2 mobil: Hilfe, ehrliche Entdecken-Navigation, Blog-ARIA und Checkbox-Hitboxen", async ({ page }, testInfo) => {
  await boot(page, 393);

  const week = page.locator(".kd-wochenplan");
  await week.getByRole("button", { name: "Eintrag", exact: true }).click();
  const weekdayCheckbox = week.getByRole("checkbox", { name: "Mo", exact: true });
  const weekdayBox = await expectTouchBox(weekdayCheckbox.locator("xpath=ancestor::label[1]"), "Wochenplan-Checkbox");
  const weekdayGridFits = await week.locator(".kd-wochen-tage").evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(weekdayGridFits, "Wochenplan-Checkboxen bleiben bei 393px im Editor").toBe(true);
  await week.getByRole("button", { name: "Abbrechen", exact: true }).click();

  let menu = await openMobileMenu(page);
  const helpEntry = menu.getByRole("button", { name: "Anleitung & Hilfe", exact: true });
  const helpBox = await expectTouchBox(helpEntry, "mobiler Hilfe-Einstieg");
  await helpEntry.click();
  const help = page.getByRole("dialog", { name: "Anleitung & Hilfe" });
  await expect(help).toBeVisible();
  await expect(help.locator('a[href*="/download/"]')).toHaveCount(0);
  await expect(help).not.toContainText(/Einzeldatei (?:herunterladen|downloaden)/i);
  await help.getByRole("button", { name: "Schließen", exact: true }).click();

  await navigateMobile(page, "Entdecken");
  const views = page.getByRole("navigation", { name: "Entdecken-Ansichten" });
  await expect(views.locator('[role="tab"]')).toHaveCount(0);
  await expect(views.locator('[role="tablist"]')).toHaveCount(0);
  const recommendations = views.getByRole("button", { name: "Empfehlungen", exact: true });
  const blogView = views.getByRole("button", { name: "Blog", exact: true });
  await expect(recommendations).toHaveAttribute("aria-current", "page");
  await expect(recommendations).toHaveJSProperty("tabIndex", 0);
  await expect(blogView).toHaveJSProperty("tabIndex", 0);

  await page.getByRole("button", { name: "Entdecken verwalten" }).click();
  const manage = page.getByRole("dialog", { name: "Entdecken verwalten" });
  const recommendationCheckbox = manage.getByRole("checkbox", { name: /Explizit bewertete Mediathek/ });
  const recommendationLabel = recommendationCheckbox.locator("xpath=ancestor::label[1]");
  const recommendationBox = await expectTouchBox(recommendationLabel, "Entdecken-Empfehlungscheckbox");
  await manage.getByRole("button", { name: "Entdecken verwalten schließen und zurück" }).click();
  await page.waitForTimeout(50);

  await blogView.focus();
  await expect(blogView).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(blogView).toHaveAttribute("aria-current", "page");
  const article = page.locator(".kd-blog-karte", { hasText: "D2 Artikel" });
  await expect(article).toBeVisible();
  await expect(article).not.toHaveAttribute("role", "button");
  await expect(article).toContainText("04.09.2026");
  const expand = article.locator(".kd-blog-expand");
  await expect(expand).toHaveRole("button", { name: "Vorschau öffnen" });
  const controlledId = await expand.getAttribute("aria-controls");
  expect(controlledId).toBeTruthy();
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  const region = article.getByRole("region", { name: "D2 Artikel" });
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute("id", controlledId);
  await expect(article.locator("button button")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toHaveText("Vorschau öffnen");

  await page.getByRole("button", { name: "+ Neuer Artikel" }).click();
  const blogCheckbox = page.getByRole("checkbox", { name: /Liste ist eine Reihenfolge/ });
  const blogBox = await expectTouchBox(blogCheckbox.locator("xpath=ancestor::label[1]"), "Blog-Formularcheckbox");

  await navigateMobile(page, "Settings");
  const settingsCheckbox = page.getByRole("checkbox", { name: /Täglich neue Entdecken-Auswahl/ });
  const settingsBox = await expectTouchBox(settingsCheckbox.locator("xpath=ancestor::label[1]"), "Settings-Checkbox");
  await page.getByText("Streaming-Katalogstand", { exact: true }).click();
  const audit = page.getByTestId("streaming-catalog-audit");
  await expect(audit).toBeVisible();
  await audit.getByText(/Warum fehlt „Mandalorian & Grogu“/).click();
  await expect(audit).toContainText("Lokaler Kandidat für den providerfreien Entdecken-Pool: 24-Stunden-Intervall");
  await expect(audit).toContainText("weder auf die gemeinsame Datenbank angewandt noch deployt");
  await expect(audit).toContainText("Welches Intervall live für Entdecken oder Radar aktiv ist, ist nicht belegt");
  await expect(audit).not.toContainText(/läuft derzeit|nicht autorisiert und nicht erstellt/);

  console.log(`[D2_TOUCH] ${JSON.stringify({ browser: testInfo.project.name, viewport: "393x852", weekdayBox, helpBox, recommendationBox, blogBox, settingsBox })}`);
});

test("D2 Desktop: Hauptnavigation trägt genau eine aktuelle Seite", async ({ page }) => {
  await boot(page, 1024);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  const start = nav.getByRole("button", { name: "Start", exact: true });
  const kino = nav.getByRole("button", { name: "Kino", exact: true });
  await expect(start).toHaveAttribute("aria-current", "page");
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await kino.click();
  await expect(kino).toHaveAttribute("aria-current", "page");
  await expect(start).not.toHaveAttribute("aria-current", "page");
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
});
