import { readFileSync } from "node:fs";

const lies = (pfad) => readFileSync(new URL(pfad, import.meta.url), "utf8");
const app = lies("./src/App.jsx");
const willkommen = lies("./src/components/Willkommen.jsx");
const eintrag = lies("./src/components/EintragForm.jsx");
const filmkarte = lies("./src/components/FilmCard.jsx");
const filmwissen = lies("./src/components/FilmwissenBereich.jsx");
const finder = lies("./src/tabs/FinderTab.jsx");
const kino = lies("./src/tabs/KinoTab.jsx");
const mediathek = lies("./src/tabs/MediathekTab.jsx");
const streaming = lies("./src/tabs/StreamingTab.jsx");

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

check("E1 Willkommen delegiert die Anmeldung an den zentralen Kontowechsel", () =>
  /export function Willkommen\(\{[\s\S]+?onAnmelden = \(benutzer, passwort\) => authService\.signIn/.test(willkommen)
  && /await onAnmelden\(benutzer, passwort\)/.test(willkommen)
  && /onAnmelden=\{anmeldenAusWillkommen\}/.test(app));

check("E2 Demo-Anmeldung aktiviert den Kontotreiber und ersetzt Demo durch den aktuellen DB-Stand", () => {
  const handler = app.match(/const anmeldenAusWillkommen = useCallback\(async[\s\S]+?\n  \}, \[demoAktiv\]\);/)?.[0] ?? "";
  return /authService\.signIn/.test(handler)
    && /aktiviereKontoTreiber\(kontoId\)/.test(handler)
    && /if \(demoAktiv\)[\s\S]+ladeKontostandNachDemo/.test(handler)
    && /location\.reload\(\)/.test(handler);
});

check("E3 laufende Prognosen werden beim Kontowechsel abgebrochen und vor dem Speichern neu geprüft", () =>
  /prognoseAbortRef\.current\?\.abort\(\)/.test(app)
  && /const lauf = \{ accountId: startKonto, filmId: String\(film\.id\), controller \}/.test(app)
  && /prognoseLaufRef\.current !== lauf/.test(app)
  && /kontoIstAktuell\(startKonto\)/.test(app)
  && /signal: controller\.signal/.test(app));

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
  /höchstens 5 US-Cent/.test(app)
  && /genau einen Sonnet-Aufruf/.test(app)
  && /keine automatische Wiederholung/.test(filmwissen));

console.log(`\n${ok}/${ok + fehler.length} Etappe-8-Produktintegrations-Checks bestanden.`);
if (fehler.length) process.exit(1);
