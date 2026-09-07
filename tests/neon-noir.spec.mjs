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

async function seedAppMitDarstellung(page, { modus = "", schrift = "normal", beibehaltenBeiReload = false } = {}) {
  await page.addInitScript(({ modus, schrift, beibehaltenBeiReload }) => {
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-07-31", version: "beta-2026-07-datenfreigabe-2" }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-07-31T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    if (!beibehaltenBeiReload || !localStorage.getItem("kd:einstellungen")) {
      localStorage.setItem("kd:einstellungen", JSON.stringify({
        theme: "dunkel", startTab: "start", schrift, modus,
        ...(modus ? { basisTheme: "dunkel" } : {}),
      }));
    }
  }, { modus, schrift, beibehaltenBeiReload });
}

/* Neon Noir uses the current private-release entry and its native ModusFx. */
async function oeffneNeonApp(page) {
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page, { modus: "neon-noir", beibehaltenBeiReload: true });
  await page.goto("/");
  const lokal = page.getByRole("button", { name: "Ohne Konto fortfahren", exact: true });
  if (await lokal.isVisible()) await lokal.click();
  await expect(page.locator('.kd-fx-neon-noir[aria-hidden="true"]')).toBeVisible();
}

for (const viewport of [...VIEWPORTS, { name: "1440x900", width: 1440, height: 900 }]) {
  test(`Neon Noir bleibt dekorativ im App-Viewport ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    await oeffneNeonApp(page);
    const overlay = page.locator('.kd-fx-neon-noir[aria-hidden="true"]');
    const city = overlay.locator("svg.kd-neon-noir__city");
    await expect(city).toHaveCount(1);
    await expect(city).toBeVisible();
    await expect(overlay).toHaveCSS("pointer-events", "none");
    await expect(city).toHaveAttribute("focusable", "false");
    await expect(page.locator('.kd-wrap.kd-neon-noir')).toHaveCount(1);
    await expect(page.locator('[data-kd-theme="neon-noir"]')).toHaveCount(1);
    await expect(overlay.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), image, foreignObject')).toHaveCount(0);
    for (const name of ["loca-wordmark", "nyso-wordmark", "riata-wordmark"]) {
      await expect(overlay.locator(`[data-neon-part="${name}"]`)).toHaveAttribute("d", /^M/);
    }
    await expect(overlay.locator('[data-neon-part="hologram"]')).toHaveCount(1);
    await expect(overlay.locator('[data-neon-part="hologram"]')).toHaveAttribute("opacity", ".64");
    await expect(overlay.locator('[data-neon-part="bob-scanlines"] rect')).toHaveAttribute("fill", "#3ba4db");
    expect(await page.evaluate(() => typeof window.neonPreview)).toBe("undefined");

    const geometrie = await city.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, viewBox: [el.viewBox.baseVal.width, el.viewBox.baseVal.height] };
    });
    expect(geometrie.left).toBeGreaterThanOrEqual(-0.5);
    expect(geometrie.right).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(geometrie.top).toBeGreaterThanOrEqual(-0.5);
    expect(geometrie.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(geometrie.viewBox[0]).toBeCloseTo(932 * viewport.width / viewport.height, 2);
    expect(geometrie.viewBox[1]).toBe(932);
    await keineDokumentUeberbreite(page);

    for (const [name, attribute] of [["rain-far", "patternTransform"], ["holo-head", "transform"], ["fog-middle-pattern", "patternTransform"]]) {
      const element = overlay.locator(`[data-neon-part="${name}"]`);
      const before = await element.getAttribute(attribute);
      await page.clock.runFor(640);
      expect(await element.getAttribute(attribute), name).not.toBe(before);
    }
    await expect(overlay.locator('[data-neon-part="hologram"]')).toHaveAttribute("opacity", ".64");
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (!process.env.CI && ["393x852", "430x932", "1440x900"].includes(viewport.name)) {
      await page.screenshot({ path: testInfo.outputPath("neon-app.png") });
      const hideUi = await page.addStyleTag({ content: ".kd-app { visibility: hidden !important; }" });
      await page.screenshot({ path: testInfo.outputPath("neon-scene.png") });
      await hideUi.evaluate(element => element.remove());
    }

    if (viewport.name === "393x852") {
      await page.reload();
      const lokal = page.getByRole("button", { name: "Ohne Konto fortfahren", exact: true });
      if (await lokal.isVisible()) await lokal.click();
      await expect(page.locator('.kd-wrap.kd-neon-noir .kd-fx-neon-noir[aria-hidden="true"]')).toHaveCount(1);
      const gespeichert = await page.evaluate(() => JSON.parse(localStorage.getItem("kd:einstellungen") || "null"));
      expect(gespeichert?.modus).toBe("neon-noir");
    }
  });
}

test("Neon Noir respektiert Reduced Motion und nimmt Bewegung wieder auf", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await oeffneNeonApp(page);
  const city = page.locator("svg.kd-neon-noir__city");
  const still = await city.evaluate(element => element.outerHTML);
  await page.clock.runFor(12_000);
  expect(await city.evaluate(element => element.outerHTML)).toBe(still);
  await expect(city.locator('[data-neon-part="flyby"]')).toHaveAttribute("opacity", "0");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // The native media-query event is delivered on the browser's rendering
  // turn, separately from Playwright's virtual requestAnimationFrame clock.
  const head = city.locator('[data-neon-part="holo-head"]');
  const stillHead = await head.getAttribute("transform");
  await expect.poll(async () => {
    await page.clock.runFor(160);
    return head.getAttribute("transform");
  }).not.toBe(stillHead);
  await page.evaluate(() => {
    window.neonReducedDelivered = false;
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
      window.neonReducedDelivered = true;
    }, { once: true });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => window.neonReducedDelivered)).toBe(true);
  const stopped = await city.evaluate(element => element.outerHTML);
  await page.clock.runFor(4000);
  expect(await city.evaluate(element => element.outerHTML)).toBe(stopped);
  await keineDokumentUeberbreite(page);
});

test("Neon Noir lässt Flug und Animation beim Themewechsel sauber auslaufen", async ({ page }) => {
  const { buildNeonNoirFixture } = await import("../neon_noir_test.mjs");
  const fixture = await buildNeonNoirFixture();
  const seitenfehler = [];
  const requests = [];
  page.on("pageerror", error => seitenfehler.push(String(error)));
  await page.route("**/*", async route => {
    if (route.request().url() === "http://neon-fixture.test/") {
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="fixture"></div></body></html>' });
    } else { requests.push(route.request().url()); await route.abort(); }
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.install();
  await page.goto("http://neon-fixture.test/");
  await page.addStyleTag({ content: fixture.css });
  await page.addScriptTag({ content: fixture.js });
  await page.evaluate(() => window.neonTest.mount());
  const overlay = page.locator('.kd-fx-neon-noir[aria-hidden="true"]');
  await expect(overlay).toBeVisible();
  const flyby = overlay.locator('[data-neon-part="flyby"]');
  await expect(flyby).toHaveAttribute("opacity", "0");
  await page.clock.runFor(6000);
  expect(Number(await flyby.getAttribute("opacity"))).toBeGreaterThan(0);
  await page.clock.runFor(5000);
  await expect(flyby).toHaveAttribute("opacity", "0");
  await page.evaluate(() => {
    window.detachedNeon = document.querySelector("svg.kd-neon-noir__city");
    window.neonTest.mount("");
  });
  await expect(overlay).toHaveCount(0);
  const detached = await page.evaluate(() => window.detachedNeon.outerHTML);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.runFor(10_000);
  expect(await page.evaluate(() => window.detachedNeon.outerHTML)).toBe(detached);
  await expect(overlay).toHaveCount(0);
  await page.evaluate(() => window.neonTest.unmount());
  expect(seitenfehler).toEqual([]);
  expect(requests).toEqual([]);
  await keineDokumentUeberbreite(page);
});
