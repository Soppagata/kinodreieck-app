# Zukunftsplan: Entdecken – Radar, Empfehlungen, Meinungen und Österreich-Charts

Stand: 09.08.2026
Audit-Scope: `FUTURE_PLAN_METADATA_ONLY`
Planungsbaseline: `staging`/`origin/staging` `65a92df`, Produktion `3898152`

> **Status: geplant, nicht implementiert.**
> Dieses Dokument ist der verbindliche Produkt- und Grenzvertrag für die
> spätere Phase „Entdecken“. Es ändert weder Rollen-v1 noch den bestehenden
> Serienstatus, führt keine Provideraufrufe aus und erteilt keine Freigabe für
> Remote-Migrationen oder einen Bau auf `main`.

**Auslieferungsgrenze:** Es ist keine öffentliche Veröffentlichung geplant.
Der vorgesehene Pilot besteht aus Max und höchstens zehn weiteren kuratierten
Logins. Jede Öffnung darüber hinaus ist ein neuer Produkt-, Datenschutz-,
Quellenrechte- und Betriebs-STOP. Die kleine private Runde vermindert die
Exposition, ersetzt aber keine Erlaubnis für automatisierten Quellenzugriff,
Speicherung oder Anzeige.

Bei Widersprüchen zu älteren sichtbaren Namen oder UI-Annahmen in
`RADAR_BEOBACHTUNGEN_PLAN.md` gilt dieses Dokument. Der ältere Plan bleibt für
den aktiven Webradar, dessen Evidenz-, Kosten- und Schedulervertrag maßgeblich.

## 1. Produktentscheidung

Der bisherige Hauptnavigationspunkt `Blog` wird sichtbar zu **Entdecken**. Die
technische Route beziehungsweise ID `blog` bleibt zunächst stabil, damit
Navigation, Startbereich, Suche, Tour, Deep-Links und gespeicherte Einstellungen
nicht unnötig migriert werden.

Innerhalb von Entdecken liegen drei klar beschriftete Ansichten:

1. **Empfehlungen** – private, deterministisch gereihte Kandidaten sowie
   getrennte österreichische Chartlisten,
2. **Radar** – eigene Titel-, Serien-, Franchise- und Personen-Abos, belegte
   Radar-Funde und freiwillig freigegebene Community-Ziele,
3. **Meinungen** – der bestehende private und geteilte Blogbereich.

Die Ansichten teilen eine Oberfläche, aber **keine fachliche Tabelle und keinen
Sammelservice**. Blogs bleiben Blogs, Radar-Abos bleiben Radar-Abos,
`kd_series_watch` bleibt der kostenlose Serienstatus, und Empfehlungen bleiben
eine private Projektion aus vorhandenen Daten.

## 2. Verbindliche Begriffe

| Begriff in der UI | Bedeutung | Kosten-/Privacy-Vertrag |
|---|---|---|
| **Beobachtet** | Ein konkreter Serien-/Titelstatus aus dem bestehenden Streamingkatalog. Neue, ohnehin im allgemeinen Kataloglauf auftauchende Inhalte werden zugeordnet. | immer privat; kein eigener Web-/KI-Aufruf; nie teilbar; zählt nicht gegen das Webradar-Limit |
| **Im Radar** | Ein persönliches Abo auf aktive Suche und belegte Ankündigungen. Titel, Serien und Franchises abonnieren direkt ein Event-Ziel; Schauspiel- und Regiepersonen erscheinen direkt im Radar, laufen intern aber über eine getrennte Discovery-Schicht. | kann Anbieter-/KI-Kosten verursachen; serverseitiges Limit und global deduplizierte Checks; privat als Default; eine Person darf nie automatisch unbegrenzt Werk-Checks öffnen |
| **Im kuratierten Kreis freigegeben** | Ein Radar-Ziel wurde freiwillig ohne Kontonamen für die höchstens zehn anderen kuratierten Logins sichtbar gemacht. | eigene Share-Projektion; keine Autor-, Zeit- oder Subscriberangaben; nicht öffentlich |
| **Empfohlen** | Ein vorhandener Kandidat passt nach nachvollziehbaren, deterministischen Regeln zum bestätigten Profil beziehungsweise zu ausdrücklich bewerteten Mediatheksdaten. | kein LLM- oder Suchaufruf im Ranking; kein Profilwrite |
| **In den Charts** | Ein Titel steht in einer klar benannten, datierten österreichischen Quellenliste. | kein Geschmacks- oder Qualitätsurteil; Quellenrechte müssen vor Ingestion freigegeben sein |

Ältere Texte wie „Beobachte Star Wars“ sind im Produkt für den aktiven Pfad in
„Star Wars ins Radar aufnehmen“ umzubenennen. `Beobachtet` darf niemals als
Synonym für `Im Radar` verwendet werden.

