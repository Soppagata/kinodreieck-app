import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    await expect(page.getByLabel('Genre im Kinoprogramm')).toBeVisible();
    await page.getByRole('button', { name: 'Abo: alle', exact: true }).click();
    await page.getByRole('button', { name: 'OmU', exact: true }).click();
    await expect(filter).toContainText('Filter · 2');
    await expect(page.locator('[data-kino-suchtreffer^="programm:"]')).toHaveCount(1);
    await expect(page.locator('.kd-kino-programmfilter-status')).toHaveText('Nur NonStop · Fassung OmU');
    const controls = page.locator('.kd-kino-programmfilter select, .kd-kino-zusatzfilter button, .kd-kino-zusatzfilter input, .kd-kino-zusatzfilter select');
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
    await page.evaluate(() => window.kinoTest.focus({ art:'programm', ref:'1001', titel:'Filtereins' }));
    await expect(page.locator('[data-kino-suchtreffer="programm:1001"]')).toBeFocused();
    await expect(page.locator('.kd-kino-filterhinweis')).toHaveText('Suchfokus: Filtereins');
    await reset.click();
    await expect(page.locator('[data-kino-suchtreffer^="programm:"]')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(requests).toEqual([]);
  });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entdeckenCss = [
  'src/index.css',
  'src/styles/design-primary.css',
  'src/styles/design-secondary.css',
  'src/styles/ui-copy-disclosures.css',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

for (const width of [320, 393]) {
  test(`Entdecken-Disclosure bleibt auf hellen und dunklen Karten lesbar bei ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.setContent(`<!doctype html><html><body style="margin:0"><section class="kd-entdecken"
      style="--kd-kartenText:#211f1e;--kd-kartenTextWeich:#4b4744;--kd-kartenFeld:#fbfaf7;--kd-leinwand:#ece8df;--kd-rauch:#948fa0;--kd-saal:#17151a;--kd-saalHoch:#211e26;--kd-wolfram:#e3a63b">
      <div class="kd-entdecken-auswahlkarten"><article class="kd-entdecken-hub-karte kd-entdecken-auswahlkarte">
        <h3><button class="kd-entdecken-beschreibung-toggle"><span>Fauda</span><span class="kd-entdecken-aufklappzeichen">⌄</span></button></h3>
        <div class="kd-entdecken-beschreibung"><p>Lesbare Beschreibung</p><small>Beleg</small><a href="#">Quelle</a></div>
      </article></div>
      <div class="kd-entdecken-beliebtliste"><article class="kd-entdecken-hub-karte kd-entdecken-neutral">
        <h3><button class="kd-entdecken-beschreibung-toggle"><span>Dunkle Karte</span><span class="kd-entdecken-aufklappzeichen">⌄</span></button></h3>
      </article></div>
    </section></body></html>`);
    await page.addStyleTag({ content: entdeckenCss });
    const values = await page.evaluate(() => {
      const color = (selector) => getComputedStyle(document.querySelector(selector)).color;
      return {
        lightTitle: color('.kd-entdecken-auswahlkarte .kd-entdecken-beschreibung-toggle'),
        lightChevron: color('.kd-entdecken-auswahlkarte .kd-entdecken-aufklappzeichen'),
        lightDescription: color('.kd-entdecken-auswahlkarte .kd-entdecken-beschreibung p'),
        lightEvidence: color('.kd-entdecken-auswahlkarte .kd-entdecken-beschreibung small'),
        lightLink: color('.kd-entdecken-auswahlkarte .kd-entdecken-beschreibung a'),
        darkTitle: color('.kd-entdecken-neutral .kd-entdecken-beschreibung-toggle'),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(values).toEqual({
      lightTitle: 'rgb(33, 31, 30)', lightChevron: 'rgb(33, 31, 30)',
      lightDescription: 'rgb(75, 71, 68)', lightEvidence: 'rgb(75, 71, 68)',
      lightLink: 'rgb(75, 71, 68)', darkTitle: 'rgb(236, 232, 223)', overflow: false,
    });
  });
}
