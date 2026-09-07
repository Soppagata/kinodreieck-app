import { expect, expectTouchTarget, navigateMobile, test } from "./fixtures.mjs";

for (const mode of [
  { theme: "dunkel", button: "Saal (dunkel)", schrift: "normal", fontButton: "Normal", factor: 1, saal: "#17151A" },
  { theme: "hell", button: "Foyer (hell)", schrift: "gross", fontButton: "Groß", factor: 1.12, saal: "#EDEAE3" },
]) for (const viewport of [{ width: 320, height: 760 }, { width: 393, height: 852 }, { width: 430, height: 932 }]) {
  test(`secondary design keeps controls reachable at ${viewport.width}px/${mode.theme}/${mode.schrift}`, async ({ privateApp }, testInfo) => {
    const { page } = privateApp;
    await page.setViewportSize(viewport);
    await navigateMobile(page, "Settings");
    await page.getByRole("button", { name: mode.button, exact: true }).click();
    await page.getByRole("button", { name: mode.fontButton, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-kd-theme", mode.theme);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--kd-saal"))).toBe(mode.saal);
    await expect(page.locator(".kd-daten-tab")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await navigateMobile(page, "Entdecken");
    const tabs = page.getByRole("navigation", { name: "Entdecken-Ansichten" });
    await expect(tabs).toBeVisible();
    await expectTouchTarget(tabs.getByRole("button", { name: "Radar", exact: true }), "Radar-tab");
    await expect(page.locator(".kd-entdecken-neutral, .kd-entdecken-leer").first()).toBeVisible();
    await tabs.getByRole("button", { name: "Blog", exact: true }).click();
    const article = page.locator(".kd-blog-karte").first();
    await expect(article).toBeVisible();
    await expectTouchTarget(article.locator(".kd-blog-expand"), "Blog-Vorschau");
    await article.locator(".kd-blog-expand").click();
    await expect(article.getByRole("region")).toBeVisible();
    const titleSize = await article.locator("h3").evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(titleSize).toBeCloseTo(22 * mode.factor, 1);
    await page.screenshot({ path: `test-results/design-secondary-${testInfo.project.name}-${viewport.width}-${mode.theme}-${mode.schrift}.png`, fullPage: true });
  });
}
