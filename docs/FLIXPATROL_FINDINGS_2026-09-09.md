# FlixPatrol: Einsatzstellen und Datenvertrag

Stand: 9. September 2026. Auftrag von Max: zuerst alle sinnvollen Einsatzstellen
einschliesslich KI untersuchen; nichts persoenliches ueberschreiben und keine
redundanten Datenbestaende aufbauen. 1000 API-Requests pro Monat mitzaehlen,
kein eigenes Freigabe-/Budgetgate und kein Frontend-Ticker. Der Hintergrundzaehler
wird bereits gebaut; die folgende Produktueberarbeitung ist eine Findings-Liste.

Codebasis der Inventur: integrierter Reparaturzweig nach `f086ef5`, zusaetzlich
die fertige Entdecken-/Radar-Trennung. Die untersuchten fachlichen KI-, Katalog-
und Suchpfade sind gegen main/staging abgeglichen. Die aktuelle Lieferung
enthaelt den Ticker; dies ist noch kein Nachweis eines laufenden
Fuenf-Quellen-Feeds. Die offenen Betriebsreparaturen bleiben im gemeinsamen
`BETRIEBSREPARATUR_REGISTER_2026-09-09.md` sichtbar.

## Was die API belegt und was noch offen ist

| Daten | Belegter Vertrag | Grenze |
| --- | --- | --- |
| Charts | `top10s`: Titelbezug, Anbieter, Land, Kategorie, Chartdatum, Rang; `rankings` fuer aggregierte Zeitraeume. [Top10s](https://flixpatrol.com/api2/endpoint-top10s/), [Rankings](https://flixpatrol.com/api2/endpoint-rankings/) | Oesterreich explizit filtern und in der Antwort pruefen. Rang ist Popularitaet, kein Qualitaetsurteil oder persoenlicher Geschmack. Tarifzugriff und aktuelle AT-Abdeckung noch nicht live belegt. |
| Titel | `titles`: stabile FlixPatrol-ID, Titel, Typ, Premiere, Online-Premiere, Laenge, Beschreibung, Genre-/Keyword-Bezug, IMDb-/TMDB-ID, Herkunft, Quellenlink und Aenderungszeit. [Titles](https://flixpatrol.com/api2/endpoint-titles/) | Viele Felder koennen fehlen/null sein. IMDb-ID ist numerisch, vorhandene IMDb-Links erhalten die richtige Kennung; TMDB immer mit Film-/Serientyp behandeln. Deutscher Alternativtitel, Poster, Besetzung und Regie sind in diesem Vertrag nicht zugesichert. |
| Premieren und Staffeln | `premieres`: Werk, Anbieter, Datum, Typ, Staffel, Teil, Binge-Kennzeichen und Episodenzahl. [Premieres](https://flixpatrol.com/api2/endpoint-premieres/) | Kein Laenderfeld: kein alleiniger Beleg fuer Start oder Verfuegbarkeit in AT. Episodenzahl ist weder persoenlicher Sehstand noch vollstaendiger Ausstrahlungsplan. |
| Anbieterabdeckung | `markets`: Anbieter/Land sowie Verfuegbarkeit des Dienstes und Chartabdeckung mit erstem/letztem Stand. [Markets](https://flixpatrol.com/api2/endpoint-markets/) | Beschreibt die Abdeckung des Dienstes/Datensatzes, nicht den vollstaendigen AT-Katalog einzelner Filme. |
| Personen und Reihen | `persons` liefert Personenidentitaet/Bio/externe IDs; `franchises` Reihenstammdaten. [Persons](https://flixpatrol.com/api2/endpoint-persons/), [Franchises](https://flixpatrol.com/api2/endpoint-franchises/) | Vollstaendige Filmografie, Besetzungsrollen und Reihenmitgliedschaft sind durch diese Endpunkte nicht belegt. Keine Beziehungen aus Namensnaehe erfinden. |
| Trailer | `trailers` liefert werkbezogene Trailer-/Teasermetadaten und Aufrufwerte. [Trailers](https://flixpatrol.com/api2/endpoint-trailers/) | Kein zugesicherter Abspiel-URL-/Bildvertrag; kein Anlass fuer Download oder Ersetzen bestehender Medien. Fuer die jetzige Reparatur niedrige Prioritaet. |
| Verbrauch | `quota`: `used`, `available`, `limit`, `limitExtra`, `resetAt`. [Quota](https://flixpatrol.com/api2/page-quota/) | Kontoverbrauch und eigene Requestereignisse sind verschiedene Messwerte und werden nicht addiert. Ob Quota-GETs beim Anbieter selbst zaehlen, muss die erste Probe zeigen. |

Die Zahlencodes fuer `type` unterscheiden sich zwischen Endpunkten: zum Beispiel
Top10s 2/3 fuer Film/Serie und Premieres 1/2. Eine gemeinsame ungepruefte
Enum-Konvertierung wuerde falsche Identitaeten erzeugen. Listen-Paginierung,
Relationsaufloesung und Sammelfilter werden vor dem jeweiligen Adapterbau
gezielt verifiziert; es wird kein Vollkatalog nur fuer diese Inventur abgerufen.

## Findings ausserhalb der KI

Prioritaet 1: Grundlage oder unmittelbarer Nutzen fuer die Reparatur.
Prioritaet 2: sinnvoller Folgeausbau. Prioritaet 3: optional oder keine neue
Anbindung empfohlen. "Cache" meint denselben gemeinsamen Quellenbestand,
nicht eine neue Kopie fuer jeden Bereich.

| ID / Prioritaet | Bereich und heutiger Code | Sinnvolle Daten und Umsetzung | Schutz vor Ueberschreiben und Redundanz |
| --- | --- | --- | --- |
| F01 / 1 | Entdecken-Marktmix: `entdecken-daily-task/publicMixAdapter.js`, `src/data/entdeckenMarketPool50.js`, `src/lib/webDiscoveryFeed.js` | Aktuelle AT-Chartplaetze fuer Prime Video, Disney+ und Apple TV+. Den 50er-Umfang 15 OeFI / 10 Netflix / 10 Prime / 10 Disney / 5 Apple behalten. Abrufdatum und echtes Chartdatum getrennt. | OeFI-/Netflix-Abrufe wiederverwenden. Den alten August-Fallback erst nach erfolgreichem neuen Feed ersetzen. Ein Film kann mehrere Chartbeobachtungen besitzen, bleibt aber dieselbe Filmidentitaet. |
| F02 / 1 | Gemeinsame Titelerkennung: `src/lib/titleSearch.js`, `src/lib/webDiscoveryFeed.js::matchWebDiscoveryFeed`, `src/lib/popularityContracts.js` | FlixPatrol-ID mit vorhandenen IMDb-/TMDB-IDs verbinden; Jahr und Medientyp kontrollieren. Neue ID nur als belegte zusaetzliche Zuordnung. | Widersprechende IDs als Konflikt behandeln. Ohne ID nur eindeutiger exakter Titel + Jahr + Typ; Suchnaehe darf keine automatische Zusammenfuehrung ausloesen. Bestehende interne IDs bleiben stabil. |
| F03 / 1 | Streaming/Mediathek-Zuordnung: `src/lib/katalog.js::baueStreamingAnsichten` | Vorhandene starke IDs aus dem Quellenbestand vor Titel-Heuristik pruefen. | Befund: der heutige Ersatzabgleich erlaubt +/-2 Jahre bzw. fehlende Jahre und projiziert anschliessend Katalog-IMDb-/TMDB-IDs ueber Masterwerte. Keine FlixPatrol-Anreicherung in diesen Pfad haengen, bevor widersprechende IDs und Film/Serie sauber getrennt sind. Dies ist eine Projektion, kein nachgewiesener persistenter Master-Write. |
| F04 / 1 | Faktenanreicherung: `kd_entdecken_wikidata_cache`, `_shared/entdeckenFacts.js`, `src/data/entdeckenFactsSnapshot.json` | Titel-ID, Jahr, Typ, Genre/Keywords und kurze belegte Beschreibung einmal aufloesen; bereits vorhandene Fakten zuerst lesen. | FlixPatrol nicht als angeblichen Wikidata-Datensatz in dessen Cache schreiben. Bestehenden Quellen-/Faktenvertrag erweitern, Quellennamespace behalten; Verbraucher erhalten eine gemeinsame Projektion statt eigener Kopien. Positive und negative Ergebnisse cachen. |
| F05 / 2 | Finder und globale Suche: `src/lib/titleSearch.js`, `src/lib/catalogTitleSearch.js`, `src/lib/finder.js`, `src/lib/globalSearchProjection.js` | Bessere Identitaet und belegte Genre-/Keywordwerte aus dem Cache; gegebenenfalls vorhandene Quellen-Titel als Alias. | Keine API-Anfrage pro Tastendruck. Bestehende Titel, Suchreihenfolge und harte Ausschlussfilter erhalten. Fremdsprachigen Quellen-Titel nicht als bestaetigten deutschen Titel ausgeben. |
| F06 / 2 | Fuer mich / Kinoempfehlungen: `src/lib/recommendationRanking.js`, `src/lib/kinoRecommendations.js` | Mehr eindeutig erkannte, mit Metadaten versehene Kandidaten fuer das bestehende lokale Ranking. | Die bestaetigten Profilsignale, eigenen Bewertungen und Gesehen-Ausschluesse bleiben massgeblich. Chartpopularitaet darf keine persoenliche Passungsbegruendung werden. Keine separate API pro Nutzer. |
| F07 / 2 | Streaming-Karten und Verfuegbarkeit: `src/lib/katalog.js`, `src/lib/streamingQuellen.js`, `src/tabs/StreamingTab.jsx` | Titelmetadaten ergaenzen und optional datierte Chartposition zu einem bekannten Angebot anzeigen. | Watchmode-IDs, echte Anbieterlinks, ausgewaehlte Dienste und AT-Verfuegbarkeit behalten ihre bestehende Quelle. Chartpraesenz ist kein Beleg fuer Abo/Kauf/Leihe oder heutige Nutzbarkeit. |
| F08 / 3 | Streaming "Neu": `src/lib/streamingNeu.js`, `src/controllers/useStreamingNeuController.js` | Hoechstens einen separaten Trendhinweis aus vorhandenen Chartdaten beziehen. | `katalog_stand`, Vollkatalog-Differenz und erste Erkennung bleiben unangetastet. Neuer Chartplatz oder API-Abruf darf keinen Film als neu verfuegbar markieren. |
| F09 / 2 | Kinoprogramm und Zuordnung: `src/lib/match.js`, `src/lib/programm.js`, `src/tabs/KinoTab.jsx` | Jahr/Typ/IDs als Identitaetskontrolle fuer Film.at-Titel nutzen; Titelmetadaten bei Luecken anbieten. | Film.at bleibt Quelle fuer Spielstaetten/Zeiten, OeFI fuer Kinoranglisten. Weltpremiere nicht als Wien-Termin uebernehmen; keine erfundenen Ticketlinks. Der heutige allgemeine Kinoabgleich ist toleranter als der Entdecken-Abgleich. |
| F10 / 2 | Serien-/Staffelbereich: `src/lib/staffeln.js`, `src/lib/wochenplan.js` | Eindeutiger Serienbezug; Premieres kann Staffel, Teil, Binge-Form und Episodenzahl als Zusatzhinweis liefern. | Sehfortschritt und manuelle Staffelkorrekturen niemals aendern. Region und tatsaechlich verfuegbare Folgen weiterhin aus dem bestehenden Verfuegbarkeitsvertrag bestaetigen. |
| F11 / 2 | Wochenplan, Pins und Merkliste: `src/lib/wochenplan.js::findeReminderVerknuepfung`, `src/lib/entdeckenPins.js` | Bereits vorhandene Eintraege sicherer mit bekannten Werken verbinden; Premieren allenfalls als Vorschlag. | Termine und Pins werden nicht durch globale Datumaenderungen verschoben oder neu angelegt. Keine zusaetzlichen Requests je Reminder. |
| F12 / 3 | Cage Pool / Personen- und Reihenwelten: `src/lib/cagePool.js`, `src/lib/personDiscoveryContracts.js` | Belegte Personen-/Werk-IDs koennen spaeter manuelle Referenzen ergaenzen, sobald die Beziehung selbst nachgewiesen ist. | Mediathek-Unlock bleibt unveraendert; keine Namensheuristik als Schauspielnachweis, keine erfundene Filmografie. Reale Kino-/Streaming-/Besitzkarten bleiben Navigationsziele. |
| F13 / 2 | Mediathek-Stammdaten und Import: `src/controllers/useMasterStateController.js`, `src/lib/stapelimport.js`, `src/lib/match.js::ensureIds` | Luecken in Jahr, Medientyp und externen IDs erkennen; zu einem bestehenden Eintrag eine belegte Zuordnung anbieten. | Eigene Titelkorrekturen, Bewertungen, Tags, Notizen, Besitz und Gesehen-Zustaende bleiben unveraendert. Kein Massensync der API in die Masterliste, keine neue interne ID bei anderem Quellen-Titel. |
| F14 / 3 | Sync, Export, Backup und Offline-Betrieb: `src/lib/personalDataRegistry.js`, `src/lib/uebernahme.js`, `src/lib/catalogProjection.js` | Quellen-Fakten und persoenliche Daten als unterschiedliche Bestaende behandeln; bei Bedarf kleinen gemeinsamen Offline-Stand ausliefern. | Keine FlixPatrol-Rohkopie pro persoenlichem Backup/Account. Anbieter-API-Key bleibt ausschliesslich serverseitig. Offline-Fallback ist eine datierte Auslieferungsprojektion, keine zweite laufende Wahrheit. |
| F15 / 1 | Betrieb und Requestverbrauch: neuer Hintergrundticker, bestehender Private-Ops-Check | Eigene gestartete Requests samt Ergebnis; letzter offizieller used/limit/resetAt-Stand; lesbarer Betriebsstatus. | Ein Zaehler fuer alle spaeteren Verbraucher. Fehlversuche sichtbar; keine erneute Zaehleraddition bei wiederholtem Abschluss. Der lesende Private-Ops-Monitor startet selbst keinen Datenrefresh. Kein Frontend und kein neues Freigabegate. |

## KI-Findings

Alle sechs aktiven Nutzeraufgaben, die separaten Entdecken-/Radar-Pfade und die
ruhenden Aufgaben wurden im Code untersucht. Fuer diese Inventur wurde keine
KI-Funktion live aufgerufen. Gemeinsame Regel: Die Funktionen lesen passende
Fakten aus dem zentralen Bestand; keine Funktion bekommt ihren eigenen
FlixPatrol-Requestloop.

| ID / Prioritaet | Funktion und heutiger Code | Nutzen und benoetigte Informationen | Schutz und Abgrenzung |
| --- | --- | --- | --- |
| K01 / 1 | Entdecken-Fakten: `supabase/functions/entdecken-daily-task/{wikidataResolver.js,anthropicFactsAdapter.js,factsRequest.js}` | Belegte FlixPatrol-Titel- und Fremd-IDs, Jahr/Typ, Genres/Keywords, Beschreibung und Laufzeit vor einer weiteren Aufloesung bereitstellen. Das kann Wikidata-/KI-Recherche fuer bereits bekannte Fakten vermeiden. | Den bestehenden positiven/negativen Cache und Quellenvertrag erweitern, nicht parallel nach denselben Fakten suchen. Personen-/Reihenbeziehungen und AT-Verfuegbarkeit brauchen weiterhin eigene Belege. Der aktuelle taegliche Chartpfad ist oeffentlich/providerfrei; `anthropicAdapter.js` fuer den redaktionellen Wochenmix ist derzeit ruhend. |
| K02 / 1 | Stapelimport / `media-batch-extract`: `supabase/functions/ai-task/index.ts`, `src/components/StapelImport.jsx`, `src/lib/stapelimport.js` | Nach der KI-Strukturierung Titel, Jahr, Film/Serie und IDs gegen bekannte Kandidaten pruefen. Das gilt auch fuer den manuellen externen GPT-/Claude-Importprompt. | Eingabetext, eigene Korrekturen, Besitzmedium und Importvorschau bleiben fuehrend. Musik bleibt ausserhalb dieses Filmresolvers. Remakes/mehrdeutige Titel bleiben offen; keine automatische Bewertung oder Uebernahme. |
| K03 / 2 | Prognose / Vorbewertung / `film-forecast`: `src/lib/prognoseAuftrag.js`, `src/services/vorbewertung.js`, `src/controllers/useIntelligenceController.js` | Eindeutige Werkidentitaet, Genres/Keywords, Kurzbeschreibung, Laufzeit, Land/Firma und Premiere koennen den Faktenkontext verbessern. | Bestaetigtes Profil, Bibliothek und gemeinsames Filmwissen bleiben massgeblich. Chartplatz darf weder Passungswert noch Kategorie bestimmen. Prognose bleibt unter `film.prognose`, getrennt von der eigenen Bewertung und mit bestehender Nutzerkorrektur. |
| K04 / 2 | Profil aus Antworten / `profile-extract`: `src/components/GeschmackBereich.jsx`, `src/lib/extraktion.js`, `supabase/functions/ai-task/index.ts` | Erwaehnte Filme nach der Extraktion mit gecachten Kandidaten zu Titel/Jahr/Typ/IDs verknuepfen. | Nur eigene Antworten liefern Geschmacksevidenz. Die heute ausdruecklich unbestaetigten Filmerwaehnungen bleiben unbestaetigt, bis der Nutzer sie uebernimmt. Popularitaet darf keine neue Vorliebe erzeugen. |
| K05 / 2 | Radar-Websuche: `supabase/functions/radar-websearch-task/{index.ts,anthropicAdapter.js,runner.js,contract.js}`, `src/services/radarWebsearch.js` | Titles fuer Identitaet; Premieres fuer Kandidaten zu Datum, Anbieter, Staffel/Teil, Binge und Episoden. Spaeter Persons/Franchises als Identitaetshilfe. | Premieres hat keinen AT-Beleg; die vorhandene unabhaengige Quellen-/Regionspruefung bleibt noetig. Charts beweisen keine kuenftige Veroeffentlichung. Personenbesetzung und Reihenmitgliedschaft sind durch die dokumentierten Endpunkte nicht belegt. Keine automatische Merkliste oder Erinnerung. |
| K06 / 3 | Filmwissen / `filmwissen-synthese`: `src/services/filmwissen.js`, `src/lib/filmwissen.js`, `supabase/functions/filmwissen-task/quellen.ts` | Zunaechst nur die vorgelagerte Identitaet durch belegte IMDb-/TMDB-Verknuepfungen verbessern. | FlixPatrol-Beschreibungen belegen keine kulturell-kritischen Aussagen. Bestehende Wikidata-/Library-of-Congress-Belegklassen und der gemeinsame Filmwissen-Cache bleiben erhalten; kein direkter Syntheseinput ohne passenden Quellenvertrag. |
| K07 / 3 | KI-Suchdeutung / `intelligent-search`: `src/tabs/FinderTab.jsx`, `src/tabs/DatenTab.jsx`, `supabase/functions/ai-task/index.ts` | Zentral gepflegte Genres/Keywords und vorhandene Titel koennen das bereits uebergebene Suchvokabular verbessern. | Die Aufgabe deutet Suchtext in Filter; sie recherchiert oder empfiehlt selbst keinen Katalog. Kein API-Aufruf pro Suche, keine ungeprueften Filterwerte und keine Chartwertung als Empfehlung. |
| K08 / keine direkte Anbindung | Blog-Profilanalyse / `blog-profile-extract`: `src/components/BlogProfilAnalyse.jsx`, `src/lib/blogProfilAnalyse.js`, `supabase/functions/ai-task/index.ts` | Im heutigen Auftrag kein direkter Bedarf. Optionales spaeteres Entity-Linking waere ein separater gecachter Schritt. | Jede Geschmacks-/Vokabularaussage muss aus dem eigenen Artikeltext belegt sein. Externe Metadaten duerfen keine angebliche Textevidenz erzeugen oder persoenliche Konflikte automatisch entscheiden. |
| K09 / keine direkte Anbindung | Automatische Nachpruefung: `supabase/functions/automatic-ai-check/{index.ts,core.js}` | Allenfalls vorhandenen Radar-Quellenstand und dessen Zaehlerstatus wiederverwenden. | Der heutige Pfad ist ein begrenzter Radar-Retry. Er darf keinen zusaetzlichen FlixPatrol-Abruf, erweiterten Retryumfang oder eigenen Cache bekommen. Keine neue KI-Aktivierung durch den FlixPatrol-Ticker. |
| K10 / 1, noch nicht gebaut | Reserviertes `masterlist-enrichment`: `supabase/functions/ai-task/requestContract.ts` | Spaeter ein sinnvoller Nutzer des zentralen Titles-Bestands: fehlende Metadaten und IDs als Uebernahmevorschlaege. | Heute ausdruecklich `NOCH_NICHT_GEBAUTE_AUFGABEN`. Keine stille Aktivierung, Massenanreicherung oder Ueberschreibung persoenlicher Felder. Erst die vorhandenen Import-/Identitaetspfade verbessern. |
| K11 / keine Anbindung | Health, Modelldiagnose, Echo, Providerprobe, Smoke/Eval und KI-Schalter: `src/services/ai.js`, `src/lib/kiSchalter.js`, `src/config/runtime.js`, `supabase/functions/entdecken-daily-task/providerProbe.js`, `tools/ai_smoke.mjs`, `tools/ai_eval_etappe6.mjs`, `tools/entdecken_facts_live.mjs` | Kein fachlicher FlixPatrol-Datenbedarf. Spaetere Adapter bekommen eigene gezielte Mock-/Vertragstests. | Keine versteckten API-Verbraucher in Diagnostik und Testlaeufen. Der neutrale Datenbestand muss auch ohne eingeschaltete KI nutzbar sein; bestehende KI-Kostengrenzen werden durch das neue Datenabonnement nicht veraendert. |

Empfohlene Reihenfolge: Hintergrundzaehler und gemeinsamer Quellenvertrag;
danach der echte 50er-Entdecken-Mix mit sicherer Identitaetszuordnung; dann
Import und Metadatenluecken; anschliessend Prognose/Profil/Radar nach Bedarf.
Die Findings sind keine Aufforderung, alle genannten Bereiche umzubauen.

## Gemeinsame Datenregeln fuer die spaetere Umsetzung

1. Vorhandener persoenlicher Eintrag bleibt fuehrend. Fremde Metadaten sind
   eine Quellenprojektion; es gibt keinen pauschalen Spread in den Master.
2. Eine externe Identitaet wird einmal gespeichert: Quelle + Quellen-ID +
   Werktyp. Verbindung zum internen Titel ueber eine bestaetigte Zuordnung;
   Kollisionen werden nicht automatisch "bereinigt".
3. Popularitaet, Verfuegbarkeit, neutrale Fakten und persoenliche Passung sind
   verschiedene Aussagen. Jeder Wert behaelt Datum, Quelle und Geltungsbereich.
4. Bekannte Fakten werden wiederverwendet. Kein Feature startet seinen eigenen
   Titelresolver, keine dauerhafte Parallelhaltung von Raw-JSON, normalisierten
   Vollkopien und identischem KI-Text ohne eigenen Nutzen.
5. Fehlende/null Felder loeschen keine vorhandenen Werte. Ein fehlerhafter oder
   leerer neuer Quellenstand ersetzt keinen letzten gueltigen Stand.
6. Geteilte Fakten bleiben neutral; eigene Notizen/Profile werden nicht an
   FlixPatrol gesendet. Die API-Anfragen brauchen IDs/Filter, keine privaten Texte.

## Requestplanung

Das Monatslimit ist 1000. Es wird kein weiteres Freigabegate eingefuehrt.
Ein konservativer Plan fuer die drei neuen Chartquellen sind hoechstens fuenf
getrennte Chartabfragen pro Tag (Prime Film/Serie, Disney Film/Serie, Apple Film)
plus eine Quota-Abfrage. Das waeren 186 Requests in einem 31-Tage-Monat,
bevor etwaige Paginierung und erstmalige Titelauflosungen hinzukommen.
Die genaue Zahl ist erst mit dem getesteten Adapter belegt.

Alle anderen Bereiche lesen vorwiegend denselben Cache. Ein Neuabruf erfolgt
nur fuer unbekannte/veraltete benoetigte Fakten, nicht fuer alle Titel bei jedem
Appstart oder KI-Lauf. Nicht zugesichert werden ein taeglicher Vollimport des
Streamingkatalogs oder eine neue Datenbank aller Filme innerhalb dieser 1000.

Der Zaehlerstatus und die erste echte Quota-Probe werden nach Implementierung
unten festgehalten. Der bisherige Zugriff in diesem Task bestand ausschliesslich
aus oeffentlicher Dokumentation und Supabase-Secret-Metadaten; bis zum Start des
Tickers wurden keine authentifizierten FlixPatrol-Requests ausgefuehrt.
