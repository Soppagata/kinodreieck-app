import { readFileSync } from "node:fs";

const lies = (pfad) => readFileSync(new URL(pfad, import.meta.url), "utf8");
const app = lies("./src/App.jsx");
const einstieg = lies("./src/components/EinstiegsGate.jsx");
const eintrag = lies("./src/components/EintragForm.jsx");
const bereichsHero = lies("./src/components/BereichsHero.jsx");
const filmkarte = lies("./src/components/FilmCard.jsx");
const filmwissen = lies("./src/components/FilmwissenBereich.jsx");
const finder = lies("./src/tabs/FinderTab.jsx");
const kino = lies("./src/tabs/KinoTab.jsx");
const mediathek = lies("./src/tabs/MediathekTab.jsx");
const streaming = lies("./src/tabs/StreamingTab.jsx");
const sessionCoordinator = lies("./src/services/sessionCoordinator.js");
const demoAccountWechsel = lies("./src/services/demoAccountWechsel.js");
const intelligenceController = lies("./src/controllers/useIntelligenceController.js");

let ok = 0;
const fehler = [];
function check(name, fn) {
  try {
    if (!fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (error) {
    fehler.push(name);
    console.error("✗ " + name + ": " + error.message);
  }
}

check("E1 Ersteinstieg delegiert die Anmeldung an den zentralen Kontowechsel", () =>
  /export function EinstiegsGate/.test(einstieg)
  && /await sessionCoordinator\.signIn\(benutzer, passwort\)/.test(einstieg)
  && /<EinstiegsGate><App \/><\/EinstiegsGate>/.test(lies("./src/main.jsx")));

check("E2 Anmeldung bereitet die Kontogrenze vor und bestätigt sie nicht im Einstieg", () => {
  return /sessionCoordinator\.signIn/.test(einstieg)
    && !/aktiviereKontoTreiber|bestaetigeKontoTreiber/.test(einstieg)
    && /storage\.prepare\(id\)/.test(sessionCoordinator)
    && /deps\.bestaetigen\(accountId\)/.test(demoAccountWechsel);
});

check("E3 laufende Prognosen werden beim Kontowechsel abgebrochen und vor dem Speichern neu geprüft", () =>
  /prognoseAbortRef\.current\?\.abort\(\)/.test(intelligenceController)
  && /const lauf = \{ accountId: startKonto, filmId: String\(film\.id\), controller \}/.test(intelligenceController)
  && /prognoseLaufRef\.current !== lauf/.test(intelligenceController)
  && /kontoIstAktuell\(startKonto\)/.test(intelligenceController)
  && /signal: controller\.signal/.test(intelligenceController)
  && /useIntelligenceController/.test(app));

check("E4 neue Einträge bewahren starke Kennungen und normalisieren sie vor dem Speichern", () =>
  /normalisiereFilmkennung/.test(eintrag)
  && /imdb_id/.test(eintrag)
  && /tmdb_id/.test(eintrag)
  && /wikidata_id/.test(eintrag)
  && /Filmkennung verknüpfen/.test(eintrag));

check("E5 Finder kann Kino- und Streamingfunde direkt mit Prognose anlegen", () =>
  (finder.match(/onAddMitPrognose=\{addFilmMitPrognose\}/g) || []).length >= 2
  && /imdb_id: t\.imdb_id, tmdb_id: t\.tmdb_id/.test(finder)
  && /film_at_id/.test(finder));

check("E6 belegtes Filmwissen bleibt eine eigene Rubrik und ist keine Bewertung", () =>
  /Belegtes Filmwissen/.test(filmwissen)
  && /keine echte Bewertung/.test(lies("./src/components/PrognoseBereich.jsx"))
  && /PrognoseBereich/.test(filmkarte)
  && /FilmwissenBereich/.test(filmkarte));

check("E7 Filmwissen ist nur am geöffneten unbewerteten Eintrag sichtbar", () =>
  /expanded && !editing && unbewertet && filmwissen/.test(filmkarte)
  && /onFilmwissenLaden/.test(kino)
  && /onFilmwissenLaden/.test(mediathek)
  && /onFilmwissenLaden/.test(streaming));

check("E8 Recherche bleibt eine einzelne bestätigte Sonnet-Ausgabe ohne Auto-Retry", () =>
  /höchstens 6 US-Cent/.test(intelligenceController)
  && /genau einen Sonnet-Aufruf/.test(intelligenceController)
  && /keine automatische Wiederholung/.test(filmwissen));

check("E8a Teil- und Entwurfsantworten bleiben sichtbar von belegtem Filmwissen getrennt", () =>
  /FILMWISSEN_STATUS\.ENTWURF/.test(filmwissen)
  && /Unverbindlicher Hinweis\/Entwurf/.test(filmwissen)
  && /nicht\s+als „belegt“ veröffentlicht/.test(filmwissen)
  && /wurde nicht als Filmwissen gespeichert/.test(filmwissen));

check("E9 Ohne-Bewertung-Schalter wird nur nach erfolgreichem Speichern zurückgesetzt", () => {
  const erfolgsGate = eintrag.indexOf("if (ergebnis === null || ergebnis === false)");
  const ruecksetzen = eintrag.indexOf("setOhneBewertung(false)", erfolgsGate);
  const fertig = eintrag.indexOf("if (onDone) onDone()", erfolgsGate);
  return erfolgsGate >= 0 && ruecksetzen > erfolgsGate && fertig > ruecksetzen;
});

check("E10 Suche-Bereich verspricht im Kicker keine KI-Deutung", () =>
  /finder:\s*\{[\s\S]*?kicker:\s*"Filme · App-Hilfe · Orientierung"/.test(bereichsHero)
  && !/finder:\s*\{[\s\S]*?kicker:[^\n]*KI-Deutung/.test(bereichsHero));

console.log(`\n${ok}/${ok + fehler.length} Etappe-8-Produktintegrations-Checks bestanden.`);
if (fehler.length) process.exit(1);