## 3. Informationsarchitektur

### 3.1 Navigation und Einstieg

- sichtbares Hauptmenü: **Entdecken**,
- technischer Key zunächst weiter `blog`,
- Standardansicht: **Empfehlungen**,
- interne Umschaltung: `Empfehlungen | Radar | Meinungen`,
- bestehende Blog-Links öffnen direkt die Ansicht `Meinungen`,
- bestehende Suchtreffer vom Typ `blog` und gespeicherte Startbereiche bleiben
  kompatibel.

### 3.1.1 Globale Suche und eindeutige Aktionen

Die globale Suchleiste wird zum gemeinsamen Einstieg, aber nicht zu einem
generischen Schreibpfad:

- Ein kanonisch aufgelöster, vom vorhandenen Streamingkatalog unterstützter
  Titel beziehungsweise eine Serie kann **Beobachten** und **Ins Radar** als
  zwei getrennte Aktionen anbieten.
- **Beobachten** schreibt ausschließlich in den bestehenden privaten,
  kostenlosen `kd_series_watch`-Pfad.
- **Ins Radar** öffnet immer eine Vorschau und schreibt erst nach bewusster
  Bestätigung in den neuen Radar-Pfad.
- Die Personen-Automatik ist nach dem fehlgeschlagenen Pflichtspike geparkt.
  Bis zu einem neuen Owner-STOP bietet die Suche für Personen keine Radar-Aktion
  an; der spätere Zielvertrag für `Schauspiel` und `Regie` bleibt dokumentiert.
- Mehrdeutige Namen oder Titel schreiben nichts. Die Suche zeigt die
  Kandidaten und verlangt eine eindeutige Auswahl mit stabiler externer ID.

Die beiden Aktionen dürfen nie zu einem kombinierten Status verschmelzen. Ein
Radar-Abo setzt `Beobachtet` nicht, und `Beobachten` startet keine aktive
Recherche.

### 3.2 Empfehlungen

Die Ansicht zeigt nur Blöcke, für die reale Kandidaten und belastbare Metadaten
vorliegen:

- **Neu & passend**,
- **Demnächst im Kino**,
- **Kult & wieder im Kino**,
- **In Österreich in den Charts** – getrennt nach Quelle und Dienst,
- **Davon könnte dir gefallen** – nur die kanonisch aufgelöste, zum Profil
  passende Teilmenge der Charts.

Chartquellen werden nie zu einer erfundenen gemeinsamen Rangliste vermischt.
„Netflix #1“ und „Kino #1“ sind nicht numerisch vergleichbar.

### 3.3 Radar

- **Neue Radar-Funde**: neue beziehungsweise geänderte, für das eigene Konto
  lesbare Ereignisse,
- **Mein Radar**: eigene aktive, pausierte und fehlerhafte Titel-, Serien-,
  Franchise- und Personen-Abos,
- **Von anderen entdeckt**: freiwillig im geschlossenen kuratierten Kreis
  freigegebene Ziele ohne Identitätsinformation.

Eine Person steht nach Bestätigung sofort sichtbar in **Mein Radar**. Intern
bleibt sie ein Discovery-Abo und kein vierter Event-Zieltyp. Neu gefundene
Werke dieser Person erscheinen als einzeln bestätigungspflichtige Kandidaten;
erst **Werk ins Radar** erzeugt ein reguläres Werk-Abo und einen kostenfähigen
Event-Check. Keine Sammelbestätigung und kein stiller Fan-out.

Der Knopf bei einem Community-Ziel heißt **In mein Radar**, nicht „Pin“, weil
Kino-Pins bereits einen anderen Vertrag besitzen. Die Aktion erzeugt ein
eigenes Abo unter dem normalen Limit; sie übernimmt weder die Freigabe noch
private Receipts des ursprünglichen Kontos.

### 3.4 Meinungen

Der heutige Blog bleibt funktional erhalten. Bestehende private Artikel,
Shared-Artikel, Claim-Tokens und Autorenangaben werden nicht in Radar- oder
Empfehlungstabellen verschoben. Die sichtbare Bündelung unter Entdecken ist
ausschließlich Navigation.

## 4. „Entdecken verwalten“

Ein Zahnrad rechts oben im Entdecken-Kopf öffnet:

- auf Desktop einen fokussierten Dialog,
- auf kleinen Viewports ein vollhohes Sheet,
- jeweils mit Fokusfalle, Escape-/Zurück-Verhalten und Rückkehrfokus.

Der Titel lautet **Entdecken verwalten**. Der Dialog ist eine zentrale
Verwaltungsoberfläche, aber kein neuer fachlicher Datentopf:

