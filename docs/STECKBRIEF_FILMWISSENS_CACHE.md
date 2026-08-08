# Produkt-Steckbrief: Gemeinsamer Filmwissens-Cache

Etappe 8, Block 2

Stand: 30.07.2026

Status: MVP implementiert und technisch abgenommen

Diese Fassung ersetzt den ausführlicheren Erstentwurf vom 29.07.2026. Sie
beschreibt nur, was für einen belastbaren MVP tatsächlich nötig ist.

## Kurzentscheidung

Kinodreieck ruft für einen ausdrücklich ausgelösten Filmwissensbericht feste
offizielle Datensätze zu genau einem Film ab. Der erste MVP verwendet
Wikidata für geprüfte Werkidentität und strukturierten Kontext sowie die
vollständige offizielle National-Film-Registry-Liste der Library of Congress
für eine mögliche institutionelle Einordnung. Freie Websuche und das Lesen
einzelner Kritiken sind nicht Teil dieses MVP.

Das recherchierte Filmwissen wird einmal gemeinsam, belegt und versioniert
gespeichert. Weitere Accounts verwenden denselben Cache, statt dieselben
Quellen erneut abzurufen. Der daraus abgeleitete persönliche Bericht bleibt
dagegen im jeweiligen Account.

**WARUM bedeutet kulturelle Relevanz.** Im gemeinsamen Cache wird es aus den
recherchierten Belegen abgeleitet, nicht aus persönlichem Geschmack,
Popularität oder dem Gedächtnis des Sprachmodells. Eine persönliche
KI-Prognose darf denselben Begriff vorläufig schätzen, ist aber kein
Cache-Eintrag.

## Schutz von Etappe 8, Block 1

Der Vorbewertungs-MVP bleibt technisch getrennt:

- Der normale Knopf „KI-Prognose erstellen“ führt keine Webrecherche aus.
- Bei fehlendem Filmwissen darf Sonnet `warum` in der persönlichen Prognose
  vorsichtig aus Filmkontext und Geschmacksprofil schätzen oder `null` lassen.
- Ein Cache-Miss löst nicht still einen zweiten kostenpflichtigen Auftrag aus.
- Prognose und echte Bewertung bleiben getrennt.
- Der gemeinsame Cache übernimmt niemals eine persönliche Schätzung.

Die Übergabe belegter Filmwissenssignale an die persönliche Prognose ist
umgesetzt und über die echte Probe P21 abgenommen: WARUM und Versions-ID
werden serverseitig unverändert gebunden.

## Wie die Vorbewertung heute arbeitet

Der aktuelle Task verwendet Claude Sonnet, nicht GPT. Sonnet erhält:

- Titel, Originaltitel, Jahr, Typ, Genres und Tags,
- die Profilachsen,
- höchstens 20 bestätigte Geschmackssignale mit Richtung, Stärke und
  Sicherheit.

Sonnet schlägt WIE, WAS, persönliche Passung, Kategorie, Sicherheit und eine
Kurzbegründung vor. Es gibt keine mathematische Bewertungsformel. Der Server
prüft Wertebereiche, Format und verwendete Signal-IDs und begrenzt die
Sicherheit. Liegt belegtes gemeinsames Filmwissen vor, bindet der Server dessen
WARUM-Wert und Versions-ID unveränderlich ein. Bei einem Cache-Miss darf Sonnet
WARUM vorsichtig persönlich schätzen oder `null` lassen; das löst keine
Recherche aus und wird getrennt gekennzeichnet.

Diese freie Modellbeurteilung ist für eine ausdrücklich als persönlich
geschätzt markierte Prognose ausreichend. Ein gemeinsamer WARUM-Wert braucht
dagegen serverseitig beschaffte Belege und die gemeinsame Skalenbedeutung.

## Zielbild

Der Ablauf besteht aus zwei klar getrennten Teilen:

```text
gezielte Quellenrecherche
        ↓
gemeinsamer Filmwissens-Cache
        ↓
persönlicher Auto-Bewertungsbericht
```

### Gemeinsamer Teil

- geprüfte Werkidentität,
- gefundene strukturierte und institutionelle Fundstellen,
- kurze eigene Paraphrasen der relevanten Aussagen,
- WARUM-Vorschlag mit Quellen,
- Stand, Modell-, Prompt- und Cache-Version.

