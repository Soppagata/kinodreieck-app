import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bestaetigeStaffel, initialisiereStaffelstaende, setzeSerienBeobachtung, staffelHinweis,
} from "./src/lib/staffeln.js";
import {
  beobachteteSerienEreignisse, SERIES_WATCH_CATALOG_FRESHNESS_MS, wienerKalendertag,
} from "./src/lib/seriesWatchEvents.js";
import { wochenansicht } from "./src/lib/wochenplan.js";

let checks = 0;
const ok = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const JETZT = new Date("2026-09-04T12:00:00Z");
const serie = (extra = {}) => ({
  watchmode_id: 42,
  titel: "Testserie",
  typ: "tv_series",
  staffeln_verfuegbar: 2,
  folgen_verfuegbar: 10,
  staffel_dienste: ["Netflix"],
  staffelstand_geprueft_am: "2026-09-04T08:00:00Z",
  wochen_bereich: "entdecken",
  ...extra,
});
const folgenStatus = { 42: {
  beobachtet: true, typ: "tv_series", staffel_alarm_basis: 2, folgen_alarm_basis: 9,
} };
const staffelStatus = { 42: {
  beobachtet: true, typ: "tv_series", staffel_alarm_basis: 1, folgen_alarm_basis: 10,
} };
const folgenEreignis = (extra = {}) => serie({
  letzte_folge: { season_number: 2, episode_number: 10, air_date: "2026-09-04" },
  ...extra,
});

ok("Europe/Vienna bestimmt den fachlichen Kalendertag unabhängig vom Prozess", () => {
  assert.equal(wienerKalendertag(new Date("2026-03-28T23:30:00Z")), "2026-03-29");
  assert.equal(wienerKalendertag(new Date("2026-10-24T22:30:00Z")), "2026-10-25");
  assert.equal(wienerKalendertag("2026-02-30"), null);
  assert.equal(wienerKalendertag("2026-09-04T12:00:00"), null);
});

ok("Erstes Beobachten übernimmt den aktuellen Stand still", () => {
  const katalog = folgenEreignis();
  const status = { 42: setzeSerienBeobachtung(null, katalog, true, JETZT) };
  assert.equal(staffelHinweis(katalog, status[42]), null);
  assert.deepEqual(beobachteteSerienEreignisse([katalog], status, JETZT), []);
});

ok("Fehlende Legacy-Baseline wird still initialisiert", () => {
  const katalog = folgenEreignis();
  const status = initialisiereStaffelstaende({ 42: {
    beobachtet: true, typ: "tv_series", titel: "Testserie",
  } }, [katalog], JETZT);
  assert.equal(status[42].staffel_alarm_basis, 2);
  assert.equal(status[42].folgen_alarm_basis, 10);
  assert.deepEqual(beobachteteSerienEreignisse([katalog], status, JETZT), []);
});

ok("Positive Folge mit Identität, Datum, Dienst und frischem Stand wird projiziert", () => {
  const [event] = beobachteteSerienEreignisse([folgenEreignis()], folgenStatus, JETZT);
  assert.equal(event.art, "folge");
  assert.equal(event.datum, "2026-09-04");
  assert.equal(event.staffel, 2);
  assert.equal(event.folge, 10);
  assert.equal(event.folgenstand, "Staffel 2 · Folge 10");
  assert.equal(event.plattform, "Netflix");
  assert.equal(event.abgeleitet, "beobachtet");
  assert.deepEqual(event.ziel, { art: "streaming", bereich: "entdecken", ref: 42 });
  assert.equal(event.id, "series-watch:42:folge:s2:e10:2026-09-04");
  assert.equal(event.dedupeKey, event.id);
});

ok("Positive Staffel mit konkretem Datum wird separat und stabil identifiziert", () => {
  const katalog = serie({ naechste_staffel: 2, naechste_staffel_am: "2026-09-05" });
  const [event] = beobachteteSerienEreignisse([katalog], staffelStatus, JETZT);
  assert.equal(event.art, "staffel");
  assert.equal(event.staffel, 2);
  assert.equal(event.folge, null);
  assert.equal(event.datum, "2026-09-05");
  assert.equal(event.id, "series-watch:42:staffel:s2:e-:2026-09-05");
});

