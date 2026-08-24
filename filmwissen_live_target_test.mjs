import {
  FILMWISSEN_LIVE_TARGET_MAX,
  FILMWISSEN_PREFLIGHT_EXIT,
  FILMWISSEN_TARGET_ID_ENV,
  FILMWISSEN_TARGET_IDS_ENV,
  FilmwissenLiveTargetFehler,
  liesFilmwissenLiveTargets,
  normalisiereFilmwissenLiveTarget,
  runAiLiveSmoke,
  waehleFilmwissenCacheMiss,
} from "./tools/filmwissen_live_target.mjs";
import {
  OWNER_CORE_SIX_GUARD_ENV,
  OWNER_CORE_SIX_GUARD_VALUE,
} from "./tools/provider_raw_capture.mjs";

let bestanden = 0;
let gesamt = 0;
async function pruefe(name, fn) {
  gesamt += 1;
  try {
    if (!await fn()) throw new Error("falsch");
    bestanden += 1;
  } catch (error) {
    console.error(`FEHLER: ${name}: ${error?.message || "unbekannt"}`);
  }
}

const ZIEL_A = "imdb:tt0081505";
const ZIEL_B = "imdb:tt0078748";
const ZIEL_C = "wikidata:Q103569";
const CACHE_MISS = Object.freeze({
  format: "filmwissen-cache-v1",
  status: "cache_miss",
});
const CACHE_HIT = Object.freeze({
  format: "filmwissen-cache-v1",
  status: "belegt",
  werk: {
    id: "11111111-1111-4111-8111-111111111111",
    typ: "film",
    titel: "nicht-ausgeben",
    originaltitel: null,
    jahr: 1979,
  },
  version: {
    id: "22222222-2222-4222-8222-222222222222",
    nr: 1,
    schemaVersion: "v1",
    rubrikVersion: "v1",
    stand: "2026-08-24T10:00:00.000Z",
  },
  warum: { wert: 5, sicherheit: "hoch", kurztext: "belegt" },
  fundstellen: [{
    quelle: "loc-nfr",
    domain: "www.loc.gov",
    titel: "nicht-ausgeben",
    url: "https://www.loc.gov/example",
    veroeffentlichtAm: null,
    abgerufenAm: "2026-08-24T10:00:00.000Z",
    attribution: "Public domain",
    kernaussagen: ["Institutioneller Beleg."],
  }],
});

await pruefe("nur starke Recherchekennungen werden kanonisiert", () => {
  const imdb = normalisiereFilmwissenLiveTarget(" IMDb:TT0081505 ");
  const wikidata = normalisiereFilmwissenLiveTarget("wikidata:q103569");
  return imdb?.namespace === "imdb" && imdb?.kennung === "tt0081505"
    && wikidata?.namespace === "wikidata" && wikidata?.kennung === "Q103569"
    && normalisiereFilmwissenLiveTarget("fixture:test") === null
    && normalisiereFilmwissenLiveTarget("kinodreieck:test") === null
    && normalisiereFilmwissenLiveTarget("imdb:tt1") === null;
});

await pruefe("explizite Einzel- oder Listenwahl bleibt eindeutig und begrenzt", () => {
  const einzel = liesFilmwissenLiveTargets({ einzel: ZIEL_A });
  const liste = liesFilmwissenLiveTargets({ liste: `${ZIEL_A}, ${ZIEL_B}` });
  const abgelehnt = [
    {},
    { einzel: ZIEL_A, liste: ZIEL_B },
    { liste: `${ZIEL_A},${ZIEL_A}` },
    { liste: `${ZIEL_A},` },
    { liste: Array.from({ length: FILMWISSEN_LIVE_TARGET_MAX + 1 }, (_, i) =>
      `imdb:tt${String(1000000 + i)}`).join(",") },
  ].every((fall) => {
    try { liesFilmwissenLiveTargets(fall); return false; }
    catch (error) { return error instanceof FilmwissenLiveTargetFehler; }
  });
  return einzel.length === 1 && liste.length === 2 && abgelehnt;
});

await pruefe("Cache-Preflight liest seriell und waehlt genau den ersten Cache-Miss", async () => {
  const ziele = liesFilmwissenLiveTargets({ liste: `${ZIEL_A},${ZIEL_B},${ZIEL_C}` });
  const rufe = [];
  const auswahl = await waehleFilmwissenCacheMiss({
    ziele,
    liesAktuell: async (target) => {
      rufe.push(`${target.namespace}:${target.kennung}`);
      return { status: 200, daten: rufe.length === 1 ? CACHE_HIT : CACHE_MISS };
    },
  });
  return auswahl.geprueft === 2
    && auswahl.target.kennung === "tt0078748"
    && rufe.join(",") === `${ZIEL_A},${ZIEL_B}`;
});

