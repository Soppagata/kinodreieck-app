# Etappe 8, Block 1: Vorbewertung

Stand: 29.07.2026

Branch: `feat/etappe-8-vorbewertung`

Produktvertrag: `docs/STECKBRIEF_VORBEWERTUNG.md`

Status: technisch implementiert; Backend, echte Anbieterprobe und
Staging-Deploy abgenommen. Manuelle Konto-Oberflächenabnahme offen.

## Ausgangslage zum Baubeginn

Etappe 7 ist auf Produktion abgenommen. Die Vorbewertung beginnt deshalb auf
dem Merge-Commit `db8199c16a8f6121468ada831ec0f1546fb54986`.

Im damaligen Code gab es noch keinen Prognosepfad und kein Prognosefeld. Die
benötigten Grenzen waren aber vorhanden:

- `src/services/ai.js` ist die einzige KI-Fassade der Oberfläche.
- `supabase/functions/ai-task/index.ts` enthält Schema, Prompt,
  Ergebnisprüfung, Kostenreservierung und Protokollabschluss je Aufgabe.
- `kd:master` wird über `kd_personal` kontogebunden synchronisiert.
- `kd:geschmacksprofil` liefert ausschließlich bestätigte Profilsignale und
  eine kurze Profilversion.
- `src/lib/profil.js` reserviert `prognose` bereits als mögliche
  Signalherkunft, nutzt sie aber noch nicht.
- Der lokale KI-Schalter blendet Kern-KI-Funktionen bei KI=aus vollständig
  aus.

Eine neue Prognosetabelle ist für den MVP nicht nötig. Ein eigenes,
streng geprüftes Feld am Filmeintrag bleibt technisch von `bewertung`
getrennt, reist automatisch mit Master-Export, Backup und Account-Sync und
benötigt keine zusätzliche RLS-Fläche.

## Festgezurrter MVP-Vertrag

### Auslöser und Sichtbarkeit

- Aufgabe: `film-forecast`.
- Genau ein On-demand-Knopf an einem unbewerteten Film sowie die direkte
  Aktion „Anlegen & KI-Prognose erstellen“ im Formular für neue Einträge.
- Der neue Eintrag wird zuerst als unbewertet persistiert. Schlägt das
  Speichern fehl, beginnt kein bezahlter Aufruf; schlägt nur die KI fehl,
  bleibt der Eintrag erhalten und bietet Wiederholen an.
- Kein Import-Batch, keine Hintergrundberechnung, kein automatischer Retry.
- Bei KI=aus existiert der Knopf nicht.
- Ohne Konto ist kein bezahlter Aufruf möglich.
- Ein laufender Auftrag sperrt den Knopf gegen Doppelklicks.
- Vor dem Klick steht sichtbar, dass genau ein kostenpflichtiger
  Sonnet-Aufruf ausgelöst wird. Nachher werden die tatsächlich gemessenen
  Kosten angezeigt.

### Erlaubte Eingabedaten

An den Anbieter gehen nur:

- Titel, Originaltitel, Jahr, Typ, Genres und Tags des gewählten Films,
- die Version des bestätigten Profils,
- bestätigte Profilsignale in kompakter Form mit neutralen IDs,
- bestätigte Profilachsen.

Nicht übertragen werden:

- Notizen,
- Blogtexte,
- gespeicherte Begründungen,
- die ursprünglichen persönlichen Textbelege der Profilsignale,
- andere Filme der Mediathek,
- echte Bewertungen und Titel anderer Filme,
- Konto-ID oder Sitzungsdaten im Payload.

Die Signal-IDs werden serverseitig vergeben beziehungsweise normalisiert.
Das Modell gibt nur verwendete IDs zurück; freier Modelltext darf keine
angeblich verwendeten Signale erfinden.

### Ausgabeformat

Das an die App ausgelieferte Prognoseergebnis besitzt genau diese fachlichen
Teile:

```json
{
  "format": "film-prognose-v1",
  "achsen": {
    "wie": 0,
    "was": 0,
    "warum": 0
  },
  "passung": 0,
  "kategorie_vorschlag": "sehenswert",
  "sicherheit": "niedrig",
  "begruendung": "Kurze Begründung.",
  "verwendete_signal_ids": ["S1", "S3"]
}
```

