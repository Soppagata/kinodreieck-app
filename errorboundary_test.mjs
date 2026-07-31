/* Letzte UI-Fehlergrenze: statischer Architekturvertrag ohne Renderfehler-
   Telemetrie oder persönliche Fehlermeldungen. */

import fs from "node:fs";

const main = fs.readFileSync("src/main.jsx", "utf8");
const boundary = fs.readFileSync(
  "src/components/AppErrorBoundary.jsx",
  "utf8",
);
let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

check("Die Fehlergrenze umschließt die gesamte App",
  /<AppErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/.test(main));
check("Renderfehler zeigen Neuladen und Notfall-Backup",
  /Gesamt-Backup versuchen/.test(boundary)
  && /App neu laden/.test(boundary)
  && /baueBackup\(\{ pull: false \}\)/.test(boundary));
check("Die Oberfläche zeigt nur eine technische ID, nie den Fehlertext",
  /Technische Fehler-ID/.test(boundary)
  && !/\b(?:error|fehler)\.(?:message|stack)\b/i.test(boundary));
check("Die Fehlergrenze eröffnet keinen Netzwerk- oder Telemetriepfad",
  !/\bfetch\s*\(|sendBeacon|XMLHttpRequest/.test(boundary));

console.log(`errorboundary_test: ${ok} Checks bestanden.`);