### Persönlicher Teil

- WIE- und WAS-Prognose,
- persönliche Passung beziehungsweise Passungsband,
- kurze Erklärung anhand bestätigter Profilsignale,
- verwendete Filmwissensversion,
- Annahme, Korrektur oder Verwerfen im bestehenden persönlichen Bereich.

Persönliche Profilsignale, Bewertungen, Notizen und Konto-IDs gelangen nie in
den gemeinsamen Cache.

## Gezielter Recherchevertrag

Eine Filmrecherche ist eng begrenzt:

1. Der Browser liefert genau eine starke IMDb-, TMDB- oder Wikidata-Kennung.
2. Wikidata löst diese Kennung exakt auf, prüft Filmtyp und Kennung erneut und
   gibt nur erlaubte strukturierte Fakten weiter.
3. Die Library of Congress liefert ausschließlich die feste vollständige
   Registry-Tabelle. Der Service prüft den gesamten Snapshot und ordnet nur
   exaktes Titelalias plus exaktes Erscheinungsjahr zu.
4. Nur die daraus serverseitig erzeugten Fundstellen gelangen zu Sonnet.
5. Gespeichert werden Werkidentität, URL, Abrufstand, Abrufhash, kurze eigene
   Kernaussagen, Belegklasse und Synthese – keine fremden Volltexte.
6. Nichtfund, Mehrdeutigkeit, Schemaabweichung, Rate-Limit oder Quellenfehler
   führen ehrlich zu keinem veröffentlichten Bericht.
7. Ein erfolgreicher Bericht wird gemeinsam versioniert und bei späteren
   Anforderungen wiederverwendet.

Nicht erlaubt sind:

- Durchlaufen von Archiven oder Seitennavigation,
- Sitemap-Ernte und Massendownloads,
- Umgehung von Paywalls, Bot-Schutz oder Zugriffssperren,
- automatischer Wechsel auf nicht freigegebene Domains,
- Verwendung von Suchergebnis-Snippets als Beleg,
- vollständige Artikeltexte im Cache ohne ausdrückliches Recht.

Auch das automatisierte Lesen einer einzelnen HTML-Seite kann rechtlich und
technisch Scraping sein. Der geringe Umfang ersetzt deshalb nicht die
Quellenfreigabe.

## Quellenstrategie

### Freigegebene erste Positivliste

| Quelle | Rolle | MVP-Status |
|---|---|---|
| Wikidata Action API | exakte Werkidentität und enger strukturierter Kontext, CC0 | produktiv freigegeben; identifizierter User-Agent und serverseitiges Limit |
| Library of Congress / National Film Registry | ausdrückliche institutionelle kulturelle, historische oder ästhetische Einordnung | produktiv freigegeben; ausschließlich vollständige Registry-Tabelle |

Weitere Kritik- oder Filminformationsquellen bleiben Erweiterungskandidaten.
Eine Quelle wird erst aktiviert, wenn Zugangsweg, Abruffrequenz, erlaubte
Speicherung, Paraphrase, Quellenanzeige und Attribution dokumentiert und als
fester Adapter getestet sind.

### Gesperrte oder ungeeignete Quellen

| Quelle | Entscheidung |
|---|---|
| IMDb | Keine Inhaltsübernahme oder API-Nutzung ohne passende kostenpflichtige Lizenz. Eine rechtmäßig vorhandene IMDb-ID darf nur als Fremdkennung dienen. |
| Rotten Tomatoes | Kein automatisiertes Lesen und kein Scraping ohne ausdrücklich erlaubten oder lizenzierten Zugangsweg. |
| film.at | Keine Nutzung als Filmwissensquelle ohne bestätigte öffentliche API oder schriftliche Erlaubnis. |
| RogerEbert.com | Automatisierte Zugriffe sind laut Nutzungsbedingungen untersagt; nur nach ausdrücklicher Erlaubnis. |
| Letterboxd | Kein Scraping; der API-Zugang ist für LLM-, Analyse- und Empfehlungsprojekte derzeit nicht vorgesehen. |
| TMDB-Inhalte | Nicht für KI-Auswertung verwenden, solange keine dafür passende Vereinbarung besteht. |
| Sprachmodellwissen | Das Modell ist niemals selbst eine Quelle. |

