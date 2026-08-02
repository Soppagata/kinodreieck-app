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

async function seedAppMitDarstellung(page, { modus = "", schrift = "normal" } = {}) {
  await page.addInitScript(({ modus, schrift }) => {
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-07-31", version: "beta-2026-07-datenfreigabe-2" }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-07-31T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    localStorage.setItem("kd:einstellungen", JSON.stringify({
      theme: "dunkel", startTab: "start", schrift, modus,
      ...(modus ? { basisTheme: "dunkel" } : {}),
    }));
  }, { modus, schrift });
}

async function animierteOverlayEbenen(overlay) {
  return overlay.evaluate((el) => [el, ...el.querySelectorAll("*")].flatMap((knoten) => {
    const stil = getComputedStyle(knoten);
    if (stil.animationName === "none" || Number.parseFloat(stil.animationDuration) <= 0) return [];
    return [{ klasse: knoten.className?.baseVal || knoten.className || "", animation: stil.animationName }];
  }));
}

const DEEP_ACHIEVEMENT = "deep-space-horror";
const DEEP_RHYTHMUS_KEY = "kd:deep-space-horror:rhythmus:gast";
const DEEP_TEST_RNG_KEY = "kd:test:deep-space-rng-calls";
const DEEP_TEST_EVENT_RNG_KEY = "kd:test:deep-space-event-rng-calls";
const DEEP_TEST_TOAST_TIMER_KEY = "kd:test:deep-space-toast-timers";
const DEEP_TEST_EVENT_TIMER_KEY = "kd:test:deep-space-event-timers";
const DEEP_TEST_EVENT_CHOICE_KEY = "kd:test:deep-space-event-choice-index";

