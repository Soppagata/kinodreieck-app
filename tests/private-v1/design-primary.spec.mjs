import { expect, navigateMobile, test } from "./fixtures.mjs";

test("Start und Woche behalten lesbare Karten und eine lokale Tagesansicht", async ({ privateApp }) => {
  const { page } = privateApp;
  await page.setViewportSize({ width: 393, height: 852 });
  const mustWatchTitle = page.locator(".kd-dash-mustwatch .kd-dash-ztitel").first();
  await expect(mustWatchTitle).toHaveCSS("font-family", /Barlow Condensed/u);
  await expect(mustWatchTitle).toHaveCSS("font-size", "22px");

  const tabs = page.getByRole("tab", { name: /^(Mo|Di|Mi|Do|Fr|Sa|So)/u });
  await expect(tabs).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Ganze Woche", exact: true })).toBeVisible();
  await expect(page.locator(".kd-wochen-tag:visible")).toHaveCount(1);
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".kd-wochen-tag:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Ganze Woche", exact: true }).click();
  await expect(page.locator(".kd-wochen-tag:visible")).toHaveCount(7);
});

test("Streaming-Ansichten behalten Karten, Sliderwerte und Titelpins", async ({ privateApp }) => {
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
  const decade = page.getByRole("slider", { name: "Entdecken: Jahrzehnt filtern" });
  await decade.fill("0");
  await expect(decade).toHaveAttribute("aria-valuetext", /Alle/u);
  const neuAnsicht = views.filter({ hasText: /^Neu/u });
  await neuAnsicht.click();
  await expect(neuAnsicht).toHaveAttribute("aria-pressed", "true");
});
