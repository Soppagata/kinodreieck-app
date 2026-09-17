import assert from 'node:assert/strict';
import { createProducer, targetTitle } from './tests/fixtures/review49_p08_feed.mjs';
import { validateEntdeckenDailyFeed } from './supabase/functions/entdecken-daily-task/contract.js';
import { validateWebDiscoveryFeed } from './src/lib/webDiscoveryFeed.js';
import { createEntdeckenRecommendations, publicDiscoveryCandidates, webDiscoveryFeedCards } from './src/lib/entdeckenUi.js';
import { runEntdeckenDailyRefresh } from './supabase/functions/entdecken-daily-task/runner.js';
import { createEntdeckenDailyResponse } from './supabase/functions/entdecken-daily-task/responseContract.js';
import { createEntdeckenDailyFeedService } from './src/services/entdeckenDailyFeed.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const now = new Date('2026-09-17T10:00:00Z');
const film = { t: targetTitle, j: 2024, film_at_id: '95001', g: ['Drama'], z: ['2026-09-17T20:00:00Z'] };
const program = { filme: [film] };
const profile = { signale: [{ art: 'genre', wert: 'Drama', richtung: 'zieht_an', staerke: 4 }] };
const input = (feed) => ({ webDiscoveryFeed: feed, streamingEntdecken: { region: 'AT', titel: [] }, master: [], profile,
  selectedServices: [], program, now, selectionDay: '2026-09-17' });
const chartCards = (feed, overrides = {}) => webDiscoveryFeedCards({ webDiscoveryFeed: feed, program, now, ...overrides })
  .filter((r) => r.sourceId === 'chart:oefi-weekend-at');