await pruefe("formfremder, gesperrter oder fehlgeschlagener Readback stoppt ohne Folgeread", async () => {
  const ziele = liesFilmwissenLiveTargets({ liste: `${ZIEL_A},${ZIEL_B}` });
  const faelle = [
    { status: 503, daten: CACHE_MISS },
    { status: 200, daten: { format: "filmwissen-cache-v1", status: "fremd" } },
    { status: 200, daten: { format: "filmwissen-cache-v1", status: "gesperrt" } },
  ];
  for (const antwort of faelle) {
    let rufe = 0;
    let error = null;
    try {
      await waehleFilmwissenCacheMiss({
        ziele,
        liesAktuell: async () => { rufe += 1; return antwort; },
      });
    } catch (caught) { error = caught; }
    if (!(error instanceof FilmwissenLiveTargetFehler) || rufe !== 1
        || String(error.message).includes(ZIEL_A)) return false;
  }
  return true;
});

await pruefe("Owner-Einstieg preflightet providerfrei und startet den Smoke genau einmal", async () => {
  const privat = "privates-owner-geheimnis";
  const token = "privates-sitzungstoken";
  const env = {
    [OWNER_CORE_SIX_GUARD_ENV]: OWNER_CORE_SIX_GUARD_VALUE,
    [FILMWISSEN_TARGET_IDS_ENV]: `${ZIEL_A},${ZIEL_B}`,
    KD_SB_URL: "https://projekt-ref.supabase.co",
    KD_SB_ANON: "sb_publishable_test_1234567890",
    KD_TESTA_USER: "owner-lokal",
    KD_TESTA_PASS: privat,
    KD_MAIL_DOMAIN: "login.kinodreieck.at",
  };
  const rufe = [];
  const fetchImpl = async (url, optionen) => {
    rufe.push({ url: String(url), optionen });
    if (rufe.length === 1) {
      return new Response(JSON.stringify({ access_token: token }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const payload = JSON.parse(optionen.body);
    return new Response(JSON.stringify(
      payload.p_kennung === "tt0081505" ? CACHE_HIT : CACHE_MISS,
    ), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  let smokeStarts = 0;
  const ausgabe = [];
  const fehler = [];
  const code = await runAiLiveSmoke({
    env,
    fetchImpl,
    smokeImporter: async () => { smokeStarts += 1; },
    ausgabe: (wert) => ausgabe.push(String(wert)),
    fehlerAusgabe: (wert) => fehler.push(String(wert)),
  });
  const text = [...ausgabe, ...fehler].join("\n");
  return code === 0 && smokeStarts === 1 && rufe.length === 3
    && rufe[0].url.endsWith("/auth/v1/token?grant_type=password")
    && rufe.slice(1).every((ruf) =>
      ruf.url.endsWith("/rest/v1/rpc/kd_filmwissen_aktuell_lesen")
      && ruf.optionen.headers.Authorization === `Bearer ${token}`)
    && env[FILMWISSEN_TARGET_ID_ENV] === ZIEL_B
    && !(FILMWISSEN_TARGET_IDS_ENV in env)
    && /Cache-Miss nach 2 providerfreien Readback/.test(text)
    && ![ZIEL_A, ZIEL_B, privat, token, "owner-lokal", "nicht-ausgeben"]
      .some((marker) => text.includes(marker));
});

await pruefe("Preflightfehler bleibt sanitisiert und startet keinen Smoke", async () => {
  const leak = "private-target-or-account-marker";
  const env = {
    [OWNER_CORE_SIX_GUARD_ENV]: OWNER_CORE_SIX_GUARD_VALUE,
    [FILMWISSEN_TARGET_ID_ENV]: ZIEL_A,
    KD_SB_URL: "https://projekt-ref.supabase.co",
    KD_SB_ANON: "sb_publishable_test_1234567890",
    KD_TESTA_USER: "owner-lokal",
    KD_TESTA_PASS: "privat",
  };
  let smokeStarts = 0;
  const fehler = [];
  const code = await runAiLiveSmoke({
    env,
    fetchImpl: async () => { throw new Error(leak); },
    smokeImporter: async () => { smokeStarts += 1; },
    ausgabe: () => {},
    fehlerAusgabe: (wert) => fehler.push(String(wert)),
  });
  return code === FILMWISSEN_PREFLIGHT_EXIT && smokeStarts === 0
    && fehler.length === 1 && !fehler[0].includes(leak)
    && !fehler[0].includes(ZIEL_A);
});

await pruefe("Nicht-Owner-Smoke bleibt ohne Preflight unveraendert", async () => {
  let smokeStarts = 0;
  let fetches = 0;
  const code = await runAiLiveSmoke({
    env: {},
    fetchImpl: async () => { fetches += 1; throw new Error("darf nicht laufen"); },
    smokeImporter: async () => { smokeStarts += 1; },
    ausgabe: () => {},
    fehlerAusgabe: () => {},
  });
  return code === 0 && smokeStarts === 1 && fetches === 0;
});

console.log(`FILMWISSEN-LIVE-TARGET-TEST: ${bestanden}/${gesamt}`);
if (bestanden !== gesamt) process.exit(1);
