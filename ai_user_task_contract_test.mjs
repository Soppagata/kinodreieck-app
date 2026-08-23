#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  AI_USER_TASKS,
  AiUserTaskContractError,
  pruefeAiUserTaskReadback,
} from "./tools/ai_user_task_contract.mjs";
import { erteileEinwilligung, leeresProfil } from "./src/lib/profil.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`✓ ${name}`);
};
const scheitert = (name, code, fn) => check(name, () => {
  assert.throws(fn, (error) => error instanceof AiUserTaskContractError && error.code === code);
});
const clone = (wert) => structuredClone(wert);

const IDS = Object.freeze({
  vorgang: "11111111-2222-4333-8444-555555555555",
  version: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  werk: "99999999-8888-4777-8666-555555555555",
});
const JETZT = "2026-08-23T09:00:00.000Z";
const VERBRAUCH = Object.freeze({
  inputTokens: 120,
  outputTokens: 40,
  kostenUsdCent: 0.42,
  dauerMs: 150,
  stopReason: "end_turn",
});
const huelle = (task, data, extra = {}) => ({
  ok: true,
  task,
  vorgangId: IDS.vorgang,
  modellAlias: task === "media-batch-extract" || task === "blog-profile-extract" ? "klein" : "gross",
  modell: "claude-test-20260823",
  data,
  verbrauch: { ...VERBRAUCH },
  ...extra,
});

const master = [{
  id: "film-alien",
  titel: "Alien",
  originaltitel: "Alien",
  jahr: 1979,
  genre: ["Sci-Fi", "Horror"],
  tags: ["düster"],
}];

const finderAntwort = huelle("intelligent-search", {
  harte_filter: {
    genres: ["sci-fi"], kategorien: [], dekaden: [1970], quellen: [], zeit: [],
    titel: ["Alien"], reihen: [], jahrMin: null, jahrMax: 1985,
  },
  weiche_wuensche: { stimmungen: [] },
  ausschluesse: { genres: ["Romance"], dekaden: [] },
  entdecken: false,
  nicht_unterstuetzt: [],
});

const profileAntwort = huelle("profile-extract", {
  signale: [{
    art: "genre", wert: "Horror", richtung: "zieht_an", staerke: 5,
    sicherheit: "hoch", quelle: "K1", beleg: "Ich liebe Horrorfilme.",
  }],
  filme: [{ titel: "Alien", jahr: 1979, richtung: "zieht_an" }],
  nicht_deutbar: [],
  achsen_tendenz: { wie: 5, was: 3, warum: null },
  verworfen_ohne_beleg: 0,
});

const forecastAntwort = huelle("film-forecast", {
  format: "film-prognose-v1",
  achsen: { wie: 5, was: 4, warum: null },
  passung: 88,
  kategorie_vorschlag: null,
  sicherheit: "mittel",
  begruendung: "Die ruhige, düstere Inszenierung passt zu den bestätigten Signalen.",
  verwendete_signale: [{ id: "S1", art: "genre", wert: "Horror", richtung: "zieht_an" }],
}, { provenienz: { warumHerkunft: "persoenlich_geschaetzt", filmwissenVersionId: null } });

const filmwissenReadback = {
  format: "filmwissen-cache-v1",
  status: "belegt",
  werk: { id: IDS.werk, typ: "film", titel: "Alien", originaltitel: "Alien", jahr: 1979 },
  version: { id: IDS.version, nr: 1, schemaVersion: "v1", rubrikVersion: "v1", stand: JETZT },
  warum: { wert: 5, sicherheit: "hoch", kurztext: "Die formale Strenge trägt den Film." },
  fundstellen: [{
    quelle: "Library of Congress", domain: "loc.gov", titel: "Alien",
    url: "https://www.loc.gov/item/alien", veroeffentlichtAm: null, abgerufenAm: JETZT,
    attribution: "Library of Congress", kernaussagen: ["Der Film ist institutionell dokumentiert."],
  }],
};
const filmwissenAntwort = huelle("filmwissen-synthese", { status: "belegt", versionId: IDS.version });

const stapelAntwort = huelle("media-batch-extract", {
  kandidaten: [{
    titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null,
    vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch",
  }],
  warnungen: [],
});

