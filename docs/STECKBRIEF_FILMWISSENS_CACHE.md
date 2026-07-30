# Produkt-Steckbrief: Gemeinsamer Filmwissens-Cache

Etappe 8, Block 2

Stand: 30.07.2026

Status: vereinfachte Produkt- und Planungsgrundlage, keine Implementierung

Diese Fassung ersetzt den ausführlicheren Erstentwurf vom 29.07.2026. Sie
beschreibt nur, was für einen belastbaren MVP tatsächlich nötig ist.

## Kurzentscheidung

Kinodreieck recherchiert für einen ausdrücklich ausgelösten
Auto-Bewertungsbericht gezielt einzelne Kritiken zu genau einem Film. Die
Recherche läuft nur auf einer kleinen Positivliste freigegebener Websites. Sie
liest keine vollständigen Websites, Archive, Sitemaps oder Kritikbestände aus.

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

Eine spätere Übergabe belegter Filmwissenssignale an die persönliche Prognose
braucht eine eigene Abnahme.

## Wie die Vorbewertung heute arbeitet

Der aktuelle Task verwendet Claude Sonnet, nicht GPT. Sonnet erhält:

- Titel, Originaltitel, Jahr, Typ, Genres und Tags,
- die Profilachsen,
- höchstens 20 bestätigte Geschmackssignale mit Richtung, Stärke und
  Sicherheit.

Sonnet schlägt WIE, WAS, persönliche Passung, Kategorie, Sicherheit und eine
Kurzbegründung vor. Es gibt keine mathematische Bewertungsformel. Der Server
prüft Wertebereiche, Format und verwendete Signal-IDs und begrenzt die
Sicherheit. WARUM wird technisch auf `null` erzwungen.

Diese freie Modellbeurteilung ist für eine persönliche Prognose grundsätzlich
ausreichend. Für WARUM braucht es dagegen recherchierte Belege und eine kurze,
gemeinsame Skalenbedeutung.

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
- gefundene Einzelkritiken und institutionelle Belege,
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

1. Der Film wird anhand von Titel, Originaltitel, Jahr, Typ und – falls
   vorhanden – Regie oder starker Fremdkennung aufgelöst.
2. Pro freigegebener Website wird gezielt nach diesem Werk gesucht.
3. Höchstens zwei Kandidatenseiten je Website werden auf die richtige
   Werkidentität geprüft.
4. Pro Website wird höchstens eine eindeutig passende Einzelkritik inhaltlich
   gelesen; eine zweite nur zur Klärung einer Mehrdeutigkeit.
5. Gespeichert werden URL, Website, Autor, Datum, eigene kurze Paraphrasen und
   die belegten Kernaussagen – nicht der vollständige Artikel.
6. Nicht gefunden, gesperrt, paywallgeschützt oder mehrdeutig wird ehrlich als
   Status gespeichert. Es gibt keinen Ausweich-Crawl.
7. Ein erfolgreicher Bericht wird gemeinsam gecacht und bei späteren
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

### Empfohlene erste Positivliste

| Quelle | Rolle | MVP-Status |
|---|---|---|
| The Guardian Open Platform | englische Filmkritiken über ein offizielles Content-API | technisch bevorzugt; nichtkommerzielle Nutzung und kommerziellen/abgeleiteten Einsatz vertraglich passend wählen |
| Filmdienst | große deutschsprachige Kritik- und Filmwissensbasis | Partnerschaft anfragen; RSS darf Inhalte entdecken, erlaubt aber keine automatische Wiederveröffentlichung ohne Absprache |
| epd Film | professionelle deutschsprachige Kritiken | schriftlichen begrenzten Such-, Lese-, Paraphrase- und Cache-Zugang anfragen |
| critic.de | cinephile, formbezogene und festivalnahe Kritik | schriftlichen kleinen Pilotzugang anfragen |
| BFI / Sight & Sound | Filmgeschichte und kulturelle Einordnung | nur mit passender schriftlicher Erlaubnis beziehungsweise Lizenz |

Ergänzende Belegquellen:

- Library of Congress, National Film Registry, für ausdrücklich kulturell oder
  historisch bedeutsame US-Filme und Filmessays,
- Wikimedia-APIs für Werkidentität und Kontext unter Beachtung der jeweiligen
  freien Lizenz und Attribution.

Die Positivliste startet mit höchstens drei bis fünf Kritikquellen. Eine Quelle
wird erst aktiviert, wenn Zugangsweg, Abruffrequenz, erlaubte Speicherung,
Paraphrase, Quellenanzeige und Attribution dokumentiert sind.

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

Für den MVP reichen zwei neue gemeinsame Datenbereiche. Das bestehende
`kd_ai_log` bleibt für Kosten- und Vorgangsmetadaten zuständig.

### 1. Quellen-Positivliste

Sie kann zunächst als kontrollierte Serverkonfiguration oder kleine Tabelle
geführt werden:

```text
quelle
domain
zugangsart
status
erlaubte_nutzung
attribution
abruflimit
rechte_geprueft_am
```

Status: `kandidat`, `freigegeben`, `pausiert` oder `gesperrt`.