Der geschlossene Anbieter-Vertrag fordert alle drei Achsen. WARUM bleibt
kulturelle Relevanz, darf in der Freundeskreis-Beta aber ausdrücklich als
persönliche Sonnet-Schätzung aus Filmkontext und Geschmacksprofil entstehen.
Der Wert ist keine belegte gemeinsame Einordnung und keine echte Bewertung;
bei zu dünner Grundlage liefert das Modell `null`. Für den optionalen
Kategorie-Vorschlag verwendet der Anbieter intern den reinen String
`kein_vorschlag`; ausschließlich der Server bildet diesen Wert auf das
öffentliche `null` ab. Der interne Platzhalter ist keine achte Kategorie und
verlässt den Server nicht.

Grenzen:

- `wie`, `was` und `warum`: ganze Zahl 0 bis 5 oder `null`.
- `passung`: ganze Zahl 0 bis 100.
- `kategorie_vorschlag`: ausschließlich `immer_gut`, `kult`,
  `kult_klassiker`, `daemlich_aber_herrlich`, `trash`, `sehenswert`,
  `echter_schrott` oder `null`.
- `sicherheit`: `sehr_niedrig`, `niedrig`, `mittel`, `hoch`.
- `begruendung`: kurze, bereinigte Anzeigezeichenkette; keine Quellenbehauptung.
- `verwendete_signal_ids`: nur IDs, die im Auftrag vorhanden waren.

### WARUM und Kategorie

Der MVP zeigt keine numerische WARUM-Prognose und keinen freien
WARUM-Modelltext. Die Oberfläche erklärt stattdessen mit festem App-Text:

> WARUM kann ohne gemeinsamen Filmwissens-Cache noch nicht belegt werden.

Der Kategorie-Vorschlag bleibt Bestandteil der vollen Rubrik, trägt aber
sichtbar den Status „noch unbelegt“. Er wird weder als echte Kategorie
gespeichert noch für Filter oder Ranking benutzt, solange der Nutzer ihn
nicht im Korrekturablauf als echte Angabe übernimmt.

Die sieben Kategorien stammen aus dem zentralen Vertrag
`src/lib/kategorien.js`; Formulare, Finder und Modellprüfung verwenden
dieselbe Menge.

### Profil-Mindestmenge

- Kein bestätigtes Signal: kein Anbieteraufruf. Die Oberfläche verweist auf
  das Geschmacksprofil.
- Ein oder zwei bestätigte Signale: Aufruf ist nach sichtbarem Warnhinweis
  möglich; die serverseitige Prüfung begrenzt die Sicherheit auf
  `sehr_niedrig`.
- Drei oder vier Signale: höchstens `niedrig`.
- Ab fünf Signalen aus mindestens zwei Signalarten darf das Modell
  `mittel` oder `hoch` vorschlagen.
- Eine hohe Modellsicherheit wird zusätzlich heruntergestuft, wenn WIE, WAS
  oder WARUM `null` bleibt.

Damit wird ein junges Profil nicht als präzise verkauft, aber ein bewusst
gewünschter Einzelaufruf auch nicht künstlich blockiert.

### Speicherung und Statusfluss

Die Prognose liegt separat als `film.prognose`, nie in `film.bewertung`:

```json
{
  "format": "film-prognose-v1",
  "erstellt": "ISO-8601",
  "promptVersion": "v2",
  "profilVersion": "p3",
  "modell": "claude-sonnet-5",
  "verbrauch": {
    "kostenUsdCent": 0
  },
  "ergebnis": {},
  "status": "offen",
  "geaendert": "ISO-8601"
}
```

Erlaubte Statusübergänge:

1. neuer Erfolg → `offen`,
2. `offen` → `angenommen`,
3. `offen` oder `angenommen` → `korrigiert`,
4. `offen` oder `angenommen` → `verworfen`.

`angenommen` macht aus der Prognose keine echte Bewertung.

`korrigiert` öffnet den bestehenden Bewertungseditor; die dort bewusst
gespeicherten Werte landen ausschließlich in `film.bewertung`. Die
ursprüngliche Prognose bleibt daneben mit Status `korrigiert` sichtbar.
`verworfen` löscht sie nicht still, sondern hält die Nutzerentscheidung fest.

Ändert sich das Profil später, wird die Prognose als „mit älterem Profil
erstellt“ markiert. Es gibt keine automatische Neuberechnung. Ein neuer
On-demand-Aufruf ersetzt die offene Prognose erst nach ausdrücklicher
Bestätigung.

### Rückfluss ins Profil

Im ersten MVP verändert weder Annehmen noch Verwerfen das Geschmacksprofil
automatisch. Auch die Differenz zwischen Prognose und echter Bewertung ist
für sich noch kein eindeutiges Geschmackssignal.

