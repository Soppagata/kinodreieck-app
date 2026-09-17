import test from 'node:test';
import assert from 'node:assert/strict';
import { filmwissenKennungen, normalisiereFilmkennung } from './src/lib/filmwissen.js';
import { createFilmwissenService } from './src/services/filmwissen.js';
import { createFilmwissenTransport } from './src/lib/filmwissenTransport.js';
import { holeWikidataFundstelle } from './supabase/functions/filmwissen-task/quellen.ts';
const film = { typ: 'film', titel: 'Fixture', jahr: 2000, tmdb_id: '77' };
const serie = { ...film, typ: 'serie' };
const miss = { format: 'filmwissen-cache-v1', status: 'cache_miss' };
const report = typ => ({ format: 'filmwissen-cache-v1', status: 'belegt',
  werk: { typ, titel: 'Fixture', jahr: 2000, id: '11111111-1111-4111-8111-111111111111' },
  version: { id: '22222222-2222-4222-8222-222222222222', nr: 1, schemaVersion: 'v1', rubrikVersion: 'v1', stand: '2026-09-17T00:00:00Z' },
  warum: { wert: 4, sicherheit: 'hoch', kurztext: 'Fixture.' },
  fundstellen: [{ quelle: 'fixture', domain: 'example.test', titel: 'Fixture', url: 'https://example.test/fixture', attribution: 'Fixture', kernaussagen: ['Fixture.'] }],
});
const snapshot = { mode: 'account', state: 'ready', account: { id: 'test-account' }, capabilities: { remoteStorage: true, personalAi: true } };
const auth = { getSnapshot: () => snapshot, requireAccount: () => snapshot };
test('TMDB media identities are separate; numeric legacy input fails closed', () => {
  assert.deepEqual(filmwissenKennungen(film), [{ namespace: 'tmdb', kennung: 'movie:77' }]);
  assert.deepEqual(filmwissenKennungen(serie), [{ namespace: 'tmdb', kennung: 'tv:77' }]);
  assert.equal(normalisiereFilmkennung('tmdb', '77'), null);
  assert.equal(normalisiereFilmkennung('tmdb', 'movie:0077'), 'movie:77');
});
test('typed identity survives HTTP RPC transport', async () => {
  const t = createFilmwissenTransport({ config: { supabaseUrl: 'https://test.supabase.co' }, getAccessToken: async () => 'fixture', fetchImpl: async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), { p_namespace: 'tmdb', p_kennung: 'tv:77' });
    return new Response(JSON.stringify(miss));
  } });
  assert.equal((await t(filmwissenKennungen(serie)[0])).ok, true);
});
test('concurrent film / series reads and research never share evidence or in-flight work', async () => {
  const calls = [], resolvers = [];
  let aiCalls = 0;
  const s = createFilmwissenService({ auth, transport: id => { calls.push(id); return new Promise(r => resolvers.push(r)); }, ai: { runTask: async () => { aiCalls++; throw new Error('unexpected synthesis'); } } });
  const movie = s.recherchiere(film), tv = s.recherchiere(serie);
  assert.equal(calls.length, 2);
  resolvers.forEach(r => r({ ok: true, data: report('film') }));
  assert.equal((await movie).status, 'belegt');
  assert.equal((await tv).status, 'gesperrt');
  assert.equal(aiCalls, 0);
});
test('IMDb miss then wrong film report cannot become series evidence', async () => {
  const ids = [];
  const s = createFilmwissenService({ auth, transport: async id => { ids.push(id); return { ok: true, data: id.namespace === 'imdb' ? miss : report('film') }; } });
  assert.equal((await s.read({ ...serie, imdb_id: 'tt1234567' })).status, 'cache_miss');
  assert.equal(ids[1].kennung, 'tv:77');
});
test('valid series IMDb and movie TMDB reports still work', async () => {
  for (const entry of [{ ...serie, imdb_id: 'tt1234567' }, film]) {
    const ids = [];
    const s = createFilmwissenService({ auth, transport: async id => { ids.push(id); return { ok: true, data: report(entry.typ) }; } });
    assert.equal((await s.recherchiere(entry)).werk.typ, entry.typ);
    assert.equal(ids.length, 1);
  }
});
test('film adapter rejects television, collection and untyped TMDB before any source request', async () => {
  let calls = 0;
  for (const kennung of ['tv:77', 'collection:77', '77']) {
    await assert.rejects(holeWikidataFundstelle({ namespace: 'tmdb', kennung }, { kontakt: 'https://example.test', fetcher: async () => { calls++; } }), { code: 'kennung-ungueltig' });
  }
  assert.equal(calls, 0);
});
test('movie adapter strips only the verified prefix for exact P4947 lookup', async () => {
  let calls = 0;
  await assert.rejects(holeWikidataFundstelle({ namespace: 'tmdb', kennung: 'movie:77' }, { kontakt: 'https://example.test', fetcher: async url => {
    calls++;
    assert.equal(new URL(url).searchParams.get('srsearch'), 'haswbstatement:P4947=77');
    return Response.json({ query: { searchinfo: { totalhits: 0 }, search: [] } });
  } }), { code: 'wikidata-nicht-gefunden' });
  assert.equal(calls, 1);
});
