import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { formatPresentationDate } from "./src/lib/presentationDate.js";

let checks = 0;
function check(name, callback) {
  callback();
  checks += 1;
  console.log(`✓ ${name}`);
}
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = source("./src/App.jsx");
const navigation = source("./src/components/AppNavigation.jsx");
const blog = source("./src/tabs/BlogTab.jsx");
const entdecken = source("./src/tabs/EntdeckenTab.jsx");
const hilfe = source("./src/lib/hilfeInhalte.js");
const css = source("./src/index.css");

function jsxFiles(path) {
  return readdirSync(new URL(path, import.meta.url), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(path, entry.name);
    return entry.isDirectory() ? jsxFiles(relative) : entry.name.endsWith(".jsx") ? [relative] : [];
  });
}

check("D-07/U-08: gemeinsamer de-AT-Formatter zeigt Datum und Zeit mit vierstelligem Jahr", () => {
  assert.equal(formatPresentationDate("2026-09-04"), "04.09.2026");
  assert.equal(formatPresentationDate("2026-09-04T08:05:00Z", { includeTime: true }), "04.09.2026, 10:05");
  assert.equal(formatPresentationDate("2026-09-04", { format: "long" }), "4. September 2026");
});

check("D-07/U-08: bekannte sichtbare Datumsflächen nutzen die Foundation", () => {
  const contracts = [
    ["./src/tabs/BlogTab.jsx", /formatPresentationDate\(a\.erstellt_am\)/],
    ["./src/components/ProfilAnsicht.jsx", /formatPresentationDate\(profil\.geaendert\)/],
    ["./src/components/TeilenBlock.jsx", /formatPresentationDate\(analyse\.erstellt\)/],
    ["./src/tabs/StartTab.jsx", /formatPresentationDate\(new Date\(\), \{ format: "long" \}\)/],
    ["./src/tabs/KinoTab.jsx", /formatPresentationDate\(progStand, \{ includeTime: true \}\)/],
    ["./src/tabs/KinoTab.jsx", /formatPresentationDate\(ev\.d, \{ fallback: ev\.d \}\)/],
    ["./src/tabs/EntdeckenTab.jsx", /formatPresentationDate\(entry\.date/],
    ["./src/tabs/StreamingTab.jsx", /formatPresentationDate\(katalogInfo\.gueltigBis\)/],
    ["./src/components/FilmwissenBereich.jsx", /formatPresentationDate\(daten\.version\.stand\)/],
    ["./src/components/StreamingEinstellungen.jsx", /formatPresentationDate\(stand, \{ includeTime: true \}\)/],
    ["./src/components/KontoBereich.jsx", /formatPresentationDate\(status\.lastPull/],
    ["./src/components/PrivatePilotOps.jsx", /formatPresentationDate\(entry\.retrievedAt/],
    ["./src/components/KatalogAuditStatus.jsx", /formatPresentationDate\(new Date\(value\), \{ includeTime: true \}\)/],
    ["./src/lib/radarNews.js", /formatPresentationDate\(entry\.checkedAt/],
  ];
  for (const [path, pattern] of contracts) assert.match(source(path), pattern, path);
  const directDateLocaleOwners = jsxFiles("./src/tabs").concat(jsxFiles("./src/components"))
    .filter((path) => /\.toLocaleDateString\(/.test(source(path)));
  assert.deepEqual(directDateLocaleOwners, ["src/components/Wochenplan.jsx"],
    "nur die ausdrücklich kurzen Wochenplan-Tageslabels dürfen direkt kurz formatieren");
  assert.doesNotMatch(blog, /erstellt_am\.slice\(0,\s*10\)/);
  assert.doesNotMatch(entdecken, />\{(?:entry|episode)\.date\}/);
});

check("D-07: interne ISO-Verträge für Inputs, Dateinamen und Persistenz bleiben erhalten", () => {
  assert.match(source("./src/components/Wochenplan.jsx"), /type="date" required value=\{entwurf\.startdatum\}/);
  assert.match(source("./src/components/TeilenBlock.jsx"), /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(source("./src/components/PrivatePilotOps.jsx"), /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(app, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

check("R-07: Blogkarte ist Artikel mit eigenem Expand-Button und benannter Region", () => {
  assert.match(blog, /<article key=\{a\.id\} className="kd-blog-karte"/);
  assert.match(blog, /<button type="button" className="kd-blog-expand"[\s\S]*?aria-expanded=\{offen\} aria-controls=\{detailsId\}/);
  assert.match(blog, /id=\{detailsId\} role="region" aria-labelledby=\{titelId\}/);
  assert.doesNotMatch(blog, /role="button" tabIndex=\{0\}/);
});

check("R-11: Entdecken verwendet ehrliche Navigation statt eines unvollständigen Tabmusters", () => {
  assert.match(entdecken, /<nav className="kd-entdecken-tabs" aria-label="Entdecken-Ansichten">/);
  assert.match(entdecken, /aria-current=\{ansicht === id \? "page" : undefined\}/);
  assert.doesNotMatch(entdecken, /role="tab(?:list|panel)?"|aria-selected=/);
});

check("R-12: Desktop- und Mobilnavigation kennzeichnen die aktive Seite", () => {
  assert.match(app, /aria-current=\{tab === id \? "page" : undefined\}/);
  assert.match(navigation, /aria-current=\{aktiv === eintrag\.id \? "page" : undefined\}/);
});

check("U-13: Eine kanonische Hilfe liegt ausschließlich in Settings", () => {
  assert.doesNotMatch(navigation, /kd-mobile-menu-hilfe|onHilfe/);
  assert.doesNotMatch(app, /anleitungAuftrag|setAnleitungAuftrag|oeffneHilfe|onHilfe=/u);
  assert.doesNotMatch(source("./src/tabs/StartTab.jsx"), /\? Anleitung &amp; Hilfe|onHilfe/);
  assert.match(source("./src/tabs/DatenTab.jsx"), /<Klappe titel="Hilfe & Anleitung">[\s\S]*<UeberKinodreieck \/>/);
  assert.match(hilfe, /zentrale Anleitung findest du dort unter Hilfe & Anleitung/u);
  for (const path of jsxFiles("./src")) assert.doesNotMatch(source(path), /href=["'{`]\/download\//, path);
  assert.doesNotMatch(source("./src/components/InstallationCard.jsx"), /herunterladen|Download/i);
});

check("U-06-Naht: Katalogbestand bleibt knapp und ohne titelspezifischen Sonderfall", () => {
  const status = source("./src/components/KatalogAuditStatus.jsx");
  assert.match(status, /Gesamtbestand/);
  assert.match(status, /Ausgewählte Dienste/);
  assert.match(status, /Mein Programm/);
  assert.match(status, /Neu/);
  assert.doesNotMatch(status, /Snapshotdifferenz|Pipelinephasen|Warum fehlt|titleTrace/);
});

check("D-09: jedes native Checkbox-Inventar hängt am gemeinsamen 44px-Labelvertrag", () => {
  const checkboxOwners = jsxFiles("./src/tabs").concat(jsxFiles("./src/components"))
    .filter((path) => /type="checkbox"/.test(source(path)));
  assert.ok(checkboxOwners.length > 0, "Checkbox-Inventar darf nicht unbemerkt verschwinden");
  for (const path of checkboxOwners) assert.match(source(path), /kd-touch-checkbox/, path);
  assert.match(css, /label\.kd-touch-checkbox \{[^}]*min-width:44px;[^}]*min-height:44px;/);
  assert.match(source("./src/components/FilmCard.jsx"), /const kartenRolle = auswahlmodus \? "checkbox"/);
  assert.match(source("./src/components/FilmCard.jsx"), /role=\{kartenRolle\}/);
  assert.match(css, /\.kd-auswahl-karte \{ min-height:44px; \}/);
});

assert.equal(checks, 9, "D2-Pflichtregister muss alle neun fokussierten Verträge ausführen");
console.log(`\n${checks}/9 D2-Vertragsprüfungen bestanden.`);