Ein späterer Ausbau darf aus einer Korrektur nur dann ein Signal mit Quelle
`prognose` bilden, wenn die Person ausdrücklich auswählt, *was* falsch lag
und die Vorschau des Profilupdates bestätigt. Die bereits reservierte Quelle
bleibt bis dahin ungenutzt. Das verhindert, dass die KI ihre eigenen
Fehler indirekt als neues Nutzerprofil einschreibt.

### Modell und Kosten

- Modellalias: `gross` (der bestehende Sonnet-Alias).
- Antwortbudget: zunächst 2048 Tokens; das strikte Schema und die kurzen
  Textgrenzen müssen darunter mit deutlicher Reserve passen.
- Promptversion: `v1`.
- Profilversion wird in `kd_ai_log` mitgeführt.
- Der serverseitige Budget-, Tages- und Parallelwächter bleibt unverändert
  vorgeschaltet.
- Echte Rauchproben und Evals laufen ausschließlich seriell über die
  budgetgeschützten npm-Befehle aus `AGENTS.md`.

## Bauabschnitte

### 0. Querschnittsverträge reparieren

Der Audit vom 29.07.2026 hat vier bestehende Widersprüche gefunden, die vor
dem neuen kostenpflichtigen Pfad geschlossen werden:

- Der Browser bricht KI-Aufträge noch nach 45 Sekunden ab, obwohl Function
  und Parallelreservierung seit Etappe 7 bewusst 120 Sekunden tragen.
- Der React-State des KI-Schalters übernimmt beim Schreiben einen Stand auch
  dann, wenn der gerätelokale Speicher ihn nicht sichern konnte; die
  kostenpflichtigen Gates müssen auch in diesem Fehlerfall geschlossen
  bleiben.
- Der alte KI-Ingestion-Prompt schreibt geschätzte Werte in `bewertung` und
  verliert das Merkmal `geschaetzt` bei der Übernahme. Neue Schätzungen dürfen
  nicht länger als echte Bewertungen ankommen.
- Finder und Formulare verwendeten unterschiedliche Kategorien. Der
  zentrale Vertrag führt jetzt die sieben tatsächlichen Werte und verhindert,
  dass Modelloutput, Filter und Korrekturfluss erneut auseinanderlaufen.

Zusätzlich wird die vorhandene Autorenzuschreibung bis zum Bewertungseditor
durchgereicht, damit eine Korrektur nicht still `"max"` einträgt.

### 1. Reines Prognosemodell

- `src/lib/prognose.js` mit strikter Prüfung,
  Sicherheits-Herabstufung und Statusübergängen.
- Fremde oder alte Prognosefelder beim Lesen quarantänisieren statt
  ungeprüft anzuzeigen.
- Unit-Tests für 0..5, Kategorien, Signal-IDs, Versionen und Übergänge.

### 2. Geschützte Serveraufgabe

- `film-forecast` in Client und Edge Function registrieren.
- Striktes Structured-Output-Schema.
- Eingabe vor Reservierung prüfen und auf Minimaldaten begrenzen.
- Ergebnis serverseitig fachlich prüfen, Text bereinigen, Signal-IDs
  nachschlagen und Sicherheit deterministisch deckeln.
- Konfigurationsmigration für Sonnet und 2048 Tokens.
- Function-Tests für Schemaangriffe, unbekannte Kategorien,
  erfundene Signal-IDs, Überpräzision und jeden Abschluss-/Fehlerpfad.

### 3. KI-Schalter und Oberfläche

- Funktion `vorbewertung` im lokalen KI-Schalter.
- On-demand-Bereich an unbewerteten Filmkarten.
- Kostenhinweis, Ladezustand, verständliche Grenzfehler.
- Volle Rubrik mit klarer Trennung von Prognose und Bewertung.
- Statusaktionen Annehmen, Korrigieren, Verwerfen.
- Bei KI=aus keinerlei Knopf und keinerlei leerer Platzhalter.

### 4. Persistenz und Datenschutz

- Prognose ausschließlich unter `film.prognose`.
- Master-Export, Backup, Restore und Account-Sync auf Erhalt und
  Größenverträglichkeit prüfen.
- Frischer Start und Profilwiderruf verändern echte Bewertungen nicht.
- Profilwiderruf löscht nicht automatisch historische Prognosen; sie werden
  als mit gelöschtem Profil erstellt gekennzeichnet und können einzeln
  verworfen oder gelöscht werden.

### 5. Abnahme

