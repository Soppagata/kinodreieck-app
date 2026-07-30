# Produkt-Steckbrief: Gemeinsamer Filmwissens-Cache

Etappe 8, Block 2
Stand: 29.07.2026
Status: Produkt- und Planungsgrundlage, keine Implementierung

## Kurzentscheidung

Kinodreieck führt Filmwissen als eigenen, accountübergreifenden und
quellengeführten Datenbereich. Ein Film wird einmal eindeutig zugeordnet,
recherchiert, geprüft und versioniert; alle zulässigen Funktionen lesen
anschließend dieselbe veröffentlichte Fassung.

**WARUM bedeutet kulturelle Relevanz.** Der Wert wird aus belegtem gemeinsamem
Filmwissen abgeleitet, nicht aus persönlichem Geschmack und nicht aus dem
Gedächtnis eines Sprachmodells. Persönliche Prägung kann eine Erklärung
ergänzen, darf den kulturellen Befund aber weder ersetzen noch erhöhen.

Der erste Vorbewertungs-MVP aus Etappe 8, Block 1 bleibt unverändert:

- keine Websuche im Vorbewertungs-Aufruf,
- kein automatischer Rechercheauftrag durch einen Klick auf
  „Prognose erstellen“,
- bei einem Cache-Miss bleibt `warum` weiterhin `null`,
- kein unbelegter WARUM-Text und keine still erfundene Quelle,
- keine Änderung an Prognoseformat, Speicherung oder Statusfluss von Block 1.

Block 2 plant den nächsten Ausbau: Ein ausdrücklich ausgelöster
Auto-Bewertungsbericht darf bei fehlendem Filmwissen gezielt auf einer kleinen
Positivliste freigegebener Websites nach genau diesem Film suchen, passende
Einzelkritiken lesen und das Ergebnis gemeinsam cachen. Er durchsucht oder
kopiert keine vollständigen Websites. Die Anbindung an die Vorbewertung ist ein
eigener, nachgelagerter Bau- und Abnahmeschritt.

## Zweck und Nutzen

Der Cache löst vier Produktprobleme:

1. **Belegbarkeit:** Objektive und kulturhistorische Aussagen bleiben bis zur
   konkreten Quelle nachvollziehbar.
2. **Konsistenz:** Derselbe Film erhält nicht je Account oder Funktion eine
   andere angebliche Geschichte.
3. **Kostenkontrolle:** Recherche und KI-Synthese werden nicht bei jedem
   persönlichen Aufruf wiederholt.
4. **Korrekturfähigkeit:** Quellen, Zuordnungen, Rubrik und Ergebnisse können
   versioniert, ersetzt oder zurückgezogen werden, ohne ältere Fassungen
   unkenntlich zu machen.

Der Cache ist keine neue Filmbewertung und kein allgemeiner Kritiken-Aggregator.
Er speichert nur das Filmwissen, das Kinodreieck für Werkidentität, Beziehungen
und kulturelle Relevanz tatsächlich benötigt.

## Produktgrenzen

### Im MVP enthalten

- eindeutige Werkidentität mit externen Kennungen und alternativen Titeln,
- atomare, belegte Aussagen statt eines einzigen freien Filmtextes,
- eine versionierte WARUM-Einordnung von 0 bis 5 oder bewusst `null`,
- Quellen-, Lizenz-, Abruf-, Prüf- und Unsicherheitsstatus,
- gemeinsamer Cache-Lesezugriff ohne persönliche Daten,
- getrennte Beschaffung, Prüfung und Veröffentlichung,
- gezielte Recherche einzelner Filmkritiken auf einer kleinen Positivliste,
- ein quellengeführter Auto-Bewertungsbericht pro Werk und Wissensversion,
- nachvollziehbare Aktualisierung, Sperrung und Rücknahme,
- sichtbare Belege in einer späteren konsumierenden Oberfläche,
- eigenes, hartes Kosten- und Abruflimit für die Cache-Pipeline.

### Nicht im MVP enthalten

- allgemeine oder offene Websuche innerhalb der Vorbewertung,
- still ausgelöste Recherche bei jedem normalen Prognose-Cache-Miss,
- Crawling von Archiven, Übersichtsseiten oder ganzen Websites,
- Suche außerhalb der freigegebenen Positivliste,
- ein Import-Batch für persönliche Prognosen,
- aktuelle Kino- oder Streamingverfügbarkeit,
- Kritiker- oder Publikums-Scores als Ersatz für WARUM,
- Speicherung vollständiger Artikel, Kritiken, Pressetexte oder Bilder ohne
  dokumentiertes Nutzungsrecht,
- öffentliche Schreibrechte oder accountabhängige Varianten des Filmwissens,
- automatische Veröffentlichung ungeprüfter Modellantworten.

## Fachliche Trennung

