/* Pages-Build-Test (Regression zu P4, 2026-07): prüft den WEB-Build (dist/),
   den GitHub Pages unter einem UNTERPFAD ausliefert — die übrige Suite testet
   nur die Single-File. Fängt: absolute "/…"-Datenfetches, absolute Asset-Pfade,
   wieder eingeschleppte Font-Inlines, fehlende PWA-Dateien.
   Aufruf: vite build && node pages_test.mjs */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const checks = [];
const check = (n, p) => { checks.push([n, p]); console.log((p ? "✓ " : "✗ ") + n); };

const indexHtml = readFileSync(join(DIST, "index.html"), "utf8");
const assets = readdirSync(join(DIST, "assets"));
const jsDatei = assets.find((f) => f.endsWith(".js"));
const cssDatei = assets.find((f) => f.endsWith(".css"));
const js = jsDatei ? readFileSync(join(DIST, "assets", jsDatei), "utf8") : "";
const css = cssDatei ? readFileSync(join(DIST, "assets", cssDatei), "utf8") : "";

/* 1) Keine absoluten Pfade — auf Pages zeigt "/x" auf die Domain-Root, nicht die App. */
check("index.html: alle src/href relativ (kein =\"/…\")", !/(?:src|href)="\/(?!\/)/.test(indexHtml));
check("JS-Bundle: kein fetch(\"/…\") (absoluter Datenpfad)", !/fetch\(\s*["']\//.test(js));
check("JS-Bundle: Katalog läuft über Supabase/PostgREST", js.includes("kd_catalog") && js.includes("/rest/v1/"));

/* 2) Fonts: im Web-Build eigene Assets, NICHT ins CSS eingebettet. */
check("CSS: keine eingebetteten Fonts (kein data:font)", !css.includes("data:font"));
check("CSS: referenziert .woff2-Assets", css.includes(".woff2"));
check("assets/: .woff2-Dateien vorhanden", assets.some((f) => f.endsWith(".woff2")));

/* 3) PWA-Dateien im Deploy vorhanden + SW-Regeln aktuell. */
check("dist/sw.js vorhanden", existsSync(join(DIST, "sw.js")));
const sw = existsSync(join(DIST, "sw.js")) ? readFileSync(join(DIST, "sw.js"), "utf8") : "";
check("sw.js: versionierter Cache-Name (v2+)", /kd-shell-v(?!1\b)\d+/.test(sw));
check("sw.js: .json-Datendateien network-first (kein Einfrieren)", sw.includes('endsWith(".json")'));
check("dist/manifest.webmanifest vorhanden", existsSync(join(DIST, "manifest.webmanifest")));
check("index.html: Manifest verlinkt", indexHtml.includes("manifest.webmanifest"));

const fails = checks.filter(([, p]) => !p);
console.log(`\n${checks.length - fails.length}/${checks.length} Checks bestanden.`);
console.log(fails.length ? "PAGES-BUILD-TEST: BEFUNDE OBEN" : "PAGES-BUILD-TEST BESTANDEN");
process.exit(fails.length ? 1 : 0);
