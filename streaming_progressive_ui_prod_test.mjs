import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-streaming-prod-ui-"));
const bundle = path.join(outDir, "bundle.mjs");
fs.symlinkSync(path.join(rootDir, "node_modules"), path.join(outDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(outDir, { recursive: true, force: true }));
let esbuild;
try { esbuild = await import("esbuild"); }
catch { esbuild = createRequire(import.meta.resolve("vite"))("esbuild"); }
await esbuild.build({
  stdin: {
    contents: [
      'export { TitleFactsDetails } from "./src/tabs/StreamingTab.jsx";',
      'export { FilmwissenBereich } from "./src/components/FilmwissenBereich.jsx";',
      'export { KatalogAuditStatus } from "./src/components/KatalogAuditStatus.jsx";',
      'export { DreiFragen } from "./src/components/DreiFragen.jsx";',
      'export { StreamingEinstellungen } from "./src/components/StreamingEinstellungen.jsx";',
      'export { entdeckenDailyFeedNotice } from "./src/services/entdeckenDailyFeed.js";',
      'export { HILFE_BEREICHE } from "./src/lib/hilfeInhalte.js";',
    ].join("\n"),
    loader: "js", resolveDir: rootDir,
  },
  bundle: true, format: "esm", outfile: bundle, jsx: "automatic", target: "es2022",
  define: { "import.meta.env": JSON.stringify({ VITE_APP_ENV: "production" }) },
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/server"], logLevel: "warning",
});
const {
  TitleFactsDetails, FilmwissenBereich, KatalogAuditStatus, DreiFragen,
  StreamingEinstellungen, entdeckenDailyFeedNotice, HILFE_BEREICHE,
} = await import(pathToFileURL(bundle).href);
const h = React.createElement;
const prod = { appEnvironment: "production" };

const facts = renderToStaticMarkup(h(TitleFactsDetails, { titel: {
  beschreibung: "Neutrale Beschreibung", genres: ["Drama"], laufzeit_minuten: 101,
  descriptionEvidence: { source: "watchmode", checkedAt: "2026-09-13T10:00:00.000Z" },
} }));
assert.match(facts, /Neutrale Beschreibung/u);
assert.doesNotMatch(facts, /Watchmode|FlixPatrol|geprüft 13\.09\.2026/u);

const filmwissen = renderToStaticMarkup(h(FilmwissenBereich, { config: prod, phase: "ready", daten: {
  status: "belegt", warum: { wert: 4, sicherheit: "hoch", kurztext: "Belegte Einordnung" },
  version: { stand: "2026-09-13", nr: 8 }, fundstellen: [],
} }));
assert.match(filmwissen, /Gemeinsame Einordnung/u);
assert.doesNotMatch(filmwissen, /Stand|Version 8/u);

const audit = renderToStaticMarkup(h(KatalogAuditStatus, { config: prod, bekannt: null, entdecken: null }));
assert.equal(audit, "");
const settings = renderToStaticMarkup(h(StreamingEinstellungen, {
  teil: "alle", auswahl: ["Netflix"], toggleQuelle() {}, bekannt: null, entdecken: null,
}));
assert.match(settings, /Netflix/u);
assert.doesNotMatch(settings, /Katalog-Status|Watchmode|Credits|Nächster Reset/u);

const questions = renderToStaticMarkup(h(DreiFragen, { config: prod, ergebnis: {
  responseMode: "structured", hinweis: null, signale: [], ohneBeleg: 0, verworfen: [],
  rahmen: { filme: [{ titel: "Möglicher Film", jahr: 2024 }] },
  flixpatrolHinweise: [{ filmIndex: 0, candidates: [{
    flixpatrolId: "fp-1", title: "Möglicher Film", year: 2024, mediaType: "film",
    checkedAt: "2026-09-13T10:00:00.000Z", sourceUrl: "https://supplier.example/fp-1",
  }] }],
} }));
assert.match(questions, /Mögliche Werke im Faktenbestand, noch nicht bestätigt/u);
assert.match(questions, /Möglicher Film/u);
assert.doesNotMatch(questions, /Stand 2026-09-13|supplier\.example|>Quelle</u);

const staleNotice = entdeckenDailyFeedNotice({
  status: "stale", responseMode: "degraded", feed: { refreshedOn: "2026-09-13" },
});
assert.match(staleNotice, /Vorhandene Empfehlungen bleiben sichtbar/u);
assert.doesNotMatch(staleNotice, /Stand|13\.09\.2026|Ersatzstand|Aktualisierung/u);
const help = HILFE_BEREICHE.flatMap((entry) => entry.details).join(" ");
assert.match(help, /14 volle Tage/u);
assert.doesNotMatch(help, /Watchmode|Movie of the Night|MotN|FlixPatrol|Quellenstand|Abrufzeit/u);

const legalSource = fs.readFileSync(path.join(rootDir, "src/components/EinstiegsGate.jsx"), "utf8");
assert.match(legalSource, /Informationen zu Movie of the Night/u);
const productionLegal = legalSource.slice(
  legalSource.indexOf("function ProduktionsRechtliches"), legalSource.indexOf("export function oeffneEinstiegsLogin"),
);
assert.doesNotMatch(productionLegal, /Stand: privater Release/u);
const stapelSource = fs.readFileSync(path.join(rootDir, "src/components/StapelImport.jsx"), "utf8");
assert.match(stapelSource, /produktiv \? "Neutrale Fakten ergänzen:"/u);
assert.match(stapelSource, /produktiv \? <small>Die Ergänzungen sind keine Bewertung oder Verfügbarkeitsangabe/u);
const profilSource = fs.readFileSync(path.join(rootDir, "src/components/ProfilAnsicht.jsx"), "utf8");
assert.match(profilSource, /!produktiv && kandidat\.checkedAt/u);
assert.match(profilSource, /!produktiv && kandidat\.sourceUrl/u);

console.log("streaming_progressive_ui_prod_test: 18 checks passed");