| Bereich | Inhalt | Besitzer und Zugriff |
|---|---|---|
| Werkidentität | kanonisches Werk, Typ, Titel, Jahr, externe IDs, Beziehungen | gemeinsam; öffentlich oder für angemeldete Konten lesbar, kontrolliert beschreibbar |
| Filmwissen | atomare Aussagen, kulturelle Einordnung, Unsicherheit | gemeinsam; nur veröffentlichte Fassung für Produktfunktionen |
| Belege | Quelle, Fundstelle, Abrufstand, Rechte, Aussagebezug | gemeinsam; Anzeige entsprechend Lizenz und Publikationsstatus |
| Arbeitsbereich | Kandidaten, Konflikte, Prüfnotizen, Rechercheläufe | nur kontrollierte Administration |
| Persönlicher Bereich | Bewertung, Profil, Prognose, Notiz, Blogsignale | ausschließlich jeweiliges Konto; nie Bestandteil des Caches |
| Programmkatalog | Kino- und Streamingverfügbarkeit | bestehender Katalogpfad; nicht Teil des Filmwissens-Caches |

Ein persönlicher Film verweist auf ein gemeinsames Werk. Die gemeinsame
Werk-ID darf nicht aus einer Konto-ID oder einer lokalen Listen-ID abgeleitet
werden.

## Datenmodell

Das Modell ist logisch beschrieben; Tabellennamen sind Arbeitsnamen und noch
keine Implementierungsentscheidung.

### 1. `filmwerke`

Eine Zeile pro eindeutigem Werk beziehungsweise eindeutigem Serienteil.

Pflichtfelder:

- interne unveränderliche `werk_id`,
- Werktyp, Originaltitel und Erstveröffentlichungsjahr,
- optional Jahr bis, Laufzeit, Ursprungsländer und Originalsprachen,
- Identitätsstatus: `ungeklaert`, `zugeordnet`, `geprueft`, `gesperrt`,
- Erstell- und Änderungszeit.

Remakes, gleichnamige Werke, Kinofilm, Serie, Staffel, Episode und Special
werden nicht über den Titel zusammengeschoben. Beziehungen wie
`remake_von`, `teil_von`, `fortsetzung_von` oder `adaption_von` sind eigene
Datensätze.

### 2. `filmwerk_kennungen`

Externe Kennungen und Titelvarianten werden getrennt von der Werkzeile geführt:

- `werk_id`,
- Quelle beziehungsweise Namensraum,
- externe ID oder normalisierter Alternativtitel,
- Sprache, Land und Gültigkeitszeitraum,
- Zuordnungsstatus und Prüfergebnis,
- Quelle und Version der Zuordnung.

Titel plus Jahr ist nur ein Suchschlüssel, nie allein der endgültige
Primärschlüssel. Eine IMDb-ID darf als bereits vorhandener Fremdschlüssel
gespeichert werden, wenn ihre Herkunft zulässig ist; sie berechtigt nicht zum
Abruf oder zur Übernahme von IMDb-Inhalten.

### 3. `filmwissen_quellen`

Das Quellenregister entscheidet vor jedem Abruf und jeder Veröffentlichung, was
technisch und rechtlich erlaubt ist:

- Betreiber, kanonische URL und Quellentyp,
- Status: `kandidat`, `in_pruefung`, `freigegeben`, `pausiert`,
  `widerrufen` oder `abgelaufen`,
- Abrufart und erlaubte Frequenz,
- erlaubte Felder und erlaubte Nutzungsarten,
- Erlaubnis für Cache, Paraphrase, Zitat, öffentliche Anzeige und Weitergabe,
- vorgeschriebene Attribution,
- Lizenz- beziehungsweise Prüfstand und nächste Rechteprüfung,
- Lösch- und Aufbewahrungsfristen,
- technische Quote und gegebenenfalls Preisregel.

`null` oder eine unbekannte Erlaubnis bedeutet **nicht freigegeben**. Eine
erreichbare Website oder ein undokumentierter Endpunkt gilt nicht als API- oder
Nutzungserlaubnis.

### 4. `filmwissen_fundstellen`

Eine Fundstelle hält fest, was zu welchem Zeitpunkt tatsächlich geprüft wurde:

- Quelle und konkrete URL beziehungsweise Dokumentkennung,
- Veröffentlichungs-, Änderungs- und Abrufzeitpunkt,
- Seiten-, Abschnitts-, Absatz- oder Datensatz-Locator,
- Quellversion, Revisions-ID oder ETag, sofern vorhanden,
- Prüfsumme des verarbeiteten Inhalts,
- erlaubter kurzer Auszug oder ausschließlich eine interne Prüfreferenz,
- Sprache, Erreichbarkeit und Rechteprüfung.

Volltexte werden nicht vorsorglich gespeichert. Wenn die Lizenz nur Verlinkung
und sachliche Entnahme erlaubt, enthält der Cache eine eigene knappe Paraphrase
plus Fundstelle, aber keinen kopierten Text.

### 5. `filmwissen_aussagen`

Filmwissen besteht aus atomaren Aussagen, damit einzelne Behauptungen
bestätigt, bestritten oder ersetzt werden können:

- `aussage_id` und `werk_id`,
- Aussageart, zum Beispiel `werkbeziehung`, `auszeichnung`,
  `institutionelle_aufnahme`, `formaler_einfluss`, `gesellschaftliche_wirkung`
  oder `popkulturelles_nachleben`,
