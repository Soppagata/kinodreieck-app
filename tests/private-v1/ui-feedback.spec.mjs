import { expect, expectTouchTarget, navigateMobile, test } from "./fixtures.mjs";

test("Eigener Must-Watch-Pin bleibt am Smartphone bedienbar und fuehrt zum Eintrag", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await navigateMobile(page, "Mediathek");
  await page.getByRole("button", { name: /^Must-Watch/u }).click();
  const card = page.locator(".kd-mustwatch-karte").filter({ hasText: "Private Must-Watch 1" });
  await expect(card).toBeVisible();
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 852 });
    for (const button of await card.locator(".kd-titelkarten-aktionen button").all()) {
      await expectTouchTarget(button, "Must-Watch-Aktion");
    }
    expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await card.getByRole("button", { name: "Private Must-Watch 1: markieren", exact: true }).click();
  await expect(card.getByRole("button", { name: "Private Must-Watch 1: Markierung entfernen", exact: true })).toHaveAttribute("aria-pressed", "true");
  const pin = card.getByRole("button", { name: "Private Must-Watch 1 am Pinboard anpinnen", exact: true });
  await expect(pin).toBeEnabled();
  await pin.click();
  await card.screenshot({ path: testInfo.outputPath("ui-mustwatch-mobile.png") });
  await navigateMobile(page, "Start");
  const pinned = page.locator(".kd-pinboard-titel").filter({ hasText: "Private Must-Watch 1" });
  await expect(pinned).toBeVisible();
  await pinned.click();
  await expect(page.locator("#mw-mw_private_1")).toBeVisible();
});