| Abschnitt | Was verwaltet wird | Autorität |
|---|---|---|
| Beobachtet | ausschließlich private bestehende Serienbeobachtungen; Status beenden oder zum Streamingtitel springen | bestehender `seriesWatchService` / `kd_series_watch` |
| Radar | Titel-/Serien-/Franchise- oder Personen-Abo pausieren, entfernen, Freigabe ein-/ausschalten; Personenkandidaten einzeln übernehmen oder verwerfen | getrennte Event-Radar- und Personen-Discovery-Subscription-/Share-RPCs |
| Empfehlungen | vorhandenes Geschmacksprofil ansehen/ändern; Nutzung bewerteter Mediatheksdaten für das Ranking ein-/ausschalten | `kd:geschmacksprofil`, Mediathek und eine kleine registrierte persönliche Entdecken-Präferenz |
| Meinungen | eigene Entwürfe und bereits geteilte Beiträge öffnen | bestehender Artikel-/Shared-Article-Pfad |

Der Dialog darf weder alle Domänen in ein generisches JSON schreiben noch
Radarlogik in Rollen-v1 oder Shared Blogs verstecken.

## 5. Radar-Freigaben im kuratierten Kreis

### 5.1 Freigabe

Beim Anlegen und später beim Verwalten eines Radar-Abos steht eine standardmäßig
**nicht** gesetzte Checkbox:

> Ohne meinen Namen im kuratierten Kinodreieck-Kreis teilen.

Vor dem Speichern zeigt eine Vorschau exakt die im Kreis sichtbare Projektion. Die
Freigabe ist jederzeit widerrufbar. Das Beenden des eigenen Radar-Abos widerruft
auch dessen Share; bereits von anderen Konten selbst angelegte Abos
bleiben unberührt.

`Beobachtet` besitzt diese Checkbox nie und bleibt ausnahmslos privat.

### 5.2 Daten- und Lesemodell

Vorgeschlagene eigene Tabelle für Event-Ziele:

`kd_radar_target_shares`

- `account_id` – nur server-/RLS-seitig,
- `target_id` – kanonisches globales Radarziel,
- `status = active|revoked`,
- interne Auditzeitpunkte,
- `unique(account_id, target_id)`.

Personenfreigaben liegen fachlich getrennt in
`kd_radar_discovery_shares` oder einer gleichwertigen streng typisierten
Projektion mit `discovery_target_id` und Rolle. Ein polymorphes Freitextziel und
ein gemeinsamer Blog-/Radar-Socialtopf sind verboten. Die Oberfläche darf beide
Feeds zusammenführen; Tabellen, RLS und Schreib-RPCs bleiben getrennt.

Der Browser erhält keinen direkten Tabellen-SELECT. Eine nur für aktive,
kuratierte Konten erreichbare security-definer Feed-RPC darf für aktive Shares
nur liefern:

- kanonische Zielkennung,
- sichtbarer Titel,
- Zieltyp,
- Veröffentlichungsjahr, sofern sicher,
- zulässiges Artwork nur aus einer separat erlaubten Katalogquelle,
- optional das neueste bereits global freigegebene Radarereignis.

Nicht geliefert werden Account-ID, Autorname, Share-ID, Freigabezeit,
Subscriberzahl, private Notiz, Suchquery, Receipt oder persönliche Statusdaten.
Die UI verspricht deshalb „ohne Namen“, nicht mathematisch garantierte
Anonymität. Gerade bei insgesamt nur elf Konten kann Vorwissen eine Zuordnung
trotzdem nahelegen; Freigaben erscheinen daher ohne Zeitstempel und werden in
einem normalen Feed-Refresh gebündelt. Der Feed ist weder öffentlich erreichbar
noch indexierbar.

### 5.3 Deduplizierung

Teilen löst keinen zweiten externen Check aus. Alle Konten zeigen auf dasselbe
globale Ziel. Der Scheduler prüft weiterhin genau den fälligen globalen
`check_key`; Shares ändern nur die Sichtbarkeit im kuratierten Kreis.

## 6. Deterministische Empfehlungen

### 6.1 Eingaben

Zulässige private Rankingquellen sind:

1. bestätigte Signale, Filme, Richtungen und Achsen aus
   `kd:geschmacksprofil`,
2. ausdrücklich bewertete Film-/Serieneinträge der eigenen Mediathek,
3. als schwacher Franchise-Hinweis mindestens drei kanonisch derselben Reihe
   zugeordnete Mediathekstitel, sofern die Mediatheksnutzung aktiviert ist.

Nicht als Geschmackssignal verwendet werden:

- `Beobachtet`,
- eigene oder fremde Radar-Abos,
- Radar-Freigaben oder Subscriberzahlen,
- bloße Klicks, Öffnungen, Ausblendungen oder Blogtexte,
- nationale Chartpositionen,
- unbewerteter Einzelbesitz.

