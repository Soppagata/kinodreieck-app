import { expect, expectTouchTarget, test } from "./fixtures.mjs";

test.use({ hasTouch: true, isMobile: true });

const viewports = [
  { width: 320, height: 560, name: "320-kurz" },
  { width: 393, height: 852, name: "393" },
  { width: 430, height: 932, name: "430-gross" },
  { width: 760, height: 430, name: "760-quer" },
];

async function openMenu(page) {
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const dialog = page.getByRole("dialog", { name: "Menü" });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const viewport of viewports) {
  test(`kompaktes Rechtshaender-Menue bleibt bei ${viewport.name} erreichbar`, async ({ privateApp }, testInfo) => {
    const { page } = privateApp;
    await page.setViewportSize(viewport);
    const dialog = await openMenu(page);
    const panel = dialog.locator(".kd-mobile-menu");
    const grid = panel.getByRole("navigation", { name: "App-Bereiche" });

    await expect(grid).toHaveCSS("grid-template-columns", /.+/u);
    await expect(grid.getByRole("button")).toHaveCount(6);
    await expect(grid.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim())))
      .resolves.toEqual(["Start", "Kino", "Mediathek", "Streaming", "Entdecken", "Settings"]);
    await expect(grid.locator("svg")).toHaveCount(6);
    await expect(grid.getByRole("button", { name: "Start", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(panel.getByRole("button", { name: "Navigation schließen", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "In diesem Bereich nach oben", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menü schließen", exact: true })).toHaveCount(1);
    await expectTouchTarget(panel.getByRole("button", { name: "Navigation schließen", exact: true }), "Navigation schließen");
    await expectTouchTarget(panel.getByRole("button", { name: "In diesem Bereich nach oben", exact: true }), "Nach oben");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    const box = await panel.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box && viewport.width - (box.x + box.width)).toBeLessThanOrEqual(12);
    expect(box && viewport.height - (box.y + box.height)).toBeLessThanOrEqual(12);
    await page.screenshot({ path: testInfo.outputPath(`menu-${viewport.name}-dunkel.png`) });

    await panel.getByRole("button", { name: "Navigation schließen", exact: true }).click();
    await expect(dialog).toBeHidden();
  });
}

test("Menu actions preserve focus, navigation and the real Nach-oben handler", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const dialog = page.getByRole("dialog", { name: "Menü" });
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "In diesem Bereich nach oben", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Start", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  for (const bereich of ["Kino", "Mediathek", "Streaming", "Entdecken", "Settings", "Start"]) {
    await (await openMenu(page)).getByRole("button", { name: bereich, exact: true }).click();
    if (bereich === "Start") await expect(page.locator(".kd-bereichshero")).toHaveCount(0);
    else await expect(page.locator(".kd-bereichshero h1")).toHaveText(bereich);
  }

  await (await openMenu(page)).getByRole("button", { name: "Mediathek", exact: true }).click();
  await expect(page.locator(".kd-bereichshero h1")).toHaveText("Mediathek");
  const menu = await openMenu(page);
  await page.evaluate(() => {
    window.__kdMenuNachObenCalls = [];
    const original = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      window.__kdMenuNachObenCalls.push(args);
      return original(...args);
    };
  });
  await menu.getByRole("button", { name: "In diesem Bereich nach oben", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__kdMenuNachObenCalls
    .some(([target]) => typeof target === "object" && target?.top === 0))).toBe(true);

  await (await openMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Foyer (hell)", exact: true }).click();
  await (await openMenu(page)).screenshot({ path: testInfo.outputPath("menu-430-hell.png") });
});
