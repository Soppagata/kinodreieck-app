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
      await expect(page.locator(".kd-tabbar")).toHaveCount(0);
      await keineDokumentUeberbreite(page);

      for (const ziel of ["Kino", "Streaming", "Mediathek", "Suche", "Blog", "Start", "Einstellungen"]) {
        await page.getByRole("button", { name: "Menü öffnen" }).click();
        const popup = page.getByRole("dialog", { name: "Menü" });
        await expect(popup).toBeVisible();
        await popup.getByRole("button", { name: ziel, exact: true }).click();
        await expect(popup).toBeHidden();
        await keineDokumentUeberbreite(page);
      }

      await page.getByRole("button", { name: "Menü öffnen" }).click();
      await page.getByRole("button", { name: "Anleitung & Hilfe" }).click();
      await expect(page.getByRole("dialog", { name: "Anleitung & Hilfe" })).toBeVisible();
      await keineDokumentUeberbreite(page);
      await page.getByRole("button", { name: "Schließen", exact: true }).click();

      await page.evaluate(() => {
        document.documentElement.style.minHeight = "2200px";
        document.body.style.minHeight = "2200px";
        window.scrollTo(0, 1200);
      });
      await page.getByRole("button", { name: "Menü öffnen" }).click();
      await page.getByRole("button", { name: "Nach oben" }).click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(8);

      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(180);
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
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
