import {
  expect,
  expectTouchTarget,
  navigateMobile,
  test,
} from "./fixtures.mjs";

const fullCatalogRequests = (traffic) => traffic.contracts.filter((entry) => entry === "catalog:streaming_entdecken");
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d3";

test("vorhandener v2-Neu-Zeitbeleg überlebt Konto-Reload in Chromium und WebKit", async ({ privateApp }) => {
  const { page } = privateApp;
  const katalogStand = "2026-09-04T10:00:00.000Z";
  const firstSeenAt = Date.parse("2026-09-01T08:15:00.000Z");
  const legacyRaw = JSON.stringify({
    format: 2,
    owner: `account:${ACCOUNT_ID}`,
    runId: katalogStand,
    coverage: JSON.stringify(["Netflix"]),
    ids: [82001],
    neu: [{ id: 82001, firstSeenAt }],
  });
  const legacyKey = `kd:streaming-neu:v2:${encodeURIComponent(`account:${ACCOUNT_ID}`)}`;
  await page.evaluate(({ key, value }) => {
    localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix"], heuristik: true }));
    localStorage.setItem(key, value);
  }, { key: legacyKey, value: legacyRaw });

  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
    await navigateMobile(page, "Streaming");
    const neu = page.getByRole("button", { name: /^Neu/u });
    await neu.click();
    await expect(neu).toContainText("(1)");
    await expect(page.locator(".kd-entdecken-karte").filter({ hasText: "Zulu Fund" })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), legacyKey)).toBe(legacyRaw);
  }
  const fristenbuecher = await page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.startsWith("kd:streaming-neu:fristen:v1:"))
    .map(([key, value]) => [key, JSON.parse(value)]));
  expect(fristenbuecher).toHaveLength(1);
  expect(fristenbuecher[0][1].eintraege).toEqual([{
    id: "82001", fensterBeginn: firstSeenAt, verbrauchtBis: firstSeenAt,
  }]);
  expect(fristenbuecher[0][1]).not.toHaveProperty("ids");
});

