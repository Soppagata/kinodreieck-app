import {
  expect,
  expectTouchTarget,
  navigateMobile,
  test,
} from "./fixtures.mjs";

const fullCatalogRequests = (traffic) => traffic.contracts.filter((entry) => entry === "catalog:streaming_entdecken");

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
  await expect.poll(() => traffic.contracts.filter((entry) => entry === "catalog:streaming_bekannt").length).toBe(1);
  expect(fullCatalogRequests(traffic)).toHaveLength(0);

  await navigateMobile(page, "Entdecken");
  await expect(page.getByTestId("entdecken-tab")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diese Woche beliebt" })).toBeVisible();
  await expect(page.locator(".kd-entdecken-neutral").first()).toBeVisible();
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
  await expect(page.locator(".kd-entdecken-karte").first()).toContainText("Zulu Fund");
});

test("Mobile Haupttabs merken Scrollpositionen und Same-tab-Schließen springt nicht", async ({ privateApp }) => {
  const { page } = privateApp;
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
  await expect(news).toContainText("Ziel: Fight Club");

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
  const helpEntry = page.getByRole("button", { name: "? Anleitung & Hilfe", exact: true });
  await helpEntry.scrollIntoViewIfNeeded();
  const helpBox = await expectTouchTarget(helpEntry, "Start-Hilfe-Einstieg");
  await helpEntry.click();
  const settingsHelp = page.getByRole("button", { name: "Über Kinodreieck & Anleitung", exact: true });
  await expect(settingsHelp).toBeFocused();
  await expect(settingsHelp).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("LOKALE FILM-PLATTFORM", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Menü" }).getByRole("button", { name: "Anleitung & Hilfe", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Menü schließen" }).click();

  await page.getByText("Streaming-Katalogbestand", { exact: true }).click();
  const audit = page.getByTestId("streaming-catalog-audit");
  await expect(audit).toContainText("Streaming-Titel im gespeicherten Bestand");
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
