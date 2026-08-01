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

      for (const ziel of ["Kino", "Streaming", "Mediathek", "Suche", "Blog", "Start", "Settings"]) {
        await page.getByRole("button", { name: "Menü öffnen" }).click();
        const popup = page.getByRole("dialog", { name: "Menü" });
        await expect(popup).toBeVisible();
        await expect(popup.locator(":focus")).toHaveCount(1);
        if (ziel === "Kino") {
          const fokusziele = popup.getByRole("button");
          await page.keyboard.press("Shift+Tab");
          await expect(fokusziele.last()).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(fokusziele.first()).toBeFocused();
        }
        await expect(popup).toHaveCSS("transform", "none");
        const popupBox = await popup.boundingBox();
        expect(popupBox.width).toBeGreaterThanOrEqual(Math.min(viewport.width * 0.76, 260) - 1);
        expect(viewport.width - popupBox.x - popupBox.width).toBeGreaterThanOrEqual(9);
        expect(viewport.height - popupBox.y - popupBox.height).toBeGreaterThanOrEqual(75);
        await expect(popup.getByRole("button", { name: "Nach oben" })).toHaveCount(0);
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
      await expect(page.locator("summary", { hasText: /^Katalog-Status$/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Erweitert/ })).toBeHidden();
      await expect(page.locator("summary", { hasText: /^Darstellung & Verhalten$/ })).toBeVisible();
      await expect(page.locator("summary", { hasText: /^Konto & Geräte-Sync$/ })).toBeVisible();
      await expect(page.locator("summary", { hasText: /^Suche-Vokabular$/ })).toBeVisible();

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