const deepSpaceFilm = (titel, jahr) => ({
  id: `deep-${jahr}-${titel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  typ: "film", titel, originaltitel: titel, jahr, quelle: "dvd",
  kategorie: "sehenswert", bewertet_von: "max",
  bewertung: { wie: 3, was: 3, warum: 3 }, genre: ["scifi"], tags: [], begruendung: "", notiz: "",
});

const DREI_DEEP_FILME = [
  deepSpaceFilm("Alien", 1979),
  deepSpaceFilm("Aliens", 1986),
  deepSpaceFilm("Event Horizon", 1997),
];

async function seedDeepSpaceApp(page, {
  rng = 0,
  achievement = true,
  filme = [],
  modus = "neon-noir",
  eventRng = 0,
  eventChoiceValues = [],
  skipTimerInstrumentation = false,
  compressedEventTimers = false,
} = {}) {
  await page.addInitScript(({
    rng, achievement, filme, modus, achievementId, rhythmusKey, rngKey, eventRngKey,
    toastTimerKey, eventTimerKey, eventChoiceKey, eventRng,
    eventChoiceValues, skipTimerInstrumentation, compressedEventTimers,
  }) => {
    const basisSetTimeout = window.setTimeout.bind(window);
    let virtuelleZeit = Date.now();
    if (compressedEventTimers) Date.now = () => virtuelleZeit;
    if (!skipTimerInstrumentation) {
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 4000) {
          let timer = [];
          try { timer = JSON.parse(localStorage.getItem(toastTimerKey) || "[]"); } catch { /* leer */ }
          try { localStorage.setItem(toastTimerKey, JSON.stringify([...timer, delay])); } catch { /* best effort */ }
        }
        const timerStack = String(new Error().stack || "");
        if (timerStack.includes("DeepSpaceHorrorOverlay") || timerStack.includes("useDeepSpaceEventScheduler")) {
          let timer = [];
          try { timer = JSON.parse(localStorage.getItem(eventTimerKey) || "[]"); } catch { /* leer */ }
          try { localStorage.setItem(eventTimerKey, JSON.stringify([...timer, delay])); } catch { /* best effort */ }
          if (compressedEventTimers) {
            const testDelay = delay >= 20_000 ? 1_000 : 2_500;
            return basisSetTimeout(() => {
              virtuelleZeit += delay;
              callback();
            }, testDelay, ...args);
          }
        }
        return basisSetTimeout(callback, delay, ...args);
      };
    }
    const basisRandom = () => {
      const stack = String(new Error().stack || "");
      const zaehle = (key) => {
        let anzahl = 0;
        try { anzahl = Number(localStorage.getItem(key) || "0"); } catch { /* about:blank */ }
        try { localStorage.setItem(key, String(anzahl + 1)); } catch { /* about:blank */ }
      };
      /* Der Scheduler reserviert den Versuch synchron vor dem RNG-Aufruf. So
         lässt er sich in Chromium und WebKit unabhängig von Stackformaten
         zählen; spätere Overlay-Zufallswerte tragen denselben Versuchstag und
         werden durch den Marker ignoriert. */
      try {
        const rhythmus = JSON.parse(localStorage.getItem(rhythmusKey) || "null");
        const markerKey = `${rngKey}:attempt`;
        const marker = localStorage.getItem(markerKey);
        if (rhythmus?.lastAttempt && marker !== rhythmus.lastAttempt) {
          zaehle(rngKey);
          localStorage.setItem(markerKey, rhythmus.lastAttempt);
        }
      } catch { /* Kein reservierter Deep-Space-Versuch. */ }
      if (stack.includes("DeepSpaceHorrorOverlay") || stack.includes("useDeepSpaceEventScheduler")) {
        zaehle(eventRngKey);
        if (stack.includes("chooseWithoutRepeat")) {
          let index = 0;
          try { index = Number(localStorage.getItem(eventChoiceKey) || "0"); } catch { /* leer */ }
          try { localStorage.setItem(eventChoiceKey, String(index + 1)); } catch { /* best effort */ }
          return eventChoiceValues[index] ?? eventRng;
        }
        return eventRng;
      }
      return rng;
    };
    Math.random = basisRandom;
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-08-02", version: "beta-2026-07-datenfreigabe-2" }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-08-02T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    localStorage.setItem("kd:einstellungen", JSON.stringify({
      theme: "dunkel", startTab: "start", schrift: "normal", modus,
      ...(modus ? { basisTheme: "dunkel" } : {}),
    }));
    localStorage.setItem("kd:master", JSON.stringify({
      meta: { version: "deep-space-test" }, filme, gespeichertAm: Date.now(),
    }));
    localStorage.setItem("kd:achievements", JSON.stringify({
      eggs: achievement ? [achievementId] : [], gespeichertAm: Date.now(),
    }));
  }, {
    rng, achievement, filme, modus, eventRng, eventChoiceValues,
    skipTimerInstrumentation, compressedEventTimers,
    achievementId: DEEP_ACHIEVEMENT,
    rhythmusKey: DEEP_RHYTHMUS_KEY,
    rngKey: DEEP_TEST_RNG_KEY, eventRngKey: DEEP_TEST_EVENT_RNG_KEY,
    toastTimerKey: DEEP_TEST_TOAST_TIMER_KEY,
    eventTimerKey: DEEP_TEST_EVENT_TIMER_KEY,
    eventChoiceKey: DEEP_TEST_EVENT_CHOICE_KEY,
  });
}

async function lokaleDeepDaten(page) {
  return page.evaluate(({
    rhythmusKey, rngKey, eventRngKey, toastTimerKey, eventTimerKey,
  }) => ({
    einstellungen: JSON.parse(localStorage.getItem("kd:einstellungen") || "null"),
    rhythmusRoh: localStorage.getItem(rhythmusKey),
    rhythmus: JSON.parse(localStorage.getItem(rhythmusKey) || "null"),
    rngCalls: Number(localStorage.getItem(rngKey) || "0"),
    eventRngCalls: Number(localStorage.getItem(eventRngKey) || "0"),
    toastTimer: JSON.parse(localStorage.getItem(toastTimerKey) || "[]"),
    eventTimer: JSON.parse(localStorage.getItem(eventTimerKey) || "[]"),
    achievements: JSON.parse(localStorage.getItem("kd:achievements") || "null"),
  }), {
    rhythmusKey: DEEP_RHYTHMUS_KEY,
    rngKey: DEEP_TEST_RNG_KEY,
    eventRngKey: DEEP_TEST_EVENT_RNG_KEY,
    toastTimerKey: DEEP_TEST_TOAST_TIMER_KEY,
    eventTimerKey: DEEP_TEST_EVENT_TIMER_KEY,
  });
}

async function laufendeOverlayAnimationen(overlay) {
  return overlay.evaluate((el) => el.getAnimations({ subtree: true })
    .filter((animation) => animation.playState !== "idle")
    .map((animation) => animation.animationName || "unbenannt"));
}

async function warteAufEventScheduler(page) {
  await expect.poll(async () => (await lokaleDeepDaten(page)).eventRngCalls)
    .toBeGreaterThanOrEqual(1);
}

async function protokolliereFolgetimer(page) {
  await page.evaluate(() => {
    window.__kdDeepEventTimer = [];
    const basisSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      window.__kdDeepEventTimer.push(delay);
      return basisSetTimeout(callback, delay, ...args);
    };
  });
}

async function protokollierteFolgetimer(page) {
  return page.evaluate(() => [...(window.__kdDeepEventTimer || [])]);
}

async function waehleMobileTab(page, name) {
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" })
    .getByRole("button", { name, exact: true }).click();
}

async function starteErstesAmbientEvent(page, overlay) {
  await warteAufEventScheduler(page);
  await expect(overlay).toHaveClass(/kd-deep-space--event-steam-burst/);
  await expect(overlay.locator(".kd-deep-space__steam-burst")).toHaveCount(1);
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

  for (const schrift of ["normal", "gross", "klein"]) {
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
      expect(menuBox.width).toBeGreaterThanOrEqual(44);
      expect(menuBox.height).toBeGreaterThanOrEqual(44);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width - 16);
      await expect(page.locator(".kd-tabbar")).toHaveCount(0);
      await keineDokumentUeberbreite(page);
      await expect(page.locator(".kd-app main")).toHaveCSS("zoom",
        schrift === "gross" ? "1.1" : schrift === "klein" ? "0.92" : "1");
      if (schrift === "klein") {
        const mainBox = await page.locator(".kd-app main").boundingBox();
        expect(mainBox.x + mainBox.width).toBeLessThanOrEqual(viewport.width + 0.5);
      }
      const globaleSuche = page.getByRole("search", { name: "Globale Suche" });
      await expect(globaleSuche).toBeVisible();
      await expect(globaleSuche).toHaveCSS("position", "fixed");
      const suchBox = await globaleSuche.boundingBox();
      expect(suchBox.x).toBeGreaterThanOrEqual(9);
      expect(suchBox.x + suchBox.width).toBeLessThanOrEqual(viewport.width - 9);
      expect(viewport.height - suchBox.y - suchBox.height).toBeLessThanOrEqual(11);

      for (const ziel of ["Kino", "Streaming", "Mediathek", "Blog", "Start", "Settings"]) {
        await page.getByRole("button", { name: "Menü öffnen" }).click();
        const popup = page.getByRole("dialog", { name: "Menü" });
        const panel = popup.locator(".kd-mobile-menu");
        await expect(popup).toBeVisible();
        await expect(popup.locator(":focus")).toHaveCount(1);
        if (ziel === "Kino") {
          const fokusziele = popup.getByRole("button");
          await page.keyboard.press("Shift+Tab");
          await expect(fokusziele.last()).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(fokusziele.first()).toBeFocused();
        }
        await expect(panel).toHaveCSS("transform", "none");
        const popupBox = await panel.boundingBox();
        expect(popupBox.width).toBeGreaterThanOrEqual(Math.min(viewport.width * 0.76, 260) - 1);
        expect(viewport.width - popupBox.x - popupBox.width).toBeGreaterThanOrEqual(9);
        /* Das Menü sitzt seit dem Blur-Streifen-Fix näher an der unteren
           Bedienzone; die globale Suchleiste wird währenddessen ausgeblendet. */
        expect(viewport.height - popupBox.y - popupBox.height).toBeGreaterThanOrEqual(60);
        await expect(popup.getByRole("button", { name: "In diesem Bereich nach oben", exact: true })).toHaveCount(1);
        await expect(panel.getByRole("button", { name: "In diesem Bereich nach oben", exact: true })).toHaveCount(0);
        await expect(popup.getByRole("button", { name: "Anleitung & Hilfe" })).toHaveCount(0);
        await expect(popup.getByRole("link", { name: /Installation/ })).toHaveCount(0);
        await popup.getByRole("button", { name: ziel, exact: true }).click();
        await expect(popup).toBeHidden();
        if (ziel === "Start") await expect(page.locator(".kd-bereichshero")).toHaveCount(0);
        else await expect(page.locator(".kd-bereichshero h1")).toHaveText(ziel);
        await keineDokumentUeberbreite(page);
      }

      await expect(page.locator("summary", { hasText: /^Masterliste$/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Gesamt-Backup$/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Kinoprogramm-Status$/ })).toBeVisible();
      await expect(page.locator("summary", { hasText: /^Katalog-Status$/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Streaming gesperrt", exact: true })).toHaveCount(2);
      await expect(page.locator("summary", { hasText: /^Erweitert/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Darstellung & Verhalten$/ })).toBeVisible();
      await expect(page.locator("summary", { hasText: /^Konto & Geräte-Sync$/ })).toBeVisible();
      await expect(page.locator("summary", { hasText: /^KI-Vokabular$/ })).toBeVisible();

      await globaleSuche.getByRole("textbox", { name: "Sucheingabe" }).fill("Wo finde ich die Schriftgröße?");
      await globaleSuche.getByRole("button", { name: "Suchen" }).click();
      const suchdialog = page.getByRole("dialog", { name: /Suchergebnisse für Wo finde ich die Schriftgröße/ });
      await expect(suchdialog).toBeVisible();
      await expect(suchdialog.getByRole("button", { name: /Schriftgröße ändern/ })).toBeFocused();
      await expect(suchdialog.getByText("Schriftgröße ändern", { exact: true })).toBeVisible();
      await expect(suchdialog.getByText("Öffne Settings → Darstellung & Verhalten → Schriftgröße.", { exact: true })).toBeVisible();
      await suchdialog.getByRole("button", { name: /Schriftgröße ändern/ }).click();
      await expect(page.locator(".kd-bereichshero h1")).toHaveText("Settings");

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

for (const viewport of VIEWPORTS) {
  test(`Neon Noir bleibt dekorativ und im iPhone-Viewport ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await blockiereFremdnetz(page);
    await seedAppMitDarstellung(page, { modus: "neon-noir" });
    await page.goto("/");

    const overlay = page.locator('.kd-fx-neon-noir[aria-hidden="true"]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS("pointer-events", "none");
    await expect(page.locator('.kd-wrap.kd-neon-noir')).toHaveCount(1);
    await expect(page.locator('[data-kd-theme="neon-noir"]')).toHaveCount(1);
    await expect(overlay.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).toHaveCount(0);
    await expect(overlay.locator(".kd-neon-noir__city--mobile")).toBeVisible();
    await expect(overlay.locator(".kd-neon-noir__city--desktop")).toBeHidden();
    const regen = overlay.locator("svg.kd-neon-noir__rain");
    await expect(regen).toBeVisible();
    await expect(regen.locator("pattern")).toHaveCount(2);
    await expect(regen.locator("pattern path")).toHaveCount(7);

    const geometrie = await overlay.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const animiert = [el, ...el.querySelectorAll("*")].filter((knoten) => {
        const stil = getComputedStyle(knoten);
        return stil.animationName !== "none" && Number.parseFloat(stil.animationDuration) > 0;
      });
      return { links: r.left, rechts: r.right, oben: r.top, unten: r.bottom, animiert: animiert.length };
    });
    expect(geometrie.links).toBeGreaterThanOrEqual(-0.5);
    expect(geometrie.rechts).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(geometrie.oben).toBeGreaterThanOrEqual(-0.5);
    expect(geometrie.unten).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(geometrie.animiert).toBeLessThanOrEqual(2);
    await keineDokumentUeberbreite(page);

    if (viewport.name === "393x852") {
      const tropfenVariation = await regen.evaluate((svg) => {
        const strecken = [...svg.querySelectorAll("pattern path")]
          .flatMap((pfad) => [...(pfad.getAttribute("d") || "").matchAll(/l(-?\d+)\s+(\d+)/g)])
          .map((treffer) => ({ x: Number(treffer[1]), y: Number(treffer[2]) }));
        return {
          laengen: new Set(strecken.map(({ x, y }) => Math.round(Math.hypot(x, y)))).size,
          richtungen: new Set(strecken.map(({ x, y }) => Math.round((x / y) * 100))).size,
        };
      });
      expect(tropfenVariation.laengen).toBeGreaterThan(10);
      expect(tropfenVariation.richtungen).toBeGreaterThan(5);

      /* Der alte Markenmodus darf nur noch als interner Migrationswert im
         JavaScript existieren, nie als sichtbare Klasse, Grafik oder Kopie. */
      await expect(page.locator('.kd-nerv, .kd-fx-nerv, [aria-label="NERV"], img[src*="nerv"]')).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/\bNERV\b/);
      await page.reload();
      await expect(page.locator('.kd-wrap.kd-neon-noir .kd-fx-neon-noir[aria-hidden="true"]')).toHaveCount(1);
      const gespeichert = await page.evaluate(() => JSON.parse(localStorage.getItem("kd:einstellungen") || "null"));
      expect(gespeichert?.modus).toBe("neon-noir");
    }
  });
}