const artikelPayload = {
  artikel: {
    id: "artikel_17b",
    titel: "Ein strenger Filmtext",
    text: "Die Kamera bleibt lange still und beobachtet, wie sich jede kleinste Bewegung verändert.",
  },
  listen: { genres: ["Drama", "Science-Fiction"], tags: ["ruhig", "präzise"] },
};
const beleg = "Die Kamera bleibt lange still und beobachtet";
const blogAntwort = huelle("blog-profile-extract", {
  geschmackszuege: [{
    art: "inszenierung", wert: "präzise", richtung: "zieht_an", staerke: 4,
    sicherheit: "hoch", beleg,
  }],
  vokabular: [{
    wort: "Nachtkino", beschreibung: "ruhig und präzise inszeniert",
    genres: ["Drama"], tags: ["ruhig"], beleg,
  }],
});
const vorschaukopf = {
  quelle: "bloganalyse",
  articleId: artikelPayload.artikel.id,
  contentHash: "a".repeat(64),
  analyzedAt: JETZT,
  promptVersion: "blog-profile-v1",
};
const profil = erteileEinwilligung(leeresProfil(), JETZT);

const ergebnisse = new Map();
ergebnisse.set("intelligent-search", pruefeAiUserTaskReadback({
  task: "intelligent-search", antwort: finderAntwort, kontext: { master },
}));
ergebnisse.set("profile-extract", pruefeAiUserTaskReadback({
  task: "profile-extract", antwort: profileAntwort, kontext: { jetzt: JETZT },
}));
ergebnisse.set("film-forecast", pruefeAiUserTaskReadback({
  task: "film-forecast", antwort: forecastAntwort,
  kontext: { profilVersion: "p-test", promptVersion: "v1", jetzt: JETZT },
}));
ergebnisse.set("filmwissen-synthese", pruefeAiUserTaskReadback({
  task: "filmwissen-synthese", antwort: filmwissenAntwort,
  kontext: { rpcReadback: filmwissenReadback },
}));
ergebnisse.set("media-batch-extract", pruefeAiUserTaskReadback({
  task: "media-batch-extract", antwort: stapelAntwort, kontext: { master: [] },
}));
ergebnisse.set("blog-profile-extract", pruefeAiUserTaskReadback({
  task: "blog-profile-extract", antwort: blogAntwort,
  kontext: { artikelPayload, profil, vokabular: [], vorschaukopf },
}));

check("alle sechs Nutzeraufgaben besitzen einen erfolgreichen Roundtrip", () => {
  assert.deepEqual([...ergebnisse.keys()], AI_USER_TASKS);
  assert.ok([...ergebnisse.values()].every((wert) => wert.ok === true));
});
check("intelligent-search bleibt ausdrücklich Sitzungszustand", () => {
  assert.equal(ergebnisse.get("intelligent-search").persistenz, "sitzung");
  assert.equal(ergebnisse.get("intelligent-search").gelesen.sig.titel[0].id, "film-alien");
});
check("profile-extract liest Produktionssignale und Rahmen lokal zurück", () => {
  const gelesen = ergebnisse.get("profile-extract").gelesen;
  assert.equal(gelesen.extraktion.signale[0].wert, "Horror");
  assert.equal(gelesen.profil.signale[0].wert, "Horror");
  assert.equal(gelesen.profil.filme[0].titel, "Alien");
});
check("film-forecast persistiert ein vom Produktionsmodell lesbares Prognoseobjekt", () => {
  assert.equal(ergebnisse.get("film-forecast").gelesen.ergebnis.passung, 88);
  assert.equal(ergebnisse.get("film-forecast").gelesen.profilVersion, "p-test");
});
check("filmwissen-synthese bindet Task-Version an den providerfreien RPC-Readback", () => {
  assert.equal(ergebnisse.get("filmwissen-synthese").gelesen.version.id, IDS.version);
});
check("media-batch-extract erzeugt einen lokalen Übernahmesnapshot", () => {
  assert.equal(ergebnisse.get("media-batch-extract").uebernahme.mediathek[0].titel, "Alien");
});
check("blog-profile-extract liest Profil und Vokabular über Produktionsverträge zurück", () => {
  const gelesen = ergebnisse.get("blog-profile-extract").gelesen;
  assert.equal(gelesen.profil.signale.at(-1).wert, "präzise");
  assert.equal(gelesen.vokabular.at(-1).wort, "Nachtkino");
});

scheitert("unbekannte Nutzeraufgabe wird geschlossen abgelehnt", "TASK_UNBEKANNT", () =>
  pruefeAiUserTaskReadback({ task: "health", antwort: huelle("health", {}) }));
