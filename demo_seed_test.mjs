/* Demo-Seed-Architekturtest: Vertrag, lokale Beilage, Migration und aktive
   Modulgrenze. Reiner Test ohne Netzwerk oder persönliche Daten. */
import fs from "node:fs";
import vm from "node:vm";

const { pruefeDemoSeed, varianteVon } = await import("./src/lib/katalog.js");

let ok = 0;
function check(name, value) {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const minimal = {
  format: 1,
  master: { meta: {}, filme: [{ id: "demo", titel: "Demo" }] },
  mustwatch: { eintraege: [] },
  streaming_dienste: { quellen: [], heuristik: true },
  artikel: { artikel: [] },
  kino_pins: [],
  merkliste: [],
};
check("Kanonischer Format-1-Seed wird akzeptiert", pruefeDemoSeed(minimal) === minimal);
check("demo_seed ist fachlich eine Demo-Variante", varianteVon("demo_seed") === "demo");
for (const [name, kaputt] of [
  ["fremdes Format", { ...minimal, format: 2 }],
  ["Master fehlt", { ...minimal, master: null }],
  ["Filmliste fehlt", { ...minimal, master: {} }],
  ["Must-Watch formfremd", { ...minimal, mustwatch: [] }],
  ["Streamingdienste formfremd", { ...minimal, streaming_dienste: { quellen: "MUBI" } }],
  ["Artikel formfremd", { ...minimal, artikel: [] }],
  ["Pins formfremd", { ...minimal, kino_pins: {} }],
  ["Merkliste formfremd", { ...minimal, merkliste: {} }],
]) {
  let geworfen = false;
  try { pruefeDemoSeed(kaputt); } catch { geworfen = true; }
  check("Vertrag weist " + name + " ab", geworfen);
}

const sidecarSource = fs.readFileSync("public/Programmdateien/System/demo_masterliste.js", "utf8");
const sandbox = { window: {} };
vm.runInNewContext(sidecarSource, sandbox);
const sidecar = sandbox.window.__KD_DEMO_SEED__;
check("Lokale Beilage liefert denselben Format-1-Vertrag",
  pruefeDemoSeed(sidecar) === sidecar && sidecar.master.filme.length > 0);
check("Legacy-Global zeigt nur auf den Master desselben Seeds",
  sandbox.window.__KD_DEMO_MASTER__ === sidecar.master);
check("Lokale Demo bringt auch ohne Konto/Netz eine echte Filmbasis mit",
  sidecar.master.filme.every((film) => !!film.id && !!film.titel));

const serviceSource = fs.readFileSync("src/services/catalog.js", "utf8");
const appSource = fs.readFileSync("src/App.jsx", "utf8");
const controllerSource = fs.readFileSync("src/controllers/catalogController.js", "utf8");
check("Aktiver Demo-Service lädt demo_seed nur mit gebundener Konto-ID",
  /ladeKatalogAsset\("demo_seed",\s*\{\s*erwarteteKontoId\s*\}\)/.test(serviceSource));
check("Aktiver Demo-Service importiert den kd_store-Adapter nicht mehr",
  !/catalogPublic|ladeDemoBlobs|kd_store/.test(serviceSource));
check("Online und Datei werden in genau dieselbe App-Ladungsform projiziert",
  (controllerSource.match(/demoSeedZuLadung\(/g) || []).length === 2
  && /__KD_DEMO_SEED__/.test(controllerSource)
  && /demoLadung/.test(appSource));

const migration = fs.readFileSync("supabase/migrations/20260731140000_demo_seed_catalog.sql", "utf8");
check("Migration erweitert den geschlossenen Katalognamen-Vertrag",
  /kd_catalog_name_check[\s\S]*'demo_seed'/.test(migration));
check("Migration baut den Seed aus dem bestehenden öffentlichen Demo-Bestand",
  /jsonb_object_agg\(key, value::jsonb\)/.test(migration)
  && /b \? 'kd:master'/.test(migration));
check("Migration veröffentlicht demo_seed für anon über die Katalog-RLS",
  /kd_catalog_read_public[\s\S]*to anon, authenticated[\s\S]*'demo_seed'/.test(migration));
check("Migration lässt den alten Demo-Bestand für ausgelieferte Clients vorläufig stehen",
  !/delete from public\.kd_store/.test(migration));

const generator = fs.readFileSync("tools/demo_mediathek.mjs", "utf8");
check("Demo-Werkzeug erzeugt den neuen Vertrag statt kd_store-SQL",
  /demo_seed\.json/.test(generator)
  && /name=demo_seed|name = 'demo_seed'|\('demo_seed'/.test(generator)
  && !/delete from public\.kd_store/.test(generator));

console.log(`demo_seed_test: ${ok} Checks bestanden.`);