- kompletter Mock-Testbestand,
- Function-Tests,
- Produktionsbuild,
- Staging-Deploy,
- genau eine budgetgeschützte echte Vorbewertung,
- anschließende Kostenmessung und RLS-Gegenprüfung,
- adversarialer Review gegen Vermischung von Prognose, WARUM und echter
  Bewertung.

## Technischer Abnahmestand vom 29.07.2026

- App-Gesamtsuite vor dem Backend-Deploy vollständig grün; Produktionsbuild
  nach dem finalen Schemafix erneut grün.
- Gemockte Edge-Function-Suite nach dem finalen Schemafix: 262/262 grün.
- Migration `20260729210000_etappe8_film_forecast.sql` einzeln und erfolgreich
  auf Projekt `bscjgwcntapobyxsiyce` ausgeführt.
- Edge Function `ai-task` mit dem finalen Providervertrag erfolgreich
  deployed.
- Budgetgeschützte echte Rauchprobe über `npm run test:ai:live`: 17/17 grün.
  P16 belegt, dass ein leeres Profil vor dem Anbieteraufruf endet; P17 belegt
  einen echten Sonnet-Prognoseerfolg mit getrenntem WARUM-`null`,
  aufgelösten Profilsignalen, echter Modell-ID und gemessenen Kosten.
- Budgetstand nach der Abnahme: 60,8296 von 500,0000 US-Cent im
  Testkonto-Monat; der finale Lauf verbrauchte 2,4331 US-Cent.
- RLS-Negativtests nach Migration und Function-Deploy: 36/36 grün;
  Account-Isolation und Sperre der KI-Tabellen für Konten bleiben intakt.
- Die technische P17-Probe verwendet ausschließlich eine flüchtige
  Testanforderung. Sie erzeugt keinen erfundenen Demofilm und schreibt keinen
  Filmeintrag in Demo- oder Kontodaten.
- Staging-Workflow `30484827013` aus Commit `8662fe3`: vollständige CI,
  Function-Suite, Cloudflare-Deploy und beide Remote-Smokechecks erfolgreich;
  Produktionsjob erwartungsgemäß übersprungen. Die Staging-App lädt, der
  Neuer-Eintrag-Dialog wurde ohne Speicherung geprüft und wieder geschlossen.
  Die bewusste Oberflächenabnahme mit Max' Konto und einem von Max gewählten
  unbewerteten Titel bleibt der letzte Schritt vor Merge beziehungsweise
  Produktionsfreigabe.

## Demo- und Konto-Vertrag

Klarstellung von Max am 29.07.2026: Der Demo-Modus zeigt Max’ veröffentlichte
Einträge zusammen mit datierten Kino- und Streaming-Schnappschüssen. Es wird
kein zusätzlicher oder erfundener „Demofilm“ angelegt.

Der Audit des öffentlichen Produktionsstands zeigt:

- Die Demo-Mediathek enthält 120 bereinigte Einträge von Max.
- Alle 120 Einträge sind bewertet; es gibt dort derzeit keinen unbewerteten
  Kandidaten und keine Prognose.
- Die öffentlichen Katalogzeilen `programm_demo` und `streaming_demo` fehlen
  derzeit; sichtbar ist nur `manifest`.
- Die bestehende App wählt den Katalog allein nach Anmeldung
  (Gast = Demo-Schnappschuss, Konto = live), nicht nach der gewählten
  Startart.

Festlegung: Nach einer Anmeldung ist der aktuelle Kontostand vollständig
maßgeblich — Kino, Streaming, Einträge, Blog, Vokabular und alle weiteren
Kontotöpfe. Fehlende Kontotöpfe werden leer dargestellt und nicht mit
lokalen Demo-Inhalten aufgefüllt. Ein Rückholpunkt wird vor dem Wechsel
gesichert.

Auch im anonymen Demo-Modus darf ein neuer unbewerteter Eintrag angelegt
werden. Der echte Prognoseaufruf verlangt jedoch ein Konto; nach der
Anmeldung und dem Kontowechsel kann er für den angelegten beziehungsweise
erneut angelegten Eintrag ausgelöst werden. Es gibt keine eingefrorene,
erfundene Beispiel-Prognose.

## Kosten- und Quellenentscheidung

Der Vorbewertungs-MVP arbeitet ohne Websuche. Domainfilter bei Anthropic
beschränken die aufrufbaren Seiten, senken aber nicht den festen Preis je
tatsächlich ausgeführter Suche. IMDb, Rotten Tomatoes und film.at werden
ohne belastbare Lizenz beziehungsweise API-Erlaubnis nicht automatisiert
abgefragt. Der spätere Filmwissens-Cache ist ein eigener Block.