for (const format of [8, 9]) {
  const producer = createProducer({ format });
  const result = await producer.run();
  const feed = result.feed;
  check(`F${format}: echter Adapter/Runner + Resolver validieren nachvollziehbare OEFI-Annotation`, () => {
    assert.equal(result.status, 'fresh'); assert.equal(result.writes, 1);
    assert.equal(validateEntdeckenDailyFeed(feed).ok, true); assert.equal(validateWebDiscoveryFeed(feed).ok, true);
    assert.equal(feed.items.length, 50); assert.equal(feed.annotations.length, 1);
    assert.equal(producer.inputs().length, 15); assert.ok(producer.inputs().every((i) => i.sourceId === 'chart:oefi-weekend-at'));
    assert.equal(feed.annotations[0].qid, 'Q12345'); assert.equal(feed.annotations[0].resolvedAt, '2026-09-17T02:00:00.000Z');
    assert.equal(producer.resolver.telemetry().requests, 16);
  });
  const requests = producer.requests();
  await producer.run();
  check(`F${format}: positiver und negativer Resolvercache verhindern neue Requests`, () => {
    assert.equal(producer.requests(), requests); assert.equal(producer.resolver.telemetry().cacheHits, 1);
    assert.equal(producer.resolver.telemetry().negativeHits, 14);
  });
  const readResult = await runEntdeckenDailyRefresh({ adapter: producer.adapter, repository: {
    ...producer.repository, claimRefresh: async () => ({ feedEnabled: true, today: '2026-09-17', isoWeek: '2026-W38',
      refresh: false, feed, maxAttempts: 1 }),
  } });
  const response = createEntdeckenDailyResponse(readResult, {});
  const session = { mode: 'account', state: 'ready', account: { id: 'synthetic' }, capabilities: { remoteStorage: true } };
  const service = createEntdeckenDailyFeedService({ config: { entdeckenDailyFeedEnabled: true, supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'public' },
    auth: { getSnapshot: () => session }, getAccount: () => session.account, getAccessToken: async () => 'synthetic-token',
    currentDay: () => '2026-09-17', fetchImpl: async () => Response.json(response) });
  const browser = await service.load();
  check(`F${format}: Browserdienst und beide Kartenwege behalten OEFI-Beleg genau einmal`, () => {
    assert.equal(browser.status, 'fresh'); assert.deepEqual(browser.feed.annotations, feed.annotations);
    const rows = createEntdeckenRecommendations(input(browser.feed));
    assert.equal(rows.popularPool.length, 1); assert.equal(rows.personal.length, 1);
    for (const card of [rows.popularPool[0], chartCards(browser.feed)[0]]) {
      assert.equal(card.filmAtId, '95001'); assert.equal(card.targetId, 'film-at:95001');
      assert.deepEqual(card.popularity, feed.items[0].popularity); assert.equal(card.popularity.value, 10000);
      assert.equal(card.externalEvidence[0].url, feed.items[0].sourceUrl);
      assert.equal(card.externalEvidence[0].retrievedOn, feed.items[0].popularity.measuredOn);
      assert.equal(card.wikidata.qid, 'Q12345');
    }
    assert.equal(chartCards(feed).length, 1);
  });
  check(`F${format}: Remake, mehrdeutige Werke, fehlende/alte Termine und archivierte Programme blockieren`, () => {
    for (const overrides of [
      { program: { filme: [{ ...film, j: 1994 }] } },
      { program: { filme: [film, { ...film, film_at_id: '95002' }] } },
      { program: { filme: [{ ...film, z: [] }] } },
      { program: { filme: [{ ...film, z: ['2026-09-16T20:00:00Z'] }] } },
      { program: null }, { programInfo: { abgelaufen: true } },
      { programInfo: { gueltigBis: now.toISOString() } }, { program: { ...program, archiviert: true } },
    ]) assert.equal(chartCards(feed, overrides).length, 0);
  });
  check(`F${format}: strenger Annotationsvertrag auf beiden Grenzen`, () => {
    const invalid = [
      (f) => { f.annotations[0].mediaType = 'series'; }, (f) => { f.annotations[0].releaseYear = null; },
      (f) => { delete f.annotations[0].qid; }, (f) => { f.annotations[0].qid = 'guess'; },
      (f) => { f.annotations[0].sourceItemId = f.items.find((i) => i.sourceId !== 'chart:oefi-weekend-at').sourceItemId; },
      (f) => { f.annotations.push(f.annotations[0]); }, (f) => { f.annotations[0].externalIds.watchmode = '55'; },
      (f) => { f.annotations[0].externalIds.tmdb = 'not-an-id'; }, (f) => { f.annotations[0].externalIds.tmdb = 12345; }, (f) => { f.annotations[0].resolvedAt = '2026-02-30T00:00:00.000Z'; },
      (f) => { f.annotations = null; }, (f) => { f.annotations = [null]; },
      (f) => { f.items[0].releaseYear = 2024; }, (f) => { f.items[0].externalIds = { imdb: 'tt1234567' }; },
    ];
    for (const mutate of invalid) {
      const f = structuredClone(feed); mutate(f);
      assert.equal(validateEntdeckenDailyFeed(f).ok, false, String(mutate)); assert.equal(validateWebDiscoveryFeed(f).ok, false, String(mutate));
    }
  });
  check(`F${format}: alte Feeds, ehrliche Fueller, Dienstwahl und 50er-Pool bleiben erhalten`, () => {
    const old = structuredClone(feed); delete old.annotations;
    assert.equal(validateEntdeckenDailyFeed(old).ok, true); assert.equal(validateWebDiscoveryFeed(old).ok, true);
    assert.equal(chartCards(old).length, 0);
    const filler = createEntdeckenRecommendations(input(old)).popularPool[0];
    assert.equal(filler.popularity, undefined); assert.deepEqual(filler.externalEvidence, []);
    const fullProgram = { filme: Array.from({ length: 15 }, (_, i) => ({ ...film, t: i ? `Fueller ${i}` : targetTitle, film_at_id: String(95001 + i) })) };
    const all = createEntdeckenRecommendations({ ...input(feed), program: fullProgram, selectedServices: ['Netflix', 'Prime Video', 'Disney+', 'Apple TV'] });
    assert.equal(all.popularPool.length, 50);
    const prime = createEntdeckenRecommendations({ ...input(feed), program: null, selectedServices: ['Prime Video'] });
    assert.equal(prime.popularPool.length, 10); assert.ok(prime.popularPool.every((r) => r.services.includes('Prime Video')));
  });
  for (const resolverMode of ['missing', 'ambiguous', 'type-conflict', 'missing-year', 'unavailable']) {
    const p = createProducer({ format, resolverMode }); const r = await p.run();
    check(`F${format}: Resolver ${resolverMode} erzeugt keine Chartidentitaet`, () => {
      assert.equal(r.status, 'fresh'); assert.equal(r.feed.annotations, undefined); assert.equal(chartCards(r.feed).length, 0);
      assert.equal(createEntdeckenRecommendations(input(r.feed)).popularPool[0].popularity, undefined);
      if (resolverMode === 'unavailable') assert.equal(p.requests(), 1);
    });
  }

  for (const targetType of ['film', 'series']) {
    const base = structuredClone(feed);
    const target = base.items.find((r) => r.sourceId === 'chart:flixpatrol-prime-at' && r.mediaType === targetType);
    target.genres = ['Drama']; target.externalIds.tmdb = '77777';
    // Die Feed-FlixPatrol-ID bleibt vorhanden, ist auf der Gegenseite nicht vergleichbar.
    const catalog = { watchmode_id: 80001, titel: target.title, typ: targetType, jahr: target.releaseYear,
      tmdb_id: '77777', dienste: ['Prime Video'], genres: ['Drama'] };
    const uiInput = { ...input(base), program: null, selectedServices: ['Prime Video'],
      streamingEntdecken: { region: 'AT', titel: [catalog] } };
    for (const source of ['master', 'catalogCandidates']) {
      const otherType = targetType === 'film' ? ' TV_SERIES ' : ' Movie ';
      const seen = { titel: 'Anderes Werk', title: 'Anderes Werk', jahr: 2001, year: 2001,
        typ: otherType, type: otherType, tmdb_id: '77777', externalIds: { tmdb: '77777' },
        bewertung: { wie: 4, was: 4, warum: 4 }, seenStatus: 'gesehen' };
      check(`F${format}: ${source}, ${targetType} gegen ${otherType.trim()} kollidiert nicht`, () => {
        const projected = publicDiscoveryCandidates({ webDiscoveryFeed: base, selectedServices: ['Prime Video'], includeSeen: true, requireMetadata: false,
          master: source === 'master' ? [seen] : [], catalogCandidates: source === 'catalogCandidates' ? [seen] : [] });
        assert.equal(projected.find((r) => r.sourceItemId === target.sourceItemId).seen, false);
        const args = source === 'master' ? { master: [seen] } : {
          // Unbekanntes Jahr bleibt als Seen-ID vergleichbar, ist aber kein zweiter Metadatenmatch.
          streamingKnown: { region: 'AT', titel: [{ ...catalog, ...seen, jahr: null, watchmode_id: 80002 }] }, entdeckenStatus: { 80002: 'gesehen' },
        };
        const recommendations = createEntdeckenRecommendations({ ...uiInput, ...args });
        assert.ok(recommendations.popularPool.some((r) => r.sourceItemId === target.sourceItemId));
        assert.ok(recommendations.personal.some((r) => r.targetId === 'watchmode:80001'));
      });
    }
    check(`F${format}: ${targetType} gleiche Identitaet/Sehkriterien/ID-Konflikt/Titel-Jahr-Typ bleiben erhalten`, () => {
      const matchesSeen = (entry) => publicDiscoveryCandidates({ webDiscoveryFeed: base, master: [entry], selectedServices: ['Prime Video'], includeSeen: true, requireMetadata: false })
        .find((r) => r.sourceItemId === target.sourceItemId).seen;
      const seen = { titel: target.title, jahr: target.releaseYear, typ: targetType, tmdb_id: '77777', gesehen: true };
      assert.equal(matchesSeen(seen), true);
      assert.equal(matchesSeen({ ...seen, gesehen: false }), false);
      assert.equal(matchesSeen({ ...seen, tmdb_id: '88888' }), false);
      assert.equal(matchesSeen({ ...seen, tmdb_id: undefined }), true);
      assert.equal(matchesSeen({ ...seen, tmdb_id: undefined, jahr: 1991 }), false);
      assert.equal(matchesSeen({ ...seen, tmdb_id: undefined, typ: targetType === 'film' ? 'series' : 'film' }), false);
      target.externalIds.imdb = 'tt1234567';
      assert.equal(matchesSeen({ ...seen, imdb_id: 'tt7654321' }), false);
      assert.equal(matchesSeen({ ...seen, imdb_id: 'tt1234567' }), true);
      assert.equal(matchesSeen({ ...seen, typ: targetType === 'film' ? 'series' : 'film', imdb_id: 'tt1234567' }), false);
      const catalogSeen = (entry) => publicDiscoveryCandidates({ webDiscoveryFeed: base, catalogCandidates: [entry],
        selectedServices: ['Prime Video'], includeSeen: true, requireMetadata: false })
        .find((r) => r.sourceItemId === target.sourceItemId).seen;
      assert.equal(catalogSeen({ ...seen, seenStatus: 'gesehen' }), true);
      assert.equal(catalogSeen({ ...seen, gesehen: true, seenStatus: null }), false);
      assert.equal(catalogSeen({ ...seen, seenStatus: 'gesehen', imdb_id: 'tt7654321' }), false);
      const same = createEntdeckenRecommendations({ ...uiInput, master: [seen] });
      assert.ok(!same.popularPool.some((r) => r.sourceItemId === target.sourceItemId)); assert.equal(same.personal.length, 0);
    });
  }
}
console.log(`P08 Entdecken: ${checks} checks passed`);