test("Neon Noir respektiert Reduced Motion als gestaltetes Standbild", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.clock.install({ time: new Date("2026-08-01T20:00:00Z") });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page, { modus: "neon-noir" });
  await page.goto("/");

  const overlay = page.locator('.kd-fx-neon-noir[aria-hidden="true"]');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".kd-neon-noir__city--mobile")).toBeVisible();
  for (const effekt of [".kd-neon-noir__rain", ".kd-neon-noir__mist"]) {
    await expect(overlay.locator(effekt)).toHaveCSS("animation-name", "none");
  }
  const bewegt = await overlay.evaluate((el) => [el, ...el.querySelectorAll("*")].some((knoten) => {
    const stil = getComputedStyle(knoten);
    return stil.animationName !== "none" && Number.parseFloat(stil.animationDuration) > 0;
  }));
  expect(bewegt).toBe(false);
  await page.clock.fastForward(400_000);
  await expect(overlay).not.toHaveClass(/kd-neon-noir--flyby/);
  await expect(overlay.locator(".kd-neon-noir__flyby")).toBeHidden();
  expect(await animierteOverlayEbenen(overlay)).toEqual([]);
  await keineDokumentUeberbreite(page);
});

test("Neon Noir hält den seltenen Rücklichtflug dekorativ und räumt seinen Timer auf", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.clock.install({ time: new Date("2026-08-01T20:00:00Z") });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page, { modus: "neon-noir" });
  const seitenfehler = [];
  page.on("pageerror", (fehler) => seitenfehler.push(String(fehler)));
  await page.goto("/");

  const overlay = page.locator('.kd-fx-neon-noir[aria-hidden="true"]');
  const flyby = overlay.locator(".kd-neon-noir__flyby");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS("pointer-events", "none");
  await expect(flyby).toHaveCSS("pointer-events", "none");
  await expect(flyby.locator("span")).toHaveCount(2);
  await expect(overlay.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).toHaveCount(0);
  expect(await animierteOverlayEbenen(overlay)).toHaveLength(2);

  await page.clock.fastForward(90_000);
  await expect(overlay).toHaveClass(/kd-neon-noir--flyby/);
  await expect(flyby).toHaveCSS("animation-name", "kd-neon-noir-flyby");
  await expect(overlay.locator(".kd-neon-noir__mist")).toHaveCSS("animation-name", "none");

  for (const schritt of [0, 250, 250, 250]) {
    if (schritt) await page.clock.fastForward(schritt);
    await expect(overlay).toHaveClass(/kd-neon-noir--flyby/);
    const ebenen = await animierteOverlayEbenen(overlay);
    expect(ebenen, JSON.stringify(ebenen)).toHaveLength(2);
    expect(ebenen.map((e) => e.animation).sort()).toEqual(["kd-neon-noir-flyby", "kd-neon-noir-rain"]);
    await keineDokumentUeberbreite(page);
  }

  /* Ausschalten während des laufenden Flugs unmountet das Overlay. Der noch
     offene End-Timer und der geplante Folgeflug dürfen es nicht zurückholen. */
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /Saal \(Dunkel\)/i }).click();
  await expect(page.locator(".kd-fx-neon-noir")).toHaveCount(0);
  await page.clock.fastForward(400_000);
  await expect(page.locator(".kd-fx-neon-noir")).toHaveCount(0);
  expect(seitenfehler).toEqual([]);
  await keineDokumentUeberbreite(page);
});