Eine frei erreichbare Website oder ein undokumentierter JSON-Endpunkt ist keine
Nutzungserlaubnis.

## Einfache Bewertungslogik

### WIE und WAS

WIE und WAS bleiben persönliche Prognosen. Dafür genügt eine kurze gemeinsame
Skalenbedeutung:

| Wert | Bedeutung |
|---|---|
| 0 | klarer persönlicher Gegenpol |
| 1 | wahrscheinlich sehr unpassend |
| 2 | eher unpassend |
| 3 | gemischt oder leicht passend |
| 4 | deutlich passend |
| 5 | außergewöhnlich starke Passung |

Eine mathematische Formel ist nicht nötig. Wenige abgenommene Beispiele sind
hilfreicher als gewichtete Unterpunkte.

### WARUM

WARUM bewertet die belegte kulturelle Relevanz:

| Wert | Bedeutung |
|---|---|
| `null` | nicht ausreichend belegt |
| 0 | nach ausreichender Recherche keine relevante Wirkung dokumentiert; nie bloß wegen eines Nichtfunds |
| 1 | begrenzte, lokale oder sehr nischenbezogene Bedeutung |
| 2 | erkennbare Bedeutung innerhalb eines Genres, einer Szene oder einer Zeit |
| 3 | nachhaltige und mehrfach belegte Wirkung über die unmittelbare Nische hinaus |
| 4 | breit anerkannter und längerfristiger kultureller oder filmhistorischer Einfluss |
| 5 | kanonisches oder kulturprägendes Werk mit außergewöhnlich stark belegter Wirkung |

Für einen Zahlenwert genügen:

- zwei voneinander unabhängige verantwortete Quellen, oder
- eine ausdrückliche institutionelle Einordnung, etwa die Aufnahme in ein
  anerkanntes Filmregister.

Mit nur einer gewöhnlichen Kritik darf ein Bericht deren Aussage zeigen, aber
WARUM bleibt `null`. Preise, Sterne, Popularität und Kritiker-Durchschnitt
erzeugen nicht automatisch einen WARUM-Wert.

Eine detaillierte Fünf-Perspektiven-Rubrik mit Gewichtungen ist für den MVP
nicht nötig.

## Schlankes Datenmodell

Der gemeinsame Cache ist relational und versioniert:

- `kd_filmwissen_quellen`: Positivliste, Rechte, Belegklasse und Attribution,
- `kd_filmwerke` und `kd_filmwerk_kennungen`: kanonische Werkidentität und
  starke IMDb-, TMDB- oder Wikidata-Kennungen,
- `kd_filmwissen_auftraege`: gesperrte Syntheseaufträge,
- `kd_filmwissen_versionen`: unveränderliche veröffentlichte Fassungen,
- `kd_filmwissen_belege`: konkrete Fundstellen und eigene Kernaussagen,
- `kd_filmwissen_zeigerlog`: atomare Historie der aktuellen Fassung,
- `kd_filmwissen_quellen_abrufe`: quellenweites Rate-Limit,
- `kd_filmwissen_adapter_snapshots`: kurzlebiger service-only LOC-Snapshot.

Das bestehende `kd_ai_log` hält Kosten- und Vorgangsmetadaten. Veröffentlichung
und KI-Logabschluss erfolgen gemeinsam in einer Transaktion. Eine neue
Recherche erzeugt eine neue unveränderliche Version; ältere Versionen bleiben
für historische Prognosen referenzierbar.

Die stabile Werkkennung entsteht nie allein aus einem frei geschriebenen
Titel. Der MVP verlangt eine starke Fremdkennung und prüft sie am aufgelösten
Wikidata-Objekt erneut.

## Cache-Verhalten

- **Cache-Treffer:** vorhandene veröffentlichte Version verwenden; kein
  Quellen- oder KI-Aufruf.
- **Cache-Miss bei normaler Vorbewertung:** keine Recherche; eine persönliche
  Sonnet-Schätzung von WARUM bleibt erlaubt und getrennt gekennzeichnet.
- **Ausdrücklich ausgelöster Filmwissensbericht:** Die Oberfläche nennt genau
  einen Sonnet-Aufruf, höchstens 6 US-Cent und keine automatische
  Wiederholung; danach startet die feste Quellenkette.
- **Gleichzeitige identische Aufträge:** auf einen laufenden Auftrag
  zusammenführen.