- strukturierter Wert und kurze anzeigbare Formulierung,
- Gültigkeits- beziehungsweise Bezugszeitraum,
- Status: `kandidat`, `bestaetigt`, `widerspruechlich`, `verworfen` oder
  `ersetzt`,
- Sicherheit und Prüfvermerk,
- Erstellmethode: deterministischer Import, manuelle Erfassung oder
  KI-unterstützte Synthese.

Eine Zuordnungstabelle verknüpft jede Aussage mit mindestens einer Fundstelle
und kennzeichnet die Beziehung als `stuetzt` oder `widerspricht`. Das
Sprachmodell ist niemals selbst eine Fundstelle.

### 6. `filmwissen_warum`

Die kulturelle Einordnung ist ein eigener, ableitbarer Datensatz:

- `werk_id`,
- WARUM-Wert 0 bis 5 oder `null`,
- Rubrikversion,
- kurze Synthese,
- referenzierte Aussagen,
- Abdeckungs- und Sicherheitsstatus,
- Prüfstatus und Freigabezeitpunkt.

Die Rubrik bewertet fünf getrennte Perspektiven:

1. filmhistorische Innovation oder nachweisbarer formaler Einfluss,
2. institutionelle Anerkennung und nachhaltige Kanonisierung,
3. gesellschaftliche, politische oder kulturelle Debatte und Wirkung,
4. popkulturelles Nachleben, Referenzen oder anhaltende Rezeption,
5. Einfluss auf Filmschaffende, Genres, Produktion oder Distribution.

Preise, Listenplätze und Popularität sind mögliche Belege innerhalb einer
Perspektive, aber kein automatischer WARUM-Wert. Qualität, persönlicher
Geschmack und aktuelle Bekanntheit werden nicht mit kultureller Relevanz
gleichgesetzt.

Für den MVP gilt:

- Ein veröffentlichter Zahlenwert braucht mindestens zwei voneinander
  unabhängige freigegebene Quellen aus zwei Betreiber-Domains.
- Mindestens eine Quelle muss institutionell, wissenschaftlich, archivalisch
  oder redaktionell verantwortlich sein.
- Mindestens zwei Rubrikperspektiven müssen positiv belegt sein.
- Jede verwendete Perspektive verweist auf konkrete bestätigte Aussagen.
- Reicht die Abdeckung nicht, bleibt WARUM `null`; fehlende Recherche wird
  nicht als Wert 0 interpretiert.
- Wert 0 ist nur nach dokumentierter Prüfung und bewusster redaktioneller
  Entscheidung zulässig, nie als automatischer Cache-Miss.
- Das Modell darf Wert und Synthese vorschlagen. Automatisch veröffentlicht
  wird nur, wenn Werkidentität, Quellenrechte, Mindestbelegung, Referenzen,
  Textgrenzen und Widerspruchsprüfung deterministisch bestanden sind.
- Bei Mehrdeutigkeit, Quellenkonflikt oder nicht eindeutig belegbarem Wert
  bleibt WARUM `null` und der Entwurf geht gegebenenfalls in redaktionelle
  Prüfung. Das Modell allein besitzt kein Veröffentlichungsrecht.

Die genaue Abbildung der fünf Perspektiven auf 0 bis 5 wird als
`warum-rubrik-v1` unveränderlich versioniert und vor der ersten produktiven
Befüllung mit Positiv-, Grenz- und Gegenbeispielen abgenommen.

### 7. `filmwissen_rechercheberichte`

Der Auto-Bewertungsbericht hält die Ergebnisse der gezielten Einzelrecherche
zusammen:

- `bericht_id`, `werk_id` und Eingangs-Filmwissensversion,
- Anlass: ausdrücklicher Nutzerauftrag, redaktionelle Erstbefüllung oder
  fällige Aktualisierung,
- angefragte Website-Positivliste und Ergebnis je Website,
- gefundene Einzelkritik mit Fundstelle oder ehrlicher Status
  `nicht_gefunden`, `nicht_zugaenglich`, `nicht_erlaubt` oder
  `identitaet_unklar`,
- extrahierte, belegte Aussagen und kurze Paraphrasen,
- Widersprüche zwischen Kritiken,
- vorgeschlagene WARUM-Einordnung mit Rubrikversion,
- Prüf-, Kosten- und Veröffentlichungsstatus.

Der Bericht ist kein Volltextarchiv und keine Sammlung fremder
Bewertungspunkte. Er beantwortet nachvollziehbar, welche relevanten Aussagen
die ausgewählten Kritiken zu diesem Werk tragen und wie diese in die
Kinodreieck-Rubrik eingehen.

### 8. `filmwissen_versionen`

Eine veröffentlichte Cache-Fassung ist unveränderlich und enthält:

- `version_id`, `werk_id` und Vorgängerversion,
- Schema-, Rubrik-, Pipeline- und gegebenenfalls Promptversion,
- die Menge der verwendeten Aussagen und Fundstellen,
- Prüfsumme des gesamten Belegpakets,
- Modell und Kostenmetadaten bei KI-Unterstützung,
- Status: `entwurf`, `in_pruefung`, `veroeffentlicht`, `ersetzt` oder
  `zurueckgezogen`,