ok("Nächste-Folge-Variante und belegte allgemeine Verfügbarkeit werden normalisiert", () => {
  const katalog = serie({
    staffel_dienste: [],
    dienste: ["Disney+"],
    letzte_folge: null,
    naechste_folge: { season_number: 2, episode_number: 11 },
    naechste_folge_am: "2026-09-06",
  });
  const [event] = beobachteteSerienEreignisse([katalog], folgenStatus, JETZT);
  assert.equal(event.folgenstand, "Staffel 2 · Folge 11");
  assert.equal(event.datum, "2026-09-06");
  assert.equal(event.plattform, "Disney+");
});

ok("Ein Delta ohne konkretes Datum bleibt ausschließlich Pinboard-Hinweis", () => {
  const katalog = serie({ letzte_folge: { season_number: 2, episode_number: 10 } });
  assert.equal(staffelHinweis(katalog, folgenStatus[42]).folgen_neu, true);
  assert.deepEqual(beobachteteSerienEreignisse([katalog], folgenStatus, JETZT), []);
});

ok("Fehlende Pflichtfelder und unklare Zeitwerte schließen fail-closed aus", () => {
  const gueltig = folgenEreignis();
  const varianten = [
    { ...gueltig, watchmode_id: null },
    { ...gueltig, watchmode_id: true },
    { ...gueltig, letzte_folge: { air_date: "2026-09-04" } },
    { ...gueltig, letzte_folge: { season_number: 2, episode_number: 10 } },
    { ...gueltig, staffel_dienste: [], dienste: [], plattform: "" },
    { ...gueltig, staffel_dienste: [{ name: "Netflix" }], dienste: [] },
    { ...gueltig, staffelstand_geprueft_am: null },
    { ...gueltig, staffelstand_geprueft_am: "2026-09-02T12:00:00Z" },
    { ...gueltig, staffelstand_geprueft_am: "2026-09-02T11:59:59Z" },
    { ...gueltig, staffelstand_geprueft_am: "2026-09-04T12:00:01Z" },
    { ...gueltig, staffelstand_geprueft_am: "2026-09-04T08:00:00" },
    { ...gueltig, staffelstand_geprueft_am: "2026-02-30T08:00:00Z" },
  ];
  for (const kandidat of varianten) {
    assert.deepEqual(beobachteteSerienEreignisse([kandidat], folgenStatus, JETZT), []);
  }
  assert.equal(SERIES_WATCH_CATALOG_FRESHNESS_MS, 48 * 60 * 60 * 1000);
});

ok("Heute und Tag +6 sind enthalten; Vergangenheit und Tag +7 nicht", () => {
  const am = (datum) => folgenEreignis({
    letzte_folge: { season_number: 2, episode_number: Number(datum.slice(-2)), air_date: datum },
  });
  assert.equal(beobachteteSerienEreignisse([am("2026-09-04")], folgenStatus, JETZT).length, 1);
  assert.equal(beobachteteSerienEreignisse([am("2026-09-10")], folgenStatus, JETZT).length, 1);
  assert.equal(beobachteteSerienEreignisse([am("2026-09-03")], folgenStatus, JETZT).length, 0);
  assert.equal(beobachteteSerienEreignisse([am("2026-09-11")], folgenStatus, JETZT).length, 0);
});

ok("Sommerzeitgrenzen verschieben weder Heute noch die Wochenposition", () => {
  const fruehling = new Date("2026-03-28T23:30:00Z");
  const katalog = folgenEreignis({
    staffelstand_geprueft_am: "2026-03-28T23:00:00Z",
    letzte_folge: { season_number: 2, episode_number: 10, air_date: "2026-03-29" },
  });
  const tage = wochenansicht({ katalog: [katalog], entdeckenStatus: folgenStatus, jetzt: fruehling });
  assert.equal(tage[0].iso, "2026-03-29");
  assert.equal(tage[0].eintraege[0].id, "series-watch:42:folge:s2:e10:2026-03-29");

  const herbst = beobachteteSerienEreignisse([folgenEreignis({
    staffelstand_geprueft_am: "2026-10-24T22:00:00Z",
    letzte_folge: { season_number: 2, episode_number: 10, air_date: "2026-10-25" },
  })], folgenStatus, new Date("2026-10-24T22:30:00Z"));
  assert.equal(herbst[0].datum, "2026-10-25");
});

