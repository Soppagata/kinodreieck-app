// Appended to the unchanged full-handler mock harness by the local runner.
const rolloutOldFunction = Deno.env.get('KD_ROLLOUT_OLD_FUNCTION') === '1';
const rolloutOldClient = await import(Deno.env.get('KD_ROLLOUT_OLD_CLIENT')!);
const rolloutNewClient = await import(new URL('./src/lib/filmwissen.js', import.meta.url).href);
const rolloutReport = (typ: string) => ({
  format: 'filmwissen-cache-v1', status: 'belegt', werk: { typ },
  version: { id: '22222222-2222-4222-8222-222222222222' },
  warum: { wert: 4, sicherheit: 'hoch', kurztext: `${typ} evidence.` },
  fundstellen: [{ kernaussagen: [`${typ} evidence.`] }],
});
// SQL shapes below are also executed against real PG17 in the SQL test.
for (const client of ['old', 'new']) for (const sql of ['old', 'new']) for (const typ of ['film', 'serie']) {
  test(`R-P06 matrix C=${client} F=${rolloutOldFunction ? 'old' : 'new'} SQL=${sql} ${typ}`, async () => {
    const lib = client === 'old' ? rolloutOldClient : rolloutNewClient;
    const id = lib.filmwissenRechercheKennung({ typ, tmdb_id: '348' });
    const p = ffPayload({ filmkennung: id }); p.film.typ = typ;
    const requests: Record<string, unknown>[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('/rpc/kd_filmwissen_aktuell_lesen')) {
        const args = JSON.parse(String(init?.body)); requests.push(args);
        if (sql === 'old' && args.p_kennung.includes(':')) {
          return antwort({ code: '22023', message: 'kennung_ungueltig' }, 400);
        }
        return antwort(sql === 'old' ? rolloutReport('film')
          : args.p_kennung.includes(':') ? rolloutReport(args.p_kennung.startsWith('tv:') ? 'serie' : 'film')
          : { format: 'filmwissen-cache-v1', status: 'gesperrt' });
      }
      return previous(input, init);
    }) as typeof fetch;
    try {
      forecastMit(FF_ANTWORT());
      const r = await forecastRuf(p);
      if (rolloutOldFunction && client === 'new') {
        gleich(r.status, 400, 'unavoidable old Function typed parser limit');
        gleich(requests.length, 0); gleich(anbieterAufrufe().length, 0);
        return;
      }
      gleich(r.status, 200);
      gleich(requests.length, 1, 'no numeric cache retry');
      if (!rolloutOldFunction) gleich(requests[0].p_kennung, `${typ === 'film' ? 'movie' : 'tv'}:348`);
      const expectedEvidence = rolloutOldFunction ? sql === 'old' : sql === 'new';
      gleich((r.daten.provenienz as Record<string, unknown>).warumHerkunft,
        expectedEvidence ? 'filmwissen' : 'persoenlich_geschaetzt');
      gleich(anbieterAufrufe().length, 1, 'only the requested personal forecast mock');
      gleich(rpc('kd_filmwissen_synthese_vorbereiten').length, 0);
      gleich(aufrufe.filter(a => /wikidata|loc.gov/.test(a.url)).length, 0);
    } finally { globalThis.fetch = previous; }
  });
}
for (const client of ['old', 'new']) for (const sql of ['old', 'new']) for (const typ of ['film', 'serie']) {
  test(`R-P06 synthesis C=${client} F=${rolloutOldFunction ? 'old' : 'new'} SQL=${sql} ${typ}`, async () => {
    const lib = client === 'old' ? rolloutOldClient : rolloutNewClient;
    const id = lib.filmwissenRechercheKennung({ typ, tmdb_id: '348' });
    const requests: Record<string, unknown>[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('/rpc/kd_filmwissen_synthese_vorbereiten')) {
        const args = JSON.parse(String(init?.body)); requests.push(args);
        const typed = args.p_kennung.includes(':');
        if ((sql === 'old') === typed) return antwort({ code: '22023', message: 'kennung_ungueltig' }, 400);
        return antwort({ status: 'cache_hit', versionId: '22222222-2222-4222-8222-222222222222' });
      }
      return previous(input, init);
    }) as typeof fetch;
    try {
      const r = await filmwissenRuf(id);
      if (rolloutOldFunction && client === 'new') {
        gleich(r.status, 400); gleich(requests.length, 0);
      } else if (!rolloutOldFunction && client === 'old') {
        gleich(r.status, 200); gleich(daten(r).status, 'nicht_zuordenbar'); gleich(requests.length, 0);
      } else if (!rolloutOldFunction && typ === 'serie') {
        gleich(r.status, 200); gleich(daten(r).status, 'quellen_nicht_verfuegbar'); gleich(requests.length, 0);
      } else {
        gleich(r.status, rolloutOldFunction === (sql === 'old') ? 200 : 500);
        if (r.status === 200) gleich(daten(r).status, 'cache_hit');
        gleich(requests.length, 1, 'one preparation, no alternate key retry');
      }
      gleich(starten().length, 0); gleich(anbieterAufrufe().length, 0);
      gleich(rpc('kd_filmwissen_quelle_abruf_reservieren').length, 0);
      gleich(rpc('kd_filmwissen_adapter_vorbereiten').length, 0);
      gleich(aufrufe.filter(a => /wikidata|loc.gov/.test(a.url)).length, 0);
    } finally { globalThis.fetch = previous; }
  });
}
if (!rolloutOldFunction) {
  for (const kennung of ['348', '00348', ' 348 ']) test(`R-P06 legacy synthesis ${JSON.stringify(kennung)} is terminal`, async () => {
    const r = await filmwissenRuf({ namespace: 'tmdb', kennung });
    gleich(r.status, 200); gleich(daten(r).status, 'nicht_zuordenbar');
    gleich(rpc('kd_filmwissen_synthese_vorbereiten').length, 0);
    gleich(rpc('kd_filmwissen_quelle_abruf_reservieren').length, 0);
    gleich(rpc('kd_filmwissen_adapter_vorbereiten').length, 0);
    gleich(starten().length, 0); gleich(anbieterAufrufe().length, 0);
    gleich(aufrufe.filter(a => /wikidata|loc.gov/.test(a.url)).length, 0);
  });
  for (const [code, message, status] of [['22023', 'other_validation', 400], ['42501', 'anmeldung_noetig', 403], ['XX000', 'db_error', 500]]) {
    test(`R-P06 unrelated SQL error ${code}/${message} stays visible`, async () => {
      const previous = globalThis.fetch;
      globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => String(input).includes('/rpc/kd_filmwissen_aktuell_lesen')
        ? Promise.resolve(antwort({ code, message }, Number(status))) : previous(input, init)) as typeof fetch;
      try {
        const r = await forecastRuf(ffPayload({ filmkennung: { namespace: 'tmdb', kennung: 'movie:348' } }));
        gleich(r.status, 500); gleich(r.daten.grund, 'forecast-filmwissen-cache-rpc');
        gleich(starten().length, 0); gleich(anbieterAufrufe().length, 0);
      } finally { globalThis.fetch = previous; }
    });
  }
  test('R-P06 IMDb validation error is not reclassified as an old TMDB contract', async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => String(input).includes('/rpc/kd_filmwissen_aktuell_lesen')
      ? Promise.resolve(antwort({ code: '22023', message: 'kennung_ungueltig' }, 400)) : previous(input, init)) as typeof fetch;
    try {
      const r = await forecastRuf(ffPayload({ filmkennung: { namespace: 'imdb', kennung: 'tt0078748' } }));
      gleich(r.status, 500); gleich(anbieterAufrufe().length, 0);
    } finally { globalThis.fetch = previous; }
  });
  for (const typ of [undefined, 'filmreihe', 'invalid']) test(`R-P06 no guessed numeric forecast type ${typ}`, async () => {
    const p = ffPayload({ filmkennung: { namespace: 'tmdb', kennung: '348' } }); p.film.typ = typ as string;
    const r = await forecastRuf(p);
    gleich(r.status, 400); gleich(rpc('kd_filmwissen_aktuell_lesen').length, 0); gleich(anbieterAufrufe().length, 0);
  });
  for (const typ of ['film', 'serie']) test(`R-P06 wrong cache type rejected after legacy ${typ} adaptation`, async () => {
    const p = ffPayload({ filmkennung: { namespace: 'tmdb', kennung: '348' } }); p.film.typ = typ;
    z.filmwissenAktuell = rolloutReport(typ === 'film' ? 'serie' : 'film');
    forecastMit(FF_ANTWORT());
    const r = await forecastRuf(p);
    gleich(r.status, 200);
    gleich((r.daten.provenienz as Record<string, unknown>).warumHerkunft, 'persoenlich_geschaetzt');
    gleich(anbieterAufrufe().length, 1); gleich(rpc('kd_filmwissen_synthese_vorbereiten').length, 0);
  });
}

if (!rolloutOldFunction) {
  for (const mode of ['unauthenticated', 'inactive', 'no-personal-ai']) test(`R-P06 numeric synthesis retains access gate ${mode}`, async () => {
    if (mode === 'unauthenticated') z.nutzerStatus = 401;
    else z.kontofreigabe = [{ role: 'member', active: mode !== 'inactive', personal_ai: false }];
    const r = await filmwissenRuf({ namespace: 'tmdb', kennung: '348' });
    gleich(r.status, mode === 'unauthenticated' ? 401 : 403);
    gleich(rpc('kd_filmwissen_synthese_vorbereiten').length, 0);
    gleich(starten().length, 0); gleich(anbieterAufrufe().length, 0);
  });
}