test("Deep Space trifft beim gespeicherten Neon-Eintritt genau einmal und bleibt flüchtig", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-08-02T10:00:00Z") });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { rng: 0 });
  await page.goto("/");

  const wurzel = page.locator('.kd-wrap.kd-neon-noir.kd-deep-space-horror[data-kd-effect="deep-space-horror"]');
  const deep = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
  await expect(wurzel).toHaveCount(1);
  await expect(deep).toBeVisible();
  await expect(page.locator(".kd-fx-neon-noir")).toHaveCount(0);

  const ersterEintritt = await lokaleDeepDaten(page);
  expect(ersterEintritt.einstellungen?.modus).toBe("neon-noir");
  expect(ersterEintritt.einstellungen?.modus).not.toBe("deep-space-horror");
  expect(ersterEintritt.rhythmus).toMatchObject({
    version: 1,
    lastAttempt: "2026-08-02",
    nextEligible: "2026-08-07",
    lastSeen: "2026-08-02",
  });
  expect(ersterEintritt.rngCalls).toBe(1);

  await page.reload();
  await expect(page.locator('.kd-wrap.kd-neon-noir[data-kd-effect]')).toHaveCount(0);
  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
  await expect(page.locator('.kd-fx-neon-noir[aria-hidden="true"]')).toBeVisible();
  const nachReload = await lokaleDeepDaten(page);
  expect(nachReload.einstellungen?.modus).toBe("neon-noir");
  expect(nachReload.rhythmusRoh).toBe(ersterEintritt.rhythmusRoh);
  expect(nachReload.rngCalls).toBe(1);
});

test("Deep Space verfehlt an der RNG-Grenze und plant drei Kalendertage", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-08-02T10:00:00Z") });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { rng: 0.1 });
  await page.goto("/");

  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
  await expect(page.locator('.kd-fx-neon-noir[aria-hidden="true"]')).toBeVisible();
  const daten = await lokaleDeepDaten(page);
  expect(daten.einstellungen?.modus).toBe("neon-noir");
  expect(daten.rhythmus).toMatchObject({
    lastAttempt: "2026-08-02",
    nextEligible: "2026-08-05",
    lastSeen: "2026-08-02",
  });
  expect(daten.rngCalls).toBe(1);
});

