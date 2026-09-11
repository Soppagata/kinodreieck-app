/* Fokussierter Consumervertrag für Alles, Mein Programm und producerbelegtes
   Neu. Rein lokal: keine Datenbank, kein Provider, keine KI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { baueStreamingAnsichten } from "./src/lib/katalog.js";
import {
  aktualisiereStreamingNeuFristenbuch,
  parseStreamingNeuFristenbuch,
  parseStreamingNeuUebergang,
  projiziereStreamingNeu,
  STREAMING_NEU_DAUER_MS,
  streamingNeuFristenbuchStorageKey,
  streamingNeuUebergangStorageKey,
} from "./src/lib/streamingNeu.js";
import {
  projiziereStreamingAnsichten,
  streamingKatalogstaendePassen,
  vereinigeStreamingTitel,
} from "./src/lib/streamingProjection.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const fixture = JSON.parse(fs.readFileSync(
  new URL("./tests/private-v1/fixtures/streaming_dienst_diffs_v1.json", import.meta.url), "utf8",
));
const TAG = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-16T11:00:00.000Z");

const knownTitle = {
  ...fixture.titel[0], id: "master-101", bewertung: { wie: 4, was: 4, warum: 4 },
  quelle: "streaming", typ: "film", genres: ["Drama"], web_urls: { Netflix: "https://example.test/101" },
  beschreibung: "Belegte gemeinsame Kartenbeschreibung.", laufzeit_minuten: 111,
  descriptionEvidence: { source: "watchmode", checkedAt: "2026-09-10T22:00:00.000Z", fetchedAt: "2026-09-10T22:00:00.000Z", sourceUrl: null },
};
const bekannt = {
  ...fixture,
  katalog_stand: fixture.stand,
  katalog_stand_bekannt: fixture.stand,
  katalog_stand_entdecken: fixture.stand,
  katalogMengen: { umfang: "voll" },
  titel: [knownTitle],
};
const entdecken = {
  ...fixture,
  katalog_stand: fixture.stand,
  katalog_stand_bekannt: fixture.stand,
  katalog_stand_entdecken: fixture.stand,
  katalogMengen: { umfang: "voll" },
  titel: fixture.titel,
};

check("Alles vereinigt Known und Discover anhand Watchmode-ID ohne Dublette", () => {
  const union = vereinigeStreamingTitel(bekannt, entdecken);
  assert.equal(union.length, 3);
  assert.equal(union.filter((titel) => titel.watchmode_id === 101).length, 1);
  assert.equal(union.find((titel) => titel.watchmode_id === 101)?.id, "master-101");
});

check("Alles ist der ausgewählte Gesamtbestand und Mein Programm dessen Teilmenge", () => {
  const sicht = projiziereStreamingAnsichten({
    bekannt, entdecken, auswahl: fixture.auswahl, auswahlGeladen: true,
  });
  assert.equal(sicht.vollstaendig, true);
  assert.equal(sicht.gesamtbestand, 3);
  assert.equal(sicht.ausgewaehlt.length, 3);
  assert.deepEqual(sicht.meinProgramm.map((titel) => titel.watchmode_id), [101]);
});

check("Explizit leere und noch ungeladene Auswahl bleiben verschiedene Nullzustände", () => {
  const leer = projiziereStreamingAnsichten({ bekannt, entdecken, auswahl: [], auswahlGeladen: true });
  const laedt = projiziereStreamingAnsichten({ bekannt, entdecken, auswahl: [], auswahlGeladen: false });
  assert.equal(leer.status, "bereit");
  assert.deepEqual(leer.ausgewaehlt, []);
  assert.equal(laedt.status, "auswahl-laedt");
  assert.deepEqual(laedt.meinProgramm, []);
});

check("Known und Discover mit verschiedenen Katalogständen sind kein Vollstand", () => {
  const altBekannt = { ...bekannt, katalog_stand_bekannt: "2026-09-14T12:00:00.000Z" };
  assert.equal(streamingKatalogstaendePassen(altBekannt, entdecken), false);
  assert.equal(projiziereStreamingAnsichten({
    bekannt: altBekannt, entdecken, auswahl: fixture.auswahl, auswahlGeladen: true,
  }).vollstaendig, false);
});

const neu = projiziereStreamingNeu({ bekannt, entdecken, auswahl: fixture.auswahl, now: NOW });
check("E11-Fixture rekonstruiert den ersten ausgewählten Union-Zugang", () => {
  assert.equal(neu.status, "ready");
  assert.deepEqual(new Set(neu.neueIds), new Set(["101", "102"]));
  assert.equal(neu.neuSeit[101], fixture.erwartet_neu_seit[101]);
  assert.equal(neu.neuSeit[102], fixture.erwartet_neu_seit[102]);
});

check("Providerzugabe verlängert nicht, reine Auswahlprojektion verschiebt aber den relevanten Zugang", () => {
  const netflix = projiziereStreamingNeu({ bekannt, entdecken, auswahl: ["Netflix"], now: NOW });
  const disney = projiziereStreamingNeu({ bekannt, entdecken, auswahl: ["Disney+"], now: NOW });
  assert.equal(netflix.neuSeit[101], "2026-09-02T12:00:00.000Z");
  assert.equal(disney.neuSeit[101], "2026-09-15T12:00:00.000Z");
});

const ownerA = "account:00000000-0000-4000-8000-0000000000aa";
const ownerB = "account:00000000-0000-4000-8000-0000000000bb";
const ownerC = "account:00000000-0000-4000-8000-0000000000cc";
const ownerD = "account:00000000-0000-4000-8000-0000000000dd";
const mandalorianSeit = Date.parse("2026-09-07T08:15:00.000Z");
const alterSeparaterSeit = Date.parse("2026-09-02T08:15:00.000Z");
const v2UebergangRoh = JSON.stringify({
  format: 2,
  owner: ownerA,
  runId: "2026-09-10T08:15:00.000Z",
  coverage: JSON.stringify(["Disney+", "Netflix"]),
  ids: [1781431, 900001],
  neu: [
    { id: 900001, firstSeenAt: alterSeparaterSeit },
    { id: 1781431, firstSeenAt: mandalorianSeit },
  ],
});
const v2Uebergang = parseStreamingNeuUebergang(v2UebergangRoh, ownerA);

check("Gültiger ownergebundener v2-Stand bewahrt zwei unabhängige ursprüngliche Fristen", () => {
  assert.deepEqual(v2Uebergang.neu, [
    { id: "900001", firstSeenAt: alterSeparaterSeit },
    { id: "1781431", firstSeenAt: mandalorianSeit },
  ]);
  assert.equal(parseStreamingNeuUebergang(v2UebergangRoh, ownerB), null);
  assert.equal(parseStreamingNeuUebergang(JSON.stringify({ ...JSON.parse(v2UebergangRoh), format: 1 }), ownerA), null);
  assert.equal(parseStreamingNeuUebergang("{kaputt", ownerA), null);
  assert.notEqual(streamingNeuUebergangStorageKey(ownerA), streamingNeuUebergangStorageKey(ownerB));
});

const mandalorianTitel = {
  watchmode_id: 1781431,
  titel: "The Mandalorian and Grogu",
  dienste: ["Disney+"],
};
const mandalorianKatalog = {
  ...entdecken,
  titel: [mandalorianTitel],
};
const mandalorianNeu = projiziereStreamingNeu({
  bekannt: { ...bekannt, titel: [] },
  entdecken: mandalorianKatalog,
  auswahl: ["Disney+"],
  uebergang: v2Uebergang,
  now: NOW,
});
check("Mandalorian-v2-Zeitbeleg ergänzt den aktuellen ausgewählten Alles-Stand ohne Neudatierung", () => {
  assert.deepEqual(mandalorianNeu.neueIds, ["1781431"]);
  assert.equal(mandalorianNeu.neuSeit[1781431], new Date(mandalorianSeit).toISOString());
  assert.equal(mandalorianNeu.naechsterAblauf, mandalorianSeit + STREAMING_NEU_DAUER_MS);
});

check("Vorhandene Einzelfrist bleibt sichtbar, wenn der heutige Dienst erst eine neue Baseline bildet", () => {
  const ohneVergleich = {
    ...mandalorianKatalog,
    vergleich_stand_pro_quelle: {},
  };
  const ergebnis = projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [], vergleich_stand_pro_quelle: {} }, entdecken: ohneVergleich,
    auswahl: ["Disney+"], uebergang: v2Uebergang, now: NOW,
  });
  assert.equal(ergebnis.status, "ready");
  assert.deepEqual(ergebnis.neueIds, ["1781431"]);
  assert.deepEqual(ergebnis.baselineQuellen, ["Disney+"]);
});

check("Ein späterer Producerbeleg verlängert eine bereits laufende v2-Einzelfrist nicht", () => {
  const frueher = Date.parse("2026-09-02T11:30:00.000Z");
  const uebergang = parseStreamingNeuUebergang({
    format: 2,
    owner: ownerA,
    runId: "2026-09-10T12:00:00.000Z",
    ids: [101],
    neu: [{ id: 101, firstSeenAt: frueher }],
  }, ownerA);
  const ergebnis = projiziereStreamingNeu({
    bekannt, entdecken, auswahl: ["Netflix"], uebergang, now: NOW,
  });
  assert.equal(ergebnis.neuSeit[101], new Date(frueher).toISOString());
});

check("Legacy-Einträge laufen je Titel bis zur Millisekunde ab und fluten keine alten oder ungewählten IDs", () => {
  const direktDavor = projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: mandalorianKatalog,
    auswahl: ["Disney+"], uebergang: v2Uebergang,
    now: mandalorianSeit + STREAMING_NEU_DAUER_MS - 1,
  });
  const anDerGrenze = projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: mandalorianKatalog,
    auswahl: ["Disney+"], uebergang: v2Uebergang,
    now: mandalorianSeit + STREAMING_NEU_DAUER_MS,
  });
  assert.deepEqual(direktDavor.neueIds, ["1781431"]);
  assert.deepEqual(anDerGrenze.neueIds, []);
  assert.ok(!direktDavor.neueIds.includes("900001"));
  assert.deepEqual(projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: mandalorianKatalog,
    auswahl: [], uebergang: v2Uebergang, now: NOW,
  }).neueIds, []);
});

check("Ein gültiger v2-Eintrag mit zukünftigem firstSeenAt bleibt bis zu seiner Erkennung unsichtbar", () => {
  const zukunft = parseStreamingNeuUebergang({
    format: 2,
    owner: ownerA,
    runId: "2026-09-20T12:00:00.000Z",
    ids: [1781431],
    neu: [{ id: 1781431, firstSeenAt: Date.parse("2026-09-18T12:00:00.000Z") }],
  }, ownerA);
  assert.deepEqual(projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: mandalorianKatalog,
    auswahl: ["Disney+"], uebergang: zukunft, now: NOW,
  }).neueIds, []);
});

check("Ab- und Wiederzugang innerhalb der aktiven Frist verlängert den Producer-Zeitpunkt nicht", () => {
  const ersterZugang = Date.parse("2026-09-01T12:00:00.000Z");
  const abgang = Date.parse("2026-09-05T12:00:00.000Z");
  const wiederzugang = Date.parse("2026-09-08T12:00:00.000Z");
  const mehrfach = {
    ...entdecken,
    stand_pro_quelle: { Netflix: new Date(wiederzugang).toISOString() },
    vergleich_stand_pro_quelle: { Netflix: new Date(wiederzugang).toISOString() },
    titel: [{
      watchmode_id: 777,
      titel: "Kurz verschwunden",
      dienste: ["Netflix"],
      dienst_diffs: [
        { dienst: "Netflix", vorher: false, nachher: true, erkannt_am: new Date(ersterZugang).toISOString() },
        { dienst: "Netflix", vorher: true, nachher: false, erkannt_am: new Date(abgang).toISOString() },
        { dienst: "Netflix", vorher: false, nachher: true, erkannt_am: new Date(wiederzugang).toISOString() },
      ],
    }],
  };
  const waehrend = projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: mehrfach,
    auswahl: ["Netflix"], now: Date.parse("2026-09-10T12:00:00.000Z"),
  });
  const nachAltemAblauf = projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: mehrfach,
    auswahl: ["Netflix"], now: ersterZugang + STREAMING_NEU_DAUER_MS,
  });
  assert.equal(waehrend.neuSeit[777], new Date(ersterZugang).toISOString());
  assert.deepEqual(nachAltemAblauf.neueIds, []);
});

const FRISTEN_T0 = Date.parse("2026-08-01T12:00:00.000Z");
const tag = (tagNummer) => FRISTEN_T0 + (tagNummer - 1) * TAG;
const tagIso = (wert) => new Date(wert).toISOString();
function prunedKatalog(nowTag, zugangstage, { letzterBleibt = true } = {}) {
  const now = tag(nowTag);
  const alleDiffs = [];
  zugangstage.forEach((zugangstag, index) => {
    alleDiffs.push({
      dienst: "Netflix", vorher: false, nachher: true, erkannt_am: tagIso(tag(zugangstag)),
    });
    if (!letzterBleibt || index < zugangstage.length - 1) {
      alleDiffs.push({
        dienst: "Netflix", vorher: true, nachher: false, erkannt_am: tagIso(tag(zugangstag) + TAG),
      });
    }
  });
  const dienst_diffs = alleDiffs.filter((diff) => Date.parse(diff.erkannt_am) >= now - STREAMING_NEU_DAUER_MS);
  const daten = {
    stand: tagIso(now), katalog_stand: tagIso(now), katalogMengen: { umfang: "voll" },
    stand_pro_quelle: { Netflix: tagIso(now) }, vergleich_stand_pro_quelle: { Netflix: tagIso(now) },
  };
  return {
    now,
    bekannt: { ...daten, titel: [] },
    entdecken: { ...daten, titel: [{
      watchmode_id: 777, titel: "Wiederkehrend", dienste: letzterBleibt ? ["Netflix"] : [], dienst_diffs,
    }] },
  };
}

check("Fristenbuch verhindert nach Pruning von Tag 1 eine Neudatierung auf Tag 4", () => {
  const tag4 = prunedKatalog(4, [1, 4]);
  const ersterStand = aktualisiereStreamingNeuFristenbuch(null, {
    owner: ownerA, auswahl: ["Netflix"], ...tag4, now: tag4.now,
  });
  const tag16 = prunedKatalog(16, [1, 4]);
  const nachPruning = aktualisiereStreamingNeuFristenbuch(ersterStand.fristenbuch, {
    owner: ownerA, auswahl: ["Netflix"], ...tag16, now: tag16.now,
  });
  assert.equal(nachPruning.fristenbuch.eintraege[0].fensterBeginn, tag(1));
  assert.equal(nachPruning.fristenbuch.eintraege[0].verbrauchtBis, tag(4));
  assert.deepEqual(projiziereStreamingNeu({
    ...tag16, auswahl: ["Netflix"], fristenbuch: nachPruning.fristenbuch, now: tag16.now,
  }).neueIds, []);
});

check("Abgelaufener v2-Beginn wird durch einen jüngeren Restdiff nicht wiederbelebt", () => {
  const tag20 = prunedKatalog(20, [10]);
  const legacy = Object.freeze({
    owner: ownerA,
    neu: Object.freeze([{ id: "777", firstSeenAt: tag(1) }]),
  });
  const buch = aktualisiereStreamingNeuFristenbuch(null, {
    owner: ownerA, auswahl: ["Netflix"], ...tag20, uebergang: legacy, now: tag20.now,
  }).fristenbuch;
  assert.equal(buch.eintraege[0].fensterBeginn, tag(1));
  assert.equal(buch.eintraege[0].verbrauchtBis, tag(10));
  assert.deepEqual(projiziereStreamingNeu({
    ...tag20, auswahl: ["Netflix"], fristenbuch: buch, now: tag20.now,
  }).neueIds, []);
});

check("Verbrauchte Restdiffs bleiben über Reload und mehrere geprunte Fenster phasenfest", () => {
  let buch = null;
  for (const [nowTag, zugaenge] of [
    [13, [1, 4, 7, 10, 13]],
    [16, [1, 4, 7, 10, 13, 16]],
    [28, [1, 4, 7, 10, 13, 16, 19, 22, 25, 28]],
  ]) {
    const lauf = prunedKatalog(nowTag, zugaenge);
    buch = aktualisiereStreamingNeuFristenbuch(buch, {
      owner: ownerA, auswahl: ["Netflix"], ...lauf, now: lauf.now,
    }).fristenbuch;
    buch = parseStreamingNeuFristenbuch(JSON.stringify(buch), ownerA, ["Netflix"]);
  }
  assert.equal(buch.eintraege[0].fensterBeginn, tag(16));
  assert.equal(buch.eintraege[0].verbrauchtBis, tag(28));
  const tag31 = prunedKatalog(31, [1, 4, 7, 10, 13, 16, 19, 22, 25, 28]);
  const final = aktualisiereStreamingNeuFristenbuch(buch, {
    owner: ownerA, auswahl: ["Netflix"], ...tag31, now: tag31.now,
  }).fristenbuch;
  assert.deepEqual(projiziereStreamingNeu({
    ...tag31, auswahl: ["Netflix"], fristenbuch: final, now: tag31.now,
  }).neueIds, []);
  assert.equal(parseStreamingNeuFristenbuch(JSON.stringify(final), ownerB, ["Netflix"]), null);
  assert.equal(parseStreamingNeuFristenbuch(JSON.stringify(final), ownerA, ["Disney+"]), null);
  assert.notEqual(
    streamingNeuFristenbuchStorageKey(ownerA, ["Netflix"]),
    streamingNeuFristenbuchStorageKey(ownerA, ["Disney+"]),
  );
});

check("v2 wird je Auswahl nur einmal und nur bei aktuell passender Dienstquelle adaptiert", () => {
  const disneyKatalog = {
    bekannt: { ...bekannt, titel: [] }, entdecken: mandalorianKatalog,
  };
  const netflixErststand = aktualisiereStreamingNeuFristenbuch(null, {
    owner: ownerA, auswahl: ["Netflix"], ...disneyKatalog,
    uebergang: v2Uebergang, now: NOW,
  }).fristenbuch;
  assert.deepEqual(netflixErststand.eintraege, []);
  assert.equal(netflixErststand.v2Uebernommen, true);
  const spaeterAufNetflix = {
    ...mandalorianKatalog,
    titel: [{ ...mandalorianTitel, dienste: ["Netflix"] }],
  };
  const spaeter = aktualisiereStreamingNeuFristenbuch(netflixErststand, {
    owner: ownerA, auswahl: ["Netflix"], bekannt: { ...bekannt, titel: [] },
    entdecken: spaeterAufNetflix, uebergang: v2Uebergang, now: NOW,
  }).fristenbuch;
  assert.deepEqual(spaeter.eintraege, []);
});

check("Gleichzeitiger Wechsel zwischen gewählten Diensten erzeugt keinen Union-Zugang", () => {
  const wechsel = {
    ...entdecken,
    titel: [{
      watchmode_id: 900, titel: "Wechsel", dienste: ["Disney+"],
      dienst_diffs: [
        { dienst: "Netflix", vorher: true, nachher: false, erkannt_am: fixture.stand },
        { dienst: "Disney+", vorher: false, nachher: true, erkannt_am: fixture.stand },
      ],
    }],
  };
  assert.deepEqual(projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: wechsel,
    auswahl: fixture.auswahl, now: NOW,
  }).neueIds, []);
});

check("Baseline und verifiziert leer werden nicht miteinander verwechselt", () => {
  const baseline = projiziereStreamingNeu({ bekannt, entdecken, auswahl: ["MUBI"], now: NOW });
  const leer = projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] },
    entdecken: { ...entdecken, titel: [{ watchmode_id: 901, titel: "Alt", dienste: ["Netflix"] }] },
    auswahl: ["Netflix"], now: NOW,
  });
  assert.equal(baseline.status, "baseline");
  assert.equal(leer.status, "ready");
  assert.equal(leer.vergleich, "verifiziert-leer");
});

check("Teilstand, unveränderter Rebuild und leere Auswahl erzeugen keine künstlichen Zugänge", () => {
  assert.equal(projiziereStreamingNeu({
    bekannt, entdecken, auswahl: fixture.auswahl, vollstaendig: false, now: NOW,
  }).status, "loading");
  assert.deepEqual(projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: { ...entdecken, titel: [{ ...fixture.titel[2] }] },
    auswahl: ["Netflix"], now: NOW,
  }).neueIds, []);
  assert.deepEqual(projiziereStreamingNeu({ bekannt, entdecken, auswahl: [], now: NOW }).neueIds, []);
});

check("Titel verschwindet streng nach 14 vollen Tagen und bei aktueller Nichtverfügbarkeit", () => {
  const vorAblauf = Date.parse(fixture.erwartet_neu_seit[101]) + STREAMING_NEU_DAUER_MS - 1;
  const amAblauf = vorAblauf + 1;
  assert.ok(projiziereStreamingNeu({ bekannt, entdecken, auswahl: ["Netflix"], now: vorAblauf }).neueIds.includes("101"));
  assert.ok(!projiziereStreamingNeu({ bekannt, entdecken, auswahl: ["Netflix"], now: amAblauf }).neueIds.includes("101"));
  const weg = { ...entdecken, titel: [{ ...fixture.titel[1], dienste: ["MUBI"] }] };
  assert.deepEqual(projiziereStreamingNeu({ bekannt: { ...bekannt, titel: [] }, entdecken: weg, auswahl: ["Netflix"], now: NOW }).neueIds, []);
});

check("Ungültige und zukünftige Diffmetadaten bleiben fail-closed", () => {
  for (const erkannt_am of ["kaputt", "2099-01-01T00:00:00.000Z"]) {
    const defekt = { ...entdecken, titel: [{
      watchmode_id: 902, titel: "Defekt", dienste: ["Netflix"],
      dienst_diffs: [{ dienst: "Netflix", vorher: false, nachher: true, erkannt_am }],
    }] };
    assert.deepEqual(projiziereStreamingNeu({ bekannt: { ...bekannt, titel: [] }, entdecken: defekt, auswahl: ["Netflix"], now: NOW }).neueIds, []);
  }
  const nachQuellenstand = { ...entdecken, titel: [{
    watchmode_id: 903, titel: "Unbelegter Zeitpunkt", dienste: ["Netflix"],
    dienst_diffs: [{ dienst: "Netflix", vorher: false, nachher: true, erkannt_am: "2026-09-16T10:00:00.000Z" }],
  }] };
  assert.deepEqual(projiziereStreamingNeu({
    bekannt: { ...bekannt, titel: [] }, entdecken: nachQuellenstand, auswahl: ["Netflix"], now: NOW,
  }).neueIds, []);
});

const wurzel = path.dirname(fileURLToPath(import.meta.url));
async function ladeEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}
const ausgabeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-streaming-ansichten-test-"));
const ausgabe = path.join(ausgabeDir, "bundle.mjs");
fs.symlinkSync(path.join(wurzel, "node_modules"), path.join(ausgabeDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(ausgabeDir, { recursive: true, force: true }));
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: [
      'export { StreamingTab, TitleFactsDetails } from "./src/tabs/StreamingTab.jsx";',
      'export { FilmCard } from "./src/components/FilmCard.jsx";',
      'export { useStreamingNeuController } from "./src/controllers/useStreamingNeuController.js";',
      'export { setStorageDriver } from "./src/lib/storage.js";',
    ].join("\n"),
    loader: "js", resolveDir: wurzel,
  },
  bundle: true, format: "esm", outfile: ausgabe, jsx: "automatic", target: "es2022",
  logLevel: "warning", external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of [
  "window", "document", "navigator", "HTMLElement", "Element", "Event", "MouseEvent", "Node", "NodeList",
  "getComputedStyle", "localStorage", "requestAnimationFrame", "cancelAnimationFrame",
]) Object.defineProperty(globalThis, name, {
  value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { StreamingTab, TitleFactsDetails, FilmCard, useStreamingNeuController, setStorageDriver } = await import(ausgabe);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function mount(Component, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (next) => act(async () => { root.render(h(Component, next)); await tick(); });
  await render(props);
  return { container, render, async cleanup() { await act(async () => root.unmount()); container.remove(); } };
}

const emptyFactsUi = await mount(TitleFactsDetails, {
  titel: { beschreibung: null, laufzeit_minuten: null, genres: [], descriptionEvidence: null },
});
check("Leere Fakten mit null-Laufzeit rendern keine leere Detailbox", () => {
  assert.equal(emptyFactsUi.container.querySelector('[data-title-facts="title-facts-projection-v1"]'), null);
  assert.equal(emptyFactsUi.container.textContent, "");
});
await emptyFactsUi.cleanup();

let gespeicherteKartenAenderung = null;
const filmCardUi = await mount(FilmCard, {
  film: { id: "neutral-test", titel: "Neutraler Musiktitel", typ: "musik", notiz: "Meine Notiz" },
  beschreibungAnzeige: "Nur angezeigter Providertext.", expanded: true, onToggle() {},
  onSave: async (changes) => { gespeicherteKartenAenderung = changes; return true; },
});
check("Read-only Providertext erscheint einmal und bleibt aus persönlichen Editorwerten", () => {
  assert.equal((filmCardUi.container.textContent.match(/Nur angezeigter Providertext\./gu) || []).length, 1);
});
const beschreibungBearbeiten = [...filmCardUi.container.querySelectorAll("button")]
  .find((button) => button.textContent.includes("Beschreibung bearbeiten"));
await act(async () => { beschreibungBearbeiten.click(); await tick(); });
check("Beschreibung/Notiz-Editor übernimmt nur persönliche Werte", () => {
  const felder = [...filmCardUi.container.querySelectorAll("textarea")];
  assert.deepEqual(felder.map((feld) => feld.value), ["", "Meine Notiz"]);
});
const speichern = [...filmCardUi.container.querySelectorAll("button")]
  .find((button) => button.textContent.trim() === "Speichern");
await act(async () => { speichern.click(); await tick(); });
check("Notizspeichern kopiert keinen Providertext in persönliche Daten", () => {
  assert.deepEqual(gespeicherteKartenAenderung, { beschreibung: "", notiz: "Meine Notiz" });
});
await filmCardUi.cleanup();

let controller;
function ControllerProbe(props) {
  controller = useStreamingNeuController(props);
  return h("output", null, `${controller.streamingNeu.status}:${controller.streamingNeu.neueIds.join(",")}`);
}
const echtesDateNow = Date.now;
Date.now = () => NOW;
const gespeicherteWerteA = new Map([[streamingNeuUebergangStorageKey(ownerA), v2UebergangRoh]]);
let storageWrites = 0;
const storageDriverA = {
  name: "test-a", owner: ownerA,
  async get(key) { return gespeicherteWerteA.has(key) ? { key, value: gespeicherteWerteA.get(key) } : null; },
  async set(key, value) { storageWrites++; gespeicherteWerteA.set(key, value); return { key, value }; },
  async delete(key) { gespeicherteWerteA.delete(key); return { key, deleted: true }; },
  async list() { return { keys: [...gespeicherteWerteA.keys()] }; },
};
setStorageDriver(storageDriverA);
const controllerUi = await mount(ControllerProbe, {
  kontextKey: "konto-a", auswahl: fixture.auswahl, auswahlGeladen: true,
});
await act(async () => { await tick(); });
await act(async () => { controller.uebernehmeVollkatalog({ bekannt, entdecken }); await tick(); });
check("Controller lässt v2 bytegleich und schreibt nur das kleine Fristenbuch", () => {
  assert.match(controllerUi.container.textContent, /^ready:/u);
  assert.equal(gespeicherteWerteA.get(streamingNeuUebergangStorageKey(ownerA)), v2UebergangRoh);
  assert.equal(storageWrites, 1);
  const fristenKey = streamingNeuFristenbuchStorageKey(ownerA, fixture.auswahl);
  const gespeichert = JSON.parse(gespeicherteWerteA.get(fristenKey));
  assert.deepEqual(Object.keys(gespeichert).sort(), ["auswahl", "eintraege", "format", "owner", "v2Uebernommen"]);
  assert.ok(gespeichert.eintraege.every((entry) => (
    Object.keys(entry).sort().join(",") === "fensterBeginn,id,verbrauchtBis"
  )));
});
await act(async () => {
  controller.uebernehmeVollkatalog({ bekannt: { ...bekannt, titel: [] }, entdecken: mandalorianKatalog });
  await tick();
});
check("Controller stellt Mandalorian nach Reload aus dem vorhandenen v2-Zeitbeleg wieder her", () => {
  assert.equal(controllerUi.container.textContent, "ready:1781431");
});
await act(async () => {
  controller.uebernehmeVollkatalog({
    bekannt: { ...bekannt, katalog_stand_bekannt: "2026-09-14T12:00:00.000Z" },
    entdecken,
  });
  await tick();
});
check("Ein inkonsistenter Folgestand verwirft den alten Neu-Beleg", () => {
  assert.equal(controllerUi.container.textContent, "loading:");
});
await act(async () => { controller.uebernehmeVollkatalog({ bekannt, entdecken }); await tick(); });
await act(async () => {
  setStorageDriver({
    ...storageDriverA,
    name: "test-b",
    owner: ownerB,
    async get() { return null; },
  });
  await tick();
});
await controllerUi.render({ kontextKey: "konto-b", auswahl: fixture.auswahl, auswahlGeladen: true });
await act(async () => { await tick(); });
check("Kontowechsel verwirft den alten Neu-Beleg", () => {
  assert.equal(controllerUi.container.textContent, "loading:");
});
await act(async () => {
  setStorageDriver({
    ...storageDriverA,
    name: "test-c",
    owner: ownerC,
    async get() { throw new Error("lokaler Cache nicht lesbar"); },
  });
  await tick();
});
await controllerUi.render({ kontextKey: "konto-c", auswahl: fixture.auswahl, auswahlGeladen: true });
await act(async () => {
  controller.uebernehmeVollkatalog({ bekannt, entdecken });
  await tick();
  await tick();
});
check("Nicht lesbarer lokaler Fristencache lässt die aktuelle Producerprojektion nutzbar", () => {
  assert.match(controllerUi.container.textContent, /^ready:/u);
  assert.doesNotMatch(controllerUi.container.textContent, /1781431/u);
});
const v2UebergangRohD = v2UebergangRoh.replace(ownerA, ownerD);
await act(async () => {
  setStorageDriver({
    ...storageDriverA,
    name: "test-d",
    owner: ownerD,
    async get(key) {
      if (key === streamingNeuUebergangStorageKey(ownerD)) return { key, value: v2UebergangRohD };
      throw new Error("Fristencache nicht lesbar");
    },
    async set() { throw new Error("Fristencache nicht schreibbar"); },
  });
  await tick();
});
await controllerUi.render({ kontextKey: "konto-d", auswahl: ["Disney+"], auswahlGeladen: true });
await act(async () => {
  controller.uebernehmeVollkatalog({ bekannt: { ...bekannt, titel: [] }, entdecken: mandalorianKatalog });
  await tick();
  await tick();
});
check("Lesbarer v2-Beleg bleibt trotz nicht verfügbarem Fristencache nutzbar", () => {
  assert.equal(controllerUi.container.textContent, "ready:1781431");
});
await controllerUi.cleanup();
setStorageDriver(null);
Date.now = echtesDateNow;

let letzterPin = null;
let status = {};
const props = {
  bekannt, entdecken, auswahl: fixture.auswahl, auswahlGeladen: true,
  merkliste: [], toggleMerk() {}, addFilm: async () => "neu", master: [{
    ...knownTitle, beschreibung: undefined, laufzeit_minuten: undefined, descriptionEvidence: undefined,
  }],
  mustwatchIds: new Set(["master-101"]), entdeckenStatus: status,
  schreibeEntdeckenStatus: async (update) => { status = update(status); return true; },
  onAllesKatalogLaden() {}, recommendationPins: [], onRecommendationPinToggle(titel) { letzterPin = titel; },
  streamingNeu: neu,
};
const ui = await mount(StreamingTab, props);
const tab = (name) => [...ui.container.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith(name));
await act(async () => { tab("▸ Filter & Sortierung").click(); await tick(); });
check("Mein Programm bleibt pinnbar und behält den Must-Watch-Filter", () => {
  assert.equal(tab("Mein Programm").textContent.trim(), "Mein Programm (1)");
  assert.ok(ui.container.querySelector('[aria-label="Bestehender Auswahlzugang am Pinboard anpinnen"]'));
  assert.match(ui.container.textContent, /Nur Must-Watch/u);
});
const programmKarte = ui.container.querySelector(".kd-filmkarte");
await act(async () => { programmKarte.click(); await tick(); });
check("Aufgeklapptes Mein Programm zeigt Beschreibung, Laufzeit, Genre und Faktenzeit", () => {
  assert.equal((programmKarte.textContent.match(/Belegte gemeinsame Kartenbeschreibung\./gu) || []).length, 1);
  assert.match(programmKarte.textContent, /111 Minuten · Drama/u);
  assert.match(programmKarte.textContent, /Beschreibung: Watchmode · geprüft 11\.09\.2026/u);
});
await act(async () => { tab("Alles").click(); await tick(); });
const bekannteAllesKarte = [...ui.container.querySelectorAll(".kd-entdecken-karte")]
  .find((karte) => /Bestehender Auswahlzugang/u.test(karte.textContent));
await act(async () => { bekannteAllesKarte.click(); await tick(); });
check("Alles zeigt Known einschließlich echter Links und den übrigen ausgewählten Katalog", () => {
  assert.equal(tab("Alles").textContent.trim(), "Alles (3)");
  assert.match(ui.container.textContent, /Bestehender Auswahlzugang/u);
  assert.match(ui.container.textContent, /Neuer Auswahlzugang/u);
  assert.equal(ui.container.querySelector('a[href="https://example.test/101"]')?.textContent, "Netflix");
});
check("Aufgeklapptes Alles nutzt dieselbe Faktenprojektion wie Mein Programm", () => {
  assert.match(bekannteAllesKarte.textContent, /Belegte gemeinsame Kartenbeschreibung/u);
  assert.match(bekannteAllesKarte.textContent, /111 Minuten · Drama/u);
  assert.match(bekannteAllesKarte.textContent, /Beschreibung: Watchmode · geprüft 11\.09\.2026/u);
});
const pinButton = ui.container.querySelector('[aria-label="Unveränderter Altbestand am Pinboard anpinnen"]');
await act(async () => { pinButton.click(); await tick(); });
check("Alles behält Pin- und Gesehen-Aktionen", () => {
  assert.equal(letzterPin.watchmode_id, 103);
  assert.ok(ui.container.querySelector('[aria-label="Als gesehen markieren"]'));
});
await act(async () => { tab("Neu").click(); await tick(); });
check("Neu ist Teilmenge von Alles und enthält auch Mein-Programm-Titel", () => {
  assert.equal(tab("Neu").textContent.trim(), "Neu (2)");
  assert.match(ui.container.textContent, /Neu im Katalog deiner ausgewählten Dienste erkannt/u);
  assert.match(ui.container.textContent, /Bestehender Auswahlzugang/u);
  assert.match(ui.container.textContent, /Neuer Auswahlzugang/u);
  assert.match(ui.container.textContent, /Belegte gemeinsame Kartenbeschreibung/u);
  assert.match(ui.container.textContent, /Beschreibung: Watchmode · geprüft 11\.09\.2026/u);
  assert.doesNotMatch(ui.container.textContent, /Unveränderter Altbestand/u);
});
await ui.render({ ...props, auswahl: [], streamingNeu: projiziereStreamingNeu({ bekannt, entdecken, auswahl: [], now: NOW }) });
check("Explizit leere Auswahl rendert keine Diensttitel", () => {
  assert.equal(tab("Neu").textContent.trim(), "Neu (0)");
  assert.match(ui.container.textContent, /Keine Streaming-Dienste ausgewählt/u);
  assert.doesNotMatch(ui.container.textContent, /Neuer Auswahlzugang/u);
});
await ui.cleanup();

const masterOhneExterneIds = [{
  id: "master-ohne-externe-ids", titel: "Streng zugeordnete Serie", originaltitel: "Streng zugeordnete Serie",
  jahr: 2025, typ: "serie", bewertung: { wie: 3, was: 3, warum: 3 },
}];
const strictViews = baueStreamingAnsichten({
  entdeckenUmfang: "voll",
  bekannt: {
    stand: fixture.stand, katalog_stand: fixture.stand,
    stand_pro_quelle: fixture.stand_pro_quelle,
    vergleich_stand_pro_quelle: fixture.vergleich_stand_pro_quelle,
    titel: [{
      watchmode_id: 104, titel: "Streng zugeordnete Serie", jahr: 2025, typ: "tv_series",
      dienste: ["Netflix"],
      dienst_diffs: [{ dienst: "Netflix", vorher: false, nachher: true, erkannt_am: fixture.stand }],
    }],
  },
  entdecken: {
    stand: fixture.stand, katalog_stand: fixture.stand,
    stand_pro_quelle: fixture.stand_pro_quelle,
    vergleich_stand_pro_quelle: fixture.vergleich_stand_pro_quelle,
    titel: [{
      watchmode_id: 105, titel: "Echte Discover-Serie", jahr: 2025, typ: "series",
      dienste: ["Netflix"],
    }],
  },
}, masterOhneExterneIds);
const strictNeu = projiziereStreamingNeu({
  bekannt: strictViews.bekannt, entdecken: strictViews.entdecken,
  auswahl: ["Netflix"], now: NOW,
});
let strictStatus = {};
let addAufruf = null;
const strictProps = {
  bekannt: strictViews.bekannt, entdecken: strictViews.entdecken,
  auswahl: ["Netflix"], auswahlGeladen: true, merkliste: [], toggleMerk() {},
  addFilm: async (film) => { addAufruf = film; return "discover-neu"; }, master: masterOhneExterneIds,
  mustwatchIds: new Set(), entdeckenStatus: strictStatus,
  schreibeEntdeckenStatus: async (update) => { strictStatus = update(strictStatus); return true; },
  onAllesKatalogLaden() {}, recommendationPins: [], onRecommendationPinToggle() {}, streamingNeu: strictNeu,
};
const strictUi = await mount(StreamingTab, strictProps);
const strictTab = (name) => [...strictUi.container.querySelectorAll("button")]
  .find((button) => button.textContent.trim().startsWith(name));
await act(async () => { strictTab("Alles").click(); await tick(); });
let knownOhneIdsKarte = [...strictUi.container.querySelectorAll(".kd-entdecken-karte")]
  .find((karte) => /Streng zugeordnete Serie/u.test(karte.textContent));
await act(async () => { knownOhneIdsKarte.click(); await tick(); });
check("streng zugeordnetes Known ohne ursprüngliche externe Master-ID ist in Alles sofort Mediathek", () => {
  assert.match(knownOhneIdsKarte.textContent, /in deiner Mediathek/u);
  assert.equal([...knownOhneIdsKarte.querySelectorAll("button")]
    .filter((button) => /Eintrag erstellen|In Mediathek übernehmen/u.test(button.textContent)).length, 0);
});
await act(async () => {
  knownOhneIdsKarte.querySelector('[aria-label="Als gesehen markieren"]').click();
  await tick();
});
await strictUi.render({ ...strictProps, entdeckenStatus: strictStatus });
knownOhneIdsKarte = [...strictUi.container.querySelectorAll(".kd-entdecken-karte")]
  .find((karte) => /Streng zugeordnete Serie/u.test(karte.textContent));
check("Known-Zuordnung markiert direkt gesehen ohne doppeltes Anlegen", () => {
  assert.match(knownOhneIdsKarte.textContent, /gesehen · in deiner Mediathek/u);
  assert.equal(addAufruf, null);
  assert.doesNotMatch(strictUi.container.textContent, /Auch als unbewerteten Eintrag/u);
});
await act(async () => { strictTab("Neu").click(); await tick(); });
check("derselbe Known-Titel bleibt auch in Neu als vorhandener Mediathektitel erkennbar", () => {
  const karte = [...strictUi.container.querySelectorAll(".kd-entdecken-karte")]
    .find((eintrag) => /Streng zugeordnete Serie/u.test(eintrag.textContent));
  assert.ok(karte);
  assert.match(karte.textContent, /in deiner Mediathek/u);
});
await act(async () => { strictTab("Alles").click(); await tick(); });
const discoverKarte = [...strictUi.container.querySelectorAll(".kd-entdecken-karte")]
  .find((karte) => /Echte Discover-Serie/u.test(karte.textContent));
await act(async () => { discoverKarte.click(); await tick(); });
check("echter Discover-Titel bleibt anlegbar", () => {
  assert.ok([...discoverKarte.querySelectorAll("button")]
    .some((button) => button.textContent.trim() === "Eintrag erstellen"));
});
await act(async () => {
  discoverKarte.querySelector('[aria-label="Als gesehen markieren"]').click();
  await tick();
  [...discoverKarte.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "Ja, in die Mediathek").click();
  await tick();
});
check("Gesehen-Übernahme nutzt für alle vorhandenen Serientypen denselben Helper", () => {
  assert.equal(addAufruf?.typ, "serie");
});
await strictUi.cleanup();

console.log(`\nStreaming-Ansichten: ${checks}/${checks} Checks bestanden.`);