ok("Ein Release-Zeitpunkt mit Offset wird auf den Wiener Tag projiziert", () => {
  const katalog = folgenEreignis({
    staffelstand_geprueft_am: "2026-03-28T23:00:00Z",
    letzte_folge: { season_number: 2, episode_number: 10, air_date: "2026-03-28T23:30:00Z" },
  });
  const [event] = beobachteteSerienEreignisse([katalog], folgenStatus, new Date("2026-03-28T23:45:00Z"));
  assert.equal(event.datum, "2026-03-29");
});

ok("Doppelte Katalogstände erzeugen nur ein Ereignis und vereinigen Dienste", () => {
  const a = folgenEreignis({ staffel_dienste: ["Netflix"] });
  const b = folgenEreignis({ staffel_dienste: ["Disney+"], wochen_bereich: "programm" });
  const events = beobachteteSerienEreignisse([a, b, a], folgenStatus, JETZT);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].plattformen, ["Disney+", "Netflix"]);
  assert.equal(events[0].plattform, "Disney+ · Netflix");
  assert.deepEqual(events[0].ziel, { art: "streaming", bereich: "programm", ref: 42 });
});

ok("Die Wochenansicht ergänzt abgeleitet und verändert den manuellen Plan nicht", () => {
  const plan = { version: 1, eintraege: [{
    id: "manuell", art: "termin", titel: "Eigener Termin", startdatum: "2026-09-04",
    wochentage: [5], intervall_wochen: 1, ende: { typ: "nie" }, aktiv: true,
  }] };
  const vorher = JSON.stringify(plan);
  const tage = wochenansicht({
    wochenplan: plan, katalog: [folgenEreignis()], entdeckenStatus: folgenStatus, jetzt: JETZT,
  });
  assert.equal(JSON.stringify(plan), vorher);
  assert.deepEqual(tage[0].eintraege.map((event) => event.id), [
    "manuell", "series-watch:42:folge:s2:e10:2026-09-04",
  ]);
});

ok("Stand bestätigen entfernt nur die Projektion; der manuelle Reminder bleibt", () => {
  const katalog = folgenEreignis();
  const bestaetigt = { 42: bestaetigeStaffel(folgenStatus[42], katalog, JETZT) };
  const plan = { eintraege: [{
    id: "manuell", art: "termin", titel: "Eigener Termin", startdatum: "2026-09-04",
    wochentage: [5], intervall_wochen: 1, ende: { typ: "nie" }, aktiv: true,
  }] };
  const tage = wochenansicht({ wochenplan: plan, katalog: [katalog], entdeckenStatus: bestaetigt, jetzt: JETZT });
  assert.deepEqual(tage[0].eintraege.map((event) => event.id), ["manuell"]);
});

ok("Entfernen aus Beobachtet entfernt die Projektion, nicht unabhängige Reminder", () => {
  const katalog = folgenEreignis();
  const entfernt = setzeSerienBeobachtung(folgenStatus[42], katalog, false, JETZT);
  const tage = wochenansicht({
    wochenplan: { eintraege: [{
      id: "manuell", art: "termin", titel: "Eigener Termin", startdatum: "2026-09-04",
      wochentage: [5], intervall_wochen: 1, ende: { typ: "nie" }, aktiv: true,
    }] },
    katalog: [katalog], entdeckenStatus: entfernt ? { 42: entfernt } : {}, jetzt: JETZT,
  });
  assert.deepEqual(tage[0].eintraege.map((event) => event.id), ["manuell"]);
});

ok("Der Projektionskern besitzt keine Netzwerk-, Radar-, Profil- oder Persistenzwirkung", () => {
  const quelle = readFileSync(new URL("./src/lib/seriesWatchEvents.js", import.meta.url), "utf8");
  assert.match(quelle, /^import \{ staffelHinweis \} from "\.\/staffeln\.js";/);
  assert.doesNotMatch(quelle, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|radar|profil|geschmack)\b/i);
  const start = readFileSync(new URL("./src/tabs/StartTab.jsx", import.meta.url), "utf8");
  assert.match(start, /katalog=\{serienKatalog\} master=\{master\} entdeckenStatus=\{entdeckenStatus\}/);
  const komponent = readFileSync(new URL("./src/components/Wochenplan.jsx", import.meta.url), "utf8");
  assert.match(komponent, /istBeobachtetProjektion/);
  assert.match(komponent, /if \(eintrag\.abgeleitet === "beobachtet"\) return;/);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("BEOBACHTET-2.0-TEST BESTANDEN (0 API-Calls, 0 Plan-Writes)");
