import { expect, expectTouchTarget, navigateMobile, test } from "./fixtures.mjs";

test.use({ hasTouch: true, isMobile: true });

test("sichtbare mobile Schaltflaechen erreichen mindestens 44 mal 44 Pixel", async ({ privateApp }) => {
  const { page } = privateApp;
  const zuKlein = [];
  const sammleZuKleine = (aktuellerBereich) => page.getByRole("button").evaluateAll((buttons, bereich) => buttons
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
        bereich,
        name: (button.getAttribute("aria-label") || button.textContent || button.title || "")
          .trim().replace(/\s+/gu, " ").slice(0, 80),
        breite: Number(rect.width.toFixed(1)),
        hoehe: Number(rect.height.toFixed(1)),
      };
    })
    .filter((button) => button.breite < 44 || button.hoehe < 44), aktuellerBereich);

  for (const bereich of ["Start", "Kino", "Mediathek", "Streaming", "Entdecken", "Settings"]) {
    if (bereich !== "Start") await navigateMobile(page, bereich);
    if (bereich === "Settings") {
      const backup = page.locator("#gesamt-backup");
      if (await backup.getAttribute("open") !== null) {
        await backup.locator(":scope > summary").click();
        await expect(backup).not.toHaveAttribute("open", "");
      }
      await backup.locator(":scope > summary").click();
      await expect(backup).toHaveAttribute("open", "");
      await expectTouchTarget(
        backup.getByRole("button", { name: "Was bedeutet dieses Feld? backup" }),
        "Settings-Feldhinweis",
      );
    }
    zuKlein.push(...await sammleZuKleine(bereich));
    if (bereich === "Entdecken") {
      await page.getByRole("navigation", { name: "Entdecken-Ansichten" })
        .getByRole("button", { name: "Radar", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Mein Radar" })).toBeVisible();
      zuKlein.push(...await sammleZuKleine("Entdecken/Radar"));
    }
  }

  const globaleSuche = page.getByRole("search", { name: "Globale Suche in allen Bereichen" });
  await globaleSuche.getByRole("textbox", { name: "Sucheingabe" }).fill("Obsession");
  await globaleSuche.getByRole("button", { name: "Suchen" }).click();
  const suchergebnisse = page.getByRole("dialog", { name: "Suchergebnisse für Obsession" });
  await expect(suchergebnisse).toBeVisible();
  await suchergebnisse.getByRole("button", { name: "Ausführliche Ergebnisse öffnen" }).click();
  await expect(page.getByText(/Deterministische Suche — keine KI/u)).toBeVisible();
  zuKlein.push(...await sammleZuKleine("Finder"));

  expect(zuKlein).toEqual([]);
});