Mediatheksdaten werden für jede Ausgabe read-only projiziert. Es erfolgt kein
stiller Write in das Geschmacksprofil. Der Nutzer kann die Mediatheksprojektion
im Verwaltungsdialog deaktivieren; das Profil bleibt davon unverändert.

### 6.2 Positive Mediatheksevidenz

Ein bewerteter Titel zählt als positiver Genre-/Franchisebeleg, wenn alle drei
Achsen als ganze Zahlen vorliegen und ihre Summe mindestens `10/15` beträgt.
Einträge mit `bewertung: null` oder unvollständigen Achsen tragen kein
Genresignal. Eine bloße Franchise-Sammlung aus mindestens drei eindeutig
zugeordneten Werken ist nur der letzte inhaltliche Gleichstandsbrecher und wird
sichtbar als „mehrere Titel dieser Reihe in deiner Mediathek“ erklärt.

### 6.3 Reihenfolge statt undurchsichtiger Mischscore

Das MVP verwendet eine lexikografische, testbare Reihenfolge:

1. Kandidat erfüllt Region, Datum und Verfügbarkeit,
2. bereits in der Mediathek vorhandene identische Werke werden entfernt,
3. bestätigte negative Profilsignale blockieren beziehungsweise senken,
4. bestätigte positive Profilsignale ordnen,
5. positive bewertete Genre-/Franchisebelege ordnen,
6. schwache Sammlungsdichte derselben kanonischen Reihe löst Gleichstand,
7. Frische löst den nächsten Gleichstand,
8. Quellenrang darf nur innerhalb derselben Chartquelle der letzte
   Gleichstandsbrecher sein.

Kein LLM formuliert oder verändert die Reihenfolge. Die Karte nennt höchstens
drei reale Gründe, zum Beispiel „Profil: Body Horror“, „zwei positiv bewertete
Alien-Filme“ und „Netflix Österreich, Rang 4“. Ohne belastbaren Grund erscheint
der Titel nur in der unpersonalisierten Quellenliste.

## 7. Vertrag für „neu“, Remakes und Kultvorstellungen

### 7.1 Zeitfenster und Labels

`Neu & passend` akzeptiert für den ersten Staging-Pilot:

- Streaming-Verfügbarkeit in Österreich ab heute bis höchstens 90 Tage in die
  Zukunft,
- Titel, die innerhalb der letzten sieben Tage erstmals in der verfügbaren
  Katalogquelle als verfügbar begonnen haben, sichtbar als **Seit kurzem
  verfügbar**,
- österreichischen Kinostart ab heute bis höchstens 90 Tage in die Zukunft,
- nur taggenaue oder vom Kartenlayout ausdrücklich als grober Zeitraum
  gekennzeichnete Daten.

Ein älteres Werk, das neu auf einem Dienst erscheint, heißt **Neu auf
<Dienst>**, niemals „neuer Film“. Das Chartdatum, Artikel- oder Indexdatum ist
kein Veröffentlichungsdatum.

### 7.2 Remakes

Ein Remake ist ein eigenes kanonisches Werk mit eigener ID und eigenem Jahr.
Die Karte zeigt **Remake von <Werk> (<Jahr>)** nur bei einer starken
strukturierten Beziehung `remake_of` oder manueller belegter Kuration. Gleicher
Titel, Franchise-Nähe oder eine LLM-Vermutung genügt nie. Bei Mehrdeutigkeit
bleibt das Relationslabel weg.

### 7.3 Kult und Wiederaufführung

Kult-, Retro-, Festival- und Repertoirevorstellungen sind sinnvoll, aber kein
„neuer Inhalt“. Sie erscheinen ausschließlich im getrennten Block
**Kult & wieder im Kino**, wenn:

- eine reale österreichische Vorstellung ab heute im vorhandenen
  Kinoprogramm belegt ist,
- das Werk kanonisch aufgelöst ist,
- mindestens ein transparenter Profil-/Mediatheksgrund passt.

Ohne Passung bleibt eine solche Vorstellung im normalen Kinoprogramm. Ein
Remake und die Wiederaufführung des Originals dürfen gleichzeitig erscheinen,
aber mit verschiedenen IDs, Jahren und Labels.

## 8. „In Österreich in den Charts“

### 8.1 Produktvertrag

Der Sammelblock ist eine Hülle für getrennte, präzise benannte Quellenlisten:

- **Auf Netflix in Österreich in den Top 10**,
- **Auf Prime Video in Österreich in den Charts**,
- **Auf Disney+ in Österreich in den Charts**,
- **Im österreichischen Kino beliebt – Top 15 des letzten Wochenendes**.