- Prüfart: `automatisch` oder `redaktionell`,
- Ersteller, Prüfer, Zeitpunkte und Rücknahmegrund.

Am Werk zeigt nur ein Zeiger auf die aktuell veröffentlichte Version.
Korrekturen erzeugen eine neue Version; ein Rollback setzt den Zeiger auf eine
bereits geprüfte Version zurück. Historische persönliche Prognosen können
dadurch weiterhin angeben, mit welcher Filmwissensversion sie entstanden sind.

### 9. `filmwissen_auftraege`

Beschaffung und Verarbeitung werden unabhängig vom Ergebnis protokolliert:

- Werk, Anlass und deduplizierender Auftragsschlüssel,
- angefragte Quellen und Quellversionen,
- Status, Versuche, Wartezeit und Fehlerklasse,
- geschätzte und tatsächliche Kosten in USD-Cent,
- Token- und Laufzeitmetadaten ohne kopierte Artikel oder persönliche Inhalte,
- erzeugte Entwurfs- beziehungsweise veröffentlichte Version.

KI-Kosten werden zusätzlich über den vorhandenen Etappe-5-Unterbau und
`kd_ai_log` reserviert und abgerechnet. Das Cache-Protokoll ersetzt den
zentralen Budgetwächter nicht.

## Quellenstrategie

### Grundregel

Zuerst werden erlaubte, strukturierte und möglichst primäre Quellen genutzt.
Erst danach darf KI bereits beschaffte, freigegebene Fundstellen ordnen und
knapp zusammenfassen. Modellwissen ohne Fundstelle wird verworfen.

Für die Auto-Bewertungsberichte wird eine kleine Positivliste von zunächst drei
bis fünf Film- und Kulturwebsites festgelegt. Pro Bericht wird nur innerhalb
dieser Domains nach dem konkreten Werk gesucht. Jede neue Quelle durchläuft vor
Verwendung:

1. Identitäts- und Betreiberprüfung,
2. Prüfung von Lizenz, Nutzungsbedingungen, Cache- und Anzeigerecht,
3. Festlegung erlaubter Felder, Auszüge, Attribution und Abruffrequenz,
4. technische Qualitätsprobe,
5. Freigabe im Quellenregister.

Das gezielte Lesen einer einzelnen öffentlich erreichbaren HTML-Seite kann
technisch und rechtlich trotzdem automatisierte Extraktion beziehungsweise
Scraping sein. Der geringe Umfang ersetzt daher nicht die Prüfung der
Nutzungsbedingungen. Ohne erlaubten Zugangsweg wird auch keine Einzelkritik
automatisiert gelesen.

### Gezielter Recherchevertrag

Eine Recherche ist werkbezogen und eng begrenzt:

1. Aus geprüftem Originaltitel, Alternativtitel, Jahr, Werktyp und
   gegebenenfalls Regie wird je freigegebener Domain eine Suchanfrage gebildet.
2. Es werden höchstens die besten zwei Kandidatenseiten je Domain auf
   Werkidentität geprüft.
3. Pro Domain wird höchstens eine eindeutig passende Einzelkritik inhaltlich
   gelesen; eine zweite nur zur Auflösung einer Mehrdeutigkeit.
4. Gelesen werden nur die für Beleg, Einordnung und Fundstelle nötigen Teile.
5. Gespeichert werden Metadaten, erlaubte kurze Auszüge, eigene Paraphrasen und
   die Verknüpfung zu atomaren Aussagen, nicht der vollständige Artikel.
6. Nicht gefundene, gesperrte, paywallgeschützte oder mehrdeutige Ergebnisse
   werden als solche protokolliert; es gibt keinen Ausweich-Crawl.
7. Nach dem ersten erfolgreichen Bericht bedienen spätere Accounts denselben
   Cache statt dieselben Kritiken erneut abzurufen.

Nicht zulässig sind Archivdurchläufe, Paginierung durch alle Kritiken,
Sitemap-Ernte, Massendownloads, Umgehung von Paywalls oder Bot-Schutz sowie die
Suche nach Ersatzkopien auf nicht freigegebenen Domains.

### Priorität A: offene strukturierte Identitätsquellen

Geeignet sind offene Wissensdaten- und Normdatenquellen für Werkidentität,
Personen, alternative Titel, Veröffentlichungsdaten und externe Kennungen.
Jede konkrete Quelle bleibt bis zur dokumentierten Lizenzprüfung ein Kandidat.
Offene Strukturinformationen sind ein Einstieg, aber für eine nuancierte
kulturelle Einordnung allein nicht ausreichend.

### Priorität B: verantwortete Kultur- und Filmquellen

Für WARUM werden bevorzugt konkrete Seiten oder Datensätze von Filmarchiven,
Filmmuseen, Bibliotheken, Fachpublikationen, wissenschaftlichen Einrichtungen,
offiziellen Registern sowie Festival- und Preisorganisationen verwendet.
Auch dort werden nur die jeweils erlaubten Fakten, Paraphrasen und kurzen
Auszüge übernommen.

