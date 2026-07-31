/* Aktiver Laufzeitgraph und reine React-Aktionen. Rein lokal, kein Browser. */

import fs from "node:fs";
import path from "node:path";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const root = process.cwd();
const besucht = new Set();
function aufloesen(von, spec) {
  if (!spec.startsWith(".")) return null;
  const basis = path.resolve(path.dirname(von), spec);
  for (const kandidat of [
    basis,
    basis + ".js",
    basis + ".jsx",
    path.join(basis, "index.js"),
    path.join(basis, "index.jsx"),
  ]) {
    if (fs.existsSync(kandidat) && /\.(?:js|jsx)$/.test(kandidat)) return kandidat;
  }
  return null;
}
function besuche(datei) {
  if (besucht.has(datei)) return;
  besucht.add(datei);
  const quelle = fs.readFileSync(datei, "utf8");
  const importe = [
    ...quelle.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...quelle.matchAll(/\bimport\s+["']([^"']+)["']/g),
    ...quelle.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ];
  for (const treffer of importe) {
    const ziel = aufloesen(datei, treffer[1]);
    if (ziel) besuche(ziel);
  }
}
besuche(path.join(root, "src/main.jsx"));

const aktivRelativ = [...besucht].map((datei) => path.relative(root, datei));
check("Aktiver Importgraph enthält keine historischen Treiber oder Ansichten",
  !aktivRelativ.some((datei) => /(?:^|\/)(?:legacy\/|gitDriver\.js$|supabaseDriver\.js$|catalogPublic\.js$)/.test(datei)));
for (const pausiert of ["Teppich.jsx", "Crawl.jsx", "NecronomiconRand.jsx", "momentEggs.js"]) {
  check(`Pausiertes Feature ${pausiert} liegt nicht im aktiven Importgraph`,
    !aktivRelativ.some((datei) => datei.endsWith("/" + pausiert)));
}

const app = fs.readFileSync("src/App.jsx", "utf8");
const streamingTab = fs.readFileSync("src/tabs/StreamingTab.jsx", "utf8");
const kinoTab = fs.readFileSync("src/tabs/KinoTab.jsx", "utf8");
const mediathekTab = fs.readFileSync("src/tabs/MediathekTab.jsx", "utf8");
const cage = fs.readFileSync("src/components/CageAlphabet.jsx", "utf8");
const controller = fs.readFileSync("src/controllers/useIntelligenceController.js", "utf8");

for (const [name, quelle, muster] of [
  ["Artikel", app + controller, /setArtikelListe\(\s*\(prev\)/],
  ["Master", app, /setMaster\(\s*\(prev\)/],
  ["Exportstand", app, /setExportStand\(\s*\(prev\)/],
  ["Must-Watch", app, /setMustwatch\(\s*\(prev\)/],
  ["Kino-Pins", app, /setKinoPins\(\s*\(prev\)/],
  ["Merkliste", app, /setMerkliste\(\s*\(prev\)/],
  ["Streaming-Auswahl", app, /setAuswahlRoh\(\s*\(prev\)/],
  ["Entdecken-Status", streamingTab, /setEntdeckenStatus\(\s*\(prev\)/],
]) {
  check(`${name}-Persistenz läuft nicht mehr in einem React-State-Updater`,
    !muster.test(quelle));
}
check("Filter-Persistenz läuft außerhalb der React-State-Updater",
  !/setFilterMenueOffen\(\s*\(/.test(kinoTab + mediathekTab)
  && !/setStreamFilterOffen\(\s*\(/.test(streamingTab));
check("Cage-Start führt Animation und Hooks nicht in einem State-Updater aus",
  !/setPhase\(\s*\(/.test(cage) && /gestartet\.current/.test(cage));
check("Artikel- und Entdecken-Aktionen besitzen je einen serialisierten Schreibweg",
  /const schreibeArtikel = useCallback/.test(app)
  && /const schreibeEntdeckenStatus = useCallback/.test(streamingTab));
check("Leichter Streaming-Boot liest nie mehr die kombinierte Katalogzeile",
  /holeEinmal\(streamingBekanntLaufRef,\s*"streamingBekannt"/.test(app)
  && /holeEinmal\(streamingEntdeckenLaufRef,\s*"streamingEntdecken"/.test(app)
  && !/loadArea\("streaming",/.test(app));

console.log(`stateactions_test: ${ok} Checks bestanden.`);
