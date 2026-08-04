/* Die frühere Beta/Personal-Gabel existiert nicht mehr. Dieser Test hält die
   neue Modus-Semantik als schnelle Quellcode-Regression fest.
   Entscheid Max 03.08.2026 (Tour entfernt, Hilfe gestärkt): Die früheren
   Checks auf die Tour-DEF-Texte aus src/lib/tour.js (baueHinweis/hinweisIds/
   SICHTBAR_TRIGGER: teilen-Hinweis, Erweitert-/Streaming-Hinweistexte,
   Sichtbar-Anker) sind mit dem Tour-Subsystem entfernt worden — die Texte
   erreichten seit dem Vollseiten-Einstieg keinen Nutzer mehr. Der
   PERSONAL_MODE/EGGS-Teil bleibt unverändert bestehen. */
import { PERSONAL_MODE, EGGS_ENABLED } from "./src/lib/modus.js";

const checks = [];
const check = (name, ok) => { checks.push([name, !!ok]); console.log((ok ? "✓ " : "✗ ") + name); };

check("einheitlicher Testermodus aktiv", PERSONAL_MODE === false);
check("Eastereggs in der Tester-PWA grundsätzlich aktiv", EGGS_ENABLED === true);

const fehler = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - fehler.length}/${checks.length} Checks bestanden.`);
process.exit(fehler.length ? 1 : 0);
