/* Eastereggs-Engine (Block 3): Eligibility (deterministischer Match, kein Fuzzy,
   kein Netz, kein LLM), Schwellen-Unlock, Verfügbarkeits-Gate (Hybrid Unlock ≠
   Inhalt) und Achievement-Persistenz (kd:achievements). Reines Node — In-Memory-
   Storage-Treiber statt localStorage. Aufruf: node eggs_test.mjs */
import { setStorageDriver } from "./src/lib/storage.js";
import {
  SCHWELLEN_EGGS, EGG_NAME, qualifiziert, zaehleQualifiziert,
  berechneUnlocks, istVerfuegbar, liveVertreter,
  parseAchievements, serialisiereAchievements, ladeAchievements, speichereAchievements,
} from "./src/lib/eggs.js";
import { wuerfleTag, tagesSchluessel, schonGefeuertHeute, markiereGefeuert } from "./src/lib/eggFrequenz.js";
import { istKlaatu, crawlHeute, levenshtein } from "./src/lib/momentEggs.js";

const checks = [];
const check = (n, p) => { checks.push([n, p]); console.log((p ? "✓ " : "✗ ") + n); };

/* In-Memory-Treiber (kein localStorage nötig). */
const mem = new Map();
setStorageDriver({
  name: "mem",
  async get(k) { return mem.has(k) ? { key: k, value: mem.get(k) } : null; },
  async set(k, v) { mem.set(k, v); return { key: k, value: v }; },
  async delete(k) { mem.delete(k); return { key: k, deleted: true }; },
  async list(prefix = "") { return { keys: [...mem.keys()].filter((x) => x.startsWith(prefix)) }; },
});

/* ---- Config geladen ---- */
const cage = SCHWELLEN_EGGS.find((e) => e.id === "cage-alphabet");
const tepp = SCHWELLEN_EGGS.find((e) => e.id === "teppich");
check("Config: 2 Schwellen-Eggs (cage-alphabet, teppich)", SCHWELLEN_EGGS.length === 2 && !!cage && !!tepp);
check("Config: Schwellen cage=5, teppich=3", cage.schwelle === 5 && tepp.schwelle === 3);
check("Config: EGG_NAME gesetzt", EGG_NAME["cage-alphabet"] === "Das Cage-Alphabet");

/* ---- Match: titel ODER originaltitel + jahr, kein Fuzzy ---- */
check("Match: via originaltitel (Raising Arizona 1987)", qualifiziert({ titel: "Arizona Junior", originaltitel: "Raising Arizona", jahr: 1987 }, cage));
check("Match: via deutschem titel (Im Körper des Feindes)", qualifiziert({ titel: "Im Körper des Feindes", jahr: 1997 }, cage));
check("Match: via originaltitel wenn titel abweicht (Face/Off)", qualifiziert({ titel: "Irgendwas", originaltitel: "Face/Off", jahr: 1997 }, cage));
check("Match: Jahr disambiguiert — Con Air 2099 zählt NICHT", !qualifiziert({ titel: "Con Air", originaltitel: "Con Air", jahr: 2099 }, cage));
check("Match: kein Fuzzy — 'Con' (Prefix) zählt nicht", !qualifiziert({ titel: "Con", jahr: 1997 }, cage));
check("Match: kein Fuzzy — 'Con Airs' zählt nicht", !qualifiziert({ titel: "Con Airs", jahr: 1997 }, cage));
check("Match: Fremdfilm zählt nicht", !qualifiziert({ titel: "Some Random Movie", jahr: 2000 }, cage));

/* ---- Zählung & Unlock-Schwelle ---- */
const master = [
  { id: "1", titel: "Arizona Junior", originaltitel: "Raising Arizona", jahr: 1987, quelle: "dvd" },
  { id: "2", titel: "Con Air", originaltitel: "Con Air", jahr: 1997, quelle: "netflix" },
  { id: "3", titel: "Im Körper des Feindes", originaltitel: "Face/Off", jahr: 1997 },
  { id: "4", titel: "Mandy", originaltitel: "Mandy", jahr: 2018, quelle: "bluray" },  // cage UND teppich
  { id: "5", titel: "Willy's Wonderland", originaltitel: "Willy's Wonderland", jahr: 2021 },
  { id: "6", titel: "Fight Club", originaltitel: "Fight Club", jahr: 1999 },
  { id: "7", titel: "Trainspotting", originaltitel: "Trainspotting", jahr: 1996 },
  { id: "8", titel: "Taxi Driver", originaltitel: "Taxi Driver", jahr: 1976 },
  { id: "9", titel: "Some Random Movie", originaltitel: "Some Random Movie", jahr: 2000 },
  { id: "10", titel: "Con Air", originaltitel: "Con Air", jahr: 2099 },  // falsches Jahr -> kein Treffer
];
const z = zaehleQualifiziert(master);
check("Zählung: cage-alphabet = 5 (id10 wg. Jahr NICHT)", z["cage-alphabet"] === 5);
check("Zählung: teppich = 4 (inkl. Mandy)", z["teppich"] === 4);
check("Mandy zählt bewusst für BEIDE Listen", qualifiziert(master[3], cage) && qualifiziert(master[3], tepp));
const unlocks = berechneUnlocks(master);
check("Unlock: cage (≥5) und teppich (≥3) erreicht", unlocks.has("cage-alphabet") && unlocks.has("teppich"));

