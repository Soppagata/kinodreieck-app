import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { transform } from "esbuild";

const read = (path) => readFileSync(path, "utf8");
const app = read("src/App.jsx");
const gate = read("src/components/EinstiegsGate.jsx");
const catalog = read("src/services/catalog.js");
const sw = read("public/sw.js");
const redirects = read("public/_redirects");
const headers = read("public/_headers");
const migration = read("supabase/migrations/20260901193000_private_release_access_boundary.sql");
const entdeckenFunction = read("supabase/functions/entdecken-daily-task/index.ts");
const distAssets = readdirSync("dist/assets").filter((name) => name.endsWith(".js"));
const distJs = distAssets.map((name) => read(join("dist/assets", name))).join("\n");

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log("✓ " + name);
}

check("Demo-Pfad ist entfernt und Offline-Snapshots sind auf den lokalen Einzeldatei-Build begrenzt",
  !/demoLadung/.test(app)
  && /const EINZELDATEI_BUILD/.test(app)
  && read("vite.config.js").includes("__KD_SINGLE_FILE__: 'false'"));

check("Minifiziertes Web-Bundle enthaelt weder Demo-Seed noch alte Sidecar-Pfade",
  !/Der letzte Vorf.hrER|window\.__KD_DEMO_SEED__|Programmdateien\/System\/demo_masterliste|streaming_entdecken\.js/i.test(distJs)
  && distJs.length > 1000);

check("Web-Build erzeugt keine Source Maps",
  !readdirSync("dist/assets").some((name) => name.endsWith(".map"))
  && !existsSync("dist/sitemap.xml"));

check("Cloudflare Pages leitet historische Download- und Demo-Assets zum bestehenden Login",
  /^\/download \/ 302$/m.test(redirects)
  && /^\/download\/\* \/ 302$/m.test(redirects)
  && /^\/Programmdateien\/System\/\* \/ 302$/m.test(redirects));

check("Discovery-Schutz bleibt zentral als Header und HTML-Fallback aktiv",
  headers.includes("X-Robots-Tag: noindex, nofollow")
  && read("index.html").includes('name="robots" content="noindex, nofollow"'));

check("Service Worker entwertet Alt-Shell und Katalogfallback und cached keine JSON-Daten",
  sw.includes('"kd-shell-"')
  && sw.includes('"kinodreieck-katalog-"')
  && /istNetzwerkNur = istBuildMeta\s*\|\| istDaten/.test(sw)
  && !/if \(istHTML \|\| istDaten\)/.test(sw));

check("Alte lokale Ready-Marker koennen fehlende Kontorechte nicht ueberstimmen",
  /if \(freigegeben && storageState === "account-ready"\)/.test(gate));

check("Entfernter Demo-Katalogpfad endet vor Token-, HTTP- und Cachezugriff",
  /async loadDemo\(\) \{[\s\S]*private-release-no-demo[\s\S]*?\n  \},/.test(catalog)
  && !/async loadDemo\(\) \{[\s\S]*ladeKatalogAsset\("demo_seed"/.test(catalog));

check("Additive Migration schliesst anonyme Katalog-, Legacy- und Sharingrechte fail-closed",
  /drop policy if exists kd_catalog_read_public/.test(migration)
  && /revoke all on table public\.kd_catalog from public, anon, authenticated/.test(migration)
  && /revoke all on table public\.kd_store from public, anon, authenticated/.test(migration)
  && /if auth\.uid\(\) is null[\s\S]*if not public\.kd_account_active\(\)/.test(migration)
  && /grant execute on function public\.kd_list_shared_articles\(\)\s+to authenticated, service_role/.test(migration));

check("Entdecken-GET verlangt ein verifiziertes aktives Konto vor demselben read-only Feedpfad",
  /requestMode === "read" \|\| requestMode === "owner"/.test(entdeckenFunction)
  && /claims\?\.role !== "authenticated"/.test(entdeckenFunction)
  && /access\?\.active === true/.test(entdeckenFunction)
  && /runEntdeckenDailyRefresh\(\{ repository, adapter: productAdapter \}\)/.test(entdeckenFunction));

await transform(entdeckenFunction, { loader: "ts", format: "esm" });
check("Geaenderte Function-Access-Grenze ist syntaktisch gueltiges TypeScript", true);

console.log(`PRIVATE-RELEASE-BOUNDARY-TEST BESTANDEN (${checks}/${checks})`);