Primärquellen belegen beispielsweise eine Preisvergabe oder Aufnahme in ein
Register. Unabhängige verantwortete Sekundärquellen belegen Einordnung,
Einfluss und längerfristige Wirkung. Presse- und Marketingmaterial kann Fakten
stützen, zählt aber nicht als unabhängiger Beleg für die eigene kulturelle
Bedeutung eines Werks.

### Priorität C: lizenzierte kommerzielle Daten

Kommerzielle Film-APIs kommen nur infrage, wenn Vertrag, Preis, Cache,
accountübergreifende Verwendung, Quellenanzeige und öffentliche
Produktnutzung ausdrücklich passen. Ein technischer API-Zugang ohne diese
Rechte genügt nicht. Eine solche Lizenz ist eine eigene Budget- und
Produktentscheidung und nicht Teil der automatischen MVP-Freigabe.

### Ausgeschlossen oder gesperrt

| Quelle | MVP-Entscheidung |
|---|---|
| IMDb | Keine Inhaltsübernahme und kein API-Abruf ohne bezahlte, passende Lizenz. Bereits zulässig vorhandene IMDb-IDs dürfen nur als Fremdkennung dienen. |
| Rotten Tomatoes | Kein automatisiertes Lesen einzelner Seiten und kein sonstiges Scraping ohne ausdrücklich erlaubten oder lizenzierten Zugangsweg. Bewertungen oder Konsens-Texte werden nicht indirekt über Suchtreffer rekonstruiert. |
| film.at | Keine Filmwissensquelle, solange keine bestätigte öffentliche API oder schriftliche Erlaubnis mit passendem Cache- und Nutzungsrecht vorliegt. |
| Sprachmodellwissen | Darf keine Quelle ersetzen und keine unbelegte Aussage veröffentlichen. |
| Suchergebnis-Snippets | Dienen höchstens zur Entdeckung einer Quelle, nie als Beleg. |

Die Sperren gelten fail-closed. Sie dürfen nicht durch alternative Domains,
undokumentierte Endpunkte, Browser-Automation oder einen anderen Anbieter
umgangen werden.

### Umgang mit Widersprüchen

- Abweichende Fakten bleiben als getrennte Aussagen samt Quellen sichtbar.
- Identitätskonflikte sperren die Veröffentlichung für das Werk.
- Ein Konflikt wird durch Quellqualität, zeitliche Nähe und manuelle Prüfung
  entschieden, nicht durch Mehrheitszählung.
- Die unterlegene Aussage wird nicht gelöscht, sondern als widersprochen,
  verworfen oder ersetzt versioniert.
- Bei ungelöstem Konflikt bleibt der betroffene Teil und gegebenenfalls WARUM
  `null`.

## Cache-Befüllung und Aktualisierung

### MVP-Befüllung

Der erste Cache wird über eine bewusst ausgewählte Prüfliste befüllt. Die
Pipeline arbeitet nur mit freigegebenen Quellen, gezielten Einzelkritiken der
Website-Positivliste oder manuell eingetragenen Fundstellen. Eine allgemeine
Websuche und das Crawling ganzer Websites sind nicht Bestandteil des MVP.

Der Ablauf pro Werk:

1. Werk über starke Kennung oder geprüften Titel-/Jahr-/Typ-Abgleich auflösen.
2. Bereits veröffentlichte Version und bestehende Fundstellen prüfen.
3. Je freigegebener Website gezielt eine passende Einzelkritik suchen und die
   Werkidentität prüfen.
4. Nur eindeutig passende, erlaubte und fällige Einzelseiten abrufen.
5. Inhalte auf erlaubte Felder und Aufbewahrung begrenzen.
6. Aussagen deterministisch extrahieren oder als KI-unterstützte Kandidaten
   erzeugen.
7. Einen quellengeführten Auto-Bewertungsbericht und den WARUM-Vorschlag anhand
   der versionierten Rubrik erzeugen.
8. Schema, Quellenbezug, Rechte und Konflikte prüfen.
9. Bei vollständig bestandener deterministischer Prüfung automatisch als neue
   unveränderliche Version veröffentlichen; Zweifelsfälle bleiben Entwurf oder
   gehen in redaktionelle Prüfung.

Ein fehlender oder laufender Auftrag blockiert persönliche App-Funktionen
nicht. Sie arbeiten ohne WARUM weiter.

### Read-through-Verhalten

Die normale Vorbewertung aus Block 1 liest weiterhin nur die aktuell
veröffentlichte Version:

- **Treffer:** Version mit Belegstatus und Stand zurückgeben; kein externer
  Abruf und kein KI-Aufruf.
- **Treffer, Prüfung fällig:** vorhandene Version mit sichtbarem Stand
  zurückgeben und höchstens einen getrennten Wartungsauftrag dedupliziert
  vormerken.
- **Cache-Miss:** `warum: null` und Status `nicht_belegt`; kein externer
  Aufruf im Nutzerpfad.