- **Teilfehler:** keine halbe neue Version veröffentlichen.
- **Mehrdeutige Werkidentität:** nicht recherchieren oder veröffentlichen,
  bevor die Zuordnung geklärt ist.

Ein fester 90-/365-Tage-Aktualisierungsplan ist nicht nötig. Ein vorhandener
Bericht liefert im MVP immer einen Cache-Treffer; die Oberfläche besitzt
keinen erzwungenen Refresh. Künftige service- oder redaktionelle Aktualisierung
kann für sachliche Korrektur, geändertes Quellenrecht oder eine relevante neue
Quellenfassung eine neue unveränderliche Version veröffentlichen.

Die Oberfläche zeigt immer den Stand. Ein Nichtfund ist kein Beweis fehlender
kultureller Relevanz.

## Kostenlimit

Es wird kein willkürliches eigenes Monatsbudget für den Cache eingeführt. Der
MVP verwendet den bestehenden Etappe-5-Unterbau mit globalem Monatsbudget,
Tageslimit, Parallelgrenze, Reservierung und Kostenprotokoll.

Zusätzlich braucht der Bericht nur:

- eine vor dem Start sichtbare maximale Kostenreservierung pro Bericht,
- Einbeziehung möglicher Such- oder API-Kosten,
- höchstens einen bezahlten Auftrag je Werk und identischer Quellenfassung,
- keine automatische bezahlte Wiederholung außerhalb derselben Reservierung,
- Wiederverwendung jedes erfolgreichen Cache-Treffers.

Der feste zusätzliche Task-Deckel beträgt 6 US-Cent pro
`filmwissen-synthese`-Auftrag. Unbekannter Preis oder nicht messbarer
Verbrauch stoppt den bezahlten Auftrag.

Für echte Entwicklungsproben und Evals gelten weiterhin die Budgetregeln aus
`AGENTS.md`; sie bestimmen nicht automatisch das spätere Produktbudget.

## Beleganzeige

Die kompakte Ansicht zeigt beispielsweise:

> **WARUM 3/5 · mittlere Sicherheit**
> Kulturelle Relevanz, Stand 30.07.2026 · belegt durch 3 Quellen

Bei unzureichender Belegung:

> **WARUM noch nicht belegt**
> Es wurde keine ausreichend breite oder eindeutige kulturelle Einordnung
> gefunden.

„Quellen anzeigen“ öffnet:

- Quelle, Titel und Abrufstand,
- direkten Link zur verwendeten offiziellen Fundstelle,
- ein bis drei eigene kurze Kernaussagen pro Quelle,
- sichtbare Nichtfund-, Sperr- oder Konfliktstatus,
- Cache-, Prompt- und Modellversion in den technischen Details.

Das Modell wird nicht als Quelle dargestellt. Originalzitate werden nur
gespeichert oder angezeigt, wenn der Rechteumfang das erlaubt; standardmäßig
werden eigene Paraphrasen verwendet.

## Automatische Veröffentlichung

Der Bericht darf automatisch veröffentlicht werden, wenn:

- die Werkidentität eindeutig ist,
- alle Domains freigegeben sind,
- jede sichtbare Aussage auf eine konkrete Quelle verweist,
- die Mindestbelegung für einen WARUM-Zahlenwert erfüllt ist,
- keine ungelösten Quellenkonflikte bestehen,
- Schema, Textgrenzen, URLs und Kostenmetadaten gültig sind.

Andernfalls bleibt WARUM `null` oder der Bericht wird als nicht veröffentlicht
beendet. Eine allgemeine redaktionelle Prüfung jedes Berichts ist nicht nötig.
Manuelle Prüfung ist nur ein Ausnahmeweg für falsche Zuordnung, Konflikt oder
gemeldete Korrektur.

## Datenschutz und Sicherheit

- Im gemeinsamen Cache stehen keine Konto-ID, Profilsignale, Bewertungen,
  Notizen, Bloginhalte oder Nutzungsverläufe.
- Quell- und Anbieter-Schlüssel bleiben serverseitig.
- Logs enthalten Metadaten und Fehlerklassen, keine vollständigen Artikel.
- Quelltexte gelten als nicht vertrauenswürdige Eingabe. Darin enthaltene
  Anweisungen dürfen Prompt, Rubrik oder Freigabe nicht verändern.
