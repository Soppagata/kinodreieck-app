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
const {
  VERALTETE_IMPORT_SNAPSHOT_KEYS, VERALTETE_PRIVACY_KEYS,
  bereinigeVeralteteImportSnapshots,
} = await import("./src/lib/personalDataRegistry.js");

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

frisch();
localStorage.setItem(K.master, "AKTIVER-PERSOENLICHER-STAND");
for (const key of VERALTETE_PRIVACY_KEYS) {
  localStorage.setItem(key, "VOLLSTAENDIGER-ALTER-KONTOBESTAND");
}
check("Normaler Upgrade-Boot entfernt sechs tote Privacy-/Secret-Keys und erhält aktive Daten", () =>
  bereinigeVeralteteImportSnapshots()
  && VERALTETE_PRIVACY_KEYS.length === 6
  && VERALTETE_PRIVACY_KEYS.every((key) => localStorage.getItem(key) === null)
  && localStorage.getItem(K.master) === "AKTIVER-PERSOENLICHER-STAND");

check("Reset-Linkprüfung unterscheidet normalen Start, ungültigen und gültigen Auftrag", () =>
  onboarding.pruefeFrischenStartUrl("?start=demo").art === "keiner"
  && onboarding.pruefeFrischenStartUrl("?fresh=zu-kurz").art === "ungueltig"
  && onboarding.pruefeFrischenStartUrl("?start=clean&fresh=abcdefgh").art === "auftrag");
location.protocol = "file:";
check("Einzeldatei gibt ihre eingebetteten Offline-Snapshots ohne DB-Schlüssel frei",
  () => onboarding.snapshotsFrei());
location.protocol = "https:";
frisch();
localStorage.setItem(K.master, JSON.stringify({ filme: [{ id: "bleibt" }] }));
location.search = "?start=clean&fresh=kurz";
check("Ungültiges fresh bleibt nicht still und löscht keine Daten", () =>
  onboarding.verbraucheFrischenStart() === null
  && /Reset-Link ist ungültig/.test(onboarding.liesFrischenStartWarnung())
  && localStorage.getItem(K.master)?.includes("bleibt"));
location.search = "";

frisch();
localStorage.setItem(K.master, JSON.stringify({ filme: [{ id: "konto-alt" }] }));
for (const key of VERALTETE_IMPORT_SNAPSHOT_KEYS) {
  localStorage.setItem(key, "VOLLSTAENDIGER-ALTER-KONTOBESTAND");
}
location.search = "?start=clean&fresh=abcdefgh";
const freshReset = await import(`./src/controllers/onboardingController.js?freshreset=${Date.now()}`);
check("Gültiger Fresh-Start entfernt auch veraltete Import-Rohsnapshots", () =>
  freshReset.verbraucheFrischenStart() === "clean"
  && localStorage.getItem(K.master) === null
  && VERALTETE_IMPORT_SNAPSHOT_KEYS.every((key) => localStorage.getItem(key) === null));
location.search = "";

class AbbrechenderStorage extends MemoryStorage {
  removeItem(key) {
    if (key === K.artikel) throw new Error("Speicher blockiert");
    super.removeItem(key);
  }
}
const normalerStorage = globalThis.localStorage;
globalThis.localStorage = new AbbrechenderStorage();
localStorage.setItem(K.master, "wird-vorher-entfernt");
localStorage.setItem(K.artikel, "bleibt-nach-fehler");
location.search = "?start=clean&fresh=abcdefgh";
const teilreset = await import(`./src/controllers/onboardingController.js?teilreset=${Date.now()}`);
check("Teilweise gescheiterter Reset behauptet keinen unveränderten Datenstand", () =>
  teilreset.verbraucheFrischenStart() === null
  && localStorage.getItem(K.master) === null
  && localStorage.getItem(K.artikel) === "bleibt-nach-fehler"
  && /nicht vollständig/.test(teilreset.liesFrischenStartWarnung())
  && /einzelne lokale Daten können bereits entfernt/.test(teilreset.liesFrischenStartWarnung())
  && !/keine Daten gelöscht/.test(teilreset.liesFrischenStartWarnung()));
globalThis.localStorage = normalerStorage;
location.search = "";

const gate = readFileSync(new URL("./src/components/EinstiegsGate.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("./src/components/AppNavigation.jsx", import.meta.url), "utf8");
const globalSuche = readFileSync(new URL("./src/components/GlobalSearchBar.jsx", import.meta.url), "utf8");
const daten = readFileSync(new URL("./src/tabs/DatenTab.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./src/index.css", import.meta.url), "utf8");
const konto = readFileSync(new URL("./src/components/KontoBereich.jsx", import.meta.url), "utf8");
const main = readFileSync(new URL("./src/main.jsx", import.meta.url), "utf8");

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
check("Boot bereinigt veraltete Rohsnapshots vor der Sitzungsausrichtung", () =>
  /bereinigeVeralteteImportSnapshots\(\)[\s\S]+sessionCoordinator\.initialize\(\)/.test(main));
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
check("Riskante Datei- und Wartungswerkzeuge bleiben mobil verborgen, Backup-Download nicht", () =>
  /className="kd-nur-desktop">\s*<Klappe titel="Masterliste"/.test(daten)
  && !/className="kd-nur-desktop">\s*<Klappe titel="Gesamt-Backup"/.test(daten)
  && /className="kd-nur-desktop"[^>]*><RestoreImport ohneKopf/.test(daten)
  && /className="kd-nur-desktop" data-tour="erweitert"/.test(daten));
check("Der alte Seitengriff und die Bedienhand-Spiegelung bleiben entfernt", () =>
  !/Bedienhand|linkshaender/.test(daten) && !/kd-links/.test(css)
  && !/kd-navband/.test(css) && /kd-globalsuche-menu/.test(css) && !/NavBand/.test(app));
check("App registriert keine automatischen Tour-, Scroll- oder IntersectionObserver-Dialoge", () =>
  !/onTour|SICHTBAR_TRIGGER|IntersectionObserver|TourOverlay/.test(app));

if (!process.exitCode) console.log(`einstieg_test: ${ok} Checks bestanden.`);