for (const viewport of VIEWPORTS) {
  test(`Deep Space nutzt die mobile Korridorkomposition ohne Überbreite ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await blockiereFremdnetz(page);
    await seedDeepSpaceApp(page, { rng: 0 });
    await page.goto("/");

    const wurzel = page.locator('.kd-wrap.kd-deep-space-horror[data-kd-effect="deep-space-horror"]');
    const overlay = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
    await expect(wurzel).toHaveCount(1);
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS("pointer-events", "none");
    await expect(overlay.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).toHaveCount(0);
    await expect(overlay.locator(".kd-deep-space__scene--mobile")).toBeVisible();
    await expect(overlay.locator(".kd-deep-space__scene--desktop")).toBeHidden();

    const geometrie = await overlay.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { links: r.left, rechts: r.right, oben: r.top, unten: r.bottom };
    });
    expect(geometrie.links).toBeGreaterThanOrEqual(-0.5);
    expect(geometrie.rechts).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(geometrie.oben).toBeGreaterThanOrEqual(-0.5);
    expect(geometrie.unten).toBeLessThanOrEqual(viewport.height + 0.5);
    const ebenen = await animierteOverlayEbenen(overlay);
    expect(ebenen.length, JSON.stringify(ebenen)).toBeLessThanOrEqual(2);
    expect(ebenen.map((e) => e.animation)).toContain("kd-deep-space-beacon");
    await keineDokumentUeberbreite(page);
  });
}

test("Deep Space wechselt am Desktop auf die breite Korridorkomposition", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { rng: 0 });
  await page.goto("/");

  const overlay = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".kd-deep-space__scene--desktop")).toBeVisible();
  await expect(overlay.locator(".kd-deep-space__scene--mobile")).toBeHidden();
  const ebenen = await animierteOverlayEbenen(overlay);
  expect(ebenen.length, JSON.stringify(ebenen)).toBeLessThanOrEqual(2);
  expect(ebenen.map((e) => e.animation)).toContain("kd-deep-space-beacon");
  await keineDokumentUeberbreite(page);
});

test("Deep Space ist mit Reduced Motion ein vollständig statischer Korridor", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-08-02T10:00:00Z") });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { rng: 0 });
  await page.goto("/");

  const overlay = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".kd-deep-space__scene--mobile")).toBeVisible();
  await expect(overlay.locator(".kd-deep-space__steam")).toBeHidden();
  await expect(overlay.locator(".kd-deep-space__steam-burst, .kd-deep-space__sparks")).toHaveCount(0);
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  expect((await lokaleDeepDaten(page)).eventTimer).toEqual([]);
  expect(await animierteOverlayEbenen(overlay)).toEqual([]);

  await page.clock.fastForward(400_000);
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  expect((await lokaleDeepDaten(page)).eventTimer).toEqual([]);
  expect(await animierteOverlayEbenen(overlay)).toEqual([]);
  await keineDokumentUeberbreite(page);
});

test("Deep Space hält Licht-, Dampf- und Warnereignisse seriell", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { rng: 0, eventRng: 0, compressedEventTimers: true });
  const seitenfehler = [];
  page.on("pageerror", (fehler) => seitenfehler.push(String(fehler)));
  await page.goto("/");

  const overlay = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
  await expect(overlay).toBeVisible();
  await warteAufEventScheduler(page);
  await protokolliereFolgetimer(page);
  expect((await laufendeOverlayAnimationen(overlay)).length).toBeLessThanOrEqual(2);
  await starteErstesAmbientEvent(page, overlay);
  await expect(overlay.locator(".kd-deep-space__steam")).toHaveCSS("animation-name", "none");
  await expect(overlay.locator(".kd-deep-space__lights").first()).toHaveCSS("animation-name", "none");
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);

  await expect(overlay).toHaveClass(/kd-deep-space--event-light-flicker/);
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  await expect(overlay).toHaveClass(/kd-deep-space--event-steam-burst/);
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  await expect(overlay).toHaveClass(/kd-deep-space--event-light-flicker/);
  expect(await protokollierteFolgetimer(page)).toEqual(expect.arrayContaining([
    800, 14_000, 680,
  ]));
  await expect(overlay.locator(".kd-deep-space__creature, .kd-deep-space__blood")).toHaveCount(0);

  await waehleMobileTab(page, "Settings");
  await page.getByRole("button", { name: /Saal \(Dunkel\)/i }).click();
  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
  await expect(page.locator('[data-kd-effect="deep-space-horror"]')).toHaveCount(0);
  const nachAusschalten = await lokaleDeepDaten(page);
  expect(nachAusschalten.einstellungen?.modus).toBe("");
  expect(nachAusschalten.einstellungen?.modus).not.toBe("deep-space-horror");
  await page.waitForTimeout(1_500);
  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
  expect(seitenfehler).toEqual([]);
});

test("Deep Space hält auch den maximalen 36-Sekunden-Rhythmus und wiederholt kein Licht direkt", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { rng: 0, eventRng: 1, compressedEventTimers: true });
  await page.goto("/");

  const overlay = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
  await warteAufEventScheduler(page);
  await protokolliereFolgetimer(page);
  await expect(overlay).toHaveClass(/kd-deep-space--event-beacon-sweep/);
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  await expect(overlay).toHaveClass(/kd-deep-space--event-sparks/);
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  await expect(overlay).toHaveClass(/kd-deep-space--event-beacon-sweep/);
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  expect(await protokollierteFolgetimer(page)).toEqual(expect.arrayContaining([
    2_800, 36_000, 900,
  ]));
  await expect(overlay.locator(".kd-deep-space__creature, .kd-deep-space__blood")).toHaveCount(0);
});

for (const ambient of [
  { type: "steam-burst", zufall: 0, selector: ".kd-deep-space__steam-burst", dauer: 800, cssDauer: "0.8s" },
  { type: "light-flicker", zufall: 0.26, selector: ".kd-deep-space__flicker-light", dauer: 680, cssDauer: "0.68s" },
  { type: "sparks", zufall: 0.51, selector: ".kd-deep-space__sparks", dauer: 900, cssDauer: "0.9s" },
  { type: "beacon-sweep", zufall: 0.76, selector: ".kd-deep-space__beacon", dauer: 2_800, cssDauer: "2.1s" },
]) {
  test(`Deep Space Ambient ${ambient.type} pausiert die Basis und räumt exakt auf`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.clock.install({ time: new Date("2026-08-02T10:00:00Z") });
    await blockiereFremdnetz(page);
    await seedDeepSpaceApp(page, {
      rng: 0,
      eventRng: 0,
      eventChoiceValues: [ambient.zufall],
      skipTimerInstrumentation: true,
    });
    await page.goto("/");

    const overlay = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
    await warteAufEventScheduler(page);
    await protokolliereFolgetimer(page);
    await page.clock.runFor(14_000);
    await expect(overlay).toHaveClass(new RegExp(`kd-deep-space--event-${ambient.type}`));
    const element = ambient.type === "light-flicker"
      ? overlay.locator(".kd-deep-space__scene--mobile").locator(ambient.selector)
      : overlay.locator(ambient.selector);
    await expect(element).toHaveCount(1);
    await expect(element).toHaveCSS("animation-duration", ambient.cssDauer);
    await expect(overlay.locator(".kd-deep-space__steam")).toHaveCSS("animation-name", "none");
    await expect(overlay.locator(".kd-deep-space__lights").first()).toHaveCSS("animation-name", "none");
    expect((await laufendeOverlayAnimationen(overlay)).length).toBeLessThanOrEqual(2);
    expect(await protokollierteFolgetimer(page)).toContain(ambient.dauer);
    await keineDokumentUeberbreite(page);

    await page.clock.runFor(ambient.dauer);
    await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
    if (["steam-burst", "sparks"].includes(ambient.type)) {
      await expect(overlay.locator(ambient.selector)).toHaveCount(0);
    }
    await keineDokumentUeberbreite(page);
  });
}

test("Deep-Space-Altbestand wird still freigeschaltet und würfelt nicht spontan", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-08-02T10:00:00Z") });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, {
    rng: 0,
    achievement: false,
    filme: [...DREI_DEEP_FILME, deepSpaceFilm("2001: A Space Odyssey", 1968)],
  });
  await page.goto("/");

  await expect.poll(async () => (await lokaleDeepDaten(page)).achievements?.eggs || [])
    .toContain(DEEP_ACHIEVEMENT);
  await expect(page.locator(".kd-toast")).toHaveCount(0);
  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
  await expect(page.locator('.kd-fx-neon-noir[aria-hidden="true"]')).toBeVisible();
  const daten = await lokaleDeepDaten(page);
  expect(daten.rhythmusRoh).toBeNull();
  expect(daten.rngCalls).toBe(0);
});

test("Der vierte Film zeigt genau vier Sekunden nur den unsichtbaren Achievement-Toast", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-08-02T10:00:00Z") });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { rng: 0, achievement: false, filme: DREI_DEEP_FILME });
  await page.goto("/");

  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
  await waehleMobileTab(page, "Mediathek");
  await page.getByRole("button", { name: "+ Eintrag hinzufügen" }).click();
  await page.getByPlaceholder("Titel *").fill("Alien: Romulus");
  await page.getByPlaceholder("Jahr *").fill("2024");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();

  const toast = page.locator(".kd-toast");
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveText("Easteregg freigeschalten!");
  await expect.poll(async () => (await lokaleDeepDaten(page)).achievements?.eggs || [])
    .toContain(DEEP_ACHIEVEMENT);
  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
  let daten = await lokaleDeepDaten(page);
  expect(daten.rhythmusRoh).toBeNull();
  expect(daten.rngCalls).toBe(0);
  expect(daten.toastTimer).toEqual([4000]);

  await page.clock.fastForward(4_000);
  await expect(toast).toHaveCount(0);

  await waehleMobileTab(page, "Settings");
  await page.getByRole("button", { name: /Saal \(Dunkel\)/i }).click();
  await page.locator("summary", { hasText: /^Über & Rechtliches$/ }).click();
  await page.locator('span[title="…"]', { hasText: /^Max$/ }).evaluate((el) => el.click());
  await page.getByRole("button", { name: /Dauerburner/i }).click();
  await expect(page.locator('.kd-wrap.kd-deep-space-horror[data-kd-effect="deep-space-horror"]')).toHaveCount(1);
  daten = await lokaleDeepDaten(page);
  expect(daten.einstellungen?.modus).toBe("neon-noir");
  expect(daten.rhythmus?.nextEligible).toBe("2026-08-07");
  expect(daten.rngCalls).toBe(1);
});

test("Lokale Deep-Space-Animationswerkstatt steuert alle Effekte ohne echten Eintritt", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedDeepSpaceApp(page, { achievement: false, modus: "", rng: 0, eventRng: 0 });
  await page.goto("/?deep-space-test=1");

  const wurzel = page.locator('[data-kd-deep-space-test="aktiv"]');
  const overlay = page.locator('.kd-fx-deep-space[aria-hidden="true"]');
  const panel = page.getByRole("complementary", { name: "Deep-Space-Animationswerkstatt" });
  await expect(wurzel).toHaveClass(/kd-deep-space-horror/);
  await expect(wurzel).toHaveCSS("animation-name", "kd-deep-space-ambient-flicker");
  await expect(overlay).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(panel.getByText("bereit", { exact: true })).toBeVisible();
  expect(await page.locator(".kd-app").evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Space Mono");
  expect(await page.getByRole("heading", { name: "Dein Abend" }).evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Barlow Condensed");
  await expect(page.getByRole("button", { name: "Menü öffnen" })).toHaveCSS("border-radius", "2px");
  expect((await lokaleDeepDaten(page)).rhythmusRoh).toBeNull();
  expect((await lokaleDeepDaten(page)).rngCalls).toBe(0);
  expect((await lokaleDeepDaten(page)).eventRngCalls).toBe(0);

  const einzelereignisse = [
    ["Dampfstoß", "steam-burst", ".kd-deep-space__steam-burst"],
    ["Lichtflackern", "light-flicker", ".kd-deep-space__flicker-light"],
    ["Funkenregen", "sparks", ".kd-deep-space__sparks"],
    ["Drehleuchte", "beacon-sweep", ".kd-deep-space__beacon"],
  ];
  for (const [knopf, type, selector] of einzelereignisse) {
    await panel.getByRole("button", { name: knopf, exact: true }).click();
    await expect(overlay).toHaveClass(new RegExp(`kd-deep-space--event-${type}`));
    await expect(overlay.locator(selector).first()).toHaveCount(1);
    await expect(wurzel).toHaveAttribute("data-kd-deep-event", type);
    if (type === "light-flicker") {
      await expect(wurzel).toHaveCSS("animation-name", "kd-deep-space-interface-flicker");
    }
    if (type === "sparks") {
      expect(await wurzel.evaluate((el) => getComputedStyle(el, "::after").animationName))
        .toBe("kd-deep-space-interface-spark");
    }
    if (type === "beacon-sweep") {
      expect(await wurzel.evaluate((el) => getComputedStyle(el, "::after").animationName))
        .toBe("kd-deep-space-interface-beacon");
    }
  }

  await expect(panel.getByRole("button", { name: /Sprung|Luke|Fernlauf|Bluttropfen/ })).toHaveCount(0);
  await expect(overlay.locator(".kd-deep-space__creature, .kd-deep-space__blood")).toHaveCount(0);

  await panel.getByRole("button", { name: "Funkenregen", exact: true }).click();
  const actor = overlay.locator(".kd-deep-space__sparks");
  await expect(actor).toBeVisible();
  await page.waitForTimeout(120);
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(overlay).toHaveClass(/kd-deep-space--test-paused/);
  await expect(actor).toHaveCSS("animation-play-state", "paused");
  /* WebKit übernimmt einen CSS-Pausezustand erst am nächsten Compositor-Tick;
     nach dem kurzen Settle müssen zwei Messungen stabil bleiben. */
  await page.waitForTimeout(90);
  const pauseStand = await actor.evaluate((el) => el.getAnimations()[0]?.currentTime || 0);
  await page.waitForTimeout(140);
  const pauseDanach = await actor.evaluate((el) => el.getAnimations()[0]?.currentTime || 0);
  expect(Math.abs(pauseDanach - pauseStand)).toBeLessThan(4);
  await panel.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(actor).toHaveCSS("animation-play-state", "running");

  await panel.getByRole("button", { name: "Stopp", exact: true }).click();
  await expect(overlay).not.toHaveClass(/kd-deep-space--event-active/);
  await expect(overlay.locator(".kd-deep-space__steam-burst, .kd-deep-space__sparks")).toHaveCount(0);
  await expect(wurzel).not.toHaveAttribute("data-kd-deep-event");
  const vorZufall = await lokaleDeepDaten(page);
  expect(vorZufall.rhythmusRoh).toBeNull();
  expect(vorZufall.rngCalls).toBe(0);
  expect(vorZufall.eventRngCalls).toBe(0);
  await panel.getByRole("button", { name: "Zufall", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Zufall", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByText("Zufallsfolge", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Testfenster minimieren" }).click();
  await expect(panel.getByRole("button", { name: "Testfenster öffnen" })).toBeVisible();
  await panel.getByRole("button", { name: "Testfenster öffnen" }).click();
  await expect(panel.getByRole("button", { name: "Drehleuchte", exact: true })).toBeVisible();

  const daten = await lokaleDeepDaten(page);
  expect(daten.einstellungen?.modus).toBe("");
  expect(daten.rhythmusRoh).toBeNull();
  expect(daten.rngCalls).toBe(0);
  await keineDokumentUeberbreite(page);

  await page.goto("/");
  await expect(page.locator(".kd-deep-space-testpanel, [data-kd-deep-space-test]")).toHaveCount(0);
  await expect(page.locator(".kd-fx-deep-space")).toHaveCount(0);
});

test("Globale Suche öffnet einen Entdecken-Treffer gezielt statt nur den Streaming-Tab", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await page.addInitScript(async () => {
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-07-31", version: "beta-2026-07-datenfreigabe-2" }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-07-31T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
    /* Der Test blockiert Fremdnetz bewusst. Ein echter Cache-Stand bildet den
       Offline-Fallback des Katalogdienstes nach und beweist zugleich, dass die
       globale Suche die volle Entdecken-Zeile statt nur UI-Navigation benutzt. */
    localStorage.setItem("kd:katalog:url", "https://abcdefghijklmnopqrst.supabase.co");
    localStorage.setItem("kd:katalog:key", "test-publishable-key-1234567890");
    const katalogCache = await caches.open("kinodreieck-katalog-v1");
    const cacheEintrag = (payload) => new Response(JSON.stringify({
      __kd: "kd-katalog-1", gecachtAm: Date.now(),
      meta: { stand: "2026-08-01T10:00:00Z", gueltig_bis: "2099-01-01T00:00:00Z" }, payload,
    }), { headers: { "Content-Type": "application/json" } });
    const basis = location.origin + "/__kd_katalog_cache__/";
    await katalogCache.put(basis + "streaming_bekannt_demo", cacheEintrag({
      demo: true, stand: "2026-08-01T10:00:00Z", region: "AT", dienste: ["Netflix"], titel: [],
    }));
    await katalogCache.put(basis + "streaming_entdecken_demo", cacheEintrag({
      demo: true, stand: "2026-08-01T10:00:00Z", region: "AT", dienste: ["Netflix"], gekuerzt: false,
      titel: [{
        watchmode_id: 900200001, titel: "Regenbogen über Kreuzberg", jahr: 2016, typ: "movie",
        genres: [], dienste: ["Netflix"], relevanz: 1.5, relevanz_signale: ["jahrzehnt:2010er(+1.5)"],
      }],
    }));
  });
  await page.goto("/");

  const globaleSuche = page.getByRole("search", { name: "Globale Suche" });
  await globaleSuche.getByRole("textbox", { name: "Sucheingabe" }).fill("Regenbogen über Kreuzberg");
  await globaleSuche.getByRole("button", { name: "Suchen" }).click();
  const suchdialog = page.getByRole("dialog", { name: /Suchergebnisse für Regenbogen über Kreuzberg/ });
  const treffer = suchdialog.getByRole("button", { name: /Streaming Regenbogen über Kreuzberg/ });
  await expect(treffer).toBeVisible();
  await treffer.click();

  await expect(page.locator(".kd-bereichshero h1")).toHaveText("Streaming");
  const ziel = page.locator('[data-streaming-suchtreffer="entdecken:900200001"]');
  await expect(ziel).toBeVisible();
  await expect(ziel).toBeFocused();
  await expect(ziel.getByText(/Passung beruht auf:/)).toBeVisible();
});

test("Gefüllte iPhone-Ansichten schneiden Karten, Editor und Profil nicht ab", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await page.addInitScript(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const wt = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()];
    const termin = `${wt} ${d.getDate()}.${d.getMonth() + 1}. 20:00 · English Cinema Haydn`;
    const filme = [
      {
        id: "totoro", film_at_id: "totoro", titel: "Mein Nachbar Totoro", originaltitel: "My Neighbor Totoro",
        jahr: 1988, typ: "film", quelle: "dvd", kategorie: "immer_gut", bewertet_von: "max",
        bewertung: { wie: 4, was: 3, warum: 5 }, genre: ["animation"], tags: [], begruendung: "Ein Testeintrag.", notiz: "",
      },
      {
        id: "blade-runner-2049", titel: "Blade Runner 2049", originaltitel: "Blade Runner 2049",
        jahr: 2017, typ: "film", quelle: "dvd+prime", kategorie: "immer_gut", bewertet_von: "max",
        bewertung: { wie: 5, was: 4, warum: 5 }, genre: ["scifi"], tags: [], begruendung: "Atmosphärisch und präzise.", notiz: "",
      },
    ];
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:master", JSON.stringify({ filme, meta: { version: "test" }, gespeichertAm: Date.now() }));
    localStorage.setItem("kd:programm-cache", JSON.stringify({
      fetchedAt: Date.now(), art: "manuell", stand: Date.now(),
      data: { stand: new Date().toISOString(), filme: [{ t: "Mein Nachbar Totoro", j: 1988, k: ["English Cinema Haydn"], z: [termin], film_at_id: "totoro" }] },
    }));
    localStorage.setItem("kd:mustwatch", JSON.stringify({ eintraege: [{
      id: "mw-1", titel: "Das siebente Siegel", jahr: 1957, typ: "film", im_besitz: true,
      erstellt_am: new Date().toISOString(), verknuepfung: { ziel: "master", id: "blade-runner-2049" },
    }] }));
    localStorage.setItem("kd:geschmacksprofil", JSON.stringify({
      format: 1, version: "p2", erstellt: "2026-07-01T00:00:00.000Z", geaendert: "2026-08-01T00:00:00.000Z",
      einwilligung: { erteilt: true, am: "2026-07-01T00:00:00.000Z", textVersion: "v1" },
      signale: ["animation", "scifi", "satire", "horror", "action", "thriller"].map((wert) => ({
        art: "genre", wert, richtung: "zieht_an", staerke: 4, sicherheit: "hoch", quelle: "schlagwort", beleg: `schlagwort:${wert}`,
      })),
      offen: [], achsen: { wie: null, was: null, warum: null }, filme: [], nichtDeutbar: [],
    }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-08-01T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
  });
  await page.goto("/");

  const ticket = page.locator(".kd-dash-ticket").first();
  await expect(ticket).toBeVisible();
  const dashboardGeometrie = await ticket.evaluate((karte) => {
    const chip = karte.querySelector(".kd-dash-showtime");
    const kr = karte.getBoundingClientRect();
    const cr = chip.getBoundingClientRect();
    return { karteRechts: kr.right, chipRechts: cr.right, chipScroll: chip.scrollWidth, chipBreite: chip.clientWidth };
  });
  expect(dashboardGeometrie.chipRechts).toBeLessThanOrEqual(dashboardGeometrie.karteRechts + 0.5);
  expect(dashboardGeometrie.chipScroll).toBeLessThanOrEqual(dashboardGeometrie.chipBreite + 1);
  await keineDokumentUeberbreite(page);

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name: "Mediathek", exact: true }).click();
  await expect(page.locator(".kd-mediathek-ansichten")).toBeVisible();
  await expect(page.locator(".kd-mediathek-typen")).toHaveCSS("grid-template-columns", /.+ .+/);
  await page.getByText("Blade Runner 2049", { exact: true }).click();
  await page.getByRole("button", { name: "✎ Bewertung bearbeiten", exact: true }).click();
  const editor = page.locator(".kd-editpanel");
  await expect(editor).toBeVisible();
  const editorGeometrie = await editor.evaluate((panel) => {
    const pr = panel.getBoundingClientRect();
    const felder = [...panel.querySelectorAll("input, select, textarea, button")].map((el) => {
      const r = el.getBoundingClientRect();
      return { links: r.left, rechts: r.right };
    });
    return { panel: { links: pr.left, rechts: pr.right }, felder };
  });
  for (const feld of editorGeometrie.felder) {
    expect(feld.links).toBeGreaterThanOrEqual(editorGeometrie.panel.links - 0.5);
    expect(feld.rechts).toBeLessThanOrEqual(editorGeometrie.panel.rechts + 0.5);
  }
  await keineDokumentUeberbreite(page);

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("summary", { hasText: /^Geschmacksprofil$/ }).click();
  await page.getByRole("button", { name: "Ändern", exact: true }).click();
  await page.getByRole("button", { name: "Aktuelle Infos", exact: true }).click();
  const signal = page.locator(".kd-profil-signal").first();
  await expect(signal).toBeVisible();
  const profilGeometrie = await signal.evaluate((zeile) => {
    const zr = zeile.getBoundingClientRect();
    const herkunft = zeile.querySelector(".kd-profil-herkunft").getBoundingClientRect();
    const auswahl = zeile.querySelector("select").getBoundingClientRect();
    const entfernen = zeile.querySelector("button").getBoundingClientRect();
    return { rechts: zr.right, herkunftUnten: herkunft.bottom, aktionOben: Math.min(auswahl.top, entfernen.top), auswahlRechts: auswahl.right, entfernenRechts: entfernen.right };
  });
  expect(profilGeometrie.aktionOben).toBeGreaterThanOrEqual(profilGeometrie.herkunftUnten - 0.5);
  expect(profilGeometrie.auswahlRechts).toBeLessThanOrEqual(profilGeometrie.rechts + 0.5);
  expect(profilGeometrie.entfernenRechts).toBeLessThanOrEqual(profilGeometrie.rechts + 0.5);
  await keineDokumentUeberbreite(page);
});

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
  await expect(page.locator(".kd-navband")).toBeHidden();
  await keineDokumentUeberbreite(page);
});
