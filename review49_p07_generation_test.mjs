import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('.', import.meta.url).pathname;

const { baueStreamingAnsichten, ladeKatalogAsset, setKatalogZugang } = await import(`${root}/src/lib/katalog.js`);
const { streamingPayloadMitMetadaten, zeitpunkt } = await import(`${root}/src/lib/catalogProjection.js`);
const { projiziereStreamingAnsichten, streamingKatalogstaendePassen } = await import(`${root}/src/lib/streamingProjection.js`);
const { filmHerkunft } = await import(`${root}/src/lib/finder.js`);
const app = readFileSync(`${root}/src/App.jsx`, 'utf8');
const start = app.indexOf('async (vollKatalog = false) => {', app.indexOf('const ladeStreamingDateien = useCallback'));
const end = app.indexOf('\n  }, [snapshotFreigabe, master, reportError, resolveError, uebernehmeVollkatalog,', start);
assert(start > 0 && end > start);
// Execute the verbatim production callback, replacing only React state and service dependencies.
const callback = app.slice(start, end) + '\n  }';
const A = '2026-09-15T10:00:00Z', B = '2026-09-16T10:00:00Z';
const identity = { watchmode_id: 901, titel: 'Validator Film', jahr: 2022, typ: 'movie', imdb_id: 'tt1234567' };
const master = [{ ...identity, id: 'personal-901', typ: 'film' }];
const knownA = { stand: A, katalog_stand: A, titel: [{ ...identity, dienste: ['Netflix'], web_urls: { Netflix: 'https://example.test/removed' } }] };
const knownB = { stand: B, katalog_stand: B, titel: [] };
const discoverB = { stand: B, katalog_stand: B, titel: [{ ...identity, dienste: ['Disney+'], web_urls: { 'Disney+': 'https://example.test/current' } }] };
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) };
setKatalogZugang({ url: 'https://validator.supabase.co', key: 'sb_publishable_validator_mock_only_123456' });
const results = [];
for (const mode of ['cache-fallback', 'throw-without-cache', 'wrong-success', 'matching-refresh']) {
  const cache = new Map();
  globalThis.caches = { open: async () => ({
    put: async (url, response) => cache.set(url, await response.text()),
    match: async url => cache.has(url) ? new Response(cache.get(url)) : undefined,
  }) };
  let knownRequests = 0;
  let healed = false;
  const requests = [], reads = [], errors = [];
  globalThis.fetch = async url => {
    const name = new URL(url).searchParams.get('p_name');
    requests.push(name);
    assert(['streaming_bekannt', 'streaming_entdecken'].includes(name));
    if (name === 'streaming_bekannt' && ++knownRequests > 1 && !healed && !['matching-refresh','wrong-success'].includes(mode)) {
      if (mode === 'throw-without-cache') cache.clear();
      throw new Error('mock network unavailable on Known refresh');
    }
    const payload = name === 'streaming_entdecken' ? discoverB : knownRequests > 1 && (healed || mode !== 'wrong-success') ? knownB : knownA;
    return new Response(JSON.stringify([{ payload, stand: payload.stand, gueltig_bis: '2099-01-01T00:00:00Z' }]));
  };
  let info = null, published = null;
  const context = {
    snapshotFreigabe: true, snapshotFreigabeRef: { current: true },
    streamingKnownZurueckgestelltRef: { current: false }, betriebsartGen: { current: 1 },
    streamingBekanntLaufRef: { current: null }, streamingEntdeckenLaufRef: { current: null },
    streamingRohRef: { current: null }, streamingGeladen: { current: false }, entdeckenGeladen: { current: false },
    sichtbareAuswahl: ['Netflix'], sichtbareAuswahlGeladen: true, master,
    EINZELDATEI_BUILD: false, streamingPayloadMitMetadaten, zeitpunkt,
    ERROR_CODES: { INVALID_KEY: 'invalid', UNAUTHENTICATED: 'unauthenticated', NO_DEMO_DATA: 'no-demo' },
    ERROR_SCOPE: { STREAMING_KNOWN: 'known', STREAMING_DISCOVER: 'discover' },
    setStreamingInfo: value => { info = typeof value === 'function' ? value(info) : value; },
    reportError: (scope, text) => errors.push({ scope, text }), resolveError: () => {},
    errorText: e => e.message,
    setStreamingBekannt: () => {}, setStreamingEntdecken: () => {},
    uebernehmeVollkatalog: views => { published = views; return !!views && streamingKatalogstaendePassen(views.bekannt, views.entdecken); },
    catalogService: {
      loadArea: async area => {
        const result = await ladeKatalogAsset(area === 'streamingBekannt' ? 'streaming_bekannt' : 'streaming_entdecken');
        reads.push({ area, source: result.quelle, generation: result.payload.katalog_stand });
        return result;
      },
      buildStreamingViews: baueStreamingAnsichten,
    },
  };
  const load = vm.runInNewContext(`(${callback})`, context);
  await load(false); // Real boot path reads generation A and writes its mock browser cache.
  const views = await load(true); // Real full-load callback reads B and attempts the Known refresh once.
  const projection = projiziereStreamingAnsichten({ ...views, auswahl: ['Netflix'] });
  const finder = filmHerkunft(master[0], { kinoMatches: [], streamingBekannt: views.bekannt });
  const stale = mode !== 'matching-refresh';
  assert.equal(projection.meinProgramm.length, 0);
  assert.equal(projection.vollstaendig, !stale);
  assert.equal(views.bekannt.titel.some(t => t.dienste.includes('Netflix')), false);
  assert.equal(views.bekannt.titel.some(t => t.web_urls?.Netflix), false);
  assert.equal((finder.streaming?.dienste || []).includes('Netflix'), false);
  assert.equal(context.entdeckenGeladen.current, !stale);
  if (stale) {
    assert.equal(info.abgelaufen, true);
    assert.equal(info.generationKonflikt, true);
    assert.equal(context.streamingRohRef.current.entdeckenUmfang, 'begrenzt');
    assert.equal(published, undefined);
  }
  healed = true;
  const repaired = await load(true);
  assert.equal(knownRequests, stale ? 3 : 2);
  assert.equal(context.entdeckenGeladen.current, true);
  assert.equal(streamingKatalogstaendePassen(repaired.bekannt, repaired.entdecken), true);
  assert.deepEqual(repaired.bekannt.titel[0].dienste, ['Disney+']);
  assert.equal(info.abgelaufen, false);
  results.push({ mode, requests, preventedMixedAvailability: true, healed: true });
}
// Same-generation lane union is legitimate and must remain intact.
const same = baueStreamingAnsichten({ bekannt: { ...knownA, katalog_stand: B }, entdecken: discoverB, entdeckenUmfang: 'voll' }, master);
assert.deepEqual(same.bekannt.titel[0].dienste, ['Disney+', 'Netflix']);
assert.equal(streamingKatalogstaendePassen(same.bekannt, same.entdecken), true);
console.log(`E05-001: ${results.length} failure/repair paths and same-generation union passed`);
