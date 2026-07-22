/* Die frühere Beta/Personal-Gabel existiert nicht mehr. Dieser Test hält die
   neue Tutorial- und Modus-Semantik als schnelle Quellcode-Regression fest. */
import { baueHinweis, hinweisIds, SICHTBAR_TRIGGER } from "./src/lib/tour.js";
import { PERSONAL_MODE, EGGS_ENABLED } from "./src/lib/modus.js";

const checks = [];
const check = (name, ok) => { checks.push([name, !!ok]); console.log((ok ? "✓ " : "✗ ") + name); };
const erweitert = baueHinweis("erweitert");
const streaming = baueHinweis("streaming-quellen");

check("einheitlicher Testermodus aktiv", PERSONAL_MODE === false);
check("Eastereggs in der Tester-PWA grundsätzlich aktiv", EGGS_ENABLED === true);
check("alter Teilen-Hinweis entfernt", !hinweisIds().includes("teilen") && !Object.values(SICHTBAR_TRIGGER).includes("teilen"));
check("Erweitert-Hinweis erklärt Refresh und Masterlisten-Import", /manuell|neu laden/i.test(erweitert?.absaetze?.[0]?.text || "") && /Masterliste/.test(erweitert?.absaetze?.[0]?.text || ""));
check("Erweitert feuert als Sichtbar-Anker", SICHTBAR_TRIGGER.erweitert === "erweitert");
check("Streaming-Hinweis enthält keinen Config-Export", !/Config|export/i.test(streaming?.absaetze?.[0]?.text || ""));

const fehler = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - fehler.length}/${checks.length} Checks bestanden.`);
process.exit(fehler.length ? 1 : 0);
