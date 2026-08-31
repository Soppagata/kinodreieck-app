import { test, expect } from "@playwright/test";

for (const width of [320, 393, 1280]) {
  test(`Minimal-Login und Legal bei ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.route("**/*", (route) => {
      const hostname = new URL(route.request().url()).hostname;
      return ["127.0.0.1", "localhost"].includes(hostname) ? route.continue() : route.abort();
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Kinodreieck", exact: true })).toBeVisible();
    await expect(page.getByLabel("Benutzername", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Passwort", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Ohne Konto fortfahren", exact: true })).toBeVisible();
    await expect(page.getByRole("link")).toHaveCount(1);
    await expect(page.locator("#datenschutz-rechtliches")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const link = page.getByRole("link", { name: "Datenschutz & Rechtliches", exact: true });
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#datenschutz-rechtliches")).toBeFocused();
    await expect(page.getByText(/ENTWURF/)).toBeVisible();
    await expect(page.getByLabel("Benutzername", { exact: true })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Zurück zum Login", exact: true }).click();
    await expect(link).toBeFocused();
    await expect(page.locator("#datenschutz-rechtliches")).toBeHidden();
  });
}