test("account-ready Boot, Chronik, Obsession-Suche und Auswahl-Sprungschutz", async ({ privateApp }) => {
  const { page, traffic } = privateApp;
  await expect(page.getByRole("heading", { name: "Dein Abend" })).toBeVisible();
  await expect(page.getByText("Zuletzt hinzugefügt", { exact: true })).toBeVisible();
  const chronology = page.locator(".kd-dash-log", { hasText: "Obsession - Du sollst mich lieben" });
  await expect(chronology.getByLabel("Ticker 1")).toHaveText("1");
  await expect(page.getByText(/Altbestand/u)).toHaveCount(0);
  await chronology.click();

  const obsession = page.locator('[data-film-id="obsession-2024"]');
  await expect(obsession.locator(".kd-karte")).toBeVisible();
  await expect(obsession.locator(".kd-film-loeschen")).toBeVisible();
  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  const localSearch = page.getByPlaceholder("Titel oder Originaltitel suchen …");
  await expect(localSearch).toBeVisible();
  await localSearch.fill("Obsession");
  await expect(obsession).toBeVisible();

  const selection = page.getByRole("checkbox", { name: "Obsession - Du sollst mich lieben auswählen" });
  await selection.click();
  await expect(selection).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/1 ausgewählt/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Fertig", exact: true })).toBeVisible();

  const globalSearch = page.getByRole("search", { name: "Globale Suche in allen Bereichen" });
  await globalSearch.getByRole("textbox", { name: "Sucheingabe" }).fill("Obsesison");
  await globalSearch.getByRole("button", { name: "Suchen" }).click();
  await expect.poll(() => fullCatalogRequests(traffic).length).toBe(1);
  const rankedFirst = globalSearch.locator("[data-globaler-suchtreffer]").first();
  await expect(rankedFirst).toContainText("Obsession - Du sollst mich lieben");
  await expect(rankedFirst).toContainText("Streaming");
  let guardText = "";
  page.once("dialog", async (dialog) => {
    guardText = dialog.message();
    await dialog.dismiss();
  });
  await rankedFirst.click();
  expect(guardText).toContain("1 Eintrag ist ausgewählt");
  expect(guardText).toContain("Mit „Abbrechen“ bleibt die Auswahl vollständig erhalten");
  await expect(selection).toHaveAttribute("aria-checked", "true");
  await expect(localSearch).toHaveValue("Obsession");
  await expect(page.getByRole("button", { name: "Fertig", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const menu = page.getByRole("dialog", { name: "Menü" });
  for (const area of ["Start", "Kino", "Mediathek", "Streaming", "Entdecken", "Settings"]) {
    await expect(menu.getByRole("button", { name: area, exact: true })).toBeVisible();
  }
});

test("Haupt-Entdecken bleibt leicht; Streaming Alles und beide Jahrzehntregler bleiben kompatibel", async ({ privateApp }) => {
  const { page, traffic } = privateApp;
  await page.setViewportSize({ width: 393, height: 852 });
  await expect.poll(() => traffic.contracts.filter((entry) => entry === "catalog:streaming_bekannt").length).toBe(1);
  expect(fullCatalogRequests(traffic)).toHaveLength(0);

  await navigateMobile(page, "Entdecken");
  await expect(page.getByTestId("entdecken-tab")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beliebte Titel" })).toBeVisible();
  await expect(page.locator(".kd-entdecken-neutral").first()).toBeVisible();
  for (const karte of await page.locator(".kd-entdecken-neutral").all()) {
    await expect(karte.locator(".kd-entdecken-beschreibung")).toHaveCount(0);
  }
  expect(fullCatalogRequests(traffic)).toHaveLength(0);

  await navigateMobile(page, "Streaming");
  await expect(page.getByRole("button", { name: /^Alles/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Entdecken/u })).toHaveCount(0);
  await page.locator(".kd-streamfilter-knopf").click();
  const programSort = page.getByRole("combobox", { name: "Mein Programm: Sortierfeld" });
  const programDirection = page.getByRole("combobox", { name: "Mein Programm: Sortierrichtung" });
  await programSort.selectOption("titel");
  await programDirection.selectOption("ab");
  const programDecade = page.getByRole("slider", { name: "Mein Programm: Jahrzehnt filtern" });
  await programDecade.fill("2");
  await expect(programSort).toHaveValue("jahr");
  await expect(programDirection).toHaveValue("auf");
  await expect(programDecade).toHaveAttribute("aria-valuetext", /1990er: 1988 bis 2002/u);

  await page.getByRole("button", { name: /^Alles/u }).click();
  await expect.poll(() => fullCatalogRequests(traffic).length).toBe(1);
  const allSort = page.getByRole("combobox", { name: "Entdecken: Sortierfeld" });
  const allDirection = page.getByRole("combobox", { name: "Entdecken: Sortierrichtung" });
  await allSort.selectOption("titel");
  await allDirection.selectOption("ab");
  const allDecade = page.getByRole("slider", { name: "Entdecken: Jahrzehnt filtern" });
  await allDecade.fill("2");
  await expect(allSort).toHaveValue("jahr");
  await expect(allDirection).toHaveValue("auf");
  await expect(allDecade).toHaveAttribute("aria-valuetext", /1990er: 1988 bis 2002/u);
  await expect(page.locator(".kd-entdecken-karte").filter({ hasText: "Zulu Fund" })).toBeVisible();
  await expect(page.locator(".kd-entdecken-karte").filter({ hasText: "Zulu Alt" })).toBeVisible();
});

test("Mobile Haupttabs merken Scrollpositionen und Same-tab-Schließen springt nicht", async ({ privateApp }) => {
  const { page, traffic } = privateApp;
  /* Erst den echten Konto-Boot abwarten: Andernfalls verschwindet zwischen
     Startmessung und Rückkehr noch der Erstladehinweis und WebKit klemmt die
     gespeicherte Tiefe korrekt an eine inzwischen kleinere Dokumenthöhe. */
  await expect.poll(() => ["catalog:programm", "catalog:streaming_bekannt"]
    .every((contract) => traffic.contracts.includes(contract))).toBe(true);
  await expect(page.locator(".kd-vertrauen")).not.toContainText("noch nicht geladen");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollHeight - window.innerHeight
  ))).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  })).toBeGreaterThan(100);
  const startY = await page.evaluate(() => window.scrollY);
  expect(startY).toBeGreaterThan(100);

  await navigateMobile(page, "Settings");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
  await page.evaluate(() => window.scrollTo(0, Math.min(700, document.documentElement.scrollHeight)));
  const settingsY = await page.evaluate(() => window.scrollY);
  expect(settingsY).toBeGreaterThan(100);

  await navigateMobile(page, "Start");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(startY - 12);
  await navigateMobile(page, "Start");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(startY - 12);

  await navigateMobile(page, "Settings");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(settingsY - 12);
});

