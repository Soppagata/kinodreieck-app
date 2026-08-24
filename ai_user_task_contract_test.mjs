#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  AI_USER_TASKS,
  AiUserTaskContractError,
  pruefeAiUserTaskReadback,
} from "./tools/ai_user_task_contract.mjs";
import { erteileEinwilligung, leeresProfil } from "./src/lib/profil.js";
import { baueStapelUebernahme } from "./src/lib/stapelimport.js";

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
const PROVIDER_RECEIPT = Object.freeze({
  schemaVersion: "provider-receipt-v1",
  provider: "anthropic",
  model: "claude-test-20260823",
  usage: Object.freeze({ inputTokens: 120, outputTokens: 40 }),
  responseSha256: "a".repeat(64),
  resultMode: "structured",
  server: Object.freeze({
    logId: 71,
    providerRequests: 1,
    reservationUsdCent: 1.5,
    costUsdCent: 0.42,
  }),
});
const huelle = (task, data, extra = {}) => ({
  ok: true,
  task,
  vorgangId: IDS.vorgang,
  modellAlias: task === "media-batch-extract" || task === "blog-profile-extract" ? "klein" : "gross",
  modell: "claude-test-20260823",
  data,
  responseMode: "structured",
  displayText: null,
  warnings: [],
  providerReceipt: PROVIDER_RECEIPT,
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
    id: "stapel-0", index: 0, zustand: "ok",
    titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null,
    vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch",
  }],
  warnungen: [], fehlmenge: [],
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
check("intelligent-search liest die exakte normale ai-task-Hülle bis zum Sitzungs-Readback", () => {
  assert.deepEqual(Object.keys(finderAntwort).sort(), [
    "data", "displayText", "modell", "modellAlias", "ok", "providerReceipt",
    "responseMode", "task", "verbrauch", "vorgangId", "warnings",
  ]);
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
check("normale Media-Teilantwort läuft mit Receipt bis zur selektiven Persistenz und zum Readback", () => {
  const antwort = huelle("media-batch-extract", {
    kandidaten: [
      {
        id: "stapel-0", index: 0, zustand: "ok",
        titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null,
        vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch",
      },
      {
        id: "stapel-1", index: 1, zustand: "ok",
        titel: "Kind of Blue", typ: "musik", jahr: 1959, quelle: "cd", staffeln: null,
        vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch",
      },
    ],
    warnungen: ["Eine Zeile blieb offen."],
    fehlmenge: [{
      id: "stapel-2", index: 2, zustand: "fehlgeschlagen",
      grund: "Der Titel fehlt oder ist nicht sicher lesbar.",
    }],
  }, {
    responseMode: "partial",
    displayText: "Die Medienliste war teilweise unvollständig.",
    warnings: ["invalid-items-ignored"],
    providerReceipt: { ...PROVIDER_RECEIPT, resultMode: "partial" },
  });
  const ausgewertet = pruefeAiUserTaskReadback({
    task: "media-batch-extract", antwort, kontext: { master: [] },
  });
  assert.equal(ausgewertet.gelesen.responseMode, "partial");
  assert.equal(ausgewertet.gelesen.kandidaten.length, 2);
  assert.equal(ausgewertet.gelesen.fehlmenge[0].index, 2);

  const kontrollierteAuswahl = ausgewertet.gelesen.kandidaten.map((kandidat) => ({
    ...kandidat,
    ausgewaehlt: kandidat.id === "stapel-0",
  }));
  const gespeichert = JSON.parse(JSON.stringify(
    baueStapelUebernahme(kontrollierteAuswahl),
  ));
  assert.deepEqual(gespeichert.mediathek.map((eintrag) => eintrag.titel), ["Alien"]);
  assert.equal(gespeichert.mediathek[0].bewertung, null);
  assert.equal(gespeichert.mediathek[0].kategorie, null);
  assert.deepEqual(JSON.parse(JSON.stringify(gespeichert)), gespeichert);
});
check("blog-profile-extract liest Profil und Vokabular über Produktionsverträge zurück", () => {
  const gelesen = ergebnisse.get("blog-profile-extract").gelesen;
  assert.equal(gelesen.profil.signale.at(-1).wert, "präzise");
  assert.equal(gelesen.vokabular.at(-1).wort, "Nachtkino");
});
check("blog-profile-extract liest ein legitimes 0/0-Ergebnis als leeres strukturiertes data bis zum Readback", () => {
  const leer = pruefeAiUserTaskReadback({
    task: "blog-profile-extract",
    antwort: huelle("blog-profile-extract", { geschmackszuege: [], vokabular: [] }),
    kontext: { artikelPayload, profil, vokabular: [], vorschaukopf },
  });
  assert.equal(leer.ok, true);
  assert.equal(leer.persistenz, "lokales-json");
  assert.equal(leer.gelesen.profil.signale.length, profil.signale.length);
  assert.deepEqual(leer.gelesen.vokabular, []);
});

scheitert("unbekannte Nutzeraufgabe wird geschlossen abgelehnt", "TASK_UNBEKANNT", () =>
  pruefeAiUserTaskReadback({ task: "health", antwort: huelle("health", {}) }));
scheitert("Zusatzfeld in der Erfolgshülle wird abgelehnt", "ERFOLGSHUELLE_FORM", () =>
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort: { ...finderAntwort, fremd: true }, kontext: { master } }));
scheitert("unvollständige additive Darstellungshülle wird abgelehnt", "ERFOLGSHUELLE_FORM", () => {
  const antwort = clone(finderAntwort);
  delete antwort.warnings;
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort, kontext: { master } });
});
scheitert("formfremde Darstellungshülle scheitert am Produktionsparser", "ERFOLGSHUELLE_DARSTELLUNG", () => {
  const antwort = clone(finderAntwort);
  antwort.warnings = ["nicht-erlaubter-hinweis"];
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort, kontext: { master } });
});
scheitert("formfremder Provider-Receipt wird abgelehnt", "PROVIDER_RECEIPT_FORM", () => {
  const antwort = clone(finderAntwort);
  antwort.providerReceipt.responseSha256 = "zu-kurz";
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort, kontext: { master } });
});
scheitert("unkorrelierter Provider-Receipt wird abgelehnt", "PROVIDER_RECEIPT_KORRELATION", () => {
  const antwort = clone(finderAntwort);
  antwort.providerReceipt.server.costUsdCent = 0.41;
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort, kontext: { master } });
});
scheitert("Fehlerhülle wird nicht als erfolgreicher Readback behandelt", "KEIN_ERFOLG", () =>
  pruefeAiUserTaskReadback({ task: "intelligent-search", antwort: { ...finderAntwort, ok: false }, kontext: { master } }));
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
scheitert("fehlendes Blog-data bleibt eine formfremde Erfolgshülle", "ERFOLGSHUELLE_FORM", () => {
  const antwort = clone(blogAntwort);
  delete antwort.data;
  pruefeAiUserTaskReadback({
    task: "blog-profile-extract", antwort,
    kontext: { artikelPayload, profil, vokabular: [], vorschaukopf },
  });
});
scheitert("null statt Blog-data bleibt DATA_FORM", "DATA_FORM", () =>
  pruefeAiUserTaskReadback({
    task: "blog-profile-extract", antwort: { ...blogAntwort, data: null },
    kontext: { artikelPayload, profil, vokabular: [], vorschaukopf },
  }));
scheitert("unvollständiges Blog-data bleibt ein Produktionsparserfehler", "PRODUKTIONSPARSER", () =>
  pruefeAiUserTaskReadback({
    task: "blog-profile-extract",
    antwort: { ...blogAntwort, data: { geschmackszuege: [] } },
    kontext: { artikelPayload, profil, vokabular: [], vorschaukopf },
  }));

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
