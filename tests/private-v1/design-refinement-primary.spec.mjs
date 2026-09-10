import { expect, expectTouchTarget, navigateMobile, test } from "./fixtures.mjs";

test("Mediathek bleibt kompakt erreichbar bei 393px und großer Schrift bei 320px", async ({ privateApp }) => {
  const { page } = privateApp;
  await page.setViewportSize({ width: 393, height: 852 });
  await navigateMobile(page, "Mediathek");

  const ansichten = page.locator(".kd-mediathek-ansichten .kd-seg-control");
  const typen = page.locator(".kd-mediathek-typen .kd-seg-control");
  await expect(ansichten).toHaveCount(3);
  await expect(typen).toHaveCount(4);
  for (const [index, label] of ["Einträge", "Im Besitz", "Must-Watch"].entries()) {
    await expectTouchTarget(ansichten.nth(index), `Mediathek-Ansicht ${label}`);
  }
  expect(await page.locator(".kd-mediathek-ansichten").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(3);
  expect(await page.locator(".kd-mediathek-typen").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(4);

  await ansichten.filter({ hasText: "Must-Watch" }).click();
  await expect(typen).toHaveCount(0);
  await ansichten.filter({ hasText: "Einträge" }).click();
  await expect(typen).toHaveCount(4);

  await page.setViewportSize({ width: 320, height: 852 });
  await page.locator("html").evaluate((node) => { node.dataset.kdSchrift = "gross"; });
  expect(await page.locator(".kd-mediathek-typen").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Kino-Nebenliste und Radar-Neuigkeiten nutzen ihre ruhigen Kartenrollen", async ({ privateApp }) => {
  const { page } = privateApp;
  await page.route("**/rest/v1/kd_catalog?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("name") !== "eq.programm") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        payload: {
          stand: "2026-09-04",
          filme: [{ t: "Nebenlisten Film", j: 2026, k: ["Metro Kino"], z: ["Fr 5.9. 20:00 · Metro Kino"] }],
        },
        updated_at: "2026-09-04T10:00:00.000Z",
        quelle: "synthetic-refinement-fixture",
        stand: "2026-09-04",
        gueltig_bis: "2099-01-01T00:00:00.000Z",
      }]),
    });
  });
  await page.reload();
  await page.setViewportSize({ width: 320, height: 852 });
  await navigateMobile(page, "Kino");
  const nebenliste = page.locator(".kd-kompakt-eintrag--nebenliste");
  await expect(nebenliste).toHaveCount(1);
  await expect(nebenliste.locator(".kd-kompakt-eintrag-titel")).toHaveCSS("font-size", "17px");
  await expect(nebenliste.locator(".kd-kompakt-eintrag-meta")).toHaveCSS("font-size", "12px");

  await navigateMobile(page, "Entdecken");
  await page.getByRole("navigation", { name: "Entdecken-Ansichten" }).getByRole("button", { name: "Radar", exact: true }).click();
  const news = page.locator(".kd-radar-neuigkeit");
  await expect(news).toHaveCount(1);
  await expect(news.getByRole("heading", { name: "Fight Club" })).toHaveCSS("font-size", "22px");
  await expect(news).toContainText("Netflix");
  await expect(news).toContainText("Gefunden für: Fight Club");
  await expect(news.locator("button")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
