import { test, expect } from "@playwright/test";

const CAGE_FILM = { id: "egg-cage-con-air", typ: "film", titel: "Con Air", originaltitel: "Con Air", jahr: 1997, quelle: "dvd" };

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
    await expect(overlay.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), image:not([data-neon-part="fog-texture"]), foreignObject')).toHaveCount(0);
    await expect(city.locator("image")).toHaveCount(1);
    const fogTexture = city.locator('[data-neon-part="fog-texture"]');
    await expect(fogTexture).toHaveAttribute("href", /^data:image\/svg\+xml;charset=utf-8,/);
    if (viewport.name === "393x852") {
      // A fast but missing SVG image must not pass as a rendering improvement.
      const alpha = await fogTexture.evaluate(async element => {
        const image = new Image(); image.src = element.getAttribute("href"); await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0, maximum = 0, edgeDifference = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) visible++;
          maximum = Math.max(maximum, pixels[index]);
        }
        for (let y = 0; y < canvas.height; y++) {
          edgeDifference = Math.max(edgeDifference, Math.abs(pixels[y * canvas.width * 4 + 3] - pixels[(y * canvas.width + canvas.width - 1) * 4 + 3]));
        }
        return { width: image.naturalWidth, height: image.naturalHeight, coverage: visible / (canvas.width * canvas.height), maximum, edgeDifference };
      });
      expect([alpha.width, alpha.height]).toEqual([600, 144]);
      expect(alpha.coverage).toBeGreaterThan(0.4);
      expect(alpha.coverage).toBeLessThan(0.9);
      expect(alpha.maximum).toBeGreaterThan(20);
      expect(alpha.maximum).toBeLessThan(80);
      expect(alpha.edgeDifference).toBeLessThanOrEqual(2);
    }
    for (const name of ["loca-wordmark", "nyso-wordmark", "riata-wordmark"]) {
      await expect(overlay.locator(`[data-neon-part="${name}"]`)).toHaveAttribute("d", /^M/);
    }
    await expect(overlay.locator('[data-neon-part="hologram"]')).toHaveCount(1);
    await expect(overlay.locator('[data-neon-part="hologram"]')).toHaveAttribute("opacity", ".96");
    await expect(overlay.locator('[data-neon-part="bob-scanlines"] rect')).toHaveAttribute("fill", "#16bcff");
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

    for (const [name, attribute] of [["rain-far", "patternTransform"], ["holo-head", "transform"], ["fog-far-pattern", "patternTransform"], ["fog-middle-pattern", "patternTransform"], ["fog-front-pattern", "patternTransform"]]) {
      const element = overlay.locator(`[data-neon-part="${name}"]`);
      const before = await element.getAttribute(attribute);
      await page.clock.runFor(640);
      expect(await element.getAttribute(attribute), name).not.toBe(before);
    }
    await expect(overlay.locator('[data-neon-part="hologram"]')).toHaveAttribute("opacity", ".96");
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
async function oeffneAppMitMockkonto(page, { filme = [], katalog = null } = {}) {
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
    } else if (katalog && url.pathname === "/src/services/catalog.js") {
      await route.fulfill({ contentType: "application/javascript", body: `
        import { baueStreamingAnsichten } from "/src/lib/katalog.js";
        const fixture = ${JSON.stringify(katalog)};
        let freigeben;
        const warten = new Promise(resolve => { freigeben = resolve; });
        window.cageCatalog = { calls: {}, release: freigeben };
        export const catalogService = {
          storedVariant: () => "live", hasConnection: () => true,
          buildStreamingViews: baueStreamingAnsichten,
          async loadArea(area) {
            window.cageCatalog.calls[area] = (window.cageCatalog.calls[area] || 0) + 1;
            if (area === "streamingEntdecken") {
              await warten;
              if (fixture.failDiscover) throw new Error("Lokaler Katalogfehler");
            }
            const meta = { stand: "2026-09-09T06:00:00Z", gueltigBis: "2026-09-10T23:59:00Z" };
            const payload = area === "programm"
              ? { ...meta, filme: fixture.kino || [] }
              : { ...meta, katalog_stand: "2026-09-09T06:00:00Z", dienste: ["Netflix"],
                  titel: (area === "streamingBekannt" ? fixture.bekannt : fixture.entdecken) || [] };
            return { ...meta, payload, quelle: "datenbank", variante: "live", abgelaufen: false };
          },
        };
      ` });
    } else await route.continue();
  });
  await seedAppMitDarstellung(page, { modus: "", beibehaltenBeiReload: true });
  if (filme.length) await page.addInitScript(filme => {
    localStorage.setItem("kd:master", JSON.stringify({ meta: { version: "egg-surface-fixture" }, filme, gespeichertAm: Date.now() }));
  }, filme);
  await page.goto("/");
  await expect(page.locator('.kd-app[data-session-mode="account"]')).toBeVisible();
  return extern;
}

