import { expect, navigateMobile, test } from "./fixtures.mjs";

test("Streaming-Reiter bleiben bei 320, 393 und 430 Pixeln in einer Zeile", async ({ privateApp }) => {
  const { page } = privateApp;
  await navigateMobile(page, "Streaming");
  const gruppe = page.locator(".kd-streaming-tab > .kd-streaming-ansichten");
  const reiter = gruppe.locator(":scope > .kd-seg-control");
  await expect(reiter).toHaveCount(3);

  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    const boxen = await reiter.evaluateAll((elemente) => elemente.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, height: box.height, right: box.right, text: element.textContent.trim() };
    }));
    expect(new Set(boxen.map((box) => Math.round(box.top))).size).toBe(1);
    expect(boxen.every((box) => box.height >= 44)).toBe(true);
    expect(Math.max(...boxen.map((box) => box.right))).toBeLessThanOrEqual(width + 1);
    expect(boxen.map((box) => box.text)).toEqual([
      expect.stringMatching(/^Mein Programm/u),
      expect.stringMatching(/^Alles/u),
      expect.stringMatching(/^Neu/u),
    ]);
    expect(await gruppe.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});
