import { test, expect } from '@playwright/test';
import { buildKinoFixture } from '../kino_mobile_filter_test.mjs';

let fixture;
test.beforeAll(async () => { fixture = await buildKinoFixture(); });

for (const width of [320, 393, 1280]) {
  test(`PR-08: Kino-Filter bei ${width}px lokal bedienbar`, async ({ page }) => {
    const requests = [];
    await page.route('**/*', async route => {
      if (route.request().url() === 'http://kino-fixture.test/') {
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="fixture" style="padding:12px;max-width:1000px;margin:auto"></main></body></html>' });
      } else { requests.push(route.request().url()); await route.abort(); }
    });
    await page.setViewportSize({ width, height: 852 });
    await page.goto('http://kino-fixture.test/');
    await page.addStyleTag({ content: fixture.css });
    await page.addScriptTag({ content: fixture.js });
    await page.evaluate(() => window.kinoTest.mount());
    await page.evaluate(() => document.fonts.ready);
    const filter = page.locator('.kd-kino-filter-toggle');
    await expect(filter).toBeVisible();
    await expect(filter).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByPlaceholder('Programm durchsuchen …')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filter zurücksetzen' })).toHaveCount(0);
    await expect(page.getByLabel('Datum im Kinoprogramm')).toBeVisible();
    await expect(page.getByLabel('Kino im Kinoprogramm')).toBeVisible();
    await filter.focus();
    await page.keyboard.press('Enter');
    await expect(filter).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'OmU', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Abo: alle', exact: true }).click();
    await page.getByRole('button', { name: 'OmU', exact: true }).click();
    await expect(filter).toContainText('Filter · 2');
    await expect(page.locator('[data-kino-suchtreffer^="programm:"]')).toHaveCount(1);
    await expect(page.locator('.kd-kino-programmfilter-status')).toHaveText('Nur NonStop · Fassung OmU');
    const controls = page.locator('.kd-kino-programmfilter select, .kd-kino-zusatzfilter button, .kd-kino-zusatzfilter input');
    const geometry = await controls.evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect();
      return { text: el.textContent, width: box.width, height: box.height, left: box.left, right: box.right };
    }));
    for (const box of geometry) {
      expect(box.height, box.text).toBeGreaterThanOrEqual(44);
      expect(box.width, box.text).toBeGreaterThanOrEqual(44);
      expect(box.left, box.text).toBeGreaterThanOrEqual(0);
      expect(box.right, box.text).toBeLessThanOrEqual(width);
    }
    const reset = page.getByRole('button', { name: 'Filter zurücksetzen', exact: true });
    await reset.click();
    await expect(reset).toHaveCount(0);
    await page.getByLabel('Rest ab', { exact: true }).fill('19:00');
    await page.getByRole('button', { name: 'Zeitfilter an', exact: true }).click();
    await expect(page.locator('[data-kino-suchtreffer^="programm:"]')).toHaveCount(2);
    await expect(page.locator('[data-kino-suchtreffer="film:9"]')).toBeVisible();
    await filter.click();
    await expect(filter).toContainText('Filter · 1');
    await expect(page.locator('.kd-kino-filterhinweis')).toHaveText('Läuft auch: Rest ab 19:00');
    await reset.click();
    await page.evaluate(() => window.kinoTest.focus({ art:'programm', ref:'Filtereins', titel:'Filtereins' }));
    await expect(page.locator('[data-kino-suchtreffer="programm:Filtereins"]')).toBeFocused();
    await expect(page.locator('.kd-kino-filterhinweis')).toHaveText('Suchfokus: Filtereins');
    await reset.click();
    await expect(page.locator('[data-kino-suchtreffer^="programm:"]')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(requests).toEqual([]);
  });
}
