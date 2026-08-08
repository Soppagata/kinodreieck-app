import { readFileSync } from "node:fs";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.location = { search: "", hash: "", protocol: "https:" };

const onboarding = await import("./src/controllers/onboardingController.js");
const { K } = await import("./src/services/storage.js");

let ok = 0;
function check(name, fn) {
  try { if (!fn()) throw new Error("falsch"); console.log("✓ " + name); ok++; }
  catch (error) { console.error("✗ " + name + ": " + error.message); process.exitCode = 1; }
}
function frisch() { localStorage.clear(); location.search = ""; location.hash = ""; }

frisch();
check("Ein vollständig neuer Gast sieht den Einstieg", () => onboarding.einstiegNoetig({ mode: "guest" }));
onboarding.schliesseEinstieg("gast");
check("Ein abgeschlossener Gastweg bleibt abgeschlossen", () => !onboarding.einstiegNoetig({ mode: "guest" }) && onboarding.liesEinstieg().weg === "gast");

frisch();
localStorage.setItem(K.start, "clean");
localStorage.setItem(K.startVersion, onboarding.START_WAHL_VERSION);
check("Eine bestätigte alte Startwahl wird ohne Unterbrechung migriert", () => !onboarding.einstiegNoetig({ mode: "guest" }) && onboarding.liesEinstieg().abgeschlossen);

frisch();
localStorage.setItem(K.master, JSON.stringify({ filme: [{ id: "einer" }] }));
check("Persönliche lokale Daten werden niemals durch einen neuen Einstieg übergangen", () => !onboarding.einstiegNoetig({ mode: "guest" }));
onboarding.fordereEinstiegNachAbmeldung();
check("Bewusstes Abmelden fordert den Zugang erneut, ohne Daten zu löschen", () => onboarding.einstiegNoetig({ mode: "guest" }) && localStorage.getItem(K.master)?.includes("einer"));
check("Ein vorhandenes Konto überspringt auch einen unterbrochenen Abmelde-Einstieg", () => !onboarding.einstiegNoetig({ mode: "account", account: { id: "konto" } }) && onboarding.liesEinstieg().weg === "konto");

const gate = readFileSync(new URL("./src/components/EinstiegsGate.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("./src/components/AppNavigation.jsx", import.meta.url), "utf8");
const globalSuche = readFileSync(new URL("./src/components/GlobalSearchBar.jsx", import.meta.url), "utf8");
const daten = readFileSync(new URL("./src/tabs/DatenTab.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./src/index.css", import.meta.url), "utf8");
const konto = readFileSync(new URL("./src/components/KontoBereich.jsx", import.meta.url), "utf8");

check("Erste Seite vereint Login, Gastweg, Installation und Einzeldatei", () =>
  /Anmelden/.test(gate) && /Ohne Konto fortfahren/.test(gate) && /InstallationCard/.test(gate) && /Einzeldatei/.test(readFileSync(new URL("./src/components/InstallationCard.jsx", import.meta.url), "utf8")));
check("Startwahl und zwei kurze Erklärschritte liegen im neuen Gate", () =>
  /Demo ansehen/.test(gate) && /Leer starten/.test(gate) && /Drei Wege zu deinem Film/.test(gate) && /Du entscheidest über KI/.test(gate));
check("Die KI-Wahl enthält kein zweites Loginformular", () => {
  const kiSeite = gate.slice(gate.indexOf('titel="Du entscheidest über KI"'), gate.indexOf("function EntryPage"));
  return kiSeite.length > 0 && !/kd-entry-login|Benutzername|Passwort/.test(kiSeite);
});
check("Loginfehler bleiben im Einstieg sichtbar und schließen ihn nicht", () => /catch \(err\)[\s\S]+setFehler\(errorText\(err\)\)/.test(gate) && /role="alert"/.test(gate));
check("Abmelden räumt zuerst den Kontokontext und öffnet danach den Einstieg", () => /sessionCoordinator\.signOut\(\)[\s\S]+fordereEinstiegNachAbmeldung\(\)/.test(konto));
check("Abmelden lädt den wiederhergestellten Gaststand unmittelbar neu", () => /async function abmelden[\s\S]+onDatenGeaendert\?\.\(\)/.test(konto));
check("Einstieg und Einstellungen laden eindeutige Kontostände automatisch", () =>
  /kontoSicherAutomatischLaden/.test(gate) && /kontoSicherAutomatischLaden/.test(konto) && /onDatenGeaendert/.test(konto));
check("Desktop-Suche ist ein eigener Bereich, mobil bleibt die globale Leiste ohne redundanten Menüpunkt", () =>
  /kd-globalsuche-menu/.test(globalSuche) && /id: "finder"[\s\S]*desktopOnly: true/.test(nav)
  && /NAVIGATION\.filter\(\(eintrag\) => !eintrag\.desktopOnly\)\.map/.test(nav)
  && /role="dialog"/.test(nav) && /In diesem Bereich nach oben/.test(nav)
  && !/kd-navband|MOBILE_NAVIGATION|kd-tabbar/.test(nav));
check("Bereiche merken ihre eigene Scrolltiefe und starten beim ersten Besuch oben", () =>
  /scrollProBereichRef/.test(app) && /aktuelleScrolltiefe/.test(app)
  && /scrollProBereichRef\.current\.get\(id\) \?\? 0/.test(app)
  && /onNachOben=\{nachObenAusMenu\}/.test(app));
check("Datei- und Wartungswerkzeuge bleiben in den mobilen Einstellungen verborgen", () =>
  /className="kd-nur-desktop">\s*<Klappe titel="Masterliste"/.test(daten)
  && /className="kd-nur-desktop">\s*<Klappe titel="Gesamt-Backup"/.test(daten)
  && /className="kd-nur-desktop" data-tour="erweitert"/.test(daten));
check("Der alte Seitengriff und die Bedienhand-Spiegelung bleiben entfernt", () =>
  !/Bedienhand|linkshaender/.test(daten) && !/kd-links/.test(css)
  && !/kd-navband/.test(css) && /kd-globalsuche-menu/.test(css) && !/NavBand/.test(app));
check("App registriert keine automatischen Tour-, Scroll- oder IntersectionObserver-Dialoge", () =>
  !/onTour|SICHTBAR_TRIGGER|IntersectionObserver|TourOverlay/.test(app));

if (!process.exitCode) console.log(`einstieg_test: ${ok} Checks bestanden.`);