test.describe("Cage und Space-Pause", () => {
  test.use({ hasTouch: true, serviceWorkers: "block", timezoneId: "Europe/Vienna" });

  const cageStand = page => page.evaluate(() => JSON.parse(localStorage.getItem("kd:eggroll:cage") || "null"));
  const sichtbarkeit = (page, sichtbar) => page.evaluate(sichtbar => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !sichtbar });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => sichtbar ? "visible" : "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, sichtbar);
  const seedCage = async (page, stand = null) => page.addInitScript(stand => {
    localStorage.setItem("kd:achievements", JSON.stringify({ eggs: ["cage-alphabet"] }));
    if (stand && !localStorage.getItem("kd:eggroll:cage")) localStorage.setItem("kd:eggroll:cage", JSON.stringify(stand));
    Math.random = () => 0.99;
  }, stand);

  test("Showa-PWA bleibt beim automatischen 24.690er Cage-Vollkatalog bedienbar", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await seedCage(page);
    await page.addInitScript(() => localStorage.setItem("kd:einstellungen", JSON.stringify({
      theme: "dunkel", basisTheme: "hell", startTab: "start", schrift: "klein", modus: "showa",
    })));
    const cageMaster = [
      ["Valley Girl", 1983], ["Racing with the Moon", 1984], ["Birdy", 1984],
      ["The Boy in Blue", 1986], ["Peggy Sue Got Married", 1986],
    ].map(([titel, jahr], index) => ({
      id: `cage-voll-${index}`, titel, originaltitel: titel, jahr, typ: "film", quelle: "dvd",
      watchmode_id: 700000 + index,
    }));
    const master = [...cageMaster, ...Array.from({ length: 495 }, (_, index) => ({
      id: `owner-voll-${index}`, titel: `Owner Vollfilm ${index}`, jahr: 1950 + (index % 70),
      typ: "film", quelle: index % 2 ? "bluray" : "dvd", watchmode_id: 710000 + index,
    }))];
    const entdecken = Array.from({ length: 24690 }, (_, index) => ({
      watchmode_id: 800000 + index, titel: `Streaming Volltitel ${String(index).padStart(5, "0")}`,
      jahr: 1900 + (index % 126), typ: index % 3 ? "movie" : "tv_series", dienste: ["Netflix"],
    }));
    for (let index = 0; index < cageMaster.length; index++) {
      entdecken[index] = {
        ...entdecken[index], watchmode_id: cageMaster[index].watchmode_id,
        titel: cageMaster[index].titel, jahr: cageMaster[index].jahr, typ: "movie",
      };
    }
    const extern = await oeffneAppMitMockkonto(page, {
      filme: master, katalog: { bekannt: [], entdecken },
    });
    await expect(page.locator('.kd-fx-showa[aria-hidden="true"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.cageCatalog.calls.streamingEntdecken || 0)).toBe(1);
    await page.evaluate(() => {
      window.cageCatalogDelay = null;
      const start = performance.now();
      setTimeout(() => { window.cageCatalogDelay = performance.now() - start; }, 0);
      window.cageCatalog.release();
    });
    await expect.poll(() => page.evaluate(() => window.cageCatalogDelay)).not.toBeNull();
    expect(await page.evaluate(() => window.cageCatalogDelay)).toBeLessThan(1500);

    for (const [name, ziel] of [["Kino", ".kd-kino-tab"], ["Mediathek", ".kd-mediathek-tab"], ["Streaming", ".kd-streaming-tab"]]) {
      await page.getByRole("button", { name: "Menü öffnen", exact: true }).tap();
      const menu = page.getByRole("dialog", { name: "Menü", exact: true });
      await menu.getByRole("button", { name, exact: true }).tap();
      await expect(page.locator(ziel)).toBeVisible();
    }
    await page.getByRole("button", { name: /^Alles/ }).tap();
    await expect(page.locator(".kd-entdecken-karte")).toHaveCount(200);
    await expect(page.getByText("200 von 24685", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Menü öffnen", exact: true }).tap();
    await page.getByRole("dialog", { name: "Menü", exact: true }).getByRole("button", { name: "Start", exact: true }).tap();
    await expect(page.locator(".kd-dash")).toBeVisible();
    expect(extern).toEqual([]);
  });

  test("Cage prüft lokale Tagesgrenzen und PWA-Rückkehr bis zum fünften Nutzungstag", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.clock.install({ time: new Date("2026-09-08T21:59:00Z") });
    await seedCage(page);
    const extern = await oeffneAppMitMockkonto(page, { filme: [CAGE_FILM] });
    await expect.poll(() => cageStand(page)).toMatchObject({ tag: "2026-09-08", fehlTage: 1, treffer: false });
    await page.reload();
    await expect(page.locator('.kd-app[data-session-mode="account"]')).toBeVisible();
    expect(await cageStand(page)).toMatchObject({ tag: "2026-09-08", fehlTage: 1 });
    await sichtbarkeit(page, false);
    await page.clock.setFixedTime(new Date("2026-09-08T22:01:00Z"));
    await sichtbarkeit(page, false);
    expect(await cageStand(page)).toMatchObject({ tag: "2026-09-08", fehlTage: 1 });
    await sichtbarkeit(page, true);
    await expect.poll(() => cageStand(page)).toMatchObject({ tag: "2026-09-09", fehlTage: 2 });
    for (const [tag, fehlTage] of [["2026-09-15", 3], ["2026-10-02", 4]]) {
      await sichtbarkeit(page, false);
      await page.clock.setFixedTime(new Date(`${tag}T10:00:00Z`));
      await sichtbarkeit(page, true);
      await expect.poll(() => cageStand(page)).toMatchObject({ tag, fehlTage, treffer: false });
    }
    await expect(page.getByRole("dialog", { name: "Cage-Alphabet" })).toHaveCount(0);
    await page.clock.setFixedTime(new Date("2026-10-17T10:00:00Z"));
    await sichtbarkeit(page, true);
    const dialog = page.getByRole("dialog", { name: "Cage-Alphabet" });
    await expect(dialog).toBeVisible();
    expect(await cageStand(page)).toMatchObject({ tag: "2026-10-17", fehlTage: 0, treffer: true });
    await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
    await sichtbarkeit(page, true);
    await page.reload();
    await expect(page.locator('.kd-app[data-session-mode="account"]')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("kd:eggfired:cage"))).toBe("2026-10-17");
    expect(extern).toEqual([]);
  });

  for (const scenario of [
    { width: 393, height: 852, reduced: false, input: "tap" },
    { width: 1440, height: 900, reduced: false, input: "keyboard" },
    { width: 430, height: 932, reduced: true, input: "tap" },
  ]) test(`Cage-Karte: ${scenario.width}px ${scenario.input}, Stakkato/Ergebnis, Fokus und Reduced Motion ${scenario.reduced}`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario);
    await page.emulateMedia({ reducedMotion: scenario.reduced ? "reduce" : "no-preference" });
    await page.clock.install({ time: new Date("2026-09-08T10:00:00Z") });
    await seedCage(page, { version: 2, tag: "2026-09-08", treffer: false, fehlTage: 4 });
    await oeffneAppMitMockkonto(page, { filme: [CAGE_FILM] });
    const ausloeser = scenario.width > 760
      ? page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Settings", exact: true })
      : page.getByRole("button", { name: "Menü öffnen", exact: true });
    await ausloeser.focus();
    await page.clock.setFixedTime(new Date("2026-09-09T10:00:00Z"));
    await sichtbarkeit(page, true);
    const dialog = page.getByRole("dialog", { name: "Cage-Alphabet" });
    await expect(dialog).toBeVisible();
    await page.clock.runFor(32);
    await expect(dialog.getByRole("button", { name: "Schließen", exact: true })).toBeFocused();
    const box = await dialog.locator(".kd-cage-karte").boundingBox();
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.width).toBeLessThanOrEqual(scenario.width - 24);
    await keineDokumentUeberbreite(page);
    await page.evaluate(() => document.fonts.ready);
    if (!process.env.CI) await page.screenshot({ path: testInfo.outputPath("cage-card.png") });
    const start = dialog.getByRole("button", { name: "Cage-Alphabet starten", exact: true });
    if (scenario.input === "keyboard") { await page.keyboard.press("Tab"); await expect(start).toBeFocused(); await page.keyboard.press("Enter"); }
    else await start.tap();
    if (!scenario.reduced) {
      await expect.poll(() => page.evaluate(() => window.__cage?.stakkato || 0)).toBeGreaterThan(0);
      await page.clock.runFor(2400);
      expect(await page.evaluate(() => window.__cage.stakkato)).toBe(15);
    } else expect(await page.evaluate(() => window.__cage?.stakkato || 0)).toBe(0);
    await expect(dialog.getByText("Con Air", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Zum Eintrag", exact: true })).toBeVisible();
    await page.clock.runFor(32);
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    if (!process.env.CI) await page.screenshot({ path: testInfo.outputPath("cage-result.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(ausloeser).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  test("Cage-Blocker und Live-Pool lassen den geeigneten Nutzungstag unberührt", async ({ page }) => {
    const { buildEggControllerFixture } = await import("../egg_controller_test.mjs");
    const fixture = await buildEggControllerFixture();
    await page.route("**/*", route => route.request().url() === "http://egg-fixture.test/"
      ? route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="fixture"></div>' }) : route.abort());
    await page.goto("http://egg-fixture.test/");
    await page.addScriptTag({ content: fixture });
    await page.evaluate(() => {window.IS_REACT_ACT_ENVIRONMENT=true;window.eggDraws=0;window.eggTest.draw=()=>{window.eggDraws++;return 0;};localStorage.setItem("kd:achievements",JSON.stringify({eggs:["cage-alphabet"]}));});
    const render = patch => page.evaluate(patch => window.eggTest.act(async () => window.eggTest.render(patch)), patch);
    await render({ master: [CAGE_FILM], setupWarnung: true });
    await render({ setupWarnung: false, startModalOffen: true });
    await render({ startModalOffen: false, bootDone: false });
    await sichtbarkeit(page, false);
    await render({ bootDone: true });
    await render({ master: [] });
    await sichtbarkeit(page, true);
    await render({ master: [{ id: "8mm", typ: "film", titel: "8MM – Acht Millimeter", originaltitel: "8MM", jahr: 1999, quelle: "dvd" }] });
    await render({ master: [{ ...CAGE_FILM, quelle: "" }] });
    expect(await cageStand(page)).toBeNull();
    expect(await page.evaluate(() => window.eggDraws)).toBe(0);
    await render({ programmInfo: { gueltigBis: "2099-09-10T10:00:00Z" }, kinoMatches: { matched: [{ film: CAGE_FILM, prog: { t: "Con Air", j: 1997 } }] } });
    expect(await page.evaluate(() => window.eggTest.state().cageOffen)).toBe(true);
    expect(await page.evaluate(() => window.eggDraws)).toBe(1);
    await page.evaluate(() => window.eggTest.act(async () => window.eggTest.unmount()));
    await sichtbarkeit(page, true);
    expect(await page.evaluate(() => window.eggDraws)).toBe(1);
  });

  test("Cage wartet vor dem tatsächlichen privaten Einstieg", async ({ page }) => {
    await blockiereFremdnetz(page);
    await page.clock.install({ time: new Date("2026-09-09T10:00:00Z") });
    await seedCage(page, { version: 2, tag: "2026-09-08", treffer: false, fehlTage: 4 });
    await page.addInitScript(film => {
      localStorage.setItem("kd:master", JSON.stringify({ filme: [film], gespeichertAm: Date.now() }));
      localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: false }));
    }, CAGE_FILM);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Ohne Konto fortfahren", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Cage-Alphabet" })).toHaveCount(0);
    expect(await cageStand(page)).toMatchObject({ tag: "2026-09-08", fehlTage: 4 });
    await page.getByRole("button", { name: "Ohne Konto fortfahren", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Cage-Alphabet" })).toBeVisible();
  });

  test("Space-Pause hält alten Unlock, gespeichertes und manuelles Neon sowie DEV-Query still", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("kd:achievements", JSON.stringify({ eggs: ["deep-space-horror"] }));
      localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", modus: "neon-noir", basisTheme: "dunkel" }));
      localStorage.setItem("kd:deep-space-horror:rhythmus:gast", "alter-unveraenderter-stand");
    });
    const extern = await oeffneAppMitMockkonto(page);
    await page.goto("/?deep-space-test=1");
    const still = async () => {
      await expect(page.locator('.kd-fx-neon-noir[aria-hidden="true"]')).toBeVisible();
      await expect(page.locator(".kd-fx-deep-space, .kd-deep-space-horror, [data-kd-deep-space-test], .kd-deep-space-testpanel")).toHaveCount(0);
      expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("kd:deep-space-horror:")))).toEqual(["kd:deep-space-horror:rhythmus:gast"]);
      expect(await page.evaluate(() => localStorage.getItem("kd:deep-space-horror:rhythmus:gast"))).toBe("alter-unveraenderter-stand");
    };
    await still();
    await page.getByRole("button", { name: "Menü öffnen", exact: true }).click();
    await page.getByRole("dialog", { name: "Menü", exact: true }).getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator("summary", { hasText: /^Über Kinodreieck, Anleitung & Rechtliches$/ }).click();
    await page.getByRole("button", { name: "Max", exact: true }).click();
    const mode = page.getByRole("button", { name: "Schon kuhl", exact: true });
    await mode.click();
    await expect(page.locator(".kd-fx-neon-noir")).toHaveCount(0);
    await mode.click();
    await still();
    await expect(page.getByText("Easteregg freigeschalten!", { exact: true })).toHaveCount(0);
    expect(extern).toEqual([]);
  });
});

