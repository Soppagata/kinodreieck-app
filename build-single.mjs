#!/usr/bin/env node
/* Baut die eigenständige Kinodreieck.html:
   1. Vite-Single-File-Build (vite.singlefile.config.js)
   2. Modul-Script -> klassisches Inline-Script vor </body> (file://-tauglich)
   3. Validierung: kein type=module, kein dynamisches import()/import.meta,
      keine externen Verweise außer data:-URIs.
   Aufruf: node build-single.mjs   (npm run build:single)
   Ergebnis: dist-single/Kinodreieck.html */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist-single");
mkdirSync(OUT, { recursive: true });

console.log("1/3 Vite-Single-File-Build …");
execSync(`npx vite build --config vite.singlefile.config.js --outDir "${OUT}" --emptyOutDir`, { cwd: ROOT, stdio: "inherit" });

console.log("2/3 Modul-Script -> klassisches Script …");
let html = readFileSync(join(OUT, "index.html"), "utf8");
html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, "");
/* PWA-Links sind nur für die gehostete Web-App (Pages) relevant; in der
   file://-Doppelklick-Datei würden sie ins Leere zeigen und die Extern-Referenz-
   Prüfung unten auslösen → hier entfernen. */
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, "");
html = html.replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, "");
const bloecke = [];
html = html.replace(/<script type="module"[^>]*>([\s\S]*?)<\/script>\s*/g, (_, code) => { bloecke.push(code); return ""; });
if (!bloecke.length) { console.error("ABBRUCH: kein module-Script in der Vite-Ausgabe."); process.exit(1); }
html = html.replace(/<\/body>/, () => bloecke.map((c) => "<script>" + c + "</script>").join("\n") + "\n</body>");

console.log("3/3 Validierung …");
const fehler = [];
if (/<script type="module"/.test(html)) fehler.push('type="module" noch enthalten');
for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  if (/\bimport\s*\(/.test(code)) fehler.push("dynamisches import() im Bundle");
  if (/import\.meta/.test(code)) fehler.push("import.meta im Bundle");
  try { new Function(code); } catch (e) { fehler.push("Script parst nicht: " + e.message); }
}
for (const m of html.matchAll(/<(?:script|link)[^>]*(?:src|href)="(?!data:)[^"]*"[^>]*>/g)) fehler.push("externer Verweis: " + m[0].slice(0, 80));
if (fehler.length) { console.error("ABBRUCH — Datei NICHT geschrieben:"); fehler.forEach((f) => console.error("  - " + f)); process.exit(1); }

const ziel = join(OUT, "Kinodreieck.html");
writeFileSync(ziel, html);
console.log(`✓ ${ziel} (${(html.length / 1024).toFixed(0)} KB, klassisches Script, Doppelklick-fähig).`);
