/* Letzte UI-Fehlergrenze: statischer Architekturvertrag ohne Netzwerk-
   Telemetrie, Rohfehler oder persönliche Fehlermeldungen. */

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
  /<AppErrorBoundary[\s\S]*ownerDiagnosticsConfirmed=[\s\S]*>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/.test(main));
check("Renderfehler zeigen Neuladen und Notfall-Backup",
  /Sicherheitskopie dieses Geräts versuchen/.test(boundary)
  && /wurde als Download ausgelöst/.test(boundary)
  && !/wurde heruntergeladen/.test(boundary)
  && /App neu laden/.test(boundary)
  && /baueBackup\(\{ pull: false \}\)/.test(boundary));
check("Die Oberfläche zeigt nur eine technische ID, nie den Fehlertext",
  /Technische Fehler-ID/.test(boundary)
  && !/\b(?:error|fehler)\.(?:message|stack)\b/i.test(boundary));
check("Die Fehlergrenze eröffnet keinen Netzwerk- oder Telemetriepfad",
  !/\bfetch\s*\(|sendBeacon|XMLHttpRequest/.test(boundary));
check("Die Fehlergrenze meldet ausschließlich feste Allowlist-Technikfelder",
  boundary.includes('code: "UI_RENDER_CRASH"')
  && boundary.includes('source: "APP_ERROR_BOUNDARY"')
  && boundary.includes('operation: "RENDER"')
  && boundary.includes("reference: this.state.fehlerId")
  && /componentDidCatch\(\)/.test(boundary));
check("Der Recorder wird mit dem bestehenden serverbestätigten Ownerguard verbunden",
  /ownerDiagnosticsConfirmed=\{hatBestaetigteOwnerRolle\(sessionCoordinator\.getSnapshot\(\)\)\}/.test(main));
check("Abgelaufene lokale Diagnoseeinträge werden bereits beim Boot verworfen",
  /purgeLocalDiagnostics\(\)/.test(main));

console.log(`errorboundary_test: ${ok} Checks bestanden.`);
