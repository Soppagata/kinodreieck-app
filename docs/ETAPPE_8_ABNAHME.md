# Etappe 8: Abnahme Vorbewertung und Filmwissen

Stand: 30.07.2026

Branch: `feat/etappe-8-vorbewertung`

Technischer Stand: abgenommen

Noch vor Merge: kurze Staging-Kontoabnahme durch Max

## Abgenommener Umfang

Diese Abnahme schließt die Roadmap-Phasen wortgleich ab:

- Phase A — Vertrag einfrieren
- Phase B — Gemeinsamer Datengrund
- Phase C — Sicherer Leseweg
- Phase D — Quellengeführte Synthese
- Phase E — Produktintegration
- Phase F — Abnahme und Freigabe

Enthalten sind der On-demand-MVP der persönlichen KI-Prognose und der erste
gemeinsame Filmwissens-Cache. Filmscan und Bloganalyse sind eigene spätere
Blöcke der übergeordneten Etappe 8.

## Produktverhalten

- Ein unbewerteter Film bietet „KI-Prognose erstellen“.
- Im Formular „Neuer Eintrag“ kann Speichern direkt mit einer Prognose
  verbunden werden. Der Eintrag wird immer zuerst sicher gespeichert.
- Prognose und echte Bewertung liegen in getrennten Feldern. Annehmen,
  Korrigieren oder Verwerfen überschreibt keine echte Bewertung.
- Bei KI=aus oder ohne angemeldetes Konto wird kein bezahlter Aufruf
  angeboten.
- Ein leeres Profil endet vor dem Anbieter. Junge Profile dürfen eine sichtbar
  stark begrenzte Sicherheit erhalten.
- Ein normaler Prognoseaufruf startet niemals still eine Filmrecherche.
- Liegt kein gemeinsames Filmwissen vor, darf Sonnet WARUM vorsichtig aus
  Filmkontext und Geschmack schätzen oder offenlassen. Die App zeigt die
  Herkunft als persönlich geschätzt.
- Liegt gemeinsames Filmwissen vor, übernimmt die Prognose dessen WARUM-Wert
  und Versions-ID unverändert. Sonnet darf den belegten Wert nicht umdeuten.
- Gemeinsames Filmwissen erscheint getrennt mit Stand, Sicherheit,
  paraphrasierten Kernaussagen und Quellenlinks.

## WARUM und Belege

WARUM bedeutet kulturelle Relevanz. Seine Stärke folgt dem Inhalt des Belegs,
nicht der bloßen Zahl gefundener Informationen. Eine eindeutige
institutionelle Einordnung darf deshalb allein einen hohen Wert tragen. Ohne
institutionelle Einordnung sind zwei unabhängige verantwortete Quellen nötig;
reine Struktur- oder Popularitätsdaten reichen nicht.

Für den ersten produktiven Pfad sind ausschließlich feste offizielle Adapter
freigegeben:

- Wikidata als strukturierte Identitäts- und Faktengrundlage,
- Library of Congress / National Film Registry als institutioneller Beleg.

IMDb, Rotten Tomatoes, film.at, Guardian und freie Websuche bleiben ohne
passende Freigabe beziehungsweise eigenen geprüften Adapter ausgeschlossen.
Der Browser kann keine Quelle, URL oder Fundstelle vorgeben.

## Daten- und Kontogrenzen

- Der Filmwissens-Cache ist gemeinsam, accountunabhängig und versioniert.
- Konten dürfen ausschließlich veröffentlichte Fassungen über eine enge RPC
  lesen. Browserrollen dürfen Werk, Quelle, Beleg und Version nicht schreiben.
- Persönliche Profilsignale, Bewertungen, Notizen und Konto-IDs gelangen
  nicht in den gemeinsamen Cache.
- Prognosen speichern ihre Filmwissensherkunft, ändern aber weder die
  veröffentlichte Fassung noch frühere echte Bewertungen.
- Accountwechsel und abgebrochene Ansichten besitzen Generations- und
  Abbruchwachen, damit verspätete Antworten nicht in das falsche Konto laufen.
- Nach einer Anmeldung aus Demo oder Willkommen gilt der aktuelle
  Kontodatenstand vollständig; Demo-Inhalte werden nicht beigemischt.

## Technischer Kettenbeweis

Der einzige erlaubte echte Testweg war seriell:

```text
npm run test:ai:live
```

Ergebnis am 30.07.2026: **21/21 grün**.

- P16: leeres Profil stoppt vor KI-Kosten.
- P17: echte persönliche Sonnet-Prognose mit geprüften Profilsignalen,
  Modell-ID und gemessenen Kosten.
- P18: Wikidata und LOC führen für `Alien` (`tt0078748`) zu einer
  veröffentlichten gemeinsamen Version.
- P19: derselbe Auftrag trifft kostenfrei exakt diese Cache-Version.
- P20: ein angemeldetes Konto liest die Version über die enge Lese-RPC;
  WARUM ist 5 mit hoher Sicherheit.
- P21: die persönliche Prognose übernimmt WARUM 5 und die Versions-ID mit
  Herkunft `filmwissen`.

Der Budgetwächter meldete danach **77,4985 von 500,0000 US-Cent** im
Testkonto-Monat. Der finale Lauf verbrauchte 4,2025 US-Cent. Es gab weder
`AUTONOMIE_STOPP` noch `BUDGET_UNBEKANNT`.

## Kostenfreie Abnahme

- Edge-Function-Vertrag: 276/276 grün.
- Quellenadapter: 13/13 grün.
- Adapterbetrieb: 8/8 grün.
- RLS: Vorbewertung 36/36 und gemeinsamer Filmwissens-Cache 54/54 grün.
- Gesamte App-, Struktur-, Datenschutz- und Regressionstests: siehe
  Abschlusslauf dieses Branches.
- Produktionsbuild: siehe Abschlusslauf dieses Branches.

Die Migration
`20260730210000_etappe8_filmwissen_adapter_betrieb.sql` wurde dateiweise
erfolgreich auf das verknüpfte Projekt angewandt. `ai-task` wurde danach mit
dem finalen Adapter- und Speichervertrag veröffentlicht.

## Manuelle Staging-Abnahme vor Merge

Max prüft mit einem angemeldeten Konto nur noch:

1. Einen unbewerteten Eintrag öffnen und die getrennte Filmwissensanzeige
   aufklappen.
2. Bei einem Film mit starker IMDb-, TMDB- oder Wikidata-Kennung den
   Filmwissensbericht bewusst anfordern.
3. Danach „KI-Prognose erstellen“ auslösen und Herkunft, Kosten, Profilversion
   sowie Filmwissensstand ansehen.
4. Annehmen, Verwerfen und Korrigieren je einmal prüfen; die echte Bewertung
   darf nur beim bewussten Speichern im Bewertungseditor entstehen.
5. Abmelden und über Demo/Willkommen wieder anmelden; anschließend müssen die
   aktuellen Kontodaten statt gemischter Demo-Daten sichtbar sein.

## Nicht Bestandteil dieses Abschlusses

- Import-Batch-Prognosen,
- automatische Neuberechnung bei Profil- oder Filmwissensänderungen,
- offene Websuche oder zusätzliche ungeprüfte Quellen,
- redaktionelles Korrektur-Backoffice,
- Filmscan und Bloganalyse,
- Produktions-Merge ohne Max’ sichtbare Staging-Freigabe.
