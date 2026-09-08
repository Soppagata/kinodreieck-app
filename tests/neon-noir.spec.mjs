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

/* A mock account opens the existing private Settings surface. App.jsx,
   DatenTab, ModusFx and the settings writer all run unchanged. No session,
   backend response or special-mode value is taken from a real account. */
async function oeffneAppMitMockkonto(page) {
  const extern = [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      extern.push(url.href);
      await route.abort();
    } else if (url.pathname === "/src/services/sessionCoordinator.js") {
      await route.fulfill({ contentType: "application/javascript", body: `
        const session = Object.freeze({ mode: "account", state: "ready",
          account: Object.freeze({ id: "neon-trigger-fixture", role: "member" }),
          capabilities: Object.freeze({ remoteStorage: true, personalAi: false }) });
        export const STORAGE_SESSION_STATES = Object.freeze({ GUEST: "guest",
          AWAITING_ADOPTION: "account-awaiting-adoption", READY: "account-ready",
          PRIVACY_LOCKED: "privacy-locked", ACCESS_BLOCKED: "account-access-blocked" });
        export const sessionCoordinator = Object.freeze({ getSnapshot: () => session,
          getStorageState: () => "account-ready", subscribe: () => () => {},
          initialize: async () => session, refresh: async () => session });
      ` });
    } else await route.continue();
  });
  await seedAppMitDarstellung(page, { modus: "", beibehaltenBeiReload: true });
  await page.goto("/");
  await expect(page.locator('.kd-app[data-session-mode="account"]')).toBeVisible();
  return extern;
}

for (const input of ["tap", "keyboard", "click"]) {
  test.describe(`Max-Einstieg per ${input}`, () => {
    // Keep the account module mock in force on reload; a service worker
    // would otherwise serve the unmocked module outside Playwright routing.
    test.use({ hasTouch: input === "tap", reducedMotion: "reduce", serviceWorkers: "block" });
    for (const theme of ["dunkel", "hell"]) {
      test(`Max öffnet ${theme === "hell" ? "Classix" : "Schon kuhl"} aus ${theme} und führt zurück`, async ({ page, browserName }, testInfo) => {
        const viewport = input === "keyboard" ? { width: 1440, height: 900 }
          : { width: theme === "hell" ? 430 : 393, height: theme === "hell" ? 932 : 852 };
        await page.setViewportSize(viewport);
        const errors = [];
        page.on("pageerror", error => errors.push(String(error)));
        const extern = await oeffneAppMitMockkonto(page);
        // macOS WebKit uses Option-Tab to include native buttons in its
        // default tab order; Chromium and Linux WebKit use plain Tab.
        const nextControl = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
        const activate = async (locator, key = "Enter") => {
          if (input === "tap") await locator.tap();
          else if (input === "keyboard") { await locator.focus(); await page.keyboard.press(key); }
          else await locator.click();
        };
        const openSettings = async () => {
          if (viewport.width > 760) {
            await activate(page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Settings", exact: true }));
          } else {
            await activate(page.getByRole("button", { name: "Menü öffnen", exact: true }));
            await activate(page.getByRole("dialog", { name: "Menü", exact: true }).getByRole("button", { name: "Settings", exact: true }));
          }
          await expect(page.locator("summary", { hasText: /^Darstellung & Verhalten$/ })).toBeVisible();
        };
        const legal = page.locator("summary", { hasText: /^Über Kinodreieck, Anleitung & Rechtliches$/ });
        const max = page.getByRole("button", { name: "Max", exact: true });
        const label = theme === "hell" ? "Classix" : "Schon kuhl";
        const modus = theme === "hell" ? "showa" : "neon-noir";
        const modeButton = page.getByRole("button", { name: label, exact: true });
        const overlay = page.locator(`.kd-fx-${modus}[aria-hidden="true"]`);
        const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem("kd:einstellungen") || "null"));

        const revealMode = async () => {
          await activate(legal);
          await expect(max).toHaveAttribute("aria-expanded", "false");
          await expect(modeButton).toHaveCount(0);
          await expect(max).toHaveCSS("text-decoration-style", "dotted");
          const box = await max.boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
          const region = page.locator(`[id="${await max.getAttribute("aria-controls")}"]`);
          await expect(region).toBeHidden();
          if (input === "keyboard") {
            await page.keyboard.press(nextControl);
            await expect(max).toBeFocused();
            await page.keyboard.press("Space");
          } else await activate(max);
          await expect(max).toHaveAttribute("aria-expanded", "true");
          await expect(region).toBeVisible();
          await expect(modeButton).toBeVisible();
          if (input === "keyboard") {
            await page.keyboard.press(nextControl);
            await expect(modeButton).toBeFocused();
          }
        };

        await openSettings();
        await activate(page.getByRole("button", { name: theme === "hell" ? "Foyer (hell)" : "Saal (dunkel)", exact: true }));
        await expect.poll(settings).toMatchObject({ modus: "", theme });
        await revealMode();
        await expect(page.locator(".kd-fx-neon-noir, .kd-fx-showa")).toHaveCount(0);
        await expect.poll(settings).toMatchObject({ modus: "", theme });
        await expect(modeButton).toHaveAttribute("aria-pressed", "false");
        await activate(modeButton);
        await expect(overlay).toBeVisible();
        await expect(overlay).toHaveCSS("pointer-events", "none");
        await expect(overlay.locator('button, a[href], input, [tabindex]:not([tabindex="-1"])')).toHaveCount(0);
        await expect(modeButton).toHaveAttribute("aria-pressed", "true");
        await expect.poll(settings).toMatchObject({ modus, theme: "dunkel", basisTheme: theme });
        await keineDokumentUeberbreite(page);
        if (!process.env.CI && input === "tap") await page.screenshot({ path: testInfo.outputPath("max-trigger-active.png") });

        await page.reload();
        await expect(overlay).toBeVisible();
        await expect.poll(settings).toMatchObject({ modus, basisTheme: theme });
        await openSettings();
        await revealMode();
        await expect(modeButton).toHaveAttribute("aria-pressed", "true");
        await activate(modeButton);
        await expect(page.locator(".kd-fx-neon-noir, .kd-fx-showa")).toHaveCount(0);
        await expect(page.locator(`[data-kd-theme="${theme}"]`)).toHaveCount(1);
        await expect.poll(settings).toMatchObject({ modus: "", theme });
        expect((await settings()).basisTheme).toBeUndefined();
        await expect(modeButton).toHaveAttribute("aria-pressed", "false");
        await keineDokumentUeberbreite(page);
        expect(errors).toEqual([]);
        expect(extern).toEqual([]);
      });
    }
  });
}
