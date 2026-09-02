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
/* KD_OUT: optionaler alternativer Zielordner für Sonder-Builds. Derzeit setzt
   ihn niemand (die frühere KD_BETA-Doppelbau-Mechanik existiert nicht mehr);
   Default bleibt dist-single. */
const OUT = join(ROOT, process.env.KD_OUT || "dist-single");
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
/* Die Offline-Beilage liegt ausschließlich als Build-Fixture außerhalb von
   public. In der Doppelklick-Datei muss derselbe geprüfte Seed VOR dem
   App-Bundle vorhanden sein: ein relativer script.src würde vom Ablageort der
   heruntergeladenen HTML-Datei abhängen und ist kein Einzeldatei-Vertrag. */
const demoSeedQuelle = readFileSync(
  join(ROOT, "tools", "fixtures", "demo_masterliste.js"),
  "utf8",
);
if (!/window\.__KD_DEMO_SEED__\s*=/.test(demoSeedQuelle)
  || !/window\.__KD_DEMO_MASTER__\s*=/.test(demoSeedQuelle)
  || /<\/script/i.test(demoSeedQuelle)) {
  console.error("ABBRUCH: Demo-Seed ist nicht sicher inline einbettbar.");
  process.exit(1);
}
html = html.replace(
  /<\/head>/,
  `<script data-kd-einzeldatei-seed>\n${demoSeedQuelle}\n</script>\n</head>`,
);
const bloecke = [];
html = html.replace(/<script type="module"[^>]*>([\s\S]*?)<\/script>\s*/g, (_, code) => { bloecke.push(code); return ""; });
if (!bloecke.length) { console.error("ABBRUCH: kein module-Script in der Vite-Ausgabe."); process.exit(1); }
html = html.replace(/<\/body>/, () => bloecke.map((c) => "<script>" + c + "</script>").join("\n") + "\n</body>");

console.log("3/3 Validierung …");
const fehler = [];
if (/<script type="module"/.test(html)) fehler.push('type="module" noch enthalten');
for (const [, code] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  if (/\bimport\s*\(/.test(code)) fehler.push("dynamisches import() im Bundle");
  if (/import\.meta/.test(code)) fehler.push("import.meta im Bundle");
  try { new Function(code); } catch (e) { fehler.push("Script parst nicht: " + e.message); }
}
for (const m of html.matchAll(/<(?:script|link)[^>]*(?:src|href)="(?!data:)[^"]*"[^>]*>/g)) fehler.push("externer Verweis: " + m[0].slice(0, 80));
for (const pfad of [
  "Programmdateien/System/demo_masterliste.js",
  "Programmdateien/System/streaming_entdecken.js",
]) {
  if (html.includes(pfad)) fehler.push("versteckte Datei-Abhängigkeit: " + pfad);
}
for (const bestandteil of [
  "data-kd-einzeldatei-seed",
  "window.__KD_DEMO_SEED__",
  "Der letzte Vorführer",
  "Sommer der Kometen",
  "Der stille Zeuge",
]) {
  if (!html.includes(bestandteil)) fehler.push("eingebetteter Offline-Bestand fehlt: " + bestandteil);
}
if (fehler.length) { console.error("ABBRUCH — Datei NICHT geschrieben:"); fehler.forEach((f) => console.error("  - " + f)); process.exit(1); }

const ziel = join(OUT, "Kinodreieck.html");
writeFileSync(ziel, html);
console.log(`✓ ${ziel} (${(html.length / 1024).toFixed(0)} KB, klassisches Script, Doppelklick-fähig).`);