- **gesperrt oder zurückgezogen:** keine frühere Zahl als aktuell ausgeben;
  Rücknahmehinweis und gegebenenfalls letzte zulässige Version nur in der
  Historie.

Ein späterer, ausdrücklich beschrifteter Auftrag „Auto-Bewertungsbericht
recherchieren“ darf bei einem Cache-Miss den getrennten, budgetgeschützten
Rechercheablauf starten. Vorher zeigt die Oberfläche Websites, Kostenmaximum
und den Hinweis, dass einzelne Kritiken automatisiert gelesen werden. Ein
normaler Klick auf „Prognose erstellen“ startet diesen Auftrag nicht
nebenbei.

### Aktualisierungsfristen

Es gibt keine pauschale kurze TTL für kulturhistorische Aussagen. Die
Startwerte sind:

| Bereich | Regelprüfung |
|---|---|
| Quellenrechte und Nutzungsbedingungen | alle 90 Tage sowie sofort bei Hinweis auf Änderung |
| Neu erschienene Werke bis drei Jahre | alle 90 Tage |
| etablierte Werke | alle 365 Tage |
| Werkidentität und Beziehungen | alle 365 Tage oder bei Konfliktmeldung |
| Korrektur, Widerruf oder falsche Zuordnung | sofortige Sperre und priorisierte Prüfung |

„Prüfung fällig“ bedeutet nicht automatisch „falsch“. Ein Quellenwiderruf,
Lizenzablauf oder Identitätskonflikt ist dagegen ein Sperrgrund. Die Fristen
sind Konfiguration mit Version, nicht im Client verstreute Konstanten.

### Nebenläufigkeit und Fehler

- Pro Werk und Eingangsquellen-Prüfsumme darf höchstens ein Auftrag laufen.
- Gleichzeitige Anforderungen werden auf denselben Auftrag zusammengeführt.
- Es gibt keinen automatischen bezahlten Retry; ein technischer Retry erfolgt
  höchstens einmal und nur innerhalb derselben Kostenreservierung.
- Rate-Limits führen zu geplantem späterem Lauf, nicht zu aggressivem
  Wiederholen.
- Ein Teilfehler veröffentlicht keine halbe Version.
- Die letzte zulässige veröffentlichte Version bleibt erhalten, bis eine neue
  vollständig geprüft ist.

## Kostenlimit

Der Cache besitzt zusätzlich zum globalen Etappe-5-Budget ein eigenes
Teilbudget. Es umfasst KI-Verarbeitung und gegebenenfalls kostenpflichtige
Such- oder Abrufdienste. Für den MVP gelten konservative Startgrenzen:

- höchstens **500 USD-Cent pro Kalendermonat** für bezahlte Recherche und
  KI-Verarbeitung des Filmwissens,
- höchstens **50 USD-Cent pro Tag**,
- höchstens **5 USD-Cent reservierte Maximalkosten pro Werk und Fassung**,
- höchstens ein bezahlter Syntheseauftrag pro Werk innerhalb von 30 Tagen,
  außer nach ausdrücklich bestätigter Quellenkorrektur,
- genau ein Werk pro Modellauftrag,
- höchstens fünf angefragte Websites, zehn geprüfte Kandidaten-URLs und fünf
  inhaltlich gelesene Einzelkritiken pro Bericht,
- keine bezahlte Verarbeitung, solange nicht bereits genügend freigegebene
  Fundstellen für die Mindestbelegung vorliegen.

Es gilt immer die strengere Grenze aus Cache-Teilbudget, globalem Monatsbudget,
Tageslimit, Parallelgrenze und Quellenquote. Die Reservierung wird vor dem
Anbieteraufruf anhand des maximalen Ein- und Ausgabebudgets gebucht und danach
durch die tatsächlichen Kosten ersetzt.

Bei unbekanntem Preis, unmessbarem Monatsverbrauch, unvollständiger
Konfiguration oder erschöpftem Budget wird fail-closed abgebrochen. Limits
werden weder automatisch angehoben noch durch Auftragsaufteilung umgangen.
Bezahlte Datenlizenzen und API-Abos brauchen zusätzlich eine separate
Freigabe; sie werden nicht aus dem Laufzeitbudget still mitentschieden.
Kosten eines Such- oder Browserdienstes müssen vor dem Auftrag ebenfalls
messbar und reservierbar sein; andernfalls bleibt nur ein kostenfreier,
vertraglich erlaubter Zugangsweg.

In Entwicklung und Abnahme gelten ergänzend die Budgetregeln aus `AGENTS.md`:
Mocks sind kostenfrei; echte Rauchproben und Evals laufen ausschließlich
seriell über die dafür vorgesehenen budgetgeschützten Befehle.

## Beleganzeige

Die spätere Produktoberfläche zeigt den Beleg direkt am WARUM-Ergebnis, nicht
nur in einer technischen Detailseite.

### Kompakte Ansicht

Beispiel:

> **WARUM 4/5 · belegt**
> Kulturelle Relevanz, Stand 29.07.2026 · 3 Aussagen aus 3 Quellen

Bei fehlender Mindestbelegung:

