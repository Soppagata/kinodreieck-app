import { expect, test } from "./fixtures.mjs";

const VIEWPORTS = [
  { name: "320x640", width: 320, height: 640 },
  { name: "393x852", width: 393, height: 852 },
  { name: "430x932", width: 430, height: 932 },
];

const frames = (page, count = 3) => page.evaluate((total) => new Promise((resolve) => {
  let remaining = total;
  const next = () => { remaining -= 1; remaining > 0 ? requestAnimationFrame(next) : resolve(); };
  requestAnimationFrame(next);
}), count);

for (const viewport of VIEWPORTS) {
  test(`D4 Suchrahmen und Menü sind bei ${viewport.name} vollständig bedienbar`, async ({ privateApp }) => {
    const { page } = privateApp;
    await page.setViewportSize(viewport);
    const suche = page.getByRole("search", { name: "Globale Suche in allen Bereichen" });
    await expect(suche).toBeVisible();
    for (const control of [
      suche.getByRole("textbox", { name: "Sucheingabe" }),
      suche.getByRole("button", { name: "Suchen" }),
      suche.getByRole("button", { name: "Menü öffnen" }),
    ]) {
      const box = await control.boundingBox();
      expect(box, "Shell-Control hat eine Box").not.toBeNull();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await suche.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog", { name: "Menü" });
    await expect(menu).toBeVisible();
    for (const area of ["Start", "Kino", "Mediathek", "Streaming", "Entdecken", "Settings"]) {
      await expect(menu.getByRole("button", { name: area, exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
}

test("D4 PWA-Keyboard-Anker, Lock, Ergebnisgesten und Handoffs bleiben im privaten Mockkonto erhalten", async ({ privateViewportApp }) => {
  const { page } = privateViewportApp;
  const suche = page.getByRole("search", { name: "Globale Suche in allen Bereichen" });
  const input = suche.getByRole("textbox", { name: "Sucheingabe" });
  const form = page.locator(".kd-globalsuche");

  await expect.poll(() => page.evaluate(() => ({
    layout: Math.max(innerHeight, document.documentElement.clientHeight),
    visual: window.visualViewport.height,
    width: window.visualViewport.width,
  }))).toEqual({ layout: 852, visual: 852, width: 393 });
  /* Fokus ohne verkleinerten VisualViewport darf weder pinnen noch sperren. */
  await input.focus();
  await frames(page, 4);
  await expect(form).not.toHaveClass(/tastatur-offen/);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");

  /* WebKit kann zuerst nativ scrollen und die kleine Geometrie später liefern. */
  await page.evaluate(() => window.scrollTo(0, 180));
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 560, offsetTop: 42, width: 393, scale: 1 }));
  await frames(page, 5);
  await expect(form).toHaveClass(/tastatur-offen/);
  const anchor = await form.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    return { bottom: rect.bottom - viewport.offsetTop - viewport.height, position: document.body.style.position };
  });
  expect(Math.abs(anchor.bottom)).toBeLessThanOrEqual(10);
  expect(anchor.position).toBe("fixed");

  await input.fill("Obsession");
  await suche.getByRole("button", { name: "Suchen" }).click();
  const antwort = page.getByRole("dialog", { name: /Suchergebnisse für Obsession/ });
  await expect(antwort).toBeVisible();
  const gestureContract = await antwort.evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflowY: style.overflowY, overscroll: style.overscrollBehavior, touchAction: style.touchAction };
  });
  expect(gestureContract.overflowY).toMatch(/auto|scroll/);
  expect(gestureContract.overscroll).toBe("contain");
  expect(gestureContract.touchAction).toContain("pan-y");

  await antwort.getByRole("button", { name: "Suchergebnisse schließen" }).click();
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
  await page.getByRole("button", { name: "Menü schließen" }).click();

  /* Rotation, Zoom, Tastatur zu und Unmount räumen die referenzgezählte Sperre auf. */
  await input.focus();
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => window.__kdDesignViewport.__set({ width: 852, height: 393, offsetTop: 0, scale: 1 }));
  await frames(page, 4);
  await expect(form).not.toHaveClass(/tastatur-offen/);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
  await page.evaluate(() => window.__kdDesignViewport.__set({ width: 393, height: 560, offsetTop: 0, scale: 1.35 }));
  await frames(page, 3);
  await expect(form).not.toHaveClass(/tastatur-offen/);
});