/* Unter Schwelle: nur 3 Cage -> kein Cage-Unlock (stateless; Einbahn macht der Aufrufer). */
const wenigerCage = master.filter((f) => f.id !== "5" && f.id !== "1");
check("Unlock: 3 Cage < Schwelle 5 -> kein cage-Unlock", !berechneUnlocks(wenigerCage).has("cage-alphabet"));

/* ---- Verfügbarkeit (Live-Pool-Gate, Hybrid Unlock ≠ Inhalt) ---- */
check("Verfügbar: physischer Besitz (dvd)", istVerfuegbar({ id: "1", quelle: "dvd" }, {}));
check("Verfügbar: virtueller Kauf zählt NICHT als Besitz", !istVerfuegbar({ id: "2", quelle: "netflix" }, {}));
check("Verfügbar: im aktuellen Kinoprogramm", istVerfuegbar({ id: "k", quelle: "" }, { kinoIds: new Set(["k"]) }));
check("Verfügbar: streambar auf angehaktem Abo", istVerfuegbar({ id: "s" }, { dienstePro: new Map([["s", ["Netflix"]]]), auswahl: ["Netflix"] }));
check("Verfügbar: NICHT auf abgewähltem Abo", !istVerfuegbar({ id: "s" }, { dienstePro: new Map([["s", ["Netflix"]]]), auswahl: ["Disney+"] }));
check("Verfügbar: nichts davon -> false", !istVerfuegbar({ id: "z", quelle: "" }, {}));

const ctx = { kinoIds: new Set(["5"]), dienstePro: new Map([["2", ["Netflix"]]]), auswahl: ["Netflix"] };
const live = liveVertreter(master, cage, ctx).map((f) => f.id).sort();
check("Live-Vertreter cage = {1,2,4,5} (Besitz∨Kino∨Abo)", JSON.stringify(live) === JSON.stringify(["1", "2", "4", "5"]));

/* ---- Achievement-Persistenz (kd:achievements) ---- */
check("parse: Array-Form", parseAchievements(JSON.stringify(["teppich"])).has("teppich"));
check("parse: {eggs:[...]}-Form", parseAchievements(JSON.stringify({ eggs: ["cage-alphabet"] })).has("cage-alphabet"));
check("parse: kaputt -> leeres Set", parseAchievements("nicht json").size === 0);
check("parse: null -> leeres Set", parseAchievements(null).size === 0);
const ser = serialisiereAchievements(new Set(["cage-alphabet", "teppich"]));
check("serialisiere: {eggs:[...]} mit beiden", /"eggs"/.test(ser) && parseAchievements(ser).size === 2);
await speichereAchievements(new Set(["cage-alphabet"]));
const geladen = await ladeAchievements();
check("lade/speichere: Roundtrip über store", geladen.has("cage-alphabet") && geladen.size === 1);

/* Einbahn (Aufrufer-Union simuliert): einmal freigeschaltet bleibt, auch bei leerem Master. */
const einbahn = new Set([...geladen, ...berechneUnlocks([])]);
check("Einbahn: Union verliert nichts bei leerem Master", einbahn.has("cage-alphabet"));

