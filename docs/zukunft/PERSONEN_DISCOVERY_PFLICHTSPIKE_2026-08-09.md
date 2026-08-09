# Personen-Discovery-Pflichtspike (§6.1)

**Stand:** 09.08.2026

**Umfang:** ausschließlich read-only Quellenprüfung; keine Produktdatei, Migration,
Deployment- oder KI-Anbieteranfrage

**Geprüfte Quelle:** ausschließlich Wikidata (Action API und Wikidata Query Service)

**Ergebnis:** `NO_GO` für Wikidata als alleinige Quelle der automatischen
Personen-Discovery

**Owner-Entscheidung:** Personen-Automatik am 09.08.2026 geparkt

## 1. STOP-Entscheidung

Wikidata trägt den in §6.1 geforderten Personen-Discovery-Pfad nicht zuverlässig.
Im vorab festgelegten Pflichtkorpus wurden nur 2 von 4 tatsächlich angekündigten
Projekten gefunden (Recall 50 %; Mindestkriterium 80 %). Beide Cage-Projekte waren
vorhanden, beide Rodriguez-Projekte fehlten. Ein verstorbener Regisseur lieferte
zugleich drei scheinbar undatierte „kommende“ Kandidaten.

Damit gilt:

- Wikidata allein wird **nicht** als release-relevante Quelle für kommende
  Personenprojekte übernommen.
- Es wurde keine zweite Quelle und kein LLM als Fallback geprüft.
- Max hat den Personenblock nach dem Spike geparkt. Er wird weder in Phase 2
  gebaut noch durch ein Env-/Serverflag aktiviert.
- Die geprüften Wikidata-Funktionen können später allenfalls als ID-/Provenienzbaustein
  neu bewertet werden; dieser Spike gibt dafür keine Produktfreigabe.

## 2. Vorab festgelegter Prüfrahmen

Zeitbox: 60 Minuten. Stichtag für „kommend“: `2026-08-09T00:00:00Z`.

| Person | Erwartete Rolle | Zweck |
|---|---|---|
| Nicolas Cage | Schauspiel | Pflichtfall und angekündigte Projekte |
| Robert Rodriguez | Regie | Pflichtfall und angekündigte Projekte |
| Greta Gerwig | Schauspiel und Regie | echte Mehrrollen-Person |
| John Smith | Schauspiel oder Regie | absichtlich hochgradig mehrdeutiger Name |
| Alfred Hitchcock | Regie | verstorbene Person; erwarteter Nullfall |

Vor dem Projektabruf wurden diese Gates festgelegt:

1. Beide Pflichtpersonen müssen eine stabile Personen-ID und die richtige Rolle haben.
2. Mehrdeutige Namen dürfen ohne eindeutige Rollen-/ID-Auflösung nicht angenommen
   werden.
3. Jeder angenommene Kandidat braucht eine stabile Werk-ID.
4. Recall der vier vorab markierten Ankündigungen mindestens 80 %.
5. Keine falsch angenommene Rollenbeziehung.
6. Bei Nichterfüllung: `NO_GO`, keine Ersatzquelle und kein LLM im selben Schritt.

## 3. Rechtliche und betreiberseitige Prüfung

| Punkt | Befund |
|---|---|
| Betreiber | Wikimedia Foundation; Abruf über offizielle Wikidata-Schnittstellen |
| Datennutzung | Strukturierte Wikidata-Daten stehen unter CC0; Seitentexte können anderen Bedingungen unterliegen |
| Zugriff | Offizielle Action API und WDQS; kein generisches HTML-Scraping |
| Attribution | Für CC0 nicht verpflichtend; ein sichtbarer Wikidata-Hinweis und gespeicherte Provenienz bleiben aus Nachvollziehbarkeitsgründen sinnvoll |
| Zugang | Kein Konto und kein Schlüssel für den geprüften read-only Zugriff |
| Geldkosten | Aktuell keine nutzungsabhängige API-Gebühr; deshalb 0 USD für den Spike und 0 USD Quellenkosten in der Projektion |
| Pflichten | Aussagekräftiger User-Agent, geringe Parallelität, Caching, `429` respektieren und keine automatischen Retries |
| Rechtsstatus | Technische/vertragliche Quellenprüfung, keine individuelle Rechtsberatung |

