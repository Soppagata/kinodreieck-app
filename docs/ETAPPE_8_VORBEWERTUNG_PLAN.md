# Etappe 8, Block 1: Vorbewertung

Stand: 29.07.2026

Branch: `feat/etappe-8-vorbewertung`

Produktvertrag: `docs/STECKBRIEF_VORBEWERTUNG.md`

## Ausgangslage

Etappe 7 ist auf Produktion abgenommen. Die Vorbewertung beginnt deshalb auf
dem Merge-Commit `db8199c16a8f6121468ada831ec0f1546fb54986`.

Im aktuellen Code gibt es noch keinen Prognosepfad und kein Prognosefeld. Die
benötigten Grenzen sind aber vorhanden:

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
- Genau ein On-demand-Knopf an einem unbewerteten Film.
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
- bestätigte Profilachsen und bestätigte Filmrichtungen.

Nicht übertragen werden:

- Notizen,
- Blogtexte,
- gespeicherte Begründungen,
- die ursprünglichen persönlichen Textbelege der Profilsignale,
- andere Filme der Mediathek,
- echte Bewertungen anderer Titel,
- Konto-ID oder Sitzungsdaten im Payload.

Die Signal-IDs werden serverseitig vergeben beziehungsweise normalisiert.
Das Modell gibt nur verwendete IDs zurück; freier Modelltext darf keine
angeblich verwendeten Signale erfinden.

### Ausgabeformat

Die Modellantwort besitzt genau diese fachlichen Teile:

```json
{
  "format": "film-prognose-v1",
  "achsen": {
    "wie": 0,
    "was": 0,
    "warum": null
  },
  "passung": 0,
  "kategorie_vorschlag": "wahrscheinlich_passend",
  "sicherheit": "niedrig",
  "begruendung": "Kurze Begründung.",
  "verwendete_signal_ids": ["S1", "S3"]
}
```

Grenzen:

- `wie` und `was`: ganze Zahl 0 bis 5 oder `null`.
- `warum`: im MVP immer `null`.
- `passung`: ganze Zahl 0 bis 100.
- `kategorie_vorschlag`: ausschließlich
  `sicher_gut`, `wahrscheinlich_passend`, `referenz`, `zu_pruefen`
  oder `null`.
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

Die vier Kategorien stammen aus der aktuellen Masterliste und
`finder_vokabular.json`. Ältere Demo-/Legacy-Werte wie `sehenswert`,
`kult` oder `immer_gut` sind keine erlaubten Modellausgaben.

### Profil-Mindestmenge

- Kein bestätigtes Signal: kein Anbieteraufruf. Die Oberfläche verweist auf
  das Geschmacksprofil.
- Ein oder zwei bestätigte Signale: Aufruf ist nach sichtbarem Warnhinweis
  möglich; die serverseitige Prüfung begrenzt die Sicherheit auf
  `sehr_niedrig`.
- Drei oder vier Signale: höchstens `niedrig`.
- Ab fünf Signalen aus mindestens zwei Signalarten darf das Modell
  `mittel` oder `hoch` vorschlagen.
- Eine hohe Modellsicherheit wird zusätzlich heruntergestuft, wenn WIE oder
  WAS `null` bleibt.

Damit wird ein junges Profil nicht als präzise verkauft, aber ein bewusst
gewünschter Einzelaufruf auch nicht künstlich blockiert.

### Speicherung und Statusfluss

Die Prognose liegt separat als `film.prognose`, nie in `film.bewertung`:

```json
{
  "format": "film-prognose-v1",
  "erstellt": "ISO-8601",
  "promptVersion": "v1",
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

## Noch von Max benötigte Demo-Entscheidung

Für das eingefrorene Demo-Beispiel wird später genau ein Beispiel-Film samt
gewünschter Beispiel-Prognose benötigt. Das blockiert Datenvertrag,
Serveraufgabe und echte Kontooberfläche nicht; es blockiert nur die
abschließende Demo-Abnahme dieses Etappe-8-Blocks.