> **WARUM noch nicht belegt**
> Für dieses Werk liegt noch keine veröffentlichte, ausreichend belegte
> kulturelle Einordnung vor.

Es wird dann keine graue Null, kein geschätzter Wert und kein freier
KI-Hinweis angezeigt.

### Aufgeklappte Ansicht

„Belege anzeigen“ führt zu:

- der kurzen kulturellen Synthese,
- den einzelnen Aussagen, geordnet nach Rubrikperspektive,
- je Aussage Quelle, Betreiber, Titel, Veröffentlichungs- oder
  Versionsdatum, Abrufdatum und direktem Link,
- notwendiger Attribution,
- Kennzeichnung von Paraphrase oder kurzem Originalauszug,
- sichtbaren Widersprüchen und Unsicherheit,
- Filmwissens-, Rubrik- und Prüfversion.

Ein Modellname darf in den technischen Entstehungsdetails stehen, aber nicht
als Autorität neben den Quellen. Ist eine Quelle nicht mehr öffentlich
erreichbar, bleibt der dokumentierte Prüfstand sichtbar, sofern die Rechte das
erlauben; andernfalls wird die Fundstelle gesperrt und die betroffene
Publikationsversion neu bewertet.

### Verwendung in späteren Prognosen

Eine spätere Vorbewertungsfassung darf einen WARUM-Wert nur übernehmen, wenn
sie zusätzlich speichert:

- `filmwissenVersion`,
- `warumRubrikVersion`,
- Belegstatus und Stand.

Die persönliche Begründung darf dann erklären, wie ein belegter kultureller
Befund zur Prognose passt. Sie darf keine neuen kulturhistorischen Tatsachen
hinzufügen. Änderungen am Cache überschreiben keine bereits gespeicherte
Prognose; sie machen deren ältere Filmwissensversion sichtbar.

## Datenschutz und Sicherheit

- Der Cache enthält keine Konto-ID, Bewertungen, Profile, Notizen,
  Bloginhalte oder Nutzungsverläufe.
- Ein Cache-Miss darf nicht offenlegen, welcher Account nach einem Film
  gefragt hat.
- Öffentliche oder angemeldete Clients lesen nur veröffentlichte Fassungen.
- Entwürfe, Prüfnotizen, Quellkonfiguration und Schreiboperationen bleiben
  administrativ geschützt.
- Quell- und Anbieter-Schlüssel liegen nur serverseitig und nie in Cache,
  Client, Export oder allgemeinem Log.
- Logs enthalten Metadaten und Fehlerklassen, aber keine vollständigen
  Quelltexte.
- Quelleninhalte gelten als nicht vertrauenswürdige Eingabe. Darin enthaltene
  Anweisungen dürfen die Rubrik, Systemregeln oder Freigabe nicht verändern.
- Jede Veröffentlichung validiert Schema, Textgrenzen, erlaubte URLs,
  Quellenstatus und Referenzintegrität.

## Abnahmekriterien

Block 2 ist fachlich abgenommen, wenn alle folgenden Punkte erfüllt sind.
Diese Kriterien beschreiben die spätere Umsetzung; dieser Steckbrief selbst
nimmt keine Implementierung vor.

### Identität und Datenmodell

- Gleichnamige Werke, Remake und Original lassen sich ohne gegenseitige
  Belegübernahme getrennt führen.
- Jede veröffentlichte Aussage verweist auf mindestens eine konkrete,
  freigegebene Fundstelle.
- Jede veröffentlichte WARUM-Zahl erfüllt die Mindestbelegung, nennt
  Rubrikversion und referenziert ihre Aussagen.
- Cache-Miss und unzureichende Abdeckung ergeben `null`, niemals automatisch
  0.
- Persönliche Daten sind im gemeinsamen Schema und in den Logs nicht
  vorhanden.

### Quellen und Rechte

- Jede verwendete Quelle steht mit erlaubten Feldern, Cache-, Anzeige-,
  Attributions- und Prüfstatus im Register.
- Der Rechercheauftrag akzeptiert ausschließlich freigegebene Domains und
  erlaubte Seitenmuster der Positivliste; Weiterleitungen auf andere Domains
  werden nicht automatisch gelesen.
- Unbekannte, pausierte, widerrufene und abgelaufene Quellen werden technisch
  nicht neu abgerufen oder veröffentlicht.
- IMDb-Inhalte werden ohne passende Lizenz nicht genutzt, Rotten Tomatoes
  wird nicht gescrapt und film.at bleibt ohne bestätigte API beziehungsweise
  Erlaubnis gesperrt.
- Volltext und Auszüge werden nur im dokumentierten Rechteumfang gespeichert.
- Eine Einzelrecherche bleibt innerhalb der festgelegten Kandidaten- und
  Seitenlimits; sie kann weder Archive paginieren noch Sitemap- oder
  Massendownloads auslösen.
- Ein Quellenwiderruf kann alle abhängigen Aussagen und Versionen auffinden
  und sperren.

### Cache und Versionierung

- Zwanzig gleichzeitige Anforderungen für dasselbe Werk erzeugen höchstens
  einen Beschaffungs- beziehungsweise Syntheseauftrag.
