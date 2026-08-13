import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

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

      for (const ziel of ["Kino", "Streaming", "Mediathek", "Entdecken", "Start", "Settings"]) {
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
        await expect(panel.getByRole("button", { name: "Suche", exact: true })).toHaveCount(0);
        await expect(popup.getByRole("button", { name: "Anleitung & Hilfe" })).toHaveCount(0);
        await expect(popup.getByRole("link", { name: /Installation/ })).toHaveCount(0);
        await popup.getByRole("button", { name: ziel, exact: true }).click();
        await expect(popup).toBeHidden();
        if (ziel === "Start") await expect(page.locator(".kd-bereichshero")).toHaveCount(0);
        else await expect(page.locator(".kd-bereichshero h1")).toHaveText(ziel);
        await keineDokumentUeberbreite(page);
      }

      await expect(page.locator("summary", { hasText: /^Masterliste$/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Gesamt-Backup$/ })).toBeVisible();
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
  test(`Entdecken-Verwaltung ist Full-Sheet, fokussicher und überlauffrei ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await blockiereFremdnetz(page);
    await seedAppMitDarstellung(page);
    await page.addInitScript(() => {
      localStorage.setItem("kd:radar", JSON.stringify({
        format: "kinodreieck-radar-local", version: 1, authority: "guest",
        subscriptions: [{
          targetId: "fixture:target:radar-work-01", targetType: "work", region: "AT", scope: "all",
          status: "active", authority: "local", serverRevision: null, serverChecksum: null,
          updatedAt: "2026-08-09T12:00:00.000Z",
        }],
        outbox: [], shares: [], shareOutbox: [], receipts: [],
        display: { showDismissed: false },
        server: { revision: 0, checksum: null, reconciledAt: null },
      }));
    });
    await page.goto("/");
    await waehleMobileTab(page, "Entdecken");
    await expect(page.locator(".kd-bereichshero h1")).toHaveText("Entdecken");
    await expect(page.getByRole("tab", { name: "Empfehlungen" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Radar" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Meinungen" })).toBeVisible();

    const ausloeser = page.getByRole("button", { name: /Entdecken verwalten/ });
    await ausloeser.focus();
    await ausloeser.click();
    const dialog = page.getByRole("dialog", { name: "Entdecken verwalten" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.y).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
    await expect(dialog.getByText("Noch keine Serie beobachtet.", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Synthetischer Kinofilm", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      position: document.body.style.position,
      locked: document.body.classList.contains("kd-scroll-gesperrt"),
    }))).toEqual({ position: "fixed", locked: true });
    await keineDokumentUeberbreite(page);

    const focusables = dialog.locator('button:not(:disabled),input:not(:disabled)');
    await expect(focusables.first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(focusables.last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(focusables.first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(ausloeser).toBeFocused();
    await expect.poll(() => page.evaluate(() => ({
      position: document.body.style.position,
      locked: document.body.classList.contains("kd-scroll-gesperrt"),
    }))).toEqual({ position: "", locked: false });

    await ausloeser.click();
    await page.getByRole("button", { name: "Entdecken verwalten schließen und zurück" }).click();
    await expect(page.getByRole("dialog", { name: "Entdecken verwalten" })).toBeHidden();
    await keineDokumentUeberbreite(page);
  });
}

test("Entdecken-Dialog und Radar-Vorschauen bleiben am Desktop lokal und fokussicher", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.goto("/");
  await page.locator("nav").getByRole("button", { name: "Entdecken", exact: true }).click();
  const verwalten = page.getByRole("button", { name: /Entdecken verwalten/ });
  await verwalten.focus();
  await verwalten.click();
  const manageDialog = page.getByRole("dialog", { name: "Entdecken verwalten" });
  const dialogBox = await manageDialog.boundingBox();
  expect(dialogBox.width).toBeLessThan(900);
  expect(dialogBox.height).toBeLessThan(860);
  expect(dialogBox.x).toBeGreaterThan(150);
  await page.keyboard.press("Escape");
  await expect(manageDialog).toBeHidden();
  await expect(verwalten).toBeFocused();

  await page.getByRole("tab", { name: "Radar" }).click();
  await page.getByRole("button", { name: "In mein Radar", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Ins Radar" });
  await expect(preview).toContainText("Vorschau · noch nicht gespeichert");
  await expect(preview.getByRole("checkbox")).toBeDisabled();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("kd:radar"))).toBeNull();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  await page.locator(".kd-entdecken-proposal summary").click();
  await page.getByRole("button", { name: "Synthetisches Beispiel einsetzen" }).click();
  await page.getByRole("button", { name: "Nur Vorschau prüfen" }).click();
  await expect(page.getByText("Writes: false · Routine: false · Auto-Retry: false", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("kd:radar"))).toBeNull();
  await keineDokumentUeberbreite(page);
});

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
    await expect(regen.locator("pattern path")).toHaveCount(9);
    await expect(overlay).not.toContainText("00:01");
    await expect(overlay).not.toContainText("SPÄTVORSTELLUNG");
    await expect(overlay.locator(".kd-neon-noir__kino-hologram")).toHaveCount(2);
    const kinoHologramm = overlay.locator(".kd-neon-noir__kino-hologram:visible");
    await expect(kinoHologramm.locator(".kd-neon-noir__kino-face")).toHaveCount(1);
    await expect(kinoHologramm).toHaveCSS("animation-name", "kd-neon-noir-hologram");
    await expect(kinoHologramm).toHaveCSS("animation-duration", "14.8s");
    const wienSchild = overlay.locator(".kd-neon-noir__wien-sign:visible");
    await expect(wienSchild).toHaveCount(1);
    await expect(wienSchild).toContainText("WIEN");
    await expect(overlay.locator(".kd-neon-noir__road-ads:visible .kd-neon-noir__road-ad")).toHaveCount(6);

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
          anzahl: strecken.length,
          maxLaenge: Math.max(...strecken.map(({ x, y }) => Math.hypot(x, y))),
          laengen: new Set(strecken.map(({ x, y }) => Math.round(Math.hypot(x, y)))).size,
          richtungen: new Set(strecken.map(({ x, y }) => Math.round((x / y) * 100))).size,
        };
      });
      expect(tropfenVariation.anzahl).toBeGreaterThan(35);
      expect(tropfenVariation.maxLaenge).toBeLessThan(24);
      expect(tropfenVariation.laengen).toBeGreaterThan(10);
      expect(tropfenVariation.richtungen).toBeGreaterThan(5);
      await expect(regen).toHaveCSS("animation-duration", "0.66s");

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

test("Showa-Kulisse wird mobil unvergrößert nach oben verschoben", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page, { modus: "showa" });
  await page.goto("/");

  const szene = page.locator(".kd-showa-scene");
  await expect(szene).toBeVisible();
  const box = await szene.boundingBox();
  expect(box.width).toBeCloseTo(820, 0);
  expect(box.height).toBeCloseTo(205, 0);
  expect(box.y).toBeCloseTo(852 - 205 - 70, 0);
  expect(box.y + box.height).toBeCloseTo(852 - 70, 0);
  await keineDokumentUeberbreite(page);
});

test("Showa-Wochenplan hält Schrift auf den dunklen Tickets lesbar", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page, { modus: "showa" });
  await page.goto("/");

  const tag = page.locator(".kd-wochen-tag:not(.ist-heute)").first();
  await expect(tag).toBeVisible();
  const kontraste = await tag.evaluate((karte) => {
    const rgb = (wert) => (wert.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminanz = (wert) => {
      const [rot, gruen, blau] = rgb(wert).map((kanal) => {
        const normiert = kanal / 255;
        return normiert <= 0.04045 ? normiert / 12.92 : ((normiert + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rot + 0.7152 * gruen + 0.0722 * blau;
    };
    const kontrast = (vordergrund, hintergrund) => {
      const hell = Math.max(luminanz(vordergrund), luminanz(hintergrund));
      const dunkel = Math.min(luminanz(vordergrund), luminanz(hintergrund));
      return (hell + 0.05) / (dunkel + 0.05);
    };
    const farbe = (selektor) => getComputedStyle(karte.querySelector(selektor)).color;
    const tagHintergrund = getComputedStyle(karte).backgroundColor;
    const stub = karte.querySelector(".kd-wochen-ticketstub");
    const stubHintergrund = getComputedStyle(stub).backgroundColor;
    return {
      tageszahl: kontrast(farbe(".kd-wochen-ticketstub b"), stubHintergrund),
      kuerzel: kontrast(farbe(".kd-wochen-ticketstub span"), stubHintergrund),
      wochentag: kontrast(farbe(".kd-wochen-ticketname b"), tagHintergrund),
      datum: kontrast(farbe(".kd-wochen-ticketname span"), tagHintergrund),
      frei: kontrast(farbe(".kd-wochen-frei"), tagHintergrund),
      plus: kontrast(farbe(".kd-wochen-tagplus"), getComputedStyle(karte.querySelector(".kd-wochen-tagplus")).backgroundColor),
    };
  });
  for (const [element, kontrast] of Object.entries(kontraste)) {
    expect(kontrast, `${element}: ${kontrast}`).toBeGreaterThanOrEqual(4.5);
  }
  await keineDokumentUeberbreite(page);
});

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
  await page.getByRole("button", { name: /Schon kuhl/i }).click();
  await expect(page.locator('.kd-wrap.kd-deep-space-horror[data-kd-effect="deep-space-horror"]')).toHaveCount(1);
  daten = await lokaleDeepDaten(page);
  expect(daten.einstellungen?.modus).toBe("neon-noir");
  expect(daten.rhythmus?.nextEligible).toBe("2026-08-07");
  expect(daten.rngCalls).toBe(1);
});

test("Das Musik-Hauptformular speichert eine CD als physische Besitzquelle", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.goto("/");

  await waehleMobileTab(page, "Mediathek");
  await page.getByRole("button", { name: /^Musik(?:\s|\()/ }).click();
  await page.getByRole("button", { name: "+ Musik hinzufügen", exact: true }).click();
  await expect(page.getByText("Quelle (optional — z.B. CD für Besitz)", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Titel *").fill("Audit-CD");
  await page.getByPlaceholder("Jahr").fill("2024");
  await page.getByRole("button", { name: "Physisch", exact: true }).click();
  await page.getByPlaceholder("Format wählen/suchen …").fill("CD");
  await expect(page.getByRole("button", { name: "CD ✕", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();

  await expect.poll(() => page.evaluate(() => {
    const master = JSON.parse(localStorage.getItem("kd:master") || "{}");
    const musik = (master.filme || []).find((eintrag) => eintrag.titel === "Audit-CD");
    return musik ? `${musik.typ}:${musik.quelle}:${musik.jahr}` : "fehlt";
  })).toBe("musik:cd:2024");
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
  /* WebKit übernimmt den CSS-Pausezustand asynchron im Compositor. Auf einem
     ausgelasteten CI-Runner ist ein festes Settle-Fenster nicht belastbar;
     gepollt wird trotzdem die echte Invariante: zwei zeitlich getrennte
     Messungen dürfen nicht weiterlaufen. */
  await expect.poll(async () => {
    const pauseStand = await actor.evaluate((el) => el.getAnimations()[0]?.currentTime || 0);
    await page.waitForTimeout(100);
    const pauseDanach = await actor.evaluate((el) => el.getAnimations()[0]?.currentTime || 0);
    return Math.abs(pauseDanach - pauseStand);
  }, { timeout: 4_000 }).toBeLessThan(4);
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

test("Globale Suche bleibt beim Tastatur-Panning am Visual Viewport verankert", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.addInitScript(() => {
    const listener = { resize: new Set(), scroll: new Set() };
    const viewport = {
      width: 393, height: 852, offsetTop: 0, offsetLeft: 0,
      pageTop: 0, pageLeft: 0, scale: 1,
      addEventListener(typ, fn) { listener[typ]?.add(fn); },
      removeEventListener(typ, fn) { listener[typ]?.delete(fn); },
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    window.__kdSetVisualViewport = ({ height, offsetTop, typ = "resize" }) => {
      viewport.height = height;
      viewport.offsetTop = offsetTop;
      viewport.pageTop = offsetTop;
      for (const fn of listener[typ] || []) fn(new Event(typ));
    };
  });
  await page.goto("/");

  const suche = page.getByRole("search", { name: "Globale Suche" });
  await suche.getByRole("textbox", { name: "Sucheingabe" }).focus();
  await page.evaluate(() => window.__kdSetVisualViewport({ height: 500, offsetTop: 60 }));
  await expect(suche).toHaveClass(/tastatur-offen/);
  await expect.poll(() => suche.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.round(rect.bottom - window.visualViewport.offsetTop - window.visualViewport.height);
  })).toBe(-8);

  await page.evaluate(() => window.__kdSetVisualViewport({ height: 500, offsetTop: 140, typ: "scroll" }));
  await expect.poll(() => suche.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.round(rect.bottom - window.visualViewport.offsetTop - window.visualViewport.height);
  })).toBe(-8);
});

test("Globale Suche öffnet einen Entdecken-Treffer gezielt statt nur den Streaming-Tab", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await page.addInitScript(async () => {
    const heute = new Date();
    const zwei = (wert) => String(wert).padStart(2, "0");
    const heuteIso = `${heute.getFullYear()}-${zwei(heute.getMonth() + 1)}-${zwei(heute.getDate())}`;
    const wochentag = heute.getDay() || 7;
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-07-31", version: "beta-2026-07-datenfreigabe-2" }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-07-31T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
    localStorage.setItem("kd:wochenplan", JSON.stringify({ version: 1, eintraege: [{
      id: "regenbogen-heute", titel: "Regenbogen über Kreuzberg", art: "termin",
      plattform: "Netflix", startdatum: heuteIso, wochentage: [wochentag],
      intervall_wochen: 1, ende: { typ: "nie" }, aktiv: true,
      ref: { watchmode_id: 900200001, streaming_art: "entdecken", auto: true },
    }] }));
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
    const fueller = Array.from({ length: 300 }, (_, index) => ({
      watchmode_id: 910000000 + index, titel: `A Füller ${String(index).padStart(3, "0")}`,
      jahr: 2000 + (index % 25), typ: "movie", genres: [], dienste: ["Netflix"],
    }));
    await katalogCache.put(basis + "streaming_entdecken_demo", cacheEintrag({
      demo: true, stand: "2026-08-01T10:00:00Z", region: "AT", dienste: ["Netflix"], gekuerzt: false,
      titel: [...fueller, {
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
  await expect.poll(async () => ziel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  })).toBe(true);
  await expect(ziel.getByText(/Passung beruht auf:/)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Entdecken sortieren" })).toBeVisible();

  /* Derselbe Sprung muss ohne vorgeschaltete globale Suche funktionieren:
     Beim Reload ist zunächst nur der kleine Bundle-Snapshot da. Erst der Klick
     auf den Wochenpin lädt die 301 Karten und darf den Fokus danach setzen. */
  await page.reload();
  const wochenPin = page.locator(".kd-wochen-eintrag").filter({ hasText: "Regenbogen über Kreuzberg" }).first();
  await wochenPin.locator("summary").click();
  await wochenPin.getByRole("button", { name: "Eintrag ansehen" }).click();
  /* 200 regulär paginierte Karten plus genau der eine gewählte Treffer. */
  await expect(page.locator(".kd-entdecken-karte")).toHaveCount(201);
  await expect(ziel).toBeFocused();
  await expect.poll(async () => ziel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  })).toBe(true);
});

test("Ein verknüpfter Wochenreminder bleibt bei fehlendem Katalog ohne tote Zielaktion sichtbar", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.addInitScript(() => {
    const heute = new Date();
    const zwei = (wert) => String(wert).padStart(2, "0");
    const heuteIso = `${heute.getFullYear()}-${zwei(heute.getMonth() + 1)}-${zwei(heute.getDate())}`;
    localStorage.setItem("kd:wochenplan", JSON.stringify({ version: 1, eintraege: [{
      id: "offline-reminder", titel: "Offline erhaltene Serie", art: "folge",
      plattform: "Streamingdienst", startdatum: heuteIso, wochentage: [heute.getDay() || 7],
      intervall_wochen: 1, ende: { typ: "nie" }, aktiv: true,
      notiz: "Diese Notiz bleibt auch offline sichtbar.",
      ref: { watchmode_id: 987654321, streaming_art: "entdecken", auto: true },
    }] }));
  });
  await page.goto("/");

  const reminder = page.locator(".kd-wochen-eintrag").filter({ hasText: "Offline erhaltene Serie" }).first();
  await expect(reminder).toBeVisible();
  await reminder.locator("summary").click();
  await expect(reminder.getByText("Diese Notiz bleibt auch offline sichtbar.")).toBeVisible();
  await expect(reminder.getByRole("status")).toHaveText("Verknüpfung derzeit nicht verfügbar.");
  await expect(reminder.getByRole("button", { name: "Eintrag ansehen" })).toHaveCount(0);
  await expect(reminder.getByRole("button", { name: "Titel anlegen" })).toHaveCount(0);
  await expect(reminder.getByRole("button", { name: "Verknüpfung lösen" })).toBeVisible();
  await expect(reminder.getByRole("button", { name: "Bearbeiten" })).toBeVisible();
});

test("Wochenplan verlangt vor der Titelanlage ein Jahr und erzeugt danach die kanonische ID", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.addInitScript(() => {
    const heute = new Date();
    const zwei = (wert) => String(wert).padStart(2, "0");
    const heuteIso = `${heute.getFullYear()}-${zwei(heute.getMonth() + 1)}-${zwei(heute.getDate())}`;
    localStorage.setItem("kd:wochenplan", JSON.stringify({ version: 1, eintraege: [{
      id: "jahr-pflicht-reminder", titel: "D4 Jahresprobe Serie", art: "folge",
      plattform: "Testdienst", startdatum: heuteIso, wochentage: [heute.getDay() || 7],
      intervall_wochen: 1, ende: { typ: "nie" }, aktiv: true,
      notiz: "Reminder bleibt erhalten.", ref: null, link_modus: "keiner",
    }] }));
  });
  await page.goto("/");

  let reminder = page.locator(".kd-wochen-eintrag").filter({ hasText: "D4 Jahresprobe Serie" }).first();
  await reminder.locator("summary").click();
  await expect(reminder.getByRole("button", { name: "Titel anlegen" })).toHaveCount(0);
  await expect(reminder.getByRole("button", { name: "Jahr ergänzen" })).toBeVisible();
  await reminder.getByRole("button", { name: "Jahr ergänzen" }).click();

  const editor = page.locator("#kd-wochen-editor");
  await expect(editor.getByLabel("Jahr (für Titelanlage)")).toBeVisible();
  await editor.getByLabel("Jahr (für Titelanlage)").fill("2024");
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem("kd:wochenplan") || "{}");
    const eintrag = plan.eintraege?.find((wert) => wert.id === "jahr-pflicht-reminder");
    return `${eintrag?.jahr}:${eintrag?.notiz}:${eintrag?.ref == null}`;
  })).toBe("2024:Reminder bleibt erhalten.:true");
  await expect.poll(() => page.evaluate(() => {
    const master = JSON.parse(localStorage.getItem("kd:master") || "{}");
    return (master.filme || []).some((film) => film.titel === "D4 Jahresprobe Serie");
  })).toBe(false);

  reminder = page.locator(".kd-wochen-eintrag").filter({ hasText: "D4 Jahresprobe Serie" }).first();
  if (!(await reminder.evaluate((element) => element.open))) await reminder.locator("summary").click();
  await expect(reminder.getByRole("button", { name: "Titel anlegen" })).toBeVisible();
  await reminder.getByRole("button", { name: "Titel anlegen" }).click();

  await expect.poll(() => page.evaluate(() => {
    const master = JSON.parse(localStorage.getItem("kd:master") || "{}");
    const film = (master.filme || []).find((wert) => wert.id === "d4_jahresprobe_serie_2024");
    return film ? `${film.jahr}:${film.typ}:${film.bewertung === null}` : "fehlt";
  })).toBe("2024:serie:true");
  await expect.poll(() => page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem("kd:wochenplan") || "{}");
    const eintrag = plan.eintraege?.find((wert) => wert.id === "jahr-pflicht-reminder");
    return `${eintrag?.jahr}:${eintrag?.notiz}:${eintrag?.ref?.master_id}`;
  })).toBe("2024:Reminder bleibt erhalten.:d4_jahresprobe_serie_2024");
});

test("Ein eindeutiger Auto-Link ist vor dem ersten Speichern sichtbar und abwählbar", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.addInitScript(() => {
    localStorage.setItem("kd:master", JSON.stringify({
      meta: { version: "auto-link-vorschau" }, gespeichertAm: Date.now(),
      filme: [{
        id: "auto-link-film", titel: "Auto Link Film", originaltitel: "Auto Link Film",
        jahr: 2026, typ: "film", quelle: "dvd", kategorie: "sehenswert",
        bewertet_von: "max", bewertung: { wie: 3, was: 3, warum: 3 },
        genre: [], tags: [], begruendung: "", notiz: "",
      }],
    }));
  });
  await page.goto("/");

  await page.locator(".kd-wochen-tagplus").first().click();
  let editor = page.locator("#kd-wochen-editor");
  await editor.getByLabel("Titel", { exact: true }).fill("Auto Link Film");
  await expect(editor.getByText("Wird automatisch verknüpft: Auto Link Film · Mediathek")).toBeVisible();
  await editor.getByRole("button", { name: "Nicht verknüpfen" }).click();
  await expect(editor.getByRole("radio", { name: /Nicht verknüpfen/ })).toBeChecked();
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const eintrag = JSON.parse(localStorage.getItem("kd:wochenplan") || "{}").eintraege?.[0];
    return `${eintrag?.link_modus}:${eintrag?.ref == null}`;
  })).toBe("keiner:true");

  await page.locator(".kd-wochen-tagplus").first().click();
  editor = page.locator("#kd-wochen-editor");
  await editor.getByLabel("Titel", { exact: true }).fill("Auto Link Film");
  await expect(editor.getByText("Wird automatisch verknüpft: Auto Link Film · Mediathek")).toBeVisible();
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const eintrag = JSON.parse(localStorage.getItem("kd:wochenplan") || "{}").eintraege?.[1];
    return `${eintrag?.link_modus}:${eintrag?.ref?.master_id}`;
  })).toBe("auto:auto-link-film");
  const verknuepft = page.locator(".kd-wochen-eintrag").filter({ hasText: "Auto Link Film" }).last();
  await verknuepft.locator("summary").click();
  await expect(verknuepft.getByText("Automatisch verknüpft: Auto Link Film · Mediathek")).toBeVisible();
  await expect(verknuepft.getByRole("button", { name: "Verknüpfung lösen" })).toBeVisible();
});

test("Eine sichtbare automatische Reminder-Verknüpfung lässt sich dauerhaft lösen", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.addInitScript(() => {
    const heute = new Date();
    const zwei = (wert) => String(wert).padStart(2, "0");
    const heuteIso = `${heute.getFullYear()}-${zwei(heute.getMonth() + 1)}-${zwei(heute.getDate())}`;
    const film = {
      id: "stop-making-sense", titel: "Stop Making Sense", originaltitel: "Stop Making Sense",
      jahr: 1984, typ: "film", quelle: "bluray", kategorie: "immer_gut",
      bewertet_von: "max", bewertung: { wie: 5, was: 4, warum: 5 },
      genre: [], tags: [], begruendung: "", notiz: "",
    };
    localStorage.setItem("kd:master", JSON.stringify({
      meta: { version: "wochenplan-link-test" }, filme: [film], gespeichertAm: Date.now(),
    }));
    localStorage.setItem("kd:wochenplan", JSON.stringify({ version: 1, eintraege: [{
      id: "auto-link", titel: film.titel, art: "termin", startdatum: heuteIso,
      wochentage: [heute.getDay() || 7], intervall_wochen: 1,
      ende: { typ: "nie" }, aktiv: true, link_modus: "auto",
      ref: { master_id: film.id, auto: true },
    }] }));
  });
  await page.goto("/");

  let reminder = page.locator(".kd-wochen-eintrag").filter({ hasText: "Stop Making Sense" }).first();
  await reminder.locator("summary").click();
  await expect(reminder.getByText("Automatisch verknüpft: Stop Making Sense · Mediathek")).toBeVisible();
  await expect(reminder.getByRole("button", { name: "Eintrag ansehen" })).toBeVisible();
  await expect(reminder.getByRole("button", { name: "Verknüpfung lösen" })).toBeVisible();
  await reminder.getByRole("button", { name: "Bearbeiten" }).click();

  const editor = page.locator("#kd-wochen-editor");
  await expect(editor.getByText("Automatisch verknüpft: Stop Making Sense · Mediathek")).toBeVisible();
  await editor.getByRole("button", { name: "Verknüpfung lösen" }).click();
  await expect(editor.getByRole("radio", { name: /Nicht verknüpfen/ })).toBeChecked();
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();

  await expect.poll(() => page.evaluate(() => {
    const eintrag = JSON.parse(localStorage.getItem("kd:wochenplan") || "{}").eintraege?.[0];
    return `${eintrag?.link_modus}:${eintrag?.ref == null}`;
  })).toBe("keiner:true");
  reminder = page.locator(".kd-wochen-eintrag").filter({ hasText: "Stop Making Sense" }).first();
  await expect(reminder).toBeVisible();
  await reminder.locator("summary").click();
  await expect(reminder.getByRole("button", { name: "Eintrag ansehen" })).toHaveCount(0);
  await expect(reminder.getByRole("button", { name: "Verknüpfung lösen" })).toHaveCount(0);
  await expect(reminder.getByText(/Automatisch verknüpft:/)).toHaveCount(0);
});

test("Suche und Wochenplan öffnen den gewählten Streaming-Eintrag eindeutig", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await page.addInitScript(async () => {
    const film = {
      id: "twin-signal-programm", titel: "Twin Signal", originaltitel: "Twin Signal",
      jahr: 2026, typ: "serie", quelle: "streaming", kategorie: "sehenswert",
      bewertet_von: "max", bewertung: { wie: 3, was: 3, warum: 3 },
      genre: [], tags: [], begruendung: "", notiz: "",
    };
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:master", JSON.stringify({ filme: [film], meta: { version: "test" }, gespeichertAm: Date.now() }));
    localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-08-02", version: "beta-2026-07-datenfreigabe-2" }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-08-02T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
    localStorage.setItem("kd:katalog:url", "https://abcdefghijklmnopqrst.supabase.co");
    localStorage.setItem("kd:katalog:key", "test-publishable-key-1234567890");
    const katalogCache = await caches.open("kinodreieck-katalog-v1");
    const cacheEintrag = (payload) => new Response(JSON.stringify({
      __kd: "kd-katalog-1", gecachtAm: Date.now(),
      meta: { stand: "2026-08-02T10:00:00Z", gueltig_bis: "2099-01-01T00:00:00Z" }, payload,
    }), { headers: { "Content-Type": "application/json" } });
    const basis = location.origin + "/__kd_katalog_cache__/";
    await katalogCache.put(basis + "streaming_bekannt_demo", cacheEintrag({
      demo: true, stand: "2026-08-02T10:00:00Z", region: "AT", dienste: ["Netflix"],
      titel: [{ ...film, typ: "tv_series", watchmode_id: 42001, dienste: ["Netflix"], web_urls: {} }],
    }));
    await katalogCache.put(basis + "streaming_entdecken_demo", cacheEintrag({
      demo: true, stand: "2026-08-02T10:00:00Z", region: "AT", dienste: ["Netflix", "Crunchyroll"], gekuerzt: false,
      titel: [
        { watchmode_id: 43001, titel: "Mirror Signal", jahr: 2024, typ: "tv_series", genres: [], dienste: ["Netflix"] },
        { watchmode_id: 43002, titel: "Mirror Signal", jahr: 2025, typ: "tv_series", genres: [], dienste: ["Crunchyroll"] },
      ],
    }));
  });
  await page.goto("/");

  const globaleSuche = page.getByRole("search", { name: "Globale Suche" });
  await globaleSuche.getByRole("textbox", { name: "Sucheingabe" }).fill("Twin Signal");
  await globaleSuche.getByRole("button", { name: "Suchen" }).click();
  const dialog = page.getByRole("dialog", { name: /Suchergebnisse für Twin Signal/ });
  await dialog.getByRole("button", { name: /Streaming Twin Signal 2026/ }).click();
  await expect(page.locator('[data-streaming-suchtreffer="programm:twin-signal-programm"]').first()).toBeFocused();

  await page.reload();
  await page.locator(".kd-wochen-tagplus").first().click();
  const editor = page.locator("#kd-wochen-editor");
  await editor.getByLabel("Art").selectOption("folge");
  await editor.getByLabel("Titel", { exact: true }).fill("Mirror Signal");
  const auswahl = editor.getByRole("group", { name: "Passenden Eintrag wählen (optional)" });
  await expect(auswahl).toBeVisible();
  await expect(auswahl.getByRole("radio", { name: /Nicht verknüpfen/ })).toBeChecked();
  await auswahl.getByRole("radio", { name: /Mirror Signal.*2025.*Crunchyroll/ }).check();
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();

  const pin = page.locator(".kd-wochen-eintrag").filter({ hasText: "Mirror Signal" }).first();
  await pin.locator("summary").click();
  await pin.getByRole("button", { name: "Bearbeiten" }).click();
  const jahrEditor = page.locator("#kd-wochen-editor");
  await jahrEditor.getByLabel("Jahr (für Titelanlage)").fill("2024");
  await expect(jahrEditor.getByText("Wird automatisch verknüpft: Mirror Signal · Streaming")).toBeVisible();
  await jahrEditor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const eintrag = JSON.parse(localStorage.getItem("kd:wochenplan") || "{}").eintraege?.find((wert) => wert.titel === "Mirror Signal");
    return `${eintrag?.jahr}:${eintrag?.link_modus}:${eintrag?.ref?.watchmode_id}`;
  })).toBe("2024:auto:43001");
  if (!(await pin.evaluate((element) => element.open))) await pin.locator("summary").click();
  await pin.getByRole("button", { name: "Eintrag ansehen" }).click();
  await expect(page.locator('[data-streaming-suchtreffer="entdecken:43001"]')).toBeFocused();
});

test("Streamingfilter sind mobil sichtbar und grenzen beide Katalogansichten eindeutig ein", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await page.addInitScript(async () => {
    const filme = [
      {
        id: "alpha-rated", titel: "Alpha Story", originaltitel: "Alpha Story", jahr: 1980,
        typ: "film", quelle: "streaming", kategorie: "sehenswert", bewertet_von: "max",
        bewertung: { wie: 4, was: 3, warum: 4 }, genre: [], tags: [], begruendung: "", notiz: "",
      },
      {
        id: "bravo-unrated", titel: "Bravo Story", originaltitel: "Bravo Story", jahr: 1990,
        typ: "film", quelle: "must_watch", kategorie: null, bewertet_von: null,
        bewertung: null, genre: [], tags: [], begruendung: "", notiz: "",
      },
      {
        id: "zebra-rated", titel: "Zebra Zone", originaltitel: "Zebra Zone", jahr: 2023,
        typ: "serie", quelle: "streaming", kategorie: "immer_gut", bewertet_von: "max",
        bewertung: { wie: 5, was: 4, warum: 5 }, genre: [], tags: [], begruendung: "", notiz: "",
      },
    ];
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
    localStorage.setItem("kd:master", JSON.stringify({ filme, meta: { version: "test" }, gespeichertAm: Date.now() }));
    localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: false, skip: [], am: "2026-08-02", version: "beta-2026-07-datenfreigabe-2" }));
    localStorage.setItem("kd:ki", JSON.stringify({ global: false, funktionen: {}, geaendertAm: "2026-08-02T00:00:00.000Z" }));
    localStorage.setItem("kd:ki-version", "e8-v1");
    localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" }));
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix", "Crunchyroll"], heuristik: true }));
    localStorage.setItem("kd:entdecken-status", JSON.stringify({
      51001: { status: "gesehen", gesehen_am: "2026-08-01T20:00:00.000Z" },
      51002: { beobachtet: true, typ: "tv_series", titel: "Berlin Nights" },
    }));
    localStorage.setItem("kd:katalog:url", "https://abcdefghijklmnopqrst.supabase.co");
    localStorage.setItem("kd:katalog:key", "test-publishable-key-1234567890");
    const katalogCache = await caches.open("kinodreieck-katalog-v1");
    const cacheEintrag = (payload) => new Response(JSON.stringify({
      __kd: "kd-katalog-1", gecachtAm: Date.now(),
      meta: { stand: "2026-08-02T10:00:00Z", gueltig_bis: "2099-01-01T00:00:00Z" }, payload,
    }), { headers: { "Content-Type": "application/json" } });
    const basis = location.origin + "/__kd_katalog_cache__/";
    await katalogCache.put(basis + "streaming_bekannt_demo", cacheEintrag({
      demo: true, stand: "2026-08-02T10:00:00Z", region: "AT", dienste: ["Netflix", "Crunchyroll"],
      titel: [
        { watchmode_id: 50001, titel: "Alpha Story", jahr: 1980, typ: "movie", genres: [], dienste: ["Netflix"] },
        { watchmode_id: 50002, titel: "Bravo Story", jahr: 1990, typ: "movie", genres: [], dienste: ["Crunchyroll"] },
        { watchmode_id: 50003, titel: "Zebra Zone", jahr: 2023, typ: "tv_series", genres: [], dienste: ["Crunchyroll"] },
      ],
    }));
    await katalogCache.put(basis + "streaming_entdecken_demo", cacheEintrag({
      demo: true, stand: "2026-08-02T10:00:00Z", region: "AT", dienste: ["Netflix", "Crunchyroll"], gekuerzt: false,
      titel: [
        { watchmode_id: 51001, titel: "Apollo Road", jahr: 1990, typ: "movie", genres: ["Drama"], dienste: ["Netflix"] },
        { watchmode_id: 51002, titel: "Berlin Nights", jahr: 2024, typ: "tv_series", genres: ["Crime"], dienste: ["Crunchyroll"] },
        { watchmode_id: 51003, titel: "Charlie Cloud", jahr: 2020, typ: "movie", genres: [], dienste: ["Netflix"] },
      ],
    }));
  });
  await page.goto("/");
  await waehleMobileTab(page, "Streaming");

  const programmKarten = page.locator('[data-streaming-suchtreffer^="programm:"]');
  await expect(programmKarten).toHaveCount(3);
  const filterKnopf = page.locator(".kd-streamfilter-knopf");
  await expect(filterKnopf).toBeVisible();
  await filterKnopf.click();
  const plattformP = page.getByRole("combobox", { name: "Mein Programm: Plattform filtern" });
  await plattformP.selectOption("Crunchyroll");
  await expect(programmKarten).toHaveCount(2);
  await plattformP.selectOption("");
  const dekadeP = page.getByRole("slider", { name: "Mein Programm: Jahrzehnt filtern" });
  await expect(dekadeP).toBeVisible();
  await dekadeP.fill("2");
  await expect(programmKarten).toHaveCount(2);
  await expect(page.locator('[data-streaming-suchtreffer="programm:alpha-rated"]')).toBeVisible();
  await dekadeP.fill("0");
  await page.getByRole("button", { name: "Bewertet", exact: true }).click();
  await expect(programmKarten).toHaveCount(2);
  const abcP = page.getByRole("slider", { name: "Mein Programm: Anfangsbuchstaben filtern" });
  await abcP.fill("26");
  await expect(programmKarten).toHaveCount(1);
  await expect(page.locator('[data-streaming-suchtreffer="programm:zebra-rated"]')).toBeVisible();

  await page.getByRole("button", { name: /^Entdecken/ }).click();
  const entdeckenKarten = page.locator(".kd-entdecken-karte");
  await expect(entdeckenKarten).toHaveCount(3);
  const entdeckenAktionen = entdeckenKarten.first().locator(".kd-entdecken-aktionen button");
  await expect(entdeckenAktionen).toHaveCount(2);
  await expect(entdeckenKarten.first().getByRole("button", { name: "Auf die Merkliste" })).toBeVisible();
  await expect(entdeckenKarten.first().getByRole("button", { name: "Gesehen-Markierung entfernen" })).toBeVisible();
  const aktionsGroessen = await entdeckenAktionen.evaluateAll((knoepfe) => knoepfe.map((knopf) => {
    const rect = knopf.getBoundingClientRect();
    return { breite: rect.width, hoehe: rect.height };
  }));
  for (const groesse of aktionsGroessen) {
    expect(groesse.breite).toBeGreaterThanOrEqual(24);
    expect(groesse.hoehe).toBeGreaterThanOrEqual(24);
  }
  const werkzeuge = page.locator(".kd-streaming-werkzeuge");
  await expect(werkzeuge.locator(".kd-streamfilter-knopf")).toBeVisible();
  await expect.poll(() => werkzeuge.evaluate((element) => {
    const sortierung = element.querySelector('[data-tour="entdecken-sortierung"]')?.getBoundingClientRect();
    const filter = element.querySelector(".kd-streamfilter-knopf")?.getBoundingClientRect();
    return !!sortierung && !!filter && Math.abs(sortierung.top - filter.top) <= 2 && filter.left >= sortierung.right;
  })).toBe(true);
  await expect(page.locator(".kd-streamfilter-genre")).toHaveCount(0);
  const plattformE = page.getByRole("combobox", { name: "Entdecken: Plattform filtern" });
  await plattformE.selectOption("Crunchyroll");
  await expect(entdeckenKarten).toHaveCount(1);
  await expect(entdeckenKarten).toContainText("Berlin Nights");
  await plattformE.selectOption("");
  await page.getByRole("button", { name: /Beobachtet \(1\)/ }).click();
  await expect(entdeckenKarten).toHaveCount(1);
  await expect(entdeckenKarten).toContainText("Berlin Nights");
  await page.getByRole("button", { name: /Beobachtet \(1\)/ }).click();
  await page.getByRole("button", { name: /Gesehen \(1\)/ }).click();
  await expect(entdeckenKarten).toHaveCount(1);
  await expect(entdeckenKarten).toContainText("Apollo Road");
  await page.getByRole("button", { name: /Gesehen \(1\)/ }).click();
  const dekadeE = page.getByRole("slider", { name: "Entdecken: Jahrzehnt filtern" });
  await expect(dekadeE).toBeVisible();
  await expect(page.locator(".kd-streamfilter-dekade-skala").last()).toContainText("90er");
  const reglerKopfGeometrie = await page.locator(".kd-streamfilter-regler").evaluate((regler) => (
    [...regler.querySelectorAll(".kd-streamfilter-abc-kopf")].map((kopf) => ({
      anzeige: kopf.querySelector("strong").getBoundingClientRect().width,
      alle: kopf.querySelector("button").getBoundingClientRect().width,
    }))
  ));
  expect(reglerKopfGeometrie).toHaveLength(2);
  expect(Math.abs(reglerKopfGeometrie[0].anzeige - reglerKopfGeometrie[1].anzeige)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(reglerKopfGeometrie[0].alle - reglerKopfGeometrie[1].alle)).toBeLessThanOrEqual(0.5);
  await dekadeE.fill("2");
  await expect(page.locator(".kd-streamfilter-dekade .kd-streamfilter-abc-kopf strong").last()).toHaveText("00er");
  await expect(entdeckenKarten).toHaveCount(1);
  await expect(entdeckenKarten).toContainText("Apollo Road");
  await dekadeE.fill("0");
  const abcE = page.getByRole("slider", { name: "Entdecken: Anfangsbuchstaben filtern" });
  await abcE.fill("3");
  await expect(entdeckenKarten).toHaveCount(1);
  await expect(entdeckenKarten).toContainText("Charlie Cloud");
  await keineDokumentUeberbreite(page);
});

test("Gefüllte iPhone-Ansichten schneiden Karten, Editor und Profil nicht ab", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await page.addInitScript(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const wt = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()];
    const termin = `${wt} ${d.getDate()}.${d.getMonth() + 1}. 20:00 · English Cinema Haydn`;
    const obsessionGartenbau = `${wt} ${d.getDate()}.${d.getMonth() + 1}. 18:30 · Gartenbaukino (OmU)`;
    const obsessionApollo = `${wt} ${d.getDate()}.${d.getMonth() + 1}. 21:00 · Apollo (OV)`;
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
      data: { stand: new Date().toISOString(), filme: [
        { t: "Event Horizon – Am Rande des Universums", j: 1997, k: ["English Cinema Haydn"], z: [termin] },
        { t: "Obsession - Du sollst mich lieben", j: 2026, k: ["Gartenbaukino", "Apollo"], z: [obsessionGartenbau, obsessionApollo] },
      ] },
    }));
    localStorage.setItem("kd:kino-pins", JSON.stringify([
      { t: "Event Horizon – Am Rande des Universums", j: 1997, z: termin, seit: Date.now() },
      { t: "Obsession - Du sollst mich lieben", j: 2026, z: obsessionApollo, seit: Date.now() },
    ]));
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

  const module = await page.locator(".kd-dash-kopfname").allTextContents();
  expect(module.slice(0, 4)).toEqual(["Pinboard & Serienradar", "Must-Watch", "Zuletzt hinzugefügt"]);
  const pinboardPin = page.locator(".kd-pinboard-kino").first();
  await expect(pinboardPin).toBeVisible();
  await expect(page.locator(".kd-pinboard-kino").filter({ hasText: "Obsession - Du sollst mich lieben" })).toBeVisible();
  const dashboardGeometrie = await pinboardPin.evaluate((karte) => {
    const titel = karte.querySelector(".kd-pinboard-kino-name");
    const meta = karte.querySelector(".kd-pinboard-kino-meta");
    const kr = karte.getBoundingClientRect();
    const tr = titel.getBoundingClientRect();
    const mr = meta.getBoundingClientRect();
    return { karteRechts: kr.right, titelRechts: tr.right, metaRechts: mr.right, hoehe: kr.height };
  });
  expect(dashboardGeometrie.titelRechts).toBeLessThanOrEqual(dashboardGeometrie.karteRechts + 0.5);
  expect(dashboardGeometrie.metaRechts).toBeLessThanOrEqual(dashboardGeometrie.karteRechts + 0.5);
  expect(dashboardGeometrie.hoehe).toBeLessThan(90);
  await page.locator(".kd-pinboard-kino").filter({ hasText: "Obsession - Du sollst mich lieben" }).click();
  await expect(page.locator('[data-kino-suchtreffer="programm:Obsession - Du sollst mich lieben"]')).toBeFocused();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".kd-wochen-eintrag--vorschlag")).toHaveCount(0);
  await expect(page.locator(".kd-wochen-eintrag--kino").getByText("Event Horizon – Am Rande des Universums", { exact: true })).toBeVisible();
  await expect(page.locator(".kd-wochen-eintrag--kino").getByText("Obsession - Du sollst mich lieben", { exact: true })).toBeVisible();
  await expect(page.locator(".kd-wochen-tagplus")).toHaveCount(7);
  await page.locator(".kd-wochen-tagplus").first().click();
  const wochenEditor = page.locator("#kd-wochen-editor");
  await expect(wochenEditor).toBeVisible();
  await expect(wochenEditor.getByLabel("App-Verknüpfung (optional)")).toHaveCount(0);
  await expect(wochenEditor.getByLabel("Externer Link (optional)")).toHaveCount(0);
  await wochenEditor.getByLabel("Art").selectOption("folge");
  await expect(wochenEditor.getByLabel("Uhrzeit (optional)")).toHaveCount(0);
  await wochenEditor.getByLabel("Art").selectOption("termin");
  await expect(wochenEditor.getByLabel("Uhrzeit (optional)")).toBeVisible();
  await wochenEditor.getByLabel("Ort / Anbieter").fill("Gartenbaukino");
  await wochenEditor.getByLabel("Datum", { exact: true }).fill("2026-08-05");
  await expect(wochenEditor.getByRole("checkbox", { name: "Mi" })).toBeChecked();
  await expect(wochenEditor.getByRole("checkbox", { name: "So" })).not.toBeChecked();
  await expect(wochenEditor.getByLabel("App-Verknüpfung (optional)")).toHaveCount(0);
  const datumZeitGeometrie = await wochenEditor.evaluate((editorElement) => {
    const datum = editorElement.querySelector('input[type="date"]').getBoundingClientRect();
    const zeit = editorElement.querySelector('input[type="time"]').getBoundingClientRect();
    const editor = editorElement.getBoundingClientRect();
    return { datumBreite: datum.width, zeitBreite: zeit.width, datumRechts: datum.right, zeitLinks: zeit.left, zeitRechts: zeit.right, editorRechts: editor.right, datumUnten: datum.bottom, zeitOben: zeit.top };
  });
  expect(datumZeitGeometrie.datumBreite).toBeLessThanOrEqual(150);
  expect(datumZeitGeometrie.zeitBreite).toBeLessThanOrEqual(110);
  expect(datumZeitGeometrie.datumRechts).toBeLessThanOrEqual(datumZeitGeometrie.editorRechts + 0.5);
  expect(datumZeitGeometrie.zeitRechts).toBeLessThanOrEqual(datumZeitGeometrie.editorRechts + 0.5);
  expect(datumZeitGeometrie.datumUnten).toBeLessThanOrEqual(datumZeitGeometrie.zeitOben + 0.5);
  await wochenEditor.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator(".kd-wochen-eintrag-download").first()).toBeVisible();
  await keineDokumentUeberbreite(page);

  const wochenPin = page.locator(".kd-wochen-eintrag--kino").filter({ hasText: "Event Horizon – Am Rande des Universums" }).first();
  await wochenPin.locator("summary").click();
  await wochenPin.getByRole("button", { name: "Termin ansehen" }).click();
  await expect(page.locator(".kd-bereichshero h1")).toHaveText("Kino");
  const kinoPin = page.locator(".kd-kino-pin").first();
  await expect(kinoPin).toBeVisible();
  const kinoPinGeometrie = await kinoPin.evaluate((zeile) => {
    const zr = zeile.getBoundingClientRect();
    const titel = zeile.querySelector(".kd-kino-pin-titel").getBoundingClientRect();
    const meta = zeile.querySelector(".kd-kino-pin-meta").getBoundingClientRect();
    return { rechts: zr.right, titelRechts: titel.right, metaRechts: meta.right, hoehe: zr.height };
  });
  expect(kinoPinGeometrie.titelRechts).toBeLessThanOrEqual(kinoPinGeometrie.rechts + 0.5);
  expect(kinoPinGeometrie.metaRechts).toBeLessThanOrEqual(kinoPinGeometrie.rechts + 0.5);
  expect(kinoPinGeometrie.hoehe).toBeLessThan(96);
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

test("Mobiler Sicherungsmarker führt zum Gesamt-Backup und verschwindet erst nach Download", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.addInitScript(() => {
    localStorage.setItem("kd:master", JSON.stringify({
      meta: { version: "mobile-backup-test" },
      gespeichertAm: Date.now(),
      filme: [{
        id: "backup-film", titel: "Backup Film", originaltitel: "Backup Film",
        jahr: 2026, typ: "film", quelle: "dvd", kategorie: "sehenswert",
        bewertet_von: "max", bewertung: { wie: 3, was: 3, warum: 3 },
        genre: [], tags: [], begruendung: "", notiz: "",
      }],
    }));
  });
  await page.goto("/");

  await expect(page.locator(".kd-backup-hinweis")).toHaveCount(0);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const settings = page.getByRole("dialog", { name: "Menü" })
    .getByRole("button", { name: "Settings", exact: true });
  await expect(settings).toHaveClass(/kd-sicherung-offen/);
  await expect(settings).toHaveAttribute("aria-description", "Sicherung offen");
  await settings.click();
  await expect(page.locator(".kd-bereichshero h1")).toHaveText("Settings");

  const backup = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Gesamt-Backup/ }) });
  await expect(backup).toHaveClass(/kd-klappe-markiert/);
  await expect(backup).toHaveAttribute("open", "");
  await expect(backup.locator("summary")).toBeVisible();
  await expect(backup.locator("summary")).toContainText("Sicherung offen");
  const herunterladen = backup.getByRole("button", { name: "Gesamt-Backup herunterladen" });
  await expect(herunterladen).toBeVisible();
  await expect(backup.locator(".kd-nur-desktop")).toBeHidden();
  await keineDokumentUeberbreite(page);

  const download = page.waitForEvent("download");
  await herunterladen.click();
  await download;
  await expect(backup).not.toHaveClass(/kd-klappe-markiert/);
  await expect(backup.locator("summary")).not.toContainText("Sicherung offen");

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const settingsDanach = page.getByRole("dialog", { name: "Menü" })
    .getByRole("button", { name: "Settings", exact: true });
  await expect(settingsDanach).not.toHaveClass(/kd-sicherung-offen/);
  await expect(settingsDanach).not.toHaveAttribute("aria-description", "Sicherung offen");
});

test("Chromium-Mobile erzeugt den flüchtigen Android-PWA-Bericht ohne Überbreite", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "Der Auftrag verlangt diese Praxisprobe ausdrücklich in Chromium-Mobile.");
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel Test) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  await blockiereFremdnetz(page);
  const baseURL = `http://127.0.0.1:${process.env.KD_TEST_PORT || "4174"}`;
  await page.goto(`${baseURL}/download/index.html`);
  await page.getByRole("button", { name: "Android-Installation prüfen" }).click();
  const result = page.locator("#diagnose-ergebnis");
  await expect(result).toHaveAttribute("data-code", /^KD-PWA-ANDROID-(?:000|040)$/i, { timeout: 15_000 });
  const report = await page.evaluate(() => window.KdPwaDiagnostics?.runDiagnostics({
    promptState: { available: false, standalone: false, installed: false },
  }));
  expect(report?.format).toBe("kinodreieck-pwa-android-diagnose");
  expect(report?.browser?.family).toBe("chrome");
  expect(report?.browser?.androidMajor).toBe(15);
  expect(report?.checks?.manifest).toBe("pass");
  expect(report?.checks?.icons).toBe("pass");
  expect(report?.checks?.serviceWorker).toBe("pass");
  expect(report?.checks?.scope).toBe("pass");
  expect(report?.checks?.controller).toBe("pass");
  expect(report?.checks?.offline).toBe("pass");
  expect(report?.checks?.storage).toBe("pass");
  expect(JSON.stringify(report)).not.toContain("Pixel Test");
  await expect(page.getByRole("button", { name: "Diagnosebericht kopieren" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Diagnosebericht herunterladen" })).toBeVisible();
  await keineDokumentUeberbreite(page);
  await context.close();
});

test("9b überträgt ein echtes Backup zwischen zwei isolierten Browserprofilen", async ({ browser }, testInfo) => {
  const baseURL = `http://127.0.0.1:${process.env.KD_TEST_PORT || "4174"}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await Promise.all([blockiereFremdnetz(pageA), blockiereFremdnetz(pageB)]);
  await Promise.all([pageA.goto(baseURL), pageB.goto(baseURL)]);

  const seedProfile = async (page, label) => page.evaluate(async (profileLabel) => {
    const { PERSONAL_DATA_KEYS } = await import("/src/lib/personalDataRegistry.js");
    const { createEmptyLocalRadar, upsertGuestRadarSubscription } = await import("/src/lib/localEventRadar.js");
    const timestamp = profileLabel === "A" ? 1_754_761_600_000 : 1_754_761_660_000;
    const radar = upsertGuestRadarSubscription(createEmptyLocalRadar({ authority: "guest" }), {
      target: { targetId: `fixture:browser-${profileLabel}`, targetType: "work", targetStatus: "active", title: `Browserfilm ${profileLabel}`, canonical: true },
      now: "2026-08-09T18:00:00.000Z",
    }).state;
    const values = {
      "kd:master": JSON.stringify({ meta: { version: `browser-${profileLabel}` }, filme: [{ id: `browser-film-${profileLabel}`, titel: `Browserfilm ${profileLabel}`, jahr: 2026 }], gespeichertAm: timestamp }),
      "kd:artikel": JSON.stringify({ artikel: [], gespeichertAm: timestamp }),
      "kd:kino-pins": "[]", "kd:wochenplan": JSON.stringify({ version: 1, eintraege: [] }),
      "kd:radar": JSON.stringify(radar), "kd:merkliste": "[]", "kd:vokabular": "[]",
      "kd:einstellungen": JSON.stringify({ theme: profileLabel === "A" ? "dunkel" : "hell", startTab: "start" }),
      "kd:entdecken-status": "{}", "kd:autor-name": `Browser ${profileLabel}`,
      "kd:streaming-dienste": JSON.stringify({ quellen: [], heuristik: false }),
      "kd:mustwatch": JSON.stringify({ eintraege: [], gespeichertAm: timestamp }),
      "kd:achievements": JSON.stringify({ eggs: [] }), "kd:zeitgrenze": "14:00",
      "kd:filter-mediathek": "0", "kd:filter-kino": "0", "kd:filter-streaming": "0",
      "kd:geschmacksprofil": JSON.stringify({ version: 1, signale: [] }),
    };
    for (const key of PERSONAL_DATA_KEYS) localStorage.setItem(key, values[key]);
    return { keys: PERSONAL_DATA_KEYS, values };
  }, label);

  const [seedA, seedB] = await Promise.all([seedProfile(pageA, "A"), seedProfile(pageB, "B")]);
  expect(seedA.keys).toHaveLength(18);
  expect(seedB.keys).toEqual(seedA.keys);
  await pageB.evaluate(async () => {
    const { sichereGebundenenGastRueckholpunkt } = await import("/src/lib/uebernahme.js");
    if (!sichereGebundenenGastRueckholpunkt("11111111-2222-4333-8444-555555555555")) throw new Error("guest-snapshot-failed");
  });

  await contextA.setOffline(true);
  const backupA = await pageA.evaluate(async () => {
    const { baueBackup } = await import("/src/lib/backup.js");
    return baueBackup({ pull: false });
  });
  await contextA.setOffline(false);
  const backupPath = testInfo.outputPath("profile-a-backup.json");
  await writeFile(backupPath, JSON.stringify(backupA), "utf8");
  const transferredBackup = JSON.parse(await readFile(backupPath, "utf8"));

  const restore = await pageB.evaluate(async (backup) => {
    const { restoreBackup } = await import("/src/lib/restore.js");
    return restoreBackup(backup);
  }, transferredBackup);
  expect(restore.ok).toBe(true);
  const backupB = await pageB.evaluate(async () => {
    const { baueBackup } = await import("/src/lib/backup.js");
    return baueBackup({ pull: false });
  });
  for (const key of Object.keys(backupA)) {
    if (!["erstellt", "_privateOps", "_exportStaende"].includes(key)) expect(backupB[key], key).toEqual(backupA[key]);
  }
  expect(await pageA.evaluate(() => localStorage.getItem("kd:autor-name"))).toBe("Browser A");

  const undo = await pageB.evaluate(async () => {
    const { restoreRueckgaengig } = await import("/src/lib/restore.js");
    return restoreRueckgaengig();
  });
  expect(undo.ok).toBe(true);
  expect(await pageB.evaluate(() => localStorage.getItem("kd:autor-name"))).toBe("Browser B");

  await pageB.evaluate(async (backup) => {
    const { restoreBackup } = await import("/src/lib/restore.js");
    await restoreBackup(backup);
    localStorage.setItem("kd:acct:owner", "11111111-2222-4333-8444-555555555555");
  }, transferredBackup);
  const logoutBoundary = await pageB.evaluate(async () => {
    const { stelleGaststandNachAbmeldungWiederHer } = await import("/src/lib/uebernahme.js");
    return stelleGaststandNachAbmeldungWiederHer("11111111-2222-4333-8444-555555555555");
  });
  expect(logoutBoundary.ok).toBe(true);
  expect(await pageB.evaluate(() => localStorage.getItem("kd:autor-name"))).toBe("Browser B");
  expect(await pageA.evaluate(() => localStorage.getItem("kd:autor-name"))).toBe("Browser A");

  await Promise.all([contextA.close(), contextB.close()]);
});

test("Desktop behält oberhalb 760 px die Hauptnavigation samt Suche", async ({ page }) => {
  /* Exakt die erste Desktopbreite belegt die zuvor ungetestete 760/761-Naht;
     breitere Desktop-Layouts werden in den übrigen Browserfällen abgedeckt. */
  await page.setViewportSize({ width: 761, height: 768 });
  await blockiereFremdnetz(page);
  await page.addInitScript(() => {
    localStorage.setItem("kd:einstieg", JSON.stringify({ version: "mobile-v1", abgeschlossen: true, weg: "gast" }));
    localStorage.setItem("kd:start", "clean");
    localStorage.setItem("kd:start-version", "demo-v1");
  });
  await page.goto("/");
  await expect(page.locator(".kd-menu")).toBeVisible();
  await expect(page.locator(".kd-navband")).toBeHidden();
  const suche = page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Suche", exact: true });
  await expect(suche).toBeVisible();
  await expect(page.getByRole("search", { name: "Globale Suche" })).toBeHidden();
  await suche.click();
  await expect(page.locator(".kd-bereichshero h1")).toHaveText("Suche");
  await keineDokumentUeberbreite(page);
});

test("E11-Auswahlmodus bleibt mobil nicht-destruktiv und kopierbar", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await blockiereFremdnetz(page);
  await seedAppMitDarstellung(page);
  await page.addInitScript(() => {
    localStorage.setItem("kd:master", JSON.stringify({
      meta: { version: "e11-browser" }, gespeichertAm: 1_786_650_000_000,
      filme: [
        { id: "z", typ: "film", titel: "Zulu", jahr: 1999, quelle: "dvd", bewertung: { wie: 1, was: 1, warum: 1 }, begruendung: "Zulu-Details", notiz: "PRIVAT-Z" },
        { id: "a", typ: "film", titel: "Alpha", jahr: 2001, quelle: "dvd", bewertung: { wie: 3, was: 3, warum: 3 }, begruendung: "Alpha-Details", notiz: "PRIVAT-A" },
        { id: "s", typ: "serie", titel: "Serie Eins", jahr: 2020, quelle: "dvd", bewertung: { wie: 2, was: 2, warum: 2 }, begruendung: "Serien-Details" },
      ],
    }));
    localStorage.setItem("kd:mustwatch", JSON.stringify({ eintraege: [], gespeichertAm: 1_786_650_000_000 }));
  });
  await page.goto("/");
  await waehleMobileTab(page, "Mediathek");

  const masterVorEntwuerfen = await page.evaluate(() => localStorage.getItem("kd:master"));
  await page.getByRole("button", { name: "+ Eintrag hinzufügen", exact: true }).click();
  const neuTitel = page.getByPlaceholder("Titel *");
  const neuJahr = page.getByPlaceholder("Jahr *");
  await neuTitel.fill("Ungespeicherter Neu-Entwurf");
  await neuJahr.fill("2025");
  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  await expect(page.locator('[data-tour="eintrag-neu"]')).toBeHidden();
  await expect(neuTitel).toHaveValue("Ungespeicherter Neu-Entwurf");
  await expect(neuJahr).toHaveValue("2025");
  await page.getByRole("button", { name: /^Serien/ }).click();
  await expect(neuTitel).toHaveValue("Ungespeicherter Neu-Entwurf");
  await page.getByRole("button", { name: /^Filme/ }).click();
  await page.getByRole("button", { name: "Auswahl beenden", exact: true }).click();
  await expect(neuTitel).toBeVisible();
  await expect(neuTitel).toHaveValue("Ungespeicherter Neu-Entwurf");
  await expect(neuJahr).toHaveValue("2025");
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("kd:master"))).toBe(masterVorEntwuerfen);

  const alphaKarte = page.locator('[data-film-id="a"] .kd-karte');
  await alphaKarte.click();
  await expect(alphaKarte).toContainText("Alpha-Details");
  await alphaKarte.getByRole("button", { name: /Bewertung bearbeiten/ }).click();
  const editBegruendung = alphaKarte.getByPlaceholder("Begründung (in deiner Stimme, 1–3 Sätze)");
  await editBegruendung.fill("Alpha-Edit-Entwurf bleibt erhalten");
  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  await expect(alphaKarte.locator(".kd-film-editor-shell")).toBeHidden();
  await expect(editBegruendung).toHaveValue("Alpha-Edit-Entwurf bleibt erhalten");
  await page.getByRole("button", { name: /^Serien/ }).click();
  await expect(editBegruendung).toHaveValue("Alpha-Edit-Entwurf bleibt erhalten");
  await page.getByRole("button", { name: /^Filme/ }).click();
  await page.getByRole("button", { name: "Auswahl beenden", exact: true }).click();
  await expect(editBegruendung).toBeVisible();
  await expect(editBegruendung).toHaveValue("Alpha-Edit-Entwurf bleibt erhalten");
  await alphaKarte.getByRole("button", { name: "Abbrechen", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("kd:master"))).toBe(masterVorEntwuerfen);
  await alphaKarte.click();

  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auswahl beenden", exact: true })).toBeVisible();
  const kopieren = page.getByRole("button", { name: "Titelliste kopieren", exact: true });
  await expect(kopieren).toBeDisabled();
  await expect(page.locator(".kd-film-loeschen")).toHaveCount(0);

  const alpha = page.getByRole("checkbox", { name: "Alpha auswählen" });
  const zulu = page.getByRole("checkbox", { name: "Zulu auswählen" });
  await alpha.focus();
  await alpha.press("Space");
  await zulu.click();
  await expect(page.getByText("2 ausgewählt", { exact: true })).toBeVisible();
  await expect(alpha).toHaveAttribute("aria-checked", "true");
  const markerBox = await alpha.locator(".kd-auswahl-marke").boundingBox();
  expect(markerBox?.width).toBeGreaterThanOrEqual(44);
  expect(markerBox?.height).toBeGreaterThanOrEqual(44);

  await page.locator("select").filter({ has: page.locator('option[value="titel"]') }).selectOption("titel");
  await page.evaluate(() => {
    window.__e11Clipboard = "";
    window.__e11ClipboardFehler = false;
    window.__e11ClipboardVerzoegern = false;
    window.__e11ClipboardPending = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text) => {
        if (window.__e11ClipboardVerzoegern) {
          return new Promise((resolve, reject) => {
            window.__e11ClipboardPending = { text, resolve, reject };
          });
        }
        if (window.__e11ClipboardFehler) return Promise.reject(new Error("denied"));
        window.__e11Clipboard = text;
        return Promise.resolve();
      } },
    });
  });
  await kopieren.click();
  await expect(page.getByRole("status").filter({ hasText: "Titelliste kopiert" })).toBeVisible();
  await expect(page.locator("#kd-titelliste-text")).toHaveValue("Alpha (2001)\nZulu (1999)");
  expect(await page.evaluate(() => window.__e11Clipboard)).toBe("Alpha (2001)\nZulu (1999)");
  expect(await page.locator("#kd-titelliste-text").inputValue()).not.toContain("PRIVAT");

  const sortierung = page.locator("select").filter({ has: page.locator('option[value="titel"]') });
  await sortierung.selectOption("jahr_alt");
  await expect(page.locator("#kd-titelliste-text")).toHaveValue("Zulu (1999)\nAlpha (2001)");
  await expect(page.getByRole("status").filter({ hasText: "Titelliste kopiert" })).toHaveCount(0);
  await sortierung.selectOption("titel");

  await page.evaluate(() => { window.__e11ClipboardVerzoegern = true; });
  await kopieren.click();
  await page.getByRole("button", { name: /^Serien/ }).click();
  await page.evaluate(() => window.__e11ClipboardPending.resolve());
  await expect(page.getByRole("status").filter({ hasText: "Titelliste kopiert" })).toHaveCount(0);
  await expect(page.locator("#kd-titelliste-text")).toHaveCount(0);
  await expect(page.locator(".kd-titelliste-leer")).toContainText(/keine ausgewählten Einträge/i);
  await page.getByRole("button", { name: /^Filme/ }).click();
  await page.evaluate(() => { window.__e11ClipboardVerzoegern = false; });

  await page.getByRole("button", { name: /^Serien/ }).click();
  await expect(page.getByText("2 ausgewählt · 0 sichtbar", { exact: true })).toBeVisible();
  await expect(kopieren).toBeDisabled();
  await expect(page.locator("#kd-titelliste-text")).toHaveCount(0);
  await expect(page.locator(".kd-titelliste-leer")).toContainText(/keine ausgewählten Einträge/i);
  await page.getByRole("checkbox", { name: "Serie Eins auswählen" }).click();
  await expect(page.getByText("3 ausgewählt · 1 sichtbar", { exact: true })).toBeVisible();
  await expect(kopieren).toBeEnabled();
  await expect(page.locator("#kd-titelliste-text")).toHaveValue("Serie Eins (2020)");
  await page.getByRole("button", { name: /^Musik/ }).click();
  await expect(page.getByText("3 ausgewählt · 0 sichtbar", { exact: true })).toBeVisible();
  await expect(kopieren).toBeDisabled();
  await page.getByRole("button", { name: /^Filme/ }).click();
  await expect(page.getByText("3 ausgewählt · 2 sichtbar", { exact: true })).toBeVisible();
  await expect(alpha).toHaveAttribute("aria-checked", "true");
  await expect(zulu).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#kd-titelliste-text")).toHaveValue("Alpha (2001)\nZulu (1999)");

  await page.getByRole("button", { name: "Auswahl leeren", exact: true }).click();
  await expect(page.getByText("0 ausgewählt", { exact: true })).toBeVisible();
  await expect(kopieren).toBeDisabled();

  await alpha.click();
  await page.evaluate(() => { window.__e11ClipboardFehler = true; });
  await kopieren.click();
  await expect(page.getByRole("alert")).toContainText("manuell kopiert");
  await expect(page.locator("#kd-titelliste-text")).toBeVisible();

  await page.getByRole("button", { name: /^Must-Watch/ }).click();
  await expect(page.getByRole("button", { name: "Auswählen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: /^Einträge/ }).click();
  await expect(page.getByRole("button", { name: "Auswählen", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  await page.getByRole("checkbox", { name: "Alpha auswählen" }).click();
  await page.getByRole("button", { name: "Auswahl beenden", exact: true }).click();
  await alphaKarte.click();
  await expect(alphaKarte).toContainText("Alpha-Details");
  await keineDokumentUeberbreite(page);
});