test.describe("Cage-Pool und echte Eintrag-Sprünge", () => {
  test.use({ hasTouch: true, serviceWorkers: "block", timezoneId: "Europe/Vienna", reducedMotion: "reduce" });
  const kino = { t: "Con Air", ot: "Con Air", j: 1997, film_at_id: "cage-kino-only", k: ["Filmcasino"], z: ["Mi 9.9. 20:00 · Filmcasino"], f: "OmU" };
  const stream = { titel: "Mandy", originaltitel: "Mandy", jahr: 2018, typ: "movie", watchmode_id: 90042, dienste: ["Netflix"] };
  for (const width of [393, 1440]) {
    for (const scenario of [
      { name: "Kino-only ohne Master nach Streamingfehler", filme: [], katalog: { kino: [kino], failDiscover: true }, titel: "Con Air", ziel: '[data-kino-suchtreffer="programm:cage-kino-only"]', herkunft: "Läuft gerade im Kino" },
      { name: "Kino mit passender Master-Karte", filme: [{ ...CAGE_FILM, quelle: "" }], katalog: { kino: [kino] }, titel: "Con Air", ziel: `[data-kino-suchtreffer="film:${CAGE_FILM.id}"]`, herkunft: "Läuft gerade im Kino" },
      { name: "Entdecken ergänzt den kleinen Besitzpool vor dem Wurf", filme: [CAGE_FILM], katalog: { entdecken: [stream] }, titel: "Mandy", ziel: '[data-streaming-suchtreffer="entdecken:90042"]', herkunft: "Streamst du auf Netflix" },
      { name: "Bekannter Stream mit echter Master-ID", filme: [{ ...CAGE_FILM, quelle: "" }], katalog: { bekannt: [{ ...CAGE_FILM, watchmode_id: 90043, dienste: ["Netflix"] }] }, titel: "Con Air", ziel: `[data-streaming-suchtreffer="programm:${CAGE_FILM.id}"]`, herkunft: "Streamst du auf Netflix" },
    ]) test(`${width}px: ${scenario.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 393 ? 852 : 900 });
      await page.clock.install({ time: new Date("2026-09-09T10:00:00Z") });
      await page.addInitScript(() => {
        localStorage.setItem("kd:achievements", JSON.stringify({ eggs: ["cage-alphabet"] }));
        localStorage.setItem("kd:eggroll:cage", JSON.stringify({ version: 2, tag: "2026-09-08", treffer: false, fehlTage: 4 }));
        localStorage.setItem("kd:streaming-dienste", JSON.stringify({ dienste: ["Netflix"], heuristik: false }));
        Math.random = () => 0.99;
      });
      const extern = await oeffneAppMitMockkonto(page, scenario);
      const dialog = page.getByRole("dialog", { name: "Cage-Alphabet" });
      await expect.poll(() => page.evaluate(() => window.cageCatalog?.calls.streamingEntdecken)).toBe(1);
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kd:eggroll:cage")).tag)).toBe("2026-09-08");
      // The normal app remains usable while only the Egg waits for its catalog.
      if (width === 393) {
        await page.getByRole("button", { name: "Menü öffnen", exact: true }).tap();
        await expect(page.getByRole("dialog", { name: "Menü", exact: true })).toBeVisible();
        await page.evaluate(() => window.cageCatalog.release());
        await expect(dialog).toHaveCount(0);
        await page.getByRole("dialog", { name: "Menü", exact: true }).getByRole("button", { name: "Settings", exact: true }).tap();
      } else {
        await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Settings", exact: true }).click();
        await page.evaluate(() => window.cageCatalog.release());
      }
      await expect(dialog).toBeVisible();
      const start = dialog.getByRole("button", { name: "Cage-Alphabet starten", exact: true });
      if (width === 393) await start.tap();
      else { await start.focus(); await page.keyboard.press("Enter"); }
      await expect(dialog.getByText(scenario.titel, { exact: true })).toBeVisible();
      await expect(dialog.getByText(scenario.herkunft, { exact: true })).toBeVisible();
      if (!process.env.CI) await page.screenshot({ path: testInfo.outputPath("cage-pool-result.png") });
      const ziel = page.locator(scenario.ziel);
      if (width === 393) await dialog.getByRole("button", { name: "Zum Eintrag", exact: true }).tap();
      else { await dialog.getByRole("button", { name: "Zum Eintrag", exact: true }).focus(); await page.keyboard.press("Enter"); }
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => {
        await page.clock.runFor(80);
        return ziel.evaluateAll(elements => elements.some(element => element === document.activeElement));
      }).toBe(true);
      await expect(ziel).toBeVisible();
      await expect(ziel).toContainText(scenario.titel);
      const box = await ziel.boundingBox();
      expect(box.y).toBeLessThan(width === 393 ? 852 : 900);
      expect(box.y + box.height).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.cageCatalog.calls.streamingEntdecken)).toBe(1);
      expect(await page.evaluate(() => localStorage.getItem("kd:eggfired:cage"))).toBe("2026-09-09");
      await keineDokumentUeberbreite(page);
      if (!process.env.CI) await page.screenshot({ path: testInfo.outputPath("cage-pool-target.png") });
      expect(extern).toEqual([]);
    });
  }
});

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

const EGG_FILM = {
  id: "egg-surface-night", typ: "film", titel: "Die Nacht der Lichter", originaltitel: "Die Nacht der Lichter",
  jahr: 1982, quelle: "dvd", kategorie: "sehenswert", bewertet_von: "max",
  bewertung: { wie: 4, was: 3, warum: 4 }, genre: ["scifi"], tags: [],
  begruendung: "Eine Stadt aus Regen und Licht. Ein ruhiger Abend im Kino.", notiz: "",
};

async function waehleEggAppTab(page, name) {
  if (page.viewportSize().width > 760) {
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name, exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Menü öffnen", exact: true }).click();
    await page.getByRole("dialog", { name: "Menü", exact: true }).getByRole("button", { name, exact: true }).click();
  }
}

async function pruefeShowaVerankerung(page) {
  const result = await page.locator(".kd-showa-scene").evaluate(svg => {
    const box = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom }; };
    const quarters = [...svg.querySelectorAll(".kd-city-front use")].map(use => {
      const source = svg.ownerDocument.getElementById(use.getAttribute("href").slice(1));
      const view = use.parentElement.viewBox.baseVal;
      return { shapes:[source.querySelector("path"),source.querySelector("rect")],
        inverse:use.getScreenCTM().inverse(), view:{x:view.x,y:view.y,width:view.width,height:view.height} };
    });
    // Check the rendered, clipped quarters, including their opaque house walls.
    // The definition alone is invisible and must never count as an occluder.
    const covered = screen => quarters.some(({shapes,inverse,view}) => {
      const p = screen.matrixTransform(inverse);
      return p.x >= view.x && p.x <= view.x+view.width && p.y >= view.y && p.y <= view.y+view.height
        && shapes.some(shape=>shape.isPointInFill(p));
    });
    const kaiju = svg.querySelector(".kd-kaiju-shape > path");
    const toScreen = kaiju.getScreenCTM();
    const feetCovered = [151,217].map(x=>covered(new DOMPoint(x,336).matrixTransform(toScreen)));
    const uncoveredLegPoints = [];
    for (let x = 116; x <= 241; x += 3) for (let y = 281; y <= 344; y += 3) {
      const point = new DOMPoint(x,y);
      if (!kaiju.isPointInFill(point)) continue;
      const screen = point.matrixTransform(toScreen);
      if (screen.y >= innerHeight || screen.x < 0 || screen.x > innerWidth) continue;
      if (!covered(screen)) uncoveredLegPoints.push({x,y});
    }
    const head = new DOMPoint(215,75).matrixTransform(toScreen);
    const back = svg.querySelector(".kd-city-back > path");
    const backInverse = back.getScreenCTM().inverse();
    return {
      motifs: [box(svg.querySelector(".kd-clock")), box(svg.querySelectorAll(".kd-diet > path")[1])],
      foundations: [...svg.querySelectorAll(".kd-city-foundation")].map(el => {
        const b = el.getBBox();
        const foot = new DOMPoint(b.x+b.width/2,b.y+b.height).matrixTransform(el.getScreenCTM());
        return { base:box(el),building:box(el.parentElement.querySelector("path")),
          grounded:covered(foot)||back.isPointInFill(foot.matrixTransform(backInverse))||foot.y>=innerHeight };
      }),
      frontOpacity: getComputedStyle(svg.querySelector(".kd-city-front")).opacity,
      feetCovered, uncoveredLegPoints,
      headVisible: head.x >= 0 && head.x <= innerWidth && head.y >= 0 && head.y <= innerHeight && !covered(head),
      kaiju: box(kaiju),
    };
  });
  for (const motif of result.motifs) {
    expect(motif.left).toBeGreaterThanOrEqual(0);
    expect(motif.right).toBeLessThanOrEqual(page.viewportSize().width);
    expect(motif.top).toBeGreaterThanOrEqual(0);
    expect(motif.bottom).toBeLessThanOrEqual(page.viewportSize().height);
  }
  for (const {base,building,grounded} of result.foundations) {
    expect(base.top).toBeLessThanOrEqual(building.bottom);
    expect(grounded).toBe(true);
  }
  expect(result.feetCovered).toEqual([true,true]);
  expect(result.frontOpacity).toBe("1");
  expect(result.uncoveredLegPoints).toEqual([]);
  expect(result.headVisible).toBe(true);
  if (page.viewportSize().width === 1440) expect(result.kaiju.right).toBeLessThan(285);
}

test.describe("Egg-Oberflächen in der echten App", () => {
  test.use({ reducedMotion: "reduce", serviceWorkers: "block" });
  for (const viewport of [{ width:393, height:852 }, { width:430, height:932 }, { width:1440, height:900 }]) {
    for (const modus of ["showa", "neon-noir"]) {
      test(`${modus}: Settings, Filmkarte und Controls bei ${viewport.width}x${viewport.height}`, async ({page}, testInfo) => {
        await page.setViewportSize(viewport);
        const errors = [];
        page.on("pageerror", error => errors.push(String(error)));
        const extern = await oeffneAppMitMockkonto(page, { filme: [EGG_FILM] });
        await waehleEggAppTab(page, "Settings");
        await page.getByRole("button", { name: modus === "showa" ? "Foyer (hell)" : "Saal (dunkel)", exact:true }).click();
        const legal = page.locator("summary", { hasText:/^Über Kinodreieck, Anleitung & Rechtliches$/ });
        await legal.click();
        await page.getByRole("button", { name:"Max", exact:true }).click();
        await page.getByRole("button", { name:modus === "showa" ? "Classix" : "Schon kuhl", exact:true }).click();
        await expect(page.locator(`.kd-fx-${modus}`)).toBeVisible();
        await expect(page.locator(".kd-app")).toHaveCSS("filter", "none");
        await expect(page.locator(".kd-app")).toHaveCSS("transform", "none");
        if (modus === "showa") {
          await pruefeShowaVerankerung(page);
          await expect(page.locator(".kd-klappe:not([open])").first()).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
        }
        await legal.click();
        await page.getByRole("button", { name:"Klein", exact:true }).click();
        await keineDokumentUeberbreite(page);
        const normal = page.getByRole("button", { name:"Normal", exact:true });
        await normal.focus();
        await page.keyboard.press("Space");
        await expect(normal).toHaveAttribute("aria-pressed", "true");
        if (modus === "neon-noir") {
          await expect(normal).toHaveCSS("background-color", "rgb(67, 234, 242)");
          await expect(normal).toHaveCSS("color", "rgb(0, 0, 0)");
          await expect(normal).toHaveCSS("border-radius", "3px");
          await expect(normal).toHaveCSS("outline-style", "solid");
          await expect(normal).toHaveCSS("outline-width", "2px");
        }
        await keineDokumentUeberbreite(page);
        if (!process.env.CI) await page.screenshot({ path:testInfo.outputPath(`${modus}-settings.png`) });
        await waehleEggAppTab(page, "Mediathek");
        const card = page.locator(".kd-filmkarte").filter({ hasText:EGG_FILM.titel });
        await card.click();
        await expect(card).toContainText(EGG_FILM.begruendung);
        const colors = await card.evaluate(el => ({ text:getComputedStyle(el).color, background:getComputedStyle(el).backgroundColor }));
        if (modus === "neon-noir") {
          await expect(card).toHaveCSS("border-radius", "4px");
          expect(colors).toEqual({text:"rgb(6, 33, 44)",background:"rgb(221, 247, 246)"});
        } else expect(colors.text).not.toBe(colors.background);
        if (!process.env.CI) await page.screenshot({ path:testInfo.outputPath(`${modus}-card.png`) });
        const search = page.locator(".kd-globalsuche input");
        if (viewport.width <= 760) {
          await search.fill("Nacht");
          await expect(search).toHaveValue("Nacht");
          if (modus === "neon-noir") {
            await expect(page.locator(".kd-globalsuche-los")).toHaveCSS("background-color", "rgb(67, 234, 242)");
            await expect(search).toHaveCSS("background-color", "rgb(4, 15, 26)");
            await expect(search).toHaveCSS("outline-color", "rgb(67, 234, 242)");
          }
          await search.fill("");
          await page.getByRole("button", { name:"Menü öffnen", exact:true }).click();
          const menu = page.getByRole("dialog", {name:"Menü",exact:true});
          await expect(menu).toBeVisible();
          await expect(menu.getByRole("button",{name:"Mediathek",exact:true})).toHaveAttribute("aria-current","page");
          if (!process.env.CI) await page.screenshot({ path:testInfo.outputPath(`${modus}-menu.png`) });
          await page.keyboard.press("Escape");
          await expect(menu).toBeHidden();
        }
        await keineDokumentUeberbreite(page);
        expect(errors).toEqual([]);
        expect(extern).toEqual([]);
      });
    }
  }
});

test("Showa bewegt die Miniatur ruhig und stoppt bei Verbergen, Reduced Motion und Unmount", async ({page}) => {
  const { buildNeonNoirFixture } = await import("../neon_noir_test.mjs");
  const fixture = await buildNeonNoirFixture();
  const extern = [];
  await page.route("**/*", async route => {
    if (route.request().url() === "http://showa-fixture.test/") {
      await route.fulfill({contentType:"text/html",body:'<!doctype html><html><body style="margin:0;background:#E5E2DA"><div id="fixture"></div></body></html>'});
    } else { extern.push(route.request().url()); await route.abort(); }
  });
  await page.setViewportSize({width:393,height:852});
  await page.goto("http://showa-fixture.test/");
  await page.addStyleTag({content:fixture.css});
  await page.addScriptTag({content:fixture.js});
  await page.evaluate(()=>window.neonTest.mount("showa"));
  const overlay = page.locator(".kd-fx-showa");
  const kaiju = overlay.locator(".kd-kaiju-shape");
  const smoke = overlay.locator(".kd-city-smoke");
  const beam = overlay.locator(".kd-beam");
  for (const part of [kaiju, smoke, beam]) {
    await expect(part).toHaveCSS("animation-play-state","running");
  }
  const motionPosition = () => overlay.evaluate(el => {
    const eye = el.querySelector(".kd-kaiju-eye");
    const p = new DOMPoint(241,105).matrixTransform(eye.getScreenCTM());
    const smoke = el.querySelector(".kd-city-smoke").getScreenCTM();
    return {head:{x:p.x,y:p.y},smoke:{x:smoke.e,y:smoke.f}};
  });
  const start = await motionPosition();
  await page.waitForTimeout(3200);
  const end = await motionPosition();
  // A real 3.2-second interval must move visible features by useful screen
  // distances; a subpixel transform change is not perceptible animation.
  expect(Math.hypot(end.head.x-start.head.x,end.head.y-start.head.y)).toBeGreaterThanOrEqual(10);
  expect(Math.hypot(end.smoke.x-start.smoke.x,end.smoke.y-start.smoke.y)).toBeGreaterThanOrEqual(15);
  for (const viewport of [{width:393,height:852},{width:430,height:932},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    await kaiju.evaluate(el=>el.getAnimations()[0].pause());
    for (const time of [0,900,1800,2700,3312,3900,4608,5400,6300,7200]) {
      await kaiju.evaluate((el,time)=>{el.getAnimations()[0].currentTime=time;},time);
      await pruefeShowaVerankerung(page);
    }
    await kaiju.evaluate(el=>el.getAnimations()[0].play());
  }
  await page.setViewportSize({width:393,height:852});
  await page.evaluate(()=>{
    Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(overlay).toHaveAttribute("data-paused","true");
  for (const part of [kaiju,smoke,beam]) await expect(part).toHaveCSS("animation-play-state","paused");
  await page.evaluate(()=>{
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(kaiju).toHaveCSS("animation-play-state","running");
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const part of [kaiju,smoke,beam]) await expect(part).toHaveCSS("animation-name","none");
  await pruefeShowaVerankerung(page);
  await expect(smoke).not.toHaveCSS("transform","none");
  await page.emulateMedia({reducedMotion:"no-preference"});
  await expect(kaiju).toHaveCSS("animation-play-state","running");
  await page.evaluate(()=>window.neonTest.unmount());
  await expect(overlay).toHaveCount(0);
  await keineDokumentUeberbreite(page);
  expect(extern).toEqual([]);
});

test.describe("Showa-PWA-Dauerbedienung", () => {
  test.use({ hasTouch: true, serviceWorkers: "block" });
  for (const scenario of [
    { width: 393, height: 852, modus: "showa", reducedMotion: "no-preference" },
    { width: 430, height: 932, modus: "showa", reducedMotion: "no-preference" },
    { width: 393, height: 852, modus: "showa", reducedMotion: "reduce" },
    { width: 393, height: 852, modus: "", reducedMotion: "no-preference" },
  ]) {
    test(`PWA-Dauerbedienung ${scenario.width}px, ${scenario.modus || "ohne Showa"}, ${scenario.reducedMotion}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.emulateMedia({ reducedMotion: scenario.reducedMotion });
      const filme = Array.from({ length: 500 }, (_, index) => ({
        ...EGG_FILM,
        id: `showa-owner-${index}`,
        titel: `Showa Praxisfilm ${String(index).padStart(3, "0")}`,
        notiz: `Lokale realistische Testbeilage ${index} `.repeat(4),
      }));
      const mustwatch = Array.from({ length: 80 }, (_, index) => ({
        id: `showa-mw-${index}`,
        titel: filme[index].titel,
        jahr: 1954 + (index % 70),
        typ: "film",
        verknuepfung: { ziel: "master", id: filme[index].id },
        notiz: `Must-Watch-Testbeilage ${index} `.repeat(4),
      }));
      await page.addInitScript(({ modus, mustwatch }) => {
        localStorage.setItem("kd:einstellungen", JSON.stringify({
          theme: "dunkel", startTab: "start", schrift: "klein", modus, ...(modus ? { basisTheme: "hell" } : {}),
        }));
        localStorage.setItem("kd:mustwatch", JSON.stringify({ eintraege: mustwatch, gespeichertAm: Date.now() }));
      }, { modus: scenario.modus, mustwatch });
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      const extern = await oeffneAppMitMockkonto(page, { filme, katalog: {} });
      const overlay = page.locator('.kd-fx-showa[aria-hidden="true"]');
      if (scenario.modus) {
        await expect(overlay).toBeVisible();
        for (const selector of [".korn", ".kd-beam", ".kd-city-smoke", ".kd-kaiju-shape"]) {
          await expect(overlay.locator(selector)).toHaveCSS("animation-name", "none");
        }
      } else await expect(overlay).toHaveCount(0);

      const tabZiele = {
        Start: ".kd-dash",
        Kino: ".kd-kino-tab",
        Mediathek: ".kd-mediathek-tab",
        Streaming: ".kd-streaming-tab",
        Entdecken: '[data-testid="entdecken-tab"]',
      };
      const openMobileTab = async name => {
        const started = Date.now();
        await page.getByRole("button", { name: "Menü öffnen", exact: true }).tap();
        const menu = page.getByRole("dialog", { name: "Menü", exact: true });
        await expect(menu).toBeVisible();
        await menu.getByRole("button", { name, exact: true }).tap();
        await expect(menu).toHaveCount(0);
        await expect(page.locator(".kd-mobile-menu-layer")).toHaveCount(0);
        expect(await page.evaluate(() => ({
          position: document.body.style.position,
          locked: document.body.classList.contains("kd-scroll-gesperrt"),
        }))).toEqual({ position: "", locked: false });
        await expect(page.locator(tabZiele[name])).toBeVisible();
        expect(Date.now() - started, `${name} reagiert`).toBeLessThan(3000);
      };

      for (let round = 0; round < 6; round++) {
        for (const name of ["Kino", "Mediathek", "Streaming", "Entdecken", "Start"]) {
          await openMobileTab(name);
          await expect(page.locator(".kd-app")).toBeVisible();
        }
        await page.screenshot({ animations: "allow" });
      }

      if (scenario.modus) {
        const setVisibility = hidden => page.evaluate(hidden => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
          Object.defineProperty(document, "visibilityState", {
            configurable: true, get: () => hidden ? "hidden" : "visible",
          });
          document.dispatchEvent(new Event("visibilitychange"));
          return { hidden: document.hidden, visibilityState: document.visibilityState };
        }, hidden);
        expect(await setVisibility(true)).toEqual({ hidden: true, visibilityState: "hidden" });
        await expect(overlay).toHaveAttribute("data-paused", "true");
        expect(await setVisibility(false)).toEqual({ hidden: false, visibilityState: "visible" });
        await expect(overlay).toHaveAttribute("data-paused", "false");
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('.kd-app[data-session-mode="account"]')).toBeVisible();
      if (scenario.modus) await expect(overlay).toBeVisible();
      else await expect(overlay).toHaveCount(0);
      await openMobileTab("Mediathek");
      await openMobileTab("Start");
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kd:einstellungen") || "null")?.modus)).toBe(scenario.modus);
      expect(errors).toEqual([]);
      expect(extern).toEqual([]);

      if (scenario.width === 393 && scenario.modus === "showa" && scenario.reducedMotion === "no-preference") {
        const restarted = await page.context().newPage();
        await restarted.setViewportSize({ width: scenario.width, height: scenario.height });
        await restarted.emulateMedia({ reducedMotion: scenario.reducedMotion });
        const restartErrors = [];
        restarted.on("pageerror", error => restartErrors.push(String(error)));
        await page.close();
        const restartExtern = await oeffneAppMitMockkonto(restarted, { filme, katalog: {} });
        await expect(restarted.locator('.kd-app[data-session-mode="account"]')).toBeVisible();
        await expect(restarted.locator('.kd-fx-showa[aria-hidden="true"]')).toBeVisible();
        for (const name of ["Mediathek", "Start"]) {
          await restarted.getByRole("button", { name: "Menü öffnen", exact: true }).tap();
          const menu = restarted.getByRole("dialog", { name: "Menü", exact: true });
          await expect(menu).toBeVisible();
          await menu.getByRole("button", { name, exact: true }).tap();
          await expect(menu).toHaveCount(0);
          await expect(restarted.locator(tabZiele[name])).toBeVisible();
        }
        expect(await restarted.evaluate(() => ({
          modus: JSON.parse(localStorage.getItem("kd:einstellungen") || "null")?.modus,
          position: document.body.style.position,
          locked: document.body.classList.contains("kd-scroll-gesperrt"),
        }))).toEqual({ modus: "showa", position: "", locked: false });
        await restarted.getByRole("button", { name: "Menü öffnen", exact: true }).tap();
        const settingsMenu = restarted.getByRole("dialog", { name: "Menü", exact: true });
        await expect(settingsMenu).toBeVisible();
        await settingsMenu.getByRole("button", { name: "Settings", exact: true }).tap();
        await expect(settingsMenu).toHaveCount(0);
        await expect(restarted.locator(".kd-daten-tab")).toBeVisible();
        await expect(restarted.locator("summary", { hasText: /^Darstellung & Verhalten$/ })).toBeVisible();
        await restarted.getByRole("button", { name: "Foyer (hell)", exact: true }).tap();
        await expect(restarted.locator('.kd-fx-showa[aria-hidden="true"]')).toHaveCount(0);
        await expect.poll(() => restarted.evaluate(() => {
          const settings = JSON.parse(localStorage.getItem("kd:einstellungen") || "null");
          return { modus: settings?.modus, theme: settings?.theme };
        })).toEqual({ modus: "", theme: "hell" });
        expect(restartErrors).toEqual([]);
        expect(restartExtern).toEqual([]);
      }
    });
  }
});