test("Entdecken-Verwaltung reserviert oben sichtbaren Raum für Kopf und Schließen", async ({ privateApp }) => {
  const { page } = privateApp;
  const viewport = { width: 393, height: 568 };
  await page.setViewportSize(viewport);
  await navigateMobile(page, "Entdecken");

  await page.evaluate(() => {
    const nativeFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focusMitIosScroll(options) {
      const result = nativeFocus.call(this, options);
      if (this.matches?.(".kd-entdecken-schliessen") && !options?.preventScroll) {
        const dialog = this.closest(".kd-entdecken-dialog");
        if (dialog) dialog.scrollTop = Math.min(80, dialog.scrollHeight - dialog.clientHeight);
      }
      return result;
    };
  });

  const ausloeser = page.getByRole("button", { name: "Entdecken verwalten" });
  await ausloeser.click();
  const layer = page.getByTestId("entdecken-manage-layer");
  const dialog = page.getByRole("dialog", { name: "Entdecken verwalten" });
  const schliessen = dialog.getByRole("button", { name: "Entdecken verwalten schließen und zurück" });
  const kopf = dialog.locator(".kd-entdecken-dialog-kopf");
  const ersterAbschnitt = dialog.getByRole("heading", { name: "Mein Radar" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => dialog.evaluate((element) => element.scrollTop)).toBe(0);

  const standardFreiraum = await layer.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
  expect(standardFreiraum).toBeGreaterThanOrEqual(24);
  // Desktop-Playwright liefert keine iPhone-Safe-Area. Die Testvariable
  // bildet die nicht scrollbare sichtbare Oberkante des Geräts nach.
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--kd-entdecken-manage-top-gap", "52px");
  });
  await expect.poll(() => layer.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(52);
  const obererFreiraum = await layer.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
  const dialogBox = await dialog.boundingBox();
  const kopfBox = await kopf.boundingBox();
  const abschnittBox = await ersterAbschnitt.boundingBox();
  const schliessenBox = await schliessen.boundingBox();
  expect(obererFreiraum).toBe(52);
  expect(dialogBox.y).toBeGreaterThanOrEqual(obererFreiraum - 1);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(kopfBox.y).toBeGreaterThanOrEqual(dialogBox.y + 13);
  expect(abschnittBox.y).toBeGreaterThanOrEqual(kopfBox.y + kopfBox.height - 1);
  expect(schliessenBox.y).toBeGreaterThanOrEqual(dialogBox.y + 13);
  expect(schliessenBox.y + schliessenBox.height).toBeLessThanOrEqual(viewport.height + 1);

  await schliessen.click();
  await expect(dialog).toBeHidden();
  await expect(ausloeser).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.classList.contains("kd-scroll-gesperrt"))).toBe(false);
});