- Ein Cache-Treffer verursacht nachweislich keinen externen oder bezahlten
  Aufruf.
- Ein Cache-Miss in der Vorbewertung verursacht ebenfalls keinen externen
  oder bezahlten Aufruf und verändert Block 1 nicht.
- Nur der ausdrücklich ausgelöste Auto-Bewertungsbericht darf bei einem
  Cache-Miss die gezielte Recherche starten; identische gleichzeitige
  Berichtsaufträge werden zusammengeführt.
- Änderungen erzeugen unveränderliche Folgeversionen; Historie, Vergleich und
  Rollback bleiben möglich.
- Eine fehlerhafte oder nur teilweise erzeugte Fassung ersetzt niemals die
  letzte zulässige veröffentlichte Version.
- Konflikt, fällige Prüfung, Sperre und Rücknahme sind fachlich und in der
  Anzeige unterscheidbar.

### Kosten und Betrieb

- Jeder bezahlte Auftrag wird vorab reserviert und danach mit tatsächlichen
  Kosten abgeschlossen.
- Vor einem ausdrücklich ausgelösten Bericht werden Website-Positivliste und
  Kostenmaximum angezeigt.
- Monats-, Tages-, Werk-, Parallel- und Quellenlimits werden in
  Konkurrenzsituationen atomar eingehalten.
- Unbekannte Kosten oder nicht messbarer Verbrauch stoppen bezahlte Arbeit.
- Automatische Wiederholungen können weder das Werk- noch das Monatslimit
  vervielfachen.
- Ein Betriebsbericht kann Cache-Trefferquote, Misses, fällige Werke,
  Sperren, Quellenfehler und Kosten ohne persönliche Nutzungsdaten ausweisen.

### Belegqualität und Oberfläche

- Eine feste Prüfliste enthält mindestens zwölf Werke: gut belegte,
  schwach belegte, gleichnamige beziehungsweise neu verfilmte und
  widersprüchlich beschriebene Fälle.
- Für jedes veröffentlichte Werk ist jede sichtbare kulturelle Behauptung von
  der Oberfläche bis zur Fundstelle rückverfolgbar.
- Der Bericht zeigt pro angefragter Website entweder die passende
  Einzelkritik oder einen ehrlichen Nichtfund-, Sperr- beziehungsweise
  Mehrdeutigkeitsstatus.
- Widersprüche und Unsicherheit werden sichtbar; das Modell wird nicht als
  Quelle dargestellt.
- Bei fehlenden oder gesperrten Belegen verschwindet die WARUM-Zahl und wird
  durch einen ehrlichen Status ersetzt.
- Kritikerwert, Popularität oder persönliche Passung können in den
  Gegenbeispielen keinen unbelegten WARUM-Wert erzeugen.

### Schutz von Block 1

- `docs/ETAPPE_8_VORBEWERTUNG_PLAN.md` und
  `docs/STECKBRIEF_VORBEWERTUNG.md` bleiben für Block 2 unverändert.
- Das bestehende Format `film-prognose-v1`, insbesondere `warum: null`, wird
  nicht still erweitert.
- Erst ein eigener, ausdrücklich abgenommener Integrationsschritt darf eine
  neue Prognoseformatversion einführen und belegtes Filmwissen verwenden.

## Empfohlene Baufolge für einen späteren Umsetzungsauftrag

1. Quellenregister und Rechtevertrag festziehen.
2. Kanonische Werkidentität und Beziehungen aufbauen.
3. Fundstellen, atomare Aussagen und Konfliktmodell anlegen.
4. Unveränderliche Versionen und veröffentlichten Zeiger einführen.
5. Domain- und Seitenmuster-Positivliste samt eng begrenzter
   Einzelkritik-Recherche umsetzen.
6. WARUM-Rubrik mit Prüffällen abnehmen.
7. KI-unterstützte Synthese hinter bestehendem Budgetwächter ergänzen.
8. Automatische Veröffentlichung für den vollständig validierten Pfad und
   administrative Prüfung für Zweifelsfälle bauen.
9. Beleganzeige und Betriebsbericht umsetzen.
10. Erst danach einen eigenen Steckbrief für die Integration in die
    Vorbewertung beschließen.

## Noch vor Implementierung zu entscheiden

- konkrete erste Positivliste von drei bis fünf Websites samt erlaubtem
  Such-/Abrufweg und Rechteprüfung je Quelle,
- feste Zuordnungstabelle von `warum-rubrik-v1` auf 0 bis 5,
- wer Entwürfe prüfen und veröffentlichen darf,
- ob veröffentlichte Belege öffentlich oder zunächst nur für angemeldete
  Beta-Konten lesbar sind,
- welche zwölf oder mehr Werke die verbindliche Prüfliste bilden,
- ob und unter welchen Rechten kurze Quellenauszüge zusätzlich zur Paraphrase
  angezeigt werden,
- ob 500 USD-Cent Monatsbudget nach dem Pilot unverändert bleibt; jede
  Erhöhung braucht eine bewusste Produktentscheidung.