### 2. Versionierter Filmwissens-Cache

Eine unveränderliche Fassung pro Werk und Version:

```json
{
  "format": "filmwissen-cache-v1",
  "werkKey": "interne-stabile-kennung",
  "identitaet": {
    "titel": "…",
    "originaltitel": "…",
    "jahr": 2026,
    "typ": "film"
  },
  "version": 1,
  "stand": "ISO-8601",
  "status": "veroeffentlicht",
  "quellen": [
    {
      "anbieter": "…",
      "url": "https://…",
      "titel": "…",
      "autor": "…",
      "publiziert": "ISO-Datum oder null",
      "abgerufen": "ISO-8601",
      "status": "verwendet",
      "kernaussagen": ["Kurze eigene Paraphrase."]
    }
  ],
  "warum": {
    "wert": 3,
    "sicherheit": "mittel",
    "begruendung": "Kurze belegte Synthese."
  },
  "verarbeitung": {
    "promptVersion": "v1",
    "modell": "…",
    "kostenUsdCent": 0
  }
}
```

Quellen, Aussagen, WARUM, Bericht und Versionsmetadaten müssen im MVP keine
eigenen Tabellen bilden. Sie bleiben als begrenztes, streng geprüftes JSON
zusammen. Eine neue Recherche erzeugt eine neue unveränderliche Version; ältere
Versionen bleiben für historische Prognosen referenzierbar.

Die stabile Werkkennung darf nicht allein aus einem frei geschriebenen Titel
bestehen. Starke erlaubte Fremdkennungen werden bevorzugt; andernfalls wird
eine kontrollierte interne Kennung aus geprüfter Werkidentität verwendet.

## Cache-Verhalten

- **Cache-Treffer:** vorhandene veröffentlichte Version verwenden; kein
  Quellen- oder KI-Aufruf.
- **Cache-Miss bei normaler Vorbewertung:** keine Recherche; eine persönliche
  Sonnet-Schätzung von WARUM bleibt erlaubt und getrennt gekennzeichnet.
- **Ausdrücklich ausgelöster Auto-Bewertungsbericht:** Positivliste und
  Kostenmaximum anzeigen, danach gezielte Recherche starten.
- **Gleichzeitige identische Aufträge:** auf einen laufenden Auftrag
  zusammenführen.
- **Teilfehler:** keine halbe neue Version veröffentlichen.
- **Mehrdeutige Werkidentität:** nicht recherchieren oder veröffentlichen,
  bevor die Zuordnung geklärt ist.

Ein fester 90-/365-Tage-Aktualisierungsplan ist nicht nötig. Aktualisiert wird:

- auf ausdrücklichen neuen Bericht,
- nach einer gemeldeten sachlichen Korrektur,
- bei geändertem oder widerrufenem Quellenrecht,
- wenn eine Quelle eine relevante neue Fassung meldet.

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

Der konkrete Höchstbetrag pro Bericht wird erst nach Mock-Messung von
Eingabegröße und Antwortbudget festgelegt. Unbekannter Preis oder nicht
messbarer Verbrauch stoppt den bezahlten Auftrag.

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

- Website, Titel, Autor und Datum,
- direkten Link zur Einzelkritik,
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

- Es werden ausschließlich freigegebene Domains und erlaubte Zugangswege
  verwendet.
- Pro Website wird nur eine eindeutig passende Einzelkritik gelesen.
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

1. gut dokumentierter Klassiker,
2. aktueller Film mit mehreren Kritiken,
3. wenig dokumentierter Film mit ehrlichem `null`,
4. Original und Remake mit ähnlichem Titel,
5. widersprüchliche Kritiken,
6. Film, dessen Treffer nur von einer gesperrten Quelle kämen.

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

## Spätere Baufolge

1. Drei bis fünf konkrete Quellen und deren Rechte festziehen.
2. Quellen-Positivliste und stabile Werkkennung definieren.
3. Versioniertes Cache-JSON und strikte Prüfung festlegen.
4. Gezielte Einzelkritik-Recherche für eine Quelle als Pilot planen.
5. Einfache WARUM-Skala und sechs Prüffälle abnehmen.
6. Kostenreservierung und Wiederverwendung planen.
7. Beleganzeige planen.
8. Erst danach eine eigene Integration in die persönliche Vorbewertung
   beschließen.

## Noch zu entscheiden

- Welche drei bis fünf Websites bilden die erste Positivliste?
- Welche Quelle bekommt den ersten technischen und rechtlichen Pilot?
- Sind veröffentlichte Belege öffentlich oder zunächst nur für angemeldete
  Beta-Konten sichtbar?
- Wie wird die interne Werkkennung gebildet, wenn keine starke erlaubte
  Fremdkennung vorhanden ist?
- Welches Kostenmaximum pro Bericht ergibt die Mock-Messung?
- Soll eine spätere Prognoseversion weiterhin sowohl Prozent-Passung als auch
  Kategorie zeigen, oder reicht ein verständliches Passungsband? Diese Frage
  ändert Block 1 jetzt nicht.
