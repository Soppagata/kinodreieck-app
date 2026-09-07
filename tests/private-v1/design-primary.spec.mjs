import { expect, navigateMobile, test } from "./fixtures.mjs";

test("Start und Woche behalten lesbare Karten und eine lokale Tagesansicht", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await page.setViewportSize({ width: 393, height: 852 });
  const mustWatchTitle = page.locator(".kd-dash-mustwatch .kd-dash-ztitel").first();
  await expect(mustWatchTitle).toHaveCSS("font-family", /Barlow Condensed/u);
  await expect(mustWatchTitle).toHaveCSS("font-size", "22px");

  const tabs = page.locator(".kd-wochen-tagauswahl button");
  await expect(tabs).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Ganze Woche", exact: true })).toBeVisible();
  await expect(page.locator(".kd-wochen-tag:visible")).toHaveCount(1);
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".kd-wochen-tag:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Ganze Woche", exact: true }).click();
  await expect(page.locator(".kd-wochen-tag:visible")).toHaveCount(7);
  await page.screenshot({ path: testInfo.outputPath("start-woche-dunkel-normal-393.png"), fullPage: true });
});

test("Streaming-Ansichten behalten Karten, Sliderwerte und Titelpins", async ({ privateApp }, testInfo) => {
  const { page, traffic } = privateApp;
  await navigateMobile(page, "Streaming");
  const views = page.locator(".kd-streaming-tab .kd-seg-control");
  await expect(views).toHaveCount(3);
  await expect(page.locator(".kd-streaming-tab .kd-film-titel").first()).toHaveCSS("font-size", "22px");
  await views.filter({ hasText: /^Alles/u }).click();
  await expect.poll(() => traffic.contracts.filter((entry) => entry === "catalog:streaming_entdecken").length).toBe(1);
  const allTitle = page.locator(".kd-streaming-tab .kd-entdecken-titel").first();
  await expect(allTitle).toHaveCSS("font-size", "22px");
  await expect(allTitle).toHaveCSS("font-family", /Barlow Condensed/u);
  const card = page.locator(".kd-streaming-tab .kd-entdecken-karte").first();
  await expect(card).toHaveCSS("background-color", "rgb(236, 232, 223)");
  await expect(card).toHaveCSS("color", "rgb(28, 26, 30)");
  const provider = card.locator(".kd-entdecken-dienste > *").first();
  await expect(provider).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(provider).toHaveCSS("font-size", "12px");
  const decade = page.getByRole("slider", { name: "Entdecken: Jahrzehnt filtern" });
  await decade.fill("0");
  await expect(decade).toHaveAttribute("aria-valuetext", /Alle/u);
  const scale = page.locator(".kd-streaming-tab .kd-streamfilter-abc-skala span");
  await expect(scale.first()).toHaveCSS("font-size", "12px");
  expect(await scale.evaluateAll((items) => items.filter((item) => getComputedStyle(item).visibility === "visible").length))
    .toBeLessThan(await scale.count());
  const neuAnsicht = views.filter({ hasText: /^Neu/u });
  await neuAnsicht.click();
  await expect(neuAnsicht).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("streaming-papierkarte-dunkel-normal-393.png"), fullPage: true });
});

test("Kino-Steuerfelder bleiben 16px und der Filter behält seine Werte", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await navigateMobile(page, "Kino");
  const datum = page.getByLabel("Datum im Kinoprogramm");
  const kino = page.getByLabel("Kino im Kinoprogramm");
  await expect(datum).toHaveCSS("font-size", "16px");
  await expect(kino).toHaveCSS("font-size", "16px");
  const filter = page.locator(".kd-kino-filter-toggle");
  await filter.click();
  const zeit = page.getByLabel("Rest ab", { exact: true });
  await expect(zeit).toHaveCSS("font-size", "16px");
  await zeit.fill("19:00");
  await expect(zeit).toHaveValue("19:00");
  await page.screenshot({ path: testInfo.outputPath("kino-controls-dunkel-normal-393.png"), fullPage: true });
});