Maßgebliche Betreiberquellen:

- [Wikidata-Lizenzierung](https://www.wikidata.org/wiki/Wikidata:Licensing)
- [Wikidata-Datenzugriff](https://www.wikidata.org/wiki/Wikidata:Data_access)
- [Wikimedia API Access Policy](https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy)
- [Wikimedia API Rate Limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)
- [WDQS User Manual](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/Wikidata_Query_Help)

Für den Lauf wurde der eindeutige User-Agent
`KinodreieckPersonDiscoverySpike/0.1 (https://github.com/Soppagata/kinodreieck-app)`
verwendet. Alle Requests liefen seriell und ohne automatische Retries.

## 4. Technischer Vertrag

### 4.1 Identität und Rollen

Die Auflösung darf nicht auf Namen oder Suchbeschreibungen allein beruhen:

- stabile Person: Wikidata-QID
- Personentyp: `P31` („instance of“)
- Beruf/Rollenfähigkeit: `P106` („occupation“)
- Schauspielbeziehung: `P161` („cast member“)
- reine Sprechrolle: `P725` („voice actor“)
- Regiebeziehung: `P57` („director“)
- Veröffentlichung: `P577` („publication date“)

Actor und Director bleiben zwei getrennte interne Identitäten derselben Person,
zum Beispiel `(Q271967, actor)` und `(Q271967, director)`. Eine Mehrrollen-Person
ist dadurch nicht automatisch mehrdeutig.

### 4.2 Beobachtetes Payload-Schema

Die echten Antworten wurden nur flüchtig ausgewertet und nicht im Repository
gespeichert. Der für einen späteren Adapter relevante, gekürzte Shape lautet:

```json
{
  "head": {
    "vars": ["work", "workLabel", "relation", "release", "instance", "instanceLabel"]
  },
  "results": {
    "bindings": [
      {
        "work": { "type": "uri", "value": "http://www.wikidata.org/entity/Q..." },
        "workLabel": { "type": "literal", "xml:lang": "en", "value": "..." },
        "relation": { "type": "literal", "value": "cast_member|voice_actor|director" },
        "release": {
          "type": "literal",
          "datatype": "http://www.w3.org/2001/XMLSchema#dateTime",
          "value": "..."
        },
        "instance": { "type": "uri", "value": "http://www.wikidata.org/entity/Q..." },
        "instanceLabel": { "type": "literal", "xml:lang": "en", "value": "..." }
      }
    ]
  }
}
```

`release`, `instance` und `instanceLabel` können fehlen. Genau dieses Fehlen ist
kein Beleg für „kommend“ und darf nicht durch `!BOUND(P577) || P577 >= now()` als
automatische Zukunftsannahme behandelt werden.

Die Suchantwort enthält `search[]` mit `id`, `label`, `description`, `match` sowie
optional `search-continue`. Rollen werden anschließend aus
`entities[QID].claims.P106[]` gelesen. Die Payloads besitzen keine für das Produkt
verbindliche semantische Version; ein Adapter müsste deshalb Property-IDs,
Datentypen und Pflichtfelder selbst validieren und bei Abweichung fail-closed enden.

## 5. Vorab markierte Ankündigungen und Recall

Die Ground-Truth-Titel wurden vor dem Wikidata-Projektabruf anhand aktueller
Branchenmeldungen festgelegt.

| Person | Vorab markiertes Projekt | Rolle | Ankündigung | Wikidata-Ergebnis am 09.08.2026 | Einpflege-Latenz |
|---|---|---|---:|---|---:|
| Nicolas Cage | `Madden` | Schauspiel | 15.08.2024 | `Q129913280`, Beziehung vorhanden | 12 volle Tage |
| Nicolas Cage | `Best Pancakes in the County` | Schauspiel | 13.01.2026 | `Q137924164`, Beziehung vorhanden | 18 volle Tage |
| Robert Rodriguez | `Smooth Operators` | Regie | 13.03.2026 | kein passender Werkdatensatz und keine `P57`-Beziehung gefunden | mindestens 149 Tage fehlend |
| Robert Rodriguez | `The Naughty List` | Regie | 14.04.2026 | kein passender Werkdatensatz und keine `P57`-Beziehung gefunden | mindestens 117 Tage fehlend |

Ground-Truth-Belege:

- [`Madden`-Ankündigung](https://www.thewrap.com/nicolas-cage-john-madden-biopic/)
  und [aktueller Kommend-Status](https://www.t3.com/entertainment/streaming/nic-cages-new-madden-trailer-is-one-of-the-odder-ones-ive-seen-recently)
- [`Best Pancakes in the County`](https://www.cinemaexpress.com/english/news/2026/Jan/14/nicolas-cage-to-headline-best-pancakes-in-the-county)
- [`Smooth Operators`](https://www.thewrap.com/creative-content/movies/brass-knuckle-films-robert-rodriguez-alexis-garcia-unveils-five-project-slate/)
- [`The Naughty List`](https://au.variety.com/2026/film/news/robert-rodriguez-christmas-movie-naughty-list-paramount-35270/)

Messwerte:

| Metrik | Ergebnis | Gate |
|---|---:|---|
| Pflichtpersonen mit stabiler ID und passender Rolle | 2/2 (100 %) | bestanden |
| Recall aller vorab markierten Projekte | 2/4 (50 %) | **durchgefallen**, gefordert waren mindestens 80 % |
| Recall Nicolas Cage | 2/2 (100 %) | bestanden |
| Recall Robert Rodriguez | 0/2 (0 %) | **durchgefallen** |
| Angenommene falsche Rollenbeziehungen nach Guards | 0 | bestanden |

Der WDQS-Replikationsverzug wird vom Betreiber im Stundenbereich beschrieben. Er
erklärt keine noch nach 117 beziehungsweise 149 Tagen fehlenden Ankündigungen. Das
ist redaktionelle Quellenabdeckung, nicht bloß technischer Replikationslag.

## 6. Stabile IDs, Frische und Kandidatenrauschen

### 6.1 Personen

| Person | QID | Rollenbefund | letzter beobachteter Änderungszeitpunkt |
|---|---|---|---|
| Nicolas Cage | `Q42869` | Schauspiel und weitere Filmrollen | 01.08.2026 |
| Robert Rodriguez | `Q47284` | Filmregie, Regie, Schauspiel und weitere | 17.07.2026 |
| Greta Gerwig | `Q271967` | Schauspiel und Filmregie | 02.08.2026 |
| Alfred Hitchcock | `Q7374` | Filmregie und Schauspiel | 03.08.2026 |

### 6.2 Gefundene Pflichtwerke

| Werk | QID | aktuelle Revision | letzter beobachteter Änderungszeitpunkt | erste Cage-Beziehung |
|---|---|---:|---|---|
| `Madden` | `Q129913280` | `2516299351` | 11.07.2026 | 27.08.2024 12:56 UTC |
| `Best Pancakes in the County` | `Q137924164` | `2492485628` | 16.05.2026 | 31.01.2026 12:49 UTC |

Die QID ist stabiler als ein Titel, aber nicht unveränderlich im Sinne eines
Anwendungsdatensatzes: Merges und Redirects müssen bei jeder Revalidierung behandelt
werden. `lastrevid` oder `modified` gehört als Provenienz-/Cachemarker zum Fund.

### 6.3 Rauschen und Gegenbeispiele

- Cage lieferte 12 eindeutige Roh-QIDs für `P161`/`P725`, aber nur zwei waren die
  vorab bestätigten Pflichtprojekte. Mindestens vier Rohkandidaten waren bereits
  ausgestrahlt oder gar Figuren statt Werke. Rohkandidat-zu-Pflichttreffer: 6:1.
- Für `Madden` lieferte der rohe `P577`-Wert den 26.11.2026, während die aktuelle
  Berichterstattung zum Prime-Video-Trailer den 18.11.2026 nennt. Ohne ausgewertete
  Datumsqualifier, Region und Ausspielweg ist auch ein vorhandenes Datum nicht
  eindeutig genug für eine Benachrichtigung.
- `P725` kann bei inverser Abfrage Figuren als Subjekt liefern. Eine strikte
  Werktyp-Allowlist ist deshalb zwingend.
- Rodriguez lieferte sieben Regie-Rohkandidaten, aber keinen der beiden aktuellen
  Pflichtfälle; enthalten waren historische, unspezifische oder undatierte Einträge.
- Alfred Hitchcock lieferte trotz erwartetem Nullfall drei undatierte Kandidaten,
  darunter ein unfertiges/aufgegebenes Projekt. Fehlendes `P577` darf daher niemals
  „kommend“ bedeuten.
- Greta Gerwig lieferte einen plausiblen kommenden Regiekandidaten. Ihre zwei Rollen
  werden korrekt über dieselbe QID mit getrenntem Rollenkey modelliert.

## 7. Namensambiguität

| Suchname | exakte Personenlabels in den ersten Treffern | Ergebnis mit Rollenprüfung |
|---|---:|---|
| Nicolas Cage | 1 | eindeutig `Q42869` |
| Robert Rodriguez | 6 | nur `Q47284` erfüllt die Regierolle |
| Greta Gerwig | 1 | eindeutig `Q271967` |
| John Smith | mindestens 10 plus Folgeseite | blockiert; kein passender Rollenbeleg in den ersten zehn Treffern |
| Alfred Hitchcock | 2 | `Q7374` über Regierolle aufgelöst |

Damit waren 3 von 5 Namen (60 %) bei reiner Namenssuche kollisionsbehaftet. Nach
Rollenprüfung blieb 1 von 5 Fällen (20 %) absichtlich blockiert. Ein produktiver
Resolver darf bei `search-continue`, mehreren rollenfähigen Kandidaten oder fehlendem
Rollenbeleg keine automatische Auswahl treffen.

## 8. Requests, Quoten, Cache und Attribution

### Gemessener Spike

- 22 erfolgreiche Action-API-Requests
- 6 erfolgreiche WDQS-Requests
- insgesamt 28 erfolgreiche Wikidata-Requests, seriell
- ein lokaler DNS-Sandbox-Fehlschlag ohne Remote-Request
- keine automatischen Retries, keine Schlüssel, keine bezahlten Aufrufe

Betreibergrenzen sind kein zugesichertes SLA. Für den geprüften Zugriff nennt die
Wikimedia-Policy unter anderem niedrigere Limits für nicht identifizierte Clients;
ein sinnvoll identifizierter, nicht authentifizierter Bot wird aktuell mit bis zu
200 Requests pro Minute beschrieben. WDQS besitzt zusätzlich ein Zeitbudget pro
Client und eine harte Query-Zeitgrenze. Produktiv wären trotzdem ausschließlich
serielle, kleine Queries mit kurzer lokaler Zeitgrenze zulässig; `429`, Timeout oder
Schemafehler müssten den Lauf ohne Retry beenden.

### Erforderliches Cachemodell bei einer späteren Neubewertung

1. Personenauflösung global nach `(normalisierter Suchname, gewünschte Rolle)`
   deduplizieren; bestätigte QID speichern.
2. Discovery global nach `(person_qid, query_version)` ausführen, niemals pro
   Abonnent.
3. Normalisiert nur QIDs, Relation, Werktyp, Veröffentlichungswert,
   `lastrevid`/`modified`, Abrufzeit und Provenienz behalten.
4. Ergebnisse höchstens bis zum nächsten Montag-/Freitag-Lauf als frisch behandeln.
5. QID-Redirects/Merges und Property-Schema vor Nutzung revalidieren.
6. Rohpayloads nicht dauerhaft in Produkt- oder Zukunftsdokumenten speichern.

Attribution ist für die CC0-Strukturdaten nicht zwingend, soll aber als
`Daten: Wikidata` mit Link sowie `retrieved_at` und QIDs in der Provenienz erscheinen.

## 9. Kosten- und Lastprojektion

Die Quellenkosten sind bei der geprüften öffentlichen Schnittstelle 0 USD. Das ist
keine Garantie für Verfügbarkeit oder unveränderte Betreiberbedingungen.

Sei `U` die Zahl global eindeutiger beobachteter Personen-QIDs nach Deduplizierung:

- wiederkehrend: höchstens `2 × U` Discovery-Queries pro Woche bei Montag/Freitag
- Beispiel `U = 110`: 220 WDQS-Queries pro Woche, rund 954 in einem mittleren
  Kalendermonat oder 1.100 in einem Fünf-Wochen-Monat
- einmalige Auflösung: ungefähr ein Suchrequest pro eingereichtem Namen plus
  gebündelte Entity-/Rollenabrufe

Da der Superadmin-Scope fachlich nicht durch eine Personenanzahl begrenzt ist, gibt
es ohne separaten globalen Laufdeckel keine belastbare Worst-Case-Last. Auch deshalb
wäre vor jeder Neubewertung ein harter globaler Request-/Zeitdeckel nötig.

## 10. Entscheidungslog dieses Spikes

**Verworfen — nicht wieder aufmachen, solange sich die Quellenlage nicht geändert hat:**

| Ansatz | Grund | Datum |
|---|---|---|
| Wikidata allein als release-relevante automatische Personen-Discovery | nur 50 % Pflicht-Recall, 0/2 Rodriguez-Projekte, undatierte falsche Zukunftskandidaten | 09.08.2026 |
| Fehlendes Veröffentlichungsdatum als „kommend“ behandeln | produziert historische, ausgestrahlte und aufgegebene Kandidaten | 09.08.2026 |
| Name oder Suchbeschreibung ohne QID-/Rollen-Guard automatisch übernehmen | 60 % Namenskollisionen im bewusst kleinen Gegenbeispielkorpus | 09.08.2026 |

**Entschieden:**

| Entscheidung | Begründung | Randbedingung / offene Option |
|---|---|---|
| Personen-Automatik nach §6.1 parken | Pflichtgate ist reproduzierbar verfehlt | nur nach neuem Owner-STOP und bestandenem Quellen-/Scope-Spike wieder öffnen |
| Keine Ersatzquelle und kein LLM im selben Lauf | bindende Stop-Regel aus §6.1 | erst nach neuem STOP-Auftrag |
| Keine Produktintegration aus diesem Spike | Quellenabdeckung reicht nicht | QIDs können nur in einem später neu freigegebenen Design als Provenienzbaustein geprüft werden |

## 11. Lieferstand

| Teil | Zustand |
|---|---|
| Rechtliche/betreiberseitige Quellenprüfung | geliefert, nicht committed |
| Reale read-only Payload- und Gegenbeispielprobe | geliefert, nicht committed |
| Ergebnisdokument und `NO_GO` | geliefert, nicht committed |
| Produktadapter, Migration, Deployment | nicht gebaut und ausdrücklich außerhalb des Auftrags |
| Quelle für automatische Personen-Discovery | nicht freigegeben; Personen-Automatik geparkt |