test("Radar-Provenienz, Audit, Hilfe, Datum, Blogsemantik und Touchvertrag", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await navigateMobile(page, "Entdecken");
  const viewNav = page.getByRole("navigation", { name: "Entdecken-Ansichten" });
  const manageButton = viewNav.getByRole("button", { name: "Entdecken verwalten" });
  await manageButton.click();
  const manage = page.getByRole("dialog", { name: "Entdecken verwalten" });
  const recommendationCheckbox = manage.getByRole("checkbox", { name: /Explizit bewertete Mediathek/u });
  const touchBox = await expectTouchTarget(recommendationCheckbox.locator("xpath=ancestor::label[1]"), "Entdecken-Checkbox");
  await manage.getByRole("button", { name: "Entdecken verwalten schließen und zurück" }).click();

  const radar = viewNav.getByRole("button", { name: "Radar", exact: true });
  await expect(radar).toBeVisible();
  await radar.click();
  await expect(page.getByRole("heading", { name: "Mein Radar" })).toBeVisible();
  await expect(page.getByText("Deine Ziele bleiben gespeichert; die automatische Prüfung ist für dieses Konto derzeit nicht verfügbar.")).toBeVisible();
  const goals = page.getByRole("heading", { name: "Meine Ziele" }).locator("xpath=following-sibling::ul[1]");
  await expect(goals).toContainText("Fight Club");
  await expect(goals).toContainText("Im Radar · Film");
  const news = page.getByRole("heading", { name: "Neuigkeiten" }).locator("xpath=following-sibling::ul[1]");
  await expect(news).toContainText("05.09.2026");
  await expect(news).toContainText("Gefunden für: Fight Club");
  await expect(news).not.toContainText("nicht eindeutig zugeordnet");

  await viewNav.getByRole("button", { name: "Blog", exact: true }).click();
  const article = page.locator(".kd-blog-karte", { hasText: "Privatrelease Artikel" });
  await expect(article).not.toHaveAttribute("role", "button");
  await expect(article).toContainText("04.09.2026");
  const expand = article.locator(".kd-blog-expand");
  await expect(expand).toHaveRole("button", { name: "Vorschau öffnen" });
  const controlledId = await expand.getAttribute("aria-controls");
  expect(controlledId).toBeTruthy();
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(article.getByRole("region", { name: "Privatrelease Artikel" })).toHaveAttribute("id", controlledId);
  await expect(article.locator("button button")).toHaveCount(0);

  await navigateMobile(page, "Start");
  await expect(page.getByRole("button", { name: "? Anleitung & Hilfe", exact: true })).toHaveCount(0);
  await navigateMobile(page, "Settings");
  const settingsHelp = page.locator("summary", { hasText: /^Hilfe & Anleitung$/ });
  const helpBox = await expectTouchTarget(settingsHelp, "Settings-Hilfe-Einstieg");
  await settingsHelp.click();
  await expect(page.getByText("LOKALE FILM-PLATTFORM", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name: "Anleitung & Hilfe", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Menü schließen" }).click();

  await page.getByText("Streaming-Katalogbestand", { exact: true }).click();
  const audit = page.getByTestId("streaming-catalog-audit");
  await expect(audit).toContainText("Gesamtbestand");
  await expect(audit).not.toContainText(/Snapshotdifferenz|Pipelinephasen|Warum fehlt/u);
  await expect(audit.locator("details")).toHaveCount(0);

  console.log(`[PRIVATE_V1_TOUCH] ${JSON.stringify({ browser: testInfo.project.name, viewport: "393x852", touchBox, helpBox })}`);
});

test("Start zeigt fünf passende Must-Watch-Titel und keine verworfene Beobachtet-Oberfläche", async ({ privateApp }) => {
  const { page, traffic } = privateApp;
  await expect.poll(() => traffic.contracts.filter((entry) => entry === "catalog:streaming_bekannt").length).toBe(1);
  const mustwatch = page.locator(".kd-dash-modul", { has: page.getByText("Must-Watch", { exact: true }) });
  await expect(mustwatch.locator(".kd-dash-zeile")).toHaveCount(5);
  await expect(mustwatch).toContainText("IM BESITZ");
  await expect(page.getByText(/Beobachtet|Beobachten/u)).toHaveCount(0);
  expect(traffic.contracts).not.toContain("series-watch");
  expect(fullCatalogRequests(traffic)).toHaveLength(0);
});

test("Must-Watch-Picker speichert für rohe und Master-gematchte Streams die Watchmode-ID", async ({ privateApp }) => {
  const { page } = privateApp;
  await navigateMobile(page, "Mediathek");
  await page.getByRole("button", { name: /^Must-Watch/u }).click();

  const verknuepfe = async (titel, suchTitel, erwarteteId) => {
    await page.getByRole("button", { name: "+ Für später merken", exact: true }).click();
    const bereich = page.locator(".kd-mustwatch-form");
    const speichern = bereich.getByRole("button", { name: "Für später merken", exact: true });
    await bereich.getByPlaceholder("Titel *").fill(titel);
    await bereich.getByRole("button", { name: "… wählen (optional)", exact: true }).click();
    await bereich.getByPlaceholder(/Titel suchen/u).fill(suchTitel);
    const streamingGruppe = bereich.getByText("Streaming", { exact: true }).locator("..");
    await streamingGruppe.getByRole("button", { name: new RegExp(`^${suchTitel}`) }).click();
    await speichern.click();
    await expect.poll(async () => page.evaluate((name) => {
      const eintraege = JSON.parse(localStorage.getItem("kd:mustwatch") || "{}").eintraege || [];
      return eintraege.find((eintrag) => eintrag.titel === name)?.verknuepfung || null;
    }, titel)).toEqual({ ziel: "streaming", id: erwarteteId });
  };

  await verknuepfe("Watchmode-only Link", "Heute", 81006);
  /* Obsession ist im Fixture bereits mit der Master-ID `obsession-2024`
     gematcht. Auch hier muss der Picker 81001 speichern. */
  await verknuepfe("Master-match Link", "Obsession - Du sollst mich lieben", 81001);
});