- Clients lesen nur veröffentlichte Cache-Versionen und schreiben nie direkt.

## Abnahmekriterien

### Recherche und Rechte

- Es werden ausschließlich die zwei freigegebenen Adapter und erlaubten
  Zugangswege verwendet.
- Es wird keine Einzelkritik und kein freier Website-Inhalt gelesen.
- Es gibt keinen Archiv-, Sitemap-, Paginierungs- oder Massendownloadpfad.
- IMDb, Rotten Tomatoes und film.at bleiben ohne passende Erlaubnis technisch
  gesperrt.
- Volltexte und nicht erlaubte Auszüge gelangen weder in Cache noch Log.

### Identität und Belege

- Original, Remake und gleichnamige Werke vermischen keine Quellen.
- Jede sichtbare Aussage ist bis zur konkreten URL rückverfolgbar.
- Ein WARUM-Zahlenwert erfüllt die einfache Mindestbelegung.
- Nichtfund oder schwache Abdeckung führt zu `null`, nicht automatisch zu 0.
- Konflikte und Unsicherheit werden sichtbar.

### Cache und Kosten

- Ein Cache-Treffer erzeugt keinen externen oder bezahlten Aufruf.
- Ein normaler Vorbewertungs-Cache-Miss erzeugt ebenfalls keinen
  Rechercheauftrag.
- Nur der ausdrücklich ausgelöste Bericht darf recherchieren.
- Gleichzeitige identische Anforderungen erzeugen höchstens einen bezahlten
  Auftrag.
- Neue Ergebnisse erzeugen eine neue Version und überschreiben die Historie
  nicht.
- Kosten werden vorab reserviert, danach gemessen und angezeigt.
- Unbekannte Kosten stoppen den Auftrag.

### Produktanzeige

- WARUM, Sicherheit, Stand und Quellenanzahl sind sofort verständlich.
- Quellen, Kernaussagen und Links sind mit höchstens einem zusätzlichen Schritt
  erreichbar.
- Das Modell erscheint nicht als Beleg.
- Gemeinsames Filmwissen und persönliche Prognose sind sichtbar und technisch
  getrennt.

### Kleine verbindliche Prüfliste

Sechs Fälle genügen für den MVP:

1. `Alien` mit institutionellem LOC-Einzelbeleg,
2. derselbe Film als kostenfreier Cache-Treffer,
3. Film ohne LOC-Treffer mit ehrlichem `nicht belegt`,
4. Original/Remake oder gleichnamiges Werk mit ID-/Jahr-Abweichung,
5. manipulierte URL, Redirect oder Quellenantwort,
6. Film, dessen Treffer nur von einer gesperrten Quelle käme.

## Bewusst nicht Teil des MVP

- neun getrennte Filmwissens-Tabellen,
- gewichtete Unterrubriken für WARUM,
- tägliche oder jährliche automatische Komplettaktualisierung,
- allgemeiner Admin- und Freigabebereich,
- eigenes komplexes Cache-Monatsbudget,
- Volltextarchiv fremder Kritiken,
- öffentliche Schreibrechte,
- automatische Rückwirkung auf das Geschmacksprofil,
- Änderung von Block 1.

## Umgesetzte Baufolge

1. Quellenrechte und feste Adaptergrenzen dokumentiert.
2. Positivliste und starke Werkkennungen definiert.
3. Versionierten Cache und strikte Lese-/Schreibrechte gebaut.
4. Wikidata- und LOC-Adapter mit konservativer Identitätsprüfung gebaut.
5. WARUM-Skala und Belegklassen serverseitig eingefroren.
6. Kostenreservierung, 5-US-Cent-Deckel und Cache-Wiederverwendung gebaut.
7. Beleganzeige in der aufgeklappten Filmkarte integriert.
8. Belegtes WARUM samt Versions-ID in die persönliche Prognose integriert.

## Später zu entscheiden

- Welche weitere Quelle nach eigener Rechte- und Adapterprüfung folgt.
- Ob veröffentlichte Belege später auch anonym sichtbar werden; im MVP lesen
  nur angemeldete Konten.
- Wie Werke ohne starke erlaubte Fremdkennung redaktionell aufgenommen werden.
- Ob eine spätere Prognoseversion weiterhin Prozent-Passung und Kategorie
  zeigt oder nur ein verständliches Passungsband.
