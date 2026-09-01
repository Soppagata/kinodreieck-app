/* Privatrelease-Vertrag fuer den historischen Demo-Seed: Die lokale
   Einzeldatei darf ihre eingebettete Beilage behalten. Online- und Localmodus
   besitzen aber keinen Demo-Start; die Servicegrenze bleibt immer geschlossen. */
import fs from "node:fs";
import vm from "node:vm";

const { pruefeDemoSeed, varianteVon } = await import("./src/lib/katalog.js");
const { createCatalogService } = await import("./src/services/catalog.js");
const { ERROR_CODES } = await import("./src/services/errors.js");

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
check("Getrennte Einzeldatei-Beilage enthaelt weiterhin eine echte Filmbasis",
  sidecar.master.filme.every((film) => !!film.id && !!film.titel));

const serviceSource = fs.readFileSync("src/services/catalog.js", "utf8");
const appSource = fs.readFileSync("src/App.jsx", "utf8");
const controllerSource = fs.readFileSync("src/controllers/catalogController.js", "utf8");
let tokenAufrufe = 0;
let fetchAufrufe = 0;
globalThis.fetch = async () => { fetchAufrufe++; throw new Error("darf nicht erreicht werden"); };
const service = createCatalogService({
  auth: { getSnapshot: () => ({
    mode: "account", state: "ready", account: { id: "demo-test" },
    capabilities: { remoteStorage: true, personalAi: false },
  }) },
  driver: { getAccessToken: async () => { tokenAufrufe++; return "test-token"; } },
});
let demoFehler = null;
try { await service.loadDemo(); } catch (error) { demoFehler = error; }
check("Demo-Service bleibt auch fuer ein aktives Konto fail-closed",
  demoFehler?.code === ERROR_CODES.FORBIDDEN
  && demoFehler?.reason === "private-release-no-demo");
check("Demo-Service endet vor Token, HTTP und Cache",
  tokenAufrufe === 0 && fetchAufrufe === 0
  && !/ladeKatalogAsset\("demo_seed"\)/.test(serviceSource));
check("Aktiver Demo-Service importiert den kd_store-Adapter nicht mehr",
  !/catalogPublic|ladeDemoBlobs|kd_store/.test(serviceSource));
check("Online- und Localmodus besitzen keinen Demo-Start",
  !/demoLadung/.test(appSource)
  && !/<StartWahl\b/.test(appSource)
  && !/__KD_DEMO_SEED__/.test(appSource));
const singleConfig = fs.readFileSync("vite.singlefile.config.js", "utf8");
const singleBuilder = fs.readFileSync("build-single.mjs", "utf8");
check("Nur der ausdrueckliche Einzeldatei-Build behaelt die eingebettete Beilage",
  /__KD_SINGLE_FILE__: 'true'/.test(singleConfig)
  && /data-kd-einzeldatei-seed/.test(singleBuilder)
  && /demo_masterliste\.js/.test(singleBuilder)
  && /__KD_DEMO_SEED__/.test(controllerSource));

const migration = fs.readFileSync("supabase/migrations/20260731140000_demo_seed_catalog.sql", "utf8");
check("Migration erweitert den geschlossenen Katalognamen-Vertrag",
  /kd_catalog_name_check[\s\S]*'demo_seed'/.test(migration));
check("Migration baut den Seed aus dem bestehenden öffentlichen Demo-Bestand",
  /jsonb_object_agg\(key, value::jsonb\)/.test(migration)
  && /b \? 'kd:master'/.test(migration));
check("Historische Migration dokumentiert den frueheren anonymen Vertrag",
  /kd_catalog_read_public[\s\S]*to anon, authenticated[\s\S]*'demo_seed'/.test(migration));
check("Migration lässt den alten Demo-Bestand für ausgelieferte Clients vorläufig stehen",
  !/delete from public\.kd_store/.test(migration));
const privateReleaseMigration = fs.readFileSync(
  "supabase/migrations/20260901193000_private_release_access_boundary.sql", "utf8",
);
check("Privatrelease-Migration hebt den historischen anonymen Katalogvertrag auf",
  /drop policy if exists kd_catalog_read_public/.test(privateReleaseMigration)
  && /revoke all on table public\.kd_catalog from public, anon, authenticated/.test(privateReleaseMigration));

const generator = fs.readFileSync("tools/demo_mediathek.mjs", "utf8");
check("Lokales Demo-Werkzeug kann die getrennte Seed-Datei weiterhin erzeugen",
  /demo_seed\.json/.test(generator)
  && /name=demo_seed|name = 'demo_seed'|\('demo_seed'/.test(generator)
  && !/delete from public\.kd_store/.test(generator));

console.log(`demo_seed_test: ${ok} Checks bestanden.`);