Es wird nicht behauptet, dass ein Dienstchart den allgemeinen Geschmack
Österreichs, Marktanteil, Zuschauerzahl oder Qualität abbildet. Jede Karte
zeigt Quelle, Dienst, Region, Rang und Zeitraum.

### 8.2 Quellenentscheid vom 09.08.2026

| Quelle | Fachlich | Automatisierung heute | Kosten/Account | Entscheidung |
|---|---|---|---|---|
| [FlixPatrol API v2](https://flixpatrol.com/api2/) | dienstspezifische Plattform-Top-10 für Österreich; aktuell Netflix Film/TV, Prime Overall/Film/TV und Disney+ Overall; Ranglisten, keine Sehminuten oder Zuschauerzahlen | strukturierte API und starke IMDb-/TMDB-IDs; öffentliche [Terms](https://flixpatrol.com/about/terms-and-conditions/) belegen Cache- und Dritt-App-Anzeigerecht aber nicht eindeutig | [Start](https://flixpatrol.com/about/pricing/) derzeit 9,99 USD/Monat plus Steuer, 1.000 Calls | **einzige bevorzugte neue Streamingquelle**, aber `BLOCKED` bis schriftliches Speicher-/Anzeigerecht, Owner-Kauf und Kostenfreigabe |
| [Watchmode](https://api.watchmode.com/) | bestehender starker Kontrollbeleg für Titelidentität und Dienstverfügbarkeit in `AT`; eigene Popularity ist keine österreichische Rangmessung | Nicht-Bild-Daten dürfen laut [Terms §3](https://api.watchmode.com/tc) in der eigenen App verwendet und höchstens 30 Tage gecacht werden; Attribution nötig; Bilder nicht mitlizenziert | vorhandener nichtkommerzieller Developer-Plan, 2.500 Requests/Monat, bis drei Länder | kein neuer Anbieter; nur Identitäts-/Verfügbarkeitskontrolle, nie Rangquelle; Terms in Phase 0 gegen das lokale Quellenregister neu belegen |
| [Netflix Top-10-Länder-TSV](https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv) | offizieller kostenloser Wochenbeleg für Netflix Film/TV; keine stabilen IDs oder AT-Abrufzahlen | [Nutzungsbedingungen §1.8](https://help.netflix.com/legal/termsofuse) untersagen automatisierten Zugriff, Extraktion und Weiterveröffentlichung ohne Erlaubnis | kostenlos, kein Account | kein Produktionsadapter; nur manuelle QA beziehungsweise später mit schriftlicher Freigabe |
| [JustWatch Content Partner API](https://apis.justwatch.com/docs/api/) | `de_AT`, starke IDs, Verfügbarkeit und tägliche/wöchentliche/monatliche Ränge; misst jedoch Aktivitäten der JustWatch-Nutzer, nicht Dienst-Top-10 oder tatsächliche Views | Vertrag und Attribution nötig; Dashboard-Scraping verboten | Preis nicht öffentlich | exklusiver Fallback, falls FlixPatrol ausscheidet und ein Angebot in den Kostenzaun passt; dann ehrlich „Bei JustWatch in Österreich gefragt“, nie parallel im MVP |
| [Österreichisches Filminstitut / Comscore-Wochenendcharts](https://filminstitut.at/charts) | marktweite österreichische Kino-Top-15 mit Besuchszahlen; ÖFI bezieht die Werte bereits von Comscore | kein dokumentierter Live-Feed; [Nutzungshinweis](https://filminstitut.at/impressum) verlangt für andere Nutzung Einverständnis, Comscore-Unterlizenz unklar | Ziel: schriftlich erlaubte Datei/Feed zu 0 Euro | bevorzugte Kinoquelle; automatischer Abruf `BLOCKED` bis ÖFI-Freigabe einschließlich Comscore-Rechten |
| [Comscore Global Box Office](https://www.comscore.com/Products/Movies/Global-Box-Office-Reporting) | professionelle Primärmessung und möglicher Datenfeed | Dritt-App-/Anzeige-/Automationsrechte nur per ausdrücklicher Service-Order; Preis nicht öffentlich | vermutlich professioneller Individualvertrag | nicht Teil des Elf-Konten-MVP; nur Fallback-Angebot, falls ÖFI keine Rechte erteilen kann und es in den engen Zaun passt |

Robots-Erlaubnis, öffentliche Sichtbarkeit, ein Downloadknopf, nur elf Logins
oder ein Login-Gate
ersetzen keine Nutzungs- und Weiterveröffentlichungsrechte. Bis zur Freigabe
kann Entdecken lediglich auf die offiziellen Seiten verlinken; es darf keine
kopierten Ränge als eigenen Feed ausgeben.

Die Planung darf einen IP-/Rate-Block nicht als garantierten schlimmsten Fall
behandeln. Je nach Quelle und Zugangsweg kommen technisch oder rechtlich auch
Account-/API-Key-Sperre, Lösch- beziehungsweise Unterlassungsaufforderung sowie
vertragliche oder urheberrechtliche Ansprüche in Betracht. Der private,
nichtöffentliche Elf-Konten-Rahmen dürfte die praktische Exposition vermindern,
ändert aber die Quellenbedingungen nicht. Dies ist eine konservative
Produktgrenze, keine Rechtsberatung.

### 8.3 Bewusst kleine Quellenarchitektur

Für den Pilot gilt **höchstens eine neue bezahlte Chartquelle insgesamt**:

1. **Streaming:** FlixPatrol Start ist der bevorzugte Kandidat. Ein wöchentlicher
   Lauf übernimmt nur die explizit unterstützten österreichischen Dienstcharts
   und benötigt höchstens 25 FlixPatrol-Requests pro Monat. Plus, Premium und
   Enterprise sind ausgeschlossen.
2. **Kino:** Das ÖFI wird um schriftliche Nutzungserlaubnis und möglichst eine
   wöchentliche offizielle Datei gebeten. Zielkosten sind 0 Euro. Ein direkter
   Comscore-Vertrag wird im MVP nicht zusätzlich zu FlixPatrol betrieben.
3. **Kontrolle:** Watchmode und das vorhandene Kinoprogramm werden
   wiederverwendet. Sie bestätigen Identität, Region, Dienstverfügbarkeit,
   Kinostart und Spielbarkeit, aber **nicht** den Popularitätsrang.
4. **Fallback:** JustWatch darf FlixPatrol nur ersetzen, nicht ergänzen. Dann
   muss die Oberfläche die JustWatch-Nutzeraktivität source-genau benennen.

Der FlixPatrol-Chartdeckel beträgt höchstens **15 Euro pro Monat einschließlich
Steuer und konservativem Wechselkurspuffer** und liegt innerhalb des bereits
beschlossenen providerübergreifenden Zielkorridors von ungefähr 20 Euro. Vor
Kauf muss der exakte technische US-Cent-Deckel feststehen. Reicht der
Gesamtdeckel neben Radar/KI nicht aus, bleiben die Streamingcharts aus; der
Gesamtdeckel wird nicht still erhöht. Unbekannter Preis, unklare Quota oder
fehlendes schriftliches Nutzungsrecht bedeutet STOP.

### 8.4 Gegenabgleich und Qualitätsgate

„Gegenabgleich“ bedeutet im MVP keinen zweiten bezahlten Rankingsanbieter und
keine erfundene Konsensrangliste:

- jeder angezeigte Streamingtitel benötigt eine starke IMDb-, TMDB- oder
  bereits bestätigte Watchmode-ID sowie belegte `AT`-Verfügbarkeit beim
  genannten Dienst,
- jeder Kinotitel wird gegen den kanonischen Katalog, Kinostart und das
  vorhandene österreichische Programm geprüft; Vorstellungszahl ist nur ein
  Plausibilitätssignal,
- Region, Dienst, Chartart, Zeitraum und Abrufstand müssen exakt zur sichtbaren
  Quellenbeschriftung passen,
- mehrdeutige, widersprüchliche oder nicht auflösbare Items werden im MVP gar
  nicht angezeigt und nie fuzzy automatisch verbunden,
- der letzte vollständig bestätigte Streamingstand darf höchstens acht Tage
  klar datiert sichtbar bleiben; danach wird der betroffene Block ausgeblendet,
- vier Wochen Shadow-Betrieb vergleichen wöchentlich eine kleine, gleich
  datierte Stichprobe manuell mit den offiziellen Plattformansichten. Danach
  bleibt eine monatliche Stichprobe von höchstens zehn Positionen. Diese QA
  ist kein zweiter Produktionsfeed und speichert keine kopierten Rohlisten.

Das Abnahmegate ist: null falsche Titelverbindungen, null unbeschriftete
Quellen-/Zeiträume und keine personalisierte Karte ohne bestätigte
AT-Verfügbarkeit. Abweichende Ränge verschiedener Messmethoden werden erklärt,
nicht gemittelt.

### 8.5 Tavily

Für Chart-Ingestion und Empfehlungsranking wird **kein Tavily-Account**
benötigt. Beide Pfade sind deterministisch. Tavily bleibt ausschließlich eine
mögliche spätere Quelle des aktiven Webradars und wegen der bereits
dokumentierten Speicher-/Weiterverwendungsfragen bis zu einem eigenen
Provider-, Rechte- und Kosten-STOP geparkt.

## 9. Popularitäts-Datenmodell

Popularity ist ein globaler Katalogpfad, kein Radar- und kein persönlicher
Datentopf:

### `kd_popularity_sources`

- Quelle, Region, Dienst und Charttyp,
- Rollenart `primary_rank|identity_control|availability_control`,
- Betriebsart `fixture|manual_link|api|download`,
- Rechte-/Attributionsstatus und Prüfdatum,
- monatlicher Request- und Kosten-Unterdeckel nullable,
- aktive Adapterversion,
- Feature-/Source-Not-Aus.

### `kd_popularity_runs`

- `source_id`, Zeitraum, Abrufzeit, Adapterversion,
- Status, Schema-/Payloadhash, Itemzahl und stabiler Fehlercode,
- `expires_at` und runweiter manueller Stichprobenstatus,
- keine Account-ID und keine Suchinteressen,
- Rohpayload nur flüchtig und nur soweit die späteren Rechte dies erlauben.

### `kd_popularity_items`

- Quelllauf, Region, Dienst, Charttyp und Rang,
- erlaubter Roh-/Anzeigetitel,
- starke externe IDs, soweit vorhanden,
- `canonical_target_id` nullable,
- `match_status = matched|unmatched|ambiguous|blocked`,
- Matchbasis und Provenienz,
- Identitäts-/Verfügbarkeitskontrollquelle, Status und Prüfzeitpunkt,
- `period_start`, `period_end`, `observed_at`.

Einzigartigkeit mindestens über
`source + region + service + chart_kind + period_end + rank`. Eine persönliche
Empfehlung wird nicht gespeichert; der Client beziehungsweise eine reine
Projektion berechnet sie aus dem aktuellen privaten Profil und der globalen
Kandidatenliste.

## 10. Ingestion und Matching

Nach Quellenfreigabe läuft höchstens einmal wöchentlich ein source-spezifischer
Abruf, bevorzugt Mittwochmorgen `Europe/Vienna`. Ein Lauf übernimmt nur einen
neuen vollständigen Zeitraum. Unveränderter Zeitraum/Hash ist ein erfolgreicher
No-op.

Jeder Adapter muss vor echtem Bau einen isolierten Payload-Spike bestehen:

- echte Response/Datei flüchtig erfassen,
- dokumentierte Felder gegen echte Felder vergleichen,
- Schema und Content-Type hart validieren,
- Rate-/Quota-/Last-Modified-Verhalten messen,
- erlaubte Speicherung und Attribution bestätigen,
- keine Retries und kein LLM als Quelle, Matcher oder fachliche Autorität.

### 10.1 Optionale Codex-/Claude-Einlesehilfe

Für den privaten Pilot darf eine ein- bis zweimal wöchentlich von Max gestartete
Codex- oder Claude-Routine das **Normalisieren** einer bereits erlaubten Datei
oder eines ausdrücklich erlaubten Abrufs unterstützen. Sie ist kein
Produktprovider und kein Ersatz für Quellenrechte:

1. erlaubte Quelle beziehungsweise manuell bereitgestellte Datei erfassen,
2. LLM erzeugt ausschließlich eine begrenzte `proposal.json` mit
   Quellenbeleg,
3. deterministischer Validator prüft Schema, IDs, Region, Zeitraum, Rang und
   Duplikate,
4. bestehender Watchmode-/Kinoprogramm-Gegencheck läuft unabhängig,
5. ausschließlich ein fixer Importer schreibt nach Vorschau in die
   Staging-Datenbank.

Das LLM erhält weder Service-Role-Key noch direkten Datenbankzugriff, darf keine
gesperrte Webseite autonom scrapen und darf bei unklarer Lizenz, unklarem
Payload, Timeout oder Kostenstand nichts schreiben. Für Zuverlässigkeit und
Wiederanlauf gelten Eingabe-Hash, idempotente Import-ID, Fehlmengen-Resume und
kein automatischer Vollretry. Fällt die Routine aus, bleiben die letzten
bestätigten Daten sichtbar datiert oder der Quellenblock wird ausgeblendet;
Radar und Empfehlungen laufen weiter.

Matching-Reihenfolge:

1. identische erlaubte externe ID,
2. mehrere starke IDs in Übereinstimmung,
3. exakt normalisierter Titel plus Jahr/Typ/Staffel nur bei eindeutigem
   Kandidaten,
4. sonst `unmatched` oder `ambiguous`; kein fuzzy Auto-Match.

Nur `matched`-Items dürfen überhaupt sichtbar werden; Streamingitems benötigen
zusätzlich die bestätigte `AT`-Verfügbarkeit beim genannten Dienst. Ein
unaufgelöstes, mehrdeutiges oder widersprüchliches Item bleibt ausschließlich
im internen Prüfstatus und besitzt weder Quellenkarte noch personalisierten
Fit-Grund.

## 11. Datenschutz, Kosten und Not-Aus

- Kreis-Feed nur für Max und höchstens zehn weitere aktive kuratierte Konten;
  kein öffentlicher Zugriff und keine Indexierung.
- Empfehlungen verlassen das Gerät beziehungsweise den vorhandenen privaten
  Datenpfad nicht, solange kein separat freigegebener Serververtrag nötig ist.
- Popularity-Tabellen enthalten keine Account- oder Profildaten.
- Radarfreigaben sind private Opt-ins mit getrenntem Lösch-/Widerrufsweg.
- Keine Rankingtelemetrie und kein stilles Lernen aus Klicks.
- ÖFI verursacht erst nach Rechtefreigabe nur deterministische Transferkosten;
  FlixPatrol erhält zusätzlich den 15-Euro-Unterdeckel, maximal 25 Requests pro
  Monat, Vor-/Nach-Quotaabgleich und Source-Not-Aus. Es gibt keinen zweiten
  bezahlten Chartprovider im MVP.
- Keine bezahlte Quelle, Such-API oder KI wird ohne exakten Owner-Kosten-STOP
  aktiviert.
- Persönliche Codex-/Claude-Abos gelten weder als SLA noch als Freigabe für
  unbeaufsichtigte Automatisierung; unbekannte Account-/Providerkosten stoppen
  den Lauf vor dem ersten potenziell zahlenden Schritt.
- Ein Ausfall der Charts stoppt nur den betroffenen Quellenadapter, niemals
  Radar, Blog, Mediathek oder vorhandenes Kinoprogramm.

## 12. Baufolge und STOPs

1. **Phase 0 – read-only Re-Audit:** Baseline, Route, Blogvertrag,
   `kd_series_watch`, Profil/Mediathek, Rollen/RLS, Remote-Schema, Scheduler und
   Quellenbedingungen neu belegen. **STOP.**
2. **Verträge und Fixtures:** reine Typen/Validatoren, Empfehlungsranking,
   Share-Projektion und synthetische Popularity-Fixtures. Keine
   Remote-Writes, keine echten Quellen. **STOP.**
3. **Lokaler Entdecken-Kern:** Route/Navigation, Verwaltungsdialog,
   Empfehlungen und Radar-UI hinter Flags; Blogs bleiben getrennt. **STOP.**
4. **Lokale/Remote Radar-Grundlage:** additive Tabellen/RPCs inklusive
   Shares, weiter Provider aus. Eigener Remote-STOP vor Migration.
5. **Radar-Shadow und Staging:** ausschließlich nach den Gates des Radarplans
   und eigener Kostenfreigabe.
6. **Popularity je Quelle:** erst nach schriftlicher Quellenfreigabe,
   Payload-Spike, eigenem Adapterreview und gegebenenfalls Kostenfreigabe. Eine
   blockierte Quelle hält die anderen Phasen nicht auf.
7. **Staging-Abnahme:** echte mobile Ansichten, Konten A/B, Privacy-, Quota-,
   Ranking-, Blogregressions- und Rückwegbeleg. Kein `main`.

## 13. Definition of Done der Planung

Die Planungsphase ist abgeschlossen, wenn:

- `Beobachtet`, `Im Radar`, `im kuratierten Kreis freigegeben`, `Empfohlen`
  und `In den Charts` getrennte Verträge besitzen,
- Entdecken als UI-Hülle ohne Backendvermischung festgelegt ist,
- Kreis-Freigabe private-default, widerrufbar und identity-hidden ist,
- die globale Suche `Beobachten` und `Ins Radar` technisch getrennt anbietet
  und Personen aus Schauspiel/Regie direkt als Personen-Discovery-Abo in
  **Mein Radar** aufnehmen kann,
- kein Personen-Abo selbst Eventversionen erzeugt oder ohne Einzelbestätigung
  abgeleitete Werk-Abos und Kostenpfade aktiviert,
- Empfehlungen deterministisch, erklärbar und ohne Profilwrite definiert sind,
- „neu“, ältere Neuverfügbarkeit, Remake und Kultvorstellung unterschiedliche
  Labels und Gates besitzen,
- Chartquellen source-genau bewertet und rechtlich blockierte Automatisierung
  nicht als gebaut oder freigegeben dargestellt wird,
- höchstens eine neue bezahlte Chartquelle, der 15-Euro-Unterdeckel und der
  vorhandene Identitäts-/Verfügbarkeitsgegencheck festgelegt sind,
- Radar und Empfehlungen unabhängig von einer Chartquellenfreigabe baubar
  bleiben,
- der separate Bauauftrag Phase-0-, Remote-, Provider-, Rechte-, Kosten- und
  Staging-STOPs enthält.

Die spätere Funktion selbst ist erst fertig, wenn der freigegebene Kern separat
gebaut, vollständig getestet und auf `staging` praktisch abgenommen wurde.
