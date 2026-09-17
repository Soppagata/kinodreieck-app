import test from 'node:test';
import assert from 'node:assert/strict';
import { holeWikidataFundstelle, holeLocNfrSnapshot } from './supabase/functions/filmwissen-task/quellen.ts';
import { baueLocNfrComponentsV2Fixture } from './tests/fixtures/loc_nfr_components_v2.js';
const jsonHeader = { 'content-type': 'application/json' };
const loc = baueLocNfrComponentsV2Fixture();
for (const adapter of ['wikidata', 'loc']) {
  const call = (fetcher, timeoutMs = 25) => adapter === 'wikidata'
    ? holeWikidataFundstelle({ namespace: 'wikidata', kennung: 'Q123' }, { kontakt: 'https://example.test', fetcher, timeoutMs })
    : holeLocNfrSnapshot({ fetcher, timeoutMs });
  for (const phase of ['header', 'body', 'chunk']) {
    test(`${adapter}: ${phase} stall aborts and releases reader`, async () => {
      let signal, stream;
      const start = performance.now();
      const result = call(async (_, init) => {
        signal = init.signal;
        if (phase === 'header') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
        stream = new ReadableStream({ start(controller) {
          if (phase === 'chunk') controller.enqueue(new TextEncoder().encode('{'));
          signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        } });
        return new Response(stream, { headers: jsonHeader });
      });
      await assert.rejects(result, { code: 'adapter-timeout' });
      assert.equal(signal.aborted, true);
      assert.ok(performance.now() - start < 500);
      if (stream) assert.equal(stream.locked, false);
    });
  }
  for (const [name, response, code] of [
    ['redirect', () => new Response('', { status: 302 }), 'adapter-redirect'],
    ['rate', () => new Response('', { status: 429, headers: { 'retry-after': '8' } }), 'adapter-rate-limit'],
    ['overloaded', () => new Response('', { status: 503 }), 'adapter-rate-limit'],
    ['http', () => new Response('', { status: 403 }), 'adapter-http-403'],
    ['type', () => new Response('<html>'), 'adapter-content-type'],
    ['length', () => new Response('{}', { headers: { ...jsonHeader, 'content-length': '99999999' } }), 'antwort-zu-gross'],
    ['size', () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: jsonHeader }), 'antwort-zu-gross'],
    ['utf8', () => new Response(new Uint8Array([0xff]), { headers: jsonHeader }), 'adapter-utf8'],
    ['json', () => new Response('{', { headers: jsonHeader }), 'adapter-json'],
    ['missing-body', () => new Response(null, { headers: jsonHeader }), 'antwort-ohne-body'],
    ['network', () => { throw new Error('network'); }, 'adapter-netzfehler'],
    ['body-error', () => new Response(new ReadableStream({ start(c) { c.error(new Error('body')); } }), { headers: jsonHeader }), 'adapter-netzfehler'],
  ]) test(`${adapter}: ${name} keeps classification`, async () => {
    let body;
    await assert.rejects(call(async () => { const r = response(); body = r.body; return r; }), { code });
    if (body) assert.equal(body.locked, false);
  });
  test(`${adapter}: timely body clears timer`, async () => {
    let signal;
    const fetcher = async (_, init) => {
      signal = init.signal;
      return new Response(JSON.stringify(adapter === 'loc' ? loc : { query: { searchinfo: { totalhits: 0 }, search: [] } }), { headers: jsonHeader });
    };
    if (adapter === 'loc') assert.ok(await call(fetcher, 100));
    else await assert.rejects(holeWikidataFundstelle({ namespace: 'imdb', kennung: 'tt1234567' }, { kontakt: 'https://example.test', fetcher, timeoutMs: 100 }), { code: 'wikidata-nicht-gefunden' });
    await new Promise(r => setTimeout(r, 120));
    assert.equal(signal.aborted, false);
  });
}
