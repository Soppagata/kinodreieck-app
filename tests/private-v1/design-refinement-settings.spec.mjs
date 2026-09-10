import { expect, navigateMobile, test } from "./fixtures.mjs";

const VIEWPORTS = [
  { width: 320, height: 760 },
  { width: 393, height: 852 },
];

async function controlGeometry(page) {
  return page.locator(".kd-einstelloptionen").evaluateAll((groups) => groups.slice(0, 2).map((group) => ({
    columns: [...group.children].map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }),
    height: group.getBoundingClientRect().height,
  })));
}

function expectCompactGrid([appearance, font]) {
  expect(appearance.columns).toHaveLength(2);
  expect(font.columns).toHaveLength(3);
  for (const group of [appearance, font]) {
    expect(group.height).toBeCloseTo(44, 1);
    expect(new Set(group.columns.map(({ top }) => Math.round(top))).size).toBe(1);
    expect(Math.max(...group.columns.map(({ width }) => width)) - Math.min(...group.columns.map(({ width }) => width))).toBeLessThanOrEqual(1);
    for (const control of group.columns) expect(control.height).toBeCloseTo(44, 1);
  }
}

for (const viewport of VIEWPORTS) {
  test(`settings stay compact through real font and theme changes at ${viewport.width}px`, async ({ privateApp }) => {
    const { page, traffic } = privateApp;
    await page.setViewportSize(viewport);
    await navigateMobile(page, "Settings");

    const section = page.getByText("Darstellung & Verhalten", { exact: true }).locator("..", { has: page.locator(".kd-klappe-kopf") });
    await expect(page.getByRole("button", { name: "Normal", exact: true })).toHaveAttribute("aria-pressed", "true");

    const measurements = new Map();
    for (const font of ["Klein", "Normal", "Groß", "Klein", "Normal"]) {
      await page.getByRole("button", { name: font, exact: true }).click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await controlGeometry(page);
      expectCompactGrid(geometry);
      const labels = await page.locator('.kd-einstelloptionen--3 button').evaluateAll((buttons) => buttons.map((button) => {
        const text = document.createRange();
        text.selectNodeContents(button);
        return {
          rows: new Set([...text.getClientRects()].map((rect) => Math.round(rect.top))).size,
          fits: button.scrollWidth <= button.clientWidth,
        };
      }));
      for (const label of labels) expect(label).toEqual({ rows: 1, fits: true });
      if (measurements.has(font)) expect(geometry).toEqual(measurements.get(font));
      else measurements.set(font, geometry);
    }

    for (const theme of [
      { button: "Foyer (hell)", value: "hell" },
      { button: "Saal (dunkel)", value: "dunkel" },
    ]) {
      await page.getByRole("button", { name: theme.button, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-kd-theme", theme.value);
      expectCompactGrid(await controlGeometry(page));
    }

    const summaries = page.locator(".kd-daten-tab .kd-klappe-kopf");
    expect(await summaries.count()).toBeGreaterThanOrEqual(6);
    for (const summary of await summaries.all()) {
      const style = await summary.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        listStyle: getComputedStyle(node).listStyleType,
        chevron: getComputedStyle(node, "::after").content,
      }));
      expect(style.height).toBeGreaterThanOrEqual(44);
      expect(style.listStyle).toBe("none");
      expect(style.chevron).not.toBe("none");
    }
    await expect(section).toHaveAttribute("open", "");
    await page.getByText("Streaming-Katalogbestand", { exact: true }).click();
    await expect(page.getByText("Streaming-Katalogbestand", { exact: true }).locator("..")).toHaveAttribute("open", "");
    const typography = await page.evaluate(async () => {
      const faces = ["600 16px 'Space Grotesk'", "600 16px 'Barlow Condensed'", "400 16px 'Space Mono'", "900 16px 'Fraunces'"];
      await Promise.all(faces.map((face) => document.fonts.load(face)));
      return {
        fonts: faces.map((face) => document.fonts.check(face)),
        control: Number.parseFloat(getComputedStyle(document.querySelector(".kd-einstelloptionen button")).fontSize),
        section: Number.parseFloat(getComputedStyle(document.querySelector(".kd-klappe-kopf")).fontSize),
        input: Number.parseFloat(getComputedStyle(document.querySelector(".kd-startbereich-zeile select")).fontSize),
        radius: getComputedStyle(document.querySelector(".kd-klappe")).borderRadius,
      };
    });
    expect(typography.fonts).toEqual([true, true, true, true]);
    expect(typography.control).toBeCloseTo(14, 1);
    expect(typography.section).toBeCloseTo(15, 1);
    expect(typography.input).toBeGreaterThanOrEqual(16);
    expect(typography.radius).toBe("0px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(traffic.unknownFixturePaths).toEqual([]);
  });
}
