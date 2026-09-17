import assert from 'node:assert/strict';
import { createFlixPatrolMixAdapter, ENTDECKEN_FLIXPATROL_BATCH_MODE, ENTDECKEN_FLIXPATROL_FORMAT_9_CONSUMERS } from '../../supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js';
import { createMixedPublicChartAdapter, createOefiPublicChartAdapter, NETFLIX_AT_WEEKLY_CHART, OEFI_WEEKEND_CHART } from '../../supabase/functions/entdecken-daily-task/publicMixAdapter.js';
import { createWikidataResolver } from '../../supabase/functions/entdecken-daily-task/wikidataResolver.js';
import { runEntdeckenDailyRefresh } from '../../supabase/functions/entdecken-daily-task/runner.js';

export const sources = [
  { sourceId: 'chart:netflix-weekly-at', domain: 'netflix.com', publisherFamily: 'Netflix, Inc.', sourceClass: 'chart', rightsStatus: 'owner_private', attributionApproved: true, subdomainsAllowed: true, active: true, termsUrl: 'https://help.netflix.com/legal/termsofuse', termsCheckedOn: '2026-08-28' },
  { sourceId: 'chart:oefi-weekend-at', domain: 'filminstitut.at', publisherFamily: 'Österreichisches Filminstitut', sourceClass: 'chart', rightsStatus: 'owner_private', attributionApproved: true, subdomainsAllowed: false, active: true, termsUrl: 'https://filminstitut.at/impressum', termsCheckedOn: '2026-08-28' },
];
export function isoWeek(day) {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear(); return `${y}-W${String(Math.ceil(((d - new Date(Date.UTC(y, 0, 1))) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const statement = (content) => ({ rank: 'normal', value: { type: 'value', content } });
export const targetTitle = 'Belegter Kinofilm';
export const entity = {
  id: 'Q12345', type: 'item', labels: { de: targetTitle }, aliases: {},
  statements: { P31: [statement('Q11424')], P577: [statement({ time: '+2024-01-01T00:00:00Z' })],
    P345: [statement('tt1234567')], P4947: [statement('12345')] },
};

// Ausschliesslich lokale HTTP-/Cache-Doubles; alle Parser, Adapter, Resolver,
// Runner und Validatoren stammen aus dem Produktcode.
export function createProducer({ format = 8, today = '2026-09-17', resolverMode = 'resolved', persistence = null } = {}) {
  const checkedAt = `${today}T02:00:00.000Z`;
  const sunday = shift(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
  const fmt = (day) => day.split('-').reverse().join('.');
  const rows = Array.from({ length: 15 }, (_, i) => `<tr><td>${i + 1}</td><td>${i ? `Kinofilm ${i + 1}` : targetTitle}</td><td>Verleih</td><td>${10000 - i}</td><td>20000</td></tr>`).join('');
  const html = `<html><head><link rel="canonical" href="https://filminstitut.at/charts"></head><body><div class="charts-shortcode container"><h2>Wochenendcharts</h2><div class="charts-shortcode__description">TOP 15 vom ${fmt(shift(sunday, -2)).slice(0, 6)} - ${fmt(sunday)}</div><table><thead><tr><th>Rang</th><th>Filmtitel</th><th>Verleih</th><th>Besuche Wochenende</th><th>Besuche gesamt</th></tr></thead><tbody>${rows}</tbody></table><span class="tablepress-table-description">WE Wochenende, Zeitraum: ${fmt(shift(sunday, -2)).slice(0, 6)}-${fmt(sunday)}<br>Stand: ${fmt(today)}<br>Quelle: Comscore, Wochenendcharts</span></div></body></html>`;
  const tsv = ['country_name\tcountry_iso2\tweek\tcategory\tweekly_rank\tshow_title\tseason_title\tcumulative_weeks_in_top_10',
    ...['Films', 'TV'].flatMap((type) => Array.from({ length: 10 }, (_, i) => `Austria\tAT\t${sunday}\t${type}\t${i + 1}\tNetflix ${type} ${i + 1}\tN/A\t1`))].join('\n');
  const sourceFetch = async (url) => {
    assert.ok([NETFLIX_AT_WEEKLY_CHART.dataUrl, OEFI_WEEKEND_CHART.listUrl].includes(url));
    const body = url === OEFI_WEEKEND_CHART.listUrl ? html : tsv;
    return new Response(body, { headers: { 'content-type': url === OEFI_WEEKEND_CHART.listUrl ? 'text/html' : 'text/tab-separated-values' } });
  };
  const charts = new Map(), titles = new Map(), chartNumbers = new Map(), cache = new Map();
  let savedFeed = null, resolveInputs = [], resolverFetches = 0;
  const key = (r) => `${r.companyId}|${r.countryId}|${r.chartType}`;
  const client = {
    async fetchTop10(request) {
      const k = key(request); if (!chartNumbers.has(k)) chartNumbers.set(k, chartNumbers.size + 1);
      const n = chartNumbers.get(k);
      return { items: Array.from({ length: 10 }, (_, i) => ({ sourceId: `ttl_P08Chart${n}Title${String(i + 1).padStart(10, '0')}`, mediaType: request.chartType === 'movies' ? 'film' : 'series', ranking: i + 1 })) };
    },
    async fetchTitle({ sourceId, mediaType }) {
      return { title: { sourceId, mediaType, title: `Stream ${sourceId}`, releaseYear: 2024,
        imdbId: null, tmdbId: String(100000 + Number(sourceId.match(/Chart(\d+)/)[1]) * 100 + Number(sourceId.slice(-10))),
        sourceUrl: `https://flixpatrol.com/title/${sourceId.toLowerCase()}/` } };
    },
    async fetchTitles({ sourceIds, mediaTypes }) { return { items: await Promise.all(sourceIds.map(async (sourceId, i) => (await client.fetchTitle({ sourceId, mediaType: mediaTypes[i] })).title)) }; },
    async fetchGenres() { throw new Error('no vocabulary needed'); },
    async fetchKeywords() { throw new Error('no vocabulary needed'); },
  };
  const adapter = createFlixPatrolMixAdapter({
    publicAdapter: createMixedPublicChartAdapter({ fetchImpl: sourceFetch, now: () => checkedAt }),
    dailyPublicAdapter: createOefiPublicChartAdapter({ fetchImpl: sourceFetch, now: () => checkedAt }),
    client, now: () => checkedAt,
    ...(format === 9 ? { titleRequestMode: ENTDECKEN_FLIXPATROL_BATCH_MODE, netflixDaily: true, format9Consumers: ENTDECKEN_FLIXPATROL_FORMAT_9_CONSUMERS } : {}),
    readChart: async (r) => ({ ok: true, chart: charts.get(key(r)) || null }),
    saveChart: async (r) => { charts.set(key(r), { ...r, fresh: true }); return { ok: true }; },
    readTitles: async (ids) => ({ ok: true, items: ids.flatMap((id) => titles.has(id) ? [titles.get(id)] : []) }),
    saveTitle: async ({ title, fetchedAt, freshUntil }) => { titles.set(title.sourceId, { ...title, status: 'resolved', checkedAt: fetchedAt, freshUntil, fresh: true }); return { ok: true }; },
    saveTitleMiss: async () => { throw new Error('unexpected miss'); }, recordFailure: async () => ({ ok: true }),
    readVocabulary: async () => ({ ok: true, items: [] }), saveVocabulary: async () => ({ ok: true }),
  });
  const resolver = createWikidataResolver({ now: () => checkedAt, serialPauseMs: 0,
    loadCache: async (ids) => ids.flatMap((id) => cache.has(id) ? [cache.get(id)] : []),
    saveCache: async (row) => { cache.set(row.sourceItemId, row); },
    fetchImpl: async (rawUrl) => {
      resolverFetches++;
      const url = new URL(rawUrl);
      assert.equal(url.hostname, 'www.wikidata.org');
      if (resolverMode === 'unavailable') return new Response('', { status: 429 });
      if (url.pathname.endsWith('/search/items')) {
        const matches = url.searchParams.get('q') === targetTitle && resolverMode !== 'missing';
        return Response.json({ results: matches ? (resolverMode === 'ambiguous' ? ['Q12345', 'Q54321'] : ['Q12345'])
          .map((id) => ({ id, 'display-label': { value: targetTitle } })) : [] });
      }
      assert.ok(url.pathname.endsWith('/entities/items/Q12345'));
      const payload = structuredClone(entity);
      if (resolverMode === 'type-conflict') payload.statements.P31 = [statement('Q5398426')];
      if (resolverMode === 'missing-year') delete payload.statements.P577;
      return Response.json(payload);
    },
  });
  const repository = {
    async claimRefresh() { return persistence ? persistence.claimRefresh() : { feedEnabled: true, today, isoWeek: isoWeek(today), refresh: true, fenceToken: 42, feed: null }; },
    async loadSources() { return sources; },
    async enrichPublicItems(items) { resolveInputs = items; return resolver.resolve(items); },
    async saveFeed(feed, options) { savedFeed = feed; if (persistence) await persistence.saveFeed(feed, options); },
    async readFeed({ fenceToken }) { return persistence ? persistence.readFeed({ fenceToken }) : { ok: true, status: 'verified', fenceToken, feed: savedFeed,
      provenance: { itemCount: 50, sourceCount: 5, sourceIds: savedFeed.sourceIds, rightsStatus: 'owner_private' } }; },
    async markFailure({ code }) { throw new Error(`unexpected runner failure ${code}`); },
  };
  return { adapter, resolver, repository, cache, run: () => runEntdeckenDailyRefresh({ repository, adapter }),
    inputs: () => resolveInputs, requests: () => resolverFetches };
}