scheitert("Zusatzfeld in der Erfolgshülle wird abgelehnt", "ERFOLGSHUELLE_FORM", () =>
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort: { ...finderAntwort, fremd: true }, kontext: { master } }));
scheitert("abweichende Task-Kennung wird abgelehnt", "TASK_ABWEICHUNG", () =>
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort: { ...finderAntwort, task: "profile-extract" }, kontext: { master } }));
scheitert("formfremde Vorgangs-ID wird abgelehnt", "VORGANG_ID", () =>
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort: { ...finderAntwort, vorgangId: "kein-uuid" }, kontext: { master } }));
scheitert("Verbrauch mit Zusatzfeld wird abgelehnt", "VERBRAUCH_FORM", () =>
  pruefeAiUserTaskReadback({
    task: "intelligent-search",
    antwort: { ...finderAntwort, verbrauch: { ...VERBRAUCH, token: "fremd" } },
    kontext: { master },
  }));
scheitert("kostenloser Nicht-Cache-Erfolg wird abgelehnt", "VERBRAUCH_NICHT_POSITIV", () =>
  pruefeAiUserTaskReadback({
    task: "intelligent-search",
    antwort: { ...finderAntwort, verbrauch: { ...VERBRAUCH, kostenUsdCent: 0 } },
    kontext: { master },
  }));
scheitert("ungültiges Profilextraktionssignal scheitert am Produktionsparser", "PRODUKTIONSPARSER", () => {
  const antwort = clone(profileAntwort);
  antwort.data.signale[0].staerke = 0;
  pruefeAiUserTaskReadback({ task: "profile-extract", antwort, kontext: { jetzt: JETZT } });
});
scheitert("ungültiges Prognoseergebnis scheitert am Produktionsparser", "PRODUKTIONSPARSER", () => {
  const antwort = clone(forecastAntwort);
  antwort.data.passung = 101;
  pruefeAiUserTaskReadback({
    task: "film-forecast", antwort,
    kontext: { profilVersion: "p-test", promptVersion: "v1", jetzt: JETZT },
  });
});
scheitert("Filmwissens-Version muss mit dem RPC-Readback übereinstimmen", "FILMWISSEN_VERSION_DRIFT", () => {
  const readback = clone(filmwissenReadback);
  readback.version.id = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
  pruefeAiUserTaskReadback({
    task: "filmwissen-synthese", antwort: filmwissenAntwort, kontext: { rpcReadback: readback },
  });
});
scheitert("leerer Stapel scheitert am Produktionsparser", "PRODUKTIONSPARSER", () => {
  const antwort = clone(stapelAntwort);
  antwort.data.kandidaten = [];
  pruefeAiUserTaskReadback({ task: "media-batch-extract", antwort, kontext: { master: [] } });
});
scheitert("Blogbeleg außerhalb des Artikels scheitert am Produktionsparser", "PRODUKTIONSPARSER", () => {
  const antwort = clone(blogAntwort);
  antwort.data.geschmackszuege[0].beleg = "Dieser Beleg steht nicht im synthetischen Artikel.";
  pruefeAiUserTaskReadback({
    task: "blog-profile-extract", antwort,
    kontext: { artikelPayload, profil, vokabular: [], vorschaukopf },
  });
});

const cacheHitOhneVerbrauch = {
  ok: true,
  task: "filmwissen-synthese",
  vorgangId: IDS.vorgang,
  data: { status: "cache_hit", versionId: IDS.version },
};
check("Filmwissen-cache_hit akzeptiert den echten Erfolg ohne Verbrauch", () => {
  const result = pruefeAiUserTaskReadback({
    task: "filmwissen-synthese", antwort: cacheHitOhneVerbrauch,
    kontext: { rpcReadback: filmwissenReadback },
  });
  assert.equal(result.verbrauch, null);
});
check("Filmwissen-cache_hit akzeptiert alternativ explizit verbrauch null", () => {
  const result = pruefeAiUserTaskReadback({
    task: "filmwissen-synthese", antwort: { ...cacheHitOhneVerbrauch, verbrauch: null },
    kontext: { rpcReadback: filmwissenReadback },
  });
  assert.equal(result.verbrauch, null);
});
scheitert("Filmwissen-cache_hit weist erfundenen Verbrauch ab", "VERBRAUCH_CACHE_HIT", () =>
  pruefeAiUserTaskReadback({
    task: "filmwissen-synthese", antwort: { ...cacheHitOhneVerbrauch, verbrauch: { ...VERBRAUCH } },
    kontext: { rpcReadback: filmwissenReadback },
  }));

console.log(`ai_user_task_contract_test: ${checks} Checks bestanden.`);