/* ---- Egg-Auto-Trigger-Frequenz (test-sicher: injizierte Uhr + RNG) ---- */
const lsMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => { lsMap.set(k, String(v)); },
  removeItem: (k) => { lsMap.delete(k); },
};
const MO = new Date(2026, 6, 20);   // Montag 20.07.2026 (19.07. ist Sonntag -> 20. = getDay 1)
const DI = new Date(2026, 6, 21);   // Dienstag (getDay 2)
check("Frequenz: tagesSchluessel YYYY-MM-DD", tagesSchluessel(MO) === "2026-07-20");
check("Frequenz: erlaubter Tag + Treffer-RNG -> true", wuerfleTag("t1", 1 / 40, { jetzt: MO, rnd: () => 0.0, tage: [1, 4, 5] }) === true);
check("Frequenz: erlaubter Tag + Fehl-RNG -> false", wuerfleTag("t2", 1 / 40, { jetzt: MO, rnd: () => 0.9, tage: [1, 4, 5] }) === false);
check("Frequenz: falscher Wochentag -> false (kein Wurf)", wuerfleTag("t3", 1, { jetzt: DI, rnd: () => 0.0, tage: [1, 4, 5] }) === false);
check("Frequenz: ohne Tage-Filter -> jeder Tag würfelt", wuerfleTag("t4", 1 / 50, { jetzt: DI, rnd: () => 0.0 }) === true);
let rufe = 0; const rndOnce = () => { rufe++; return 0.0; };
wuerfleTag("t5", 1, { jetzt: MO, rnd: rndOnce, tage: [1] });
wuerfleTag("t5", 1, { jetzt: MO, rnd: rndOnce, tage: [1] });
check("Frequenz: höchstens ein Wurf pro Tag (gecacht)", rufe === 1);
check("Frequenz: schonGefeuertHeute initial false", schonGefeuertHeute("cage", MO) === false);
markiereGefeuert("cage", MO);
check("Frequenz: markiereGefeuert -> heute true", schonGefeuertHeute("cage", MO) === true);
check("Frequenz: anderer Tag wieder false", schonGefeuertHeute("cage", DI) === false);
delete globalThis.localStorage;

/* ---- Moment-Eggs (B4): Klaatu (Tippfehler-tolerant) + Crawl (4. Mai + Kino) ---- */
check("Klaatu: exakte Phrase", istKlaatu("klaatu barada nikto") === true);
check("Klaatu: Tippfehler tolerant", istKlaatu("klatu barrada niktoo") === true);
check("Klaatu: Groß/Kleinschreibung egal", istKlaatu("KLAATU BARADA NIKTO") === true);
check("Klaatu: fehlt ein Wort -> false", istKlaatu("klaatu barada") === false);
check("Klaatu: Unsinn -> false", istKlaatu("guten abend zusammen heute") === false);
check("levenshtein: Referenz kitten/sitting = 3", levenshtein("kitten", "sitting") === 3);
const MAI4 = new Date(2026, 4, 4), MAI5 = new Date(2026, 4, 5);
const km1 = { matched: [{ film: { id: "x" } }] }, km0 = { matched: [] };
check("Crawl: 4. Mai + Kino-Treffer -> true", crawlHeute({ jetzt: MAI4, kinoMatches: km1 }) === true);
check("Crawl: 4. Mai ohne Treffer -> false", crawlHeute({ jetzt: MAI4, kinoMatches: km0 }) === false);
check("Crawl: anderer Tag -> false", crawlHeute({ jetzt: MAI5, kinoMatches: km1 }) === false);

/* B4-Egg-Verdrahtung: die beiden Trigger sind rein & deterministisch (kein Netz,
   kein RNG, keine Seiteneffekte) — App stützt Auto-Trigger + Gating darauf. */
check("Crawl: deterministisch (zwei Aufrufe, gleiches Ergebnis)",
  crawlHeute({ jetzt: MAI4, kinoMatches: km1 }) === crawlHeute({ jetzt: MAI4, kinoMatches: km1 }));
check("Crawl: robust ohne Argumente/kinoMatches -> boolean, kein Wurf",
  typeof crawlHeute() === "boolean" && crawlHeute({ jetzt: MAI4 }) === false);
check("Crawl: mehrere Treffer -> true (≥1 genügt)",
  crawlHeute({ jetzt: MAI4, kinoMatches: { matched: [{}, {}, {}] } }) === true);
check("Klaatu: deterministisch + robust (null/leer -> false, kein Throw)",
  istKlaatu("klaatu barada nikto") === istKlaatu("klaatu barada nikto") && istKlaatu(null) === false && istKlaatu("") === false);

const fails = checks.filter(([, p]) => !p);
console.log(`\n${checks.length - fails.length}/${checks.length} Checks bestanden.`);
console.log(fails.length ? "EGGS-TEST: BEFUNDE OBEN" : "EGGS-TEST BESTANDEN");
process.exit(fails.length ? 1 : 0);
