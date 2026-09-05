import { expect, navigateMobile, test } from "./fixtures.mjs";

test.use({ hasTouch: true, isMobile: true });

test("sichtbare mobile Schaltflaechen erreichen mindestens 44 mal 44 Pixel", async ({ privateApp }) => {
  const { page } = privateApp;
  const zuKlein = [];

  for (const bereich of ["Start", "Kino", "Mediathek", "Streaming", "Entdecken", "Settings"]) {
    if (bereich !== "Start") await navigateMobile(page, bereich);

    const treffer = await page.getByRole("button").evaluateAll((buttons, aktuellerBereich) => buttons
      .filter((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.visibility !== "hidden"
          && style.display !== "none"
          && rect.width > 0
          && rect.height > 0;
      })
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          bereich: aktuellerBereich,
          name: (button.getAttribute("aria-label") || button.textContent || button.title || "")
            .trim().replace(/\s+/gu, " ").slice(0, 80),
          breite: Number(rect.width.toFixed(1)),
          hoehe: Number(rect.height.toFixed(1)),
        };
      })
      .filter((button) => button.breite < 44 || button.hoehe < 44), bereich);

    zuKlein.push(...treffer);
  }

  expect(zuKlein).toEqual([]);
});
