import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "393x852", width: 393, height: 852 },
  { name: "430x932", width: 430, height: 932 },
];

async function keineDokumentUeberbreite(page) {
  const breite = await page.evaluate(() => ({
    viewport: window.innerWidth,
    dokument: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(breite.dokument, JSON.stringify(breite)).toBeLessThanOrEqual(breite.viewport);
}

async function blockiereFremdnetz(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") await route.continue();
    else await route.abort();
  });
}

for (const viewport of VIEWPORTS) {
  test(`Ersteinstieg bleibt vollständig im Viewport ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await blockiereFremdnetz(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Willkommen bei Kinodreieck" })).toBeVisible();
    await expect(page.getByText("Kinodreieck installieren", { exact: true })).toBeVisible();
    await keineDokumentUeberbreite(page);

    await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
    await expect(page.getByRole("heading", { name: "Wie möchtest du starten?" })).toBeVisible();
    await keineDokumentUeberbreite(page);
    await page.getByRole("button", { name: "Leer starten" }).click();
    await expect(page.getByRole("heading", { name: "Drei Wege zu deinem Film" })).toBeVisible();
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.getByRole("heading", { name: "Du entscheidest über KI" })).toBeVisible();
    await expect(page.locator(".kd-entry-login")).toHaveCount(0);
    await page.getByRole("button", { name: "Ohne KI" }).click();
    await expect(page.getByRole("button", { name: "Menü öffnen" })).toBeVisible();
    await keineDokumentUeberbreite(page);
  });

  for (const schrift of ["normal", "gross"]) {
    test(`Mobile App ${viewport.name}, Schrift ${schrift}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await blockiereFremdnetz(page);
      await page.addInitScript(({ schrift }) => {
        localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
        localStorage.setItem("kd:start", "clean");
        localStorage.setItem("kd:start-version", "demo-v1");
        localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
        localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-07-31", version: "beta-2026-07-datenfreigabe-2" }));
        localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-07-31T00:00:00.000Z" }));
        localStorage.setItem("kd:ki-version", "e8-v1");
        localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift, modus: "" }));
      }, { schrift });
      await page.goto("/");

      const menu = page.getByRole("button", { name: "Menü öffnen" });
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      expect(menuBox.width).toBeGreaterThanOrEqual(48);
      expect(menuBox.height).toBeGreaterThanOrEqual(48);
      expect(viewport.width - menuBox.x - menuBox.width).toBeGreaterThanOrEqual(18);
      await expect(page.locator(".kd-tabbar")).toHaveCount(0);
      await keineDokumentUeberbreite(page);

      for (const ziel of ["Kino", "Streaming", "Mediathek", "Suche", "Blog", "Start", "Einstellungen"]) {
        await page.getByRole("button", { name: "Menü öffnen" }).click();
        const popup = page.getByRole("dialog", { name: "Menü" });
        await expect(popup).toBeVisible();
        const popupBox = await popup.boundingBox();
        expect(popupBox.width).toBeGreaterThanOrEqual(Math.min(360, viewport.width - 32) - 1);
        expect(Math.abs(popupBox.x - (viewport.width - popupBox.width) / 2)).toBeLessThanOrEqual(1);
        expect(viewport.height - popupBox.y - popupBox.height).toBeGreaterThanOrEqual(80);
        await expect(popup.locator(".kd-mobile-menu-liste button").first()).toHaveText("⌂Start");
        await expect(popup.getByRole("button", { name: "Nach oben" })).toHaveCount(0);
        await expect(popup.getByRole("button", { name: "Anleitung & Hilfe" })).toHaveCount(0);
        await expect(popup.getByRole("link", { name: /Installation/ })).toHaveCount(0);
        await popup.getByRole("button", { name: ziel, exact: true }).click();
        await expect(popup).toBeHidden();
        await keineDokumentUeberbreite(page);
      }

      await expect(page.locator("summary", { hasText: /^Masterliste$/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Gesamt-Backup$/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Katalog-Status$/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Erweitert/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Darstellung & Verhalten$/ })).toBeVisible();
      await expect(page.locator("summary", { hasText: /^Konto & Geräte-Sync$/ })).toBeVisible();
      await expect(page.locator("summary", { hasText: /^Suche-Vokabular$/ })).toBeVisible();

      await page.getByRole("button", { name: "Menü öffnen" }).click();
      await page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name: "Start", exact: true }).click();
      const dashboard = page.locator(".kd-dash");
      const dashboardBox = await dashboard.boundingBox();
      expect(dashboardBox.x).toBeGreaterThanOrEqual(18);
      expect(dashboardBox.x + dashboardBox.width).toBeLessThanOrEqual(viewport.width - 18);
      await page.getByRole("button", { name: "Anleitung & Hilfe" }).click();
      await expect(page.getByRole("dialog", { name: "Anleitung & Hilfe" })).toBeVisible();
      await keineDokumentUeberbreite(page);
      await page.getByRole("button", { name: "Schließen", exact: true }).click();
      await expect.poll(() => page.evaluate(() => ({
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        locked: document.body.classList.contains("kd-scroll-gesperrt"),
      }))).toEqual({ overflow: "", position: "", locked: false });

      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(180);
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Menü öffnen" })).toBeEnabled();
      await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
      await keineDokumentUeberbreite(page);
    });
  }
}

test("Desktop behält oberhalb 760 px die bestehende Leiste", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await blockiereFremdnetz(page);
  await page.addInitScript(() => {
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
  });
  await page.goto("/");
  await expect(page.locator(".kd-menu")).toBeVisible();
  await expect(page.locator(".kd-menuknopf")).toBeHidden();
  await keineDokumentUeberbreite(page);
});
