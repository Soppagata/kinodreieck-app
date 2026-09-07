import { expect, expectTouchTarget, navigateMobile, test } from "./fixtures.mjs";

for (const mode of [
  { theme: "dunkel", schrift: "normal", factor: "1" },
  { theme: "hell", schrift: "gross", factor: "1.12" },
]) for (const viewport of [{ width: 320, height: 760 }, { width: 393, height: 852 }, { width: 430, height: 932 }]) {
  test(`secondary design keeps controls reachable at ${viewport.width}px/${mode.theme}/${mode.schrift}`, async ({ privateApp }, testInfo) => {
    const { page } = privateApp;
    await page.setViewportSize(viewport);
    await page.evaluate(({ theme, factor }) => {
      document.documentElement.dataset.kdTheme = theme;
      document.documentElement.style.setProperty("--kd-schriftfaktor", factor);
    }, mode);
    await navigateMobile(page, "Entdecken");
    const tabs = page.getByRole("navigation", { name: "Entdecken-Ansichten" });
    await expect(tabs).toBeVisible();
    await expectTouchTarget(tabs.getByRole("button", { name: "Radar", exact: true }), "Radar-tab");
    await expect(page.locator(".kd-entdecken-neutral, .kd-entdecken-leer").first()).toBeVisible();
    await tabs.getByRole("button", { name: "Blog", exact: true }).click();
    const article = page.locator(".kd-blog-karte").first();
    await expect(article).toBeVisible();
    await expectTouchTarget(article.locator(".kd-blog-expand"), "Blog-Vorschau");
    await navigateMobile(page, "Settings");
    await expect(page.locator(".kd-daten-tab")).toBeVisible();
    await expect(page.locator(".kd-daten-tab").getByRole("button").first()).toBeVisible();
    await page.screenshot({ path: `test-results/design-secondary-${testInfo.project.name}-${viewport.width}-${mode.theme}-${mode.schrift}.png`, fullPage: true });
  });
}
