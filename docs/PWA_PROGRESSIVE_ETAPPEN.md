# PWA-Ladezeiten: gemeinsames Etappenregister

Owner: Meister dieses Tasks. Auftrag vom 13.09.2026: je Ebene ein Baumeister, statische Meisterintegration und genau ein Abschlussbaumeister für den kontrollierten Gesamtlauf.

Nutzerweg: Seite und vollständige Zähler mit den ersten 20 Titeln → weitere Daten automatisch in 20er-Paketen bei offenem Bereich → weitere Karten beim Scrollen → schneller Rücksprung aus dem Sitzungszustand und Erstseite aus dem Gerätecache.

## Aktueller Stand

| Etappe | Ergebnis | Zustand | Owner |
| --- | --- | --- | --- |
| P1 | Kleine erste Serverantwort und vollständige Zähler/Filter | INTEGRIERT / GEPRÜFT | A |
| P2 | Automatische 20er-Datenfolge, Cache, Priorität der Erstseite | INTEGRIERT / GEPRÜFT | B |
| P3 | Automatische Kartenportionen, Entdecken-Index, bereinigte Produktionsdarstellung | INTEGRIERT / GEPRÜFT | C |
| P4 | Identität, persönliche Marker und exakte 14-Tage-Frist | INTEGRIERT / GEPRÜFT | A/B/C |
| P5 | Ein kontrollierter integrierter Abschluss mit gezielten Fortsetzungen | ABGESCHLOSSEN / LOKAL GRÜN | `/root/pages_final` |

Produktkandidat: `232ecaa` im Branch `codex/pwa-progressive-20260913`, Worktree `/private/tmp/kd-pwa-progressive-integrate-20260913`. Veröffentlichte Ausgangsbasis war `cfcaae60dc540117b0cb2d447152ab4d7a0e4420`; gemeinsamer Paketplan `75fdcd97ec7c7098d2eafcbbdd657e8fbe60de0d`.

Finaler Prüfstand: `898704c78c856a0cd3e920150b4d1d571759e0fa` des einzigen Abschlussbaumeisters. Dessen letzte eigene Testverdrahtung und vollständiger Abschlussbericht sind als `84b85c6` integriert. Alle fünf Etappen sind lokal abgeschlossen; die Veröffentlichung ist nicht Teil dieses Abschlussbelegs.

Die abschließende statische Meisterprüfung bestätigt identische Produkt-, Migrations-, Test- und Paketdateien zum finalen Prüfstand sowie einen sauberen `git diff --check`. Nur der vom Meister geführte Vertrag und dieses Register unterscheiden sich. Der Meister hat keine Tests erneut ausgeführt.

## Vertrag und Autorisierung

- Maßgeblich ist `docs/PWA_PROGRESSIVE_CONTRACT.md`. Beide Bereiche verwenden zunächst 20 Karten. Folgedaten laden automatisch seriell in 20er-Paketen; es gibt keinen Nachladebutton. Scrollen erweitert nur die sichtbare Kartenportion. Verlassen/Verbergen pausiert die normale Datenfolge.
- Zähler, Filter und Sortierung beziehen sich auf den vollständigen ausgewählten Bestand. `Neu` endet nach exakt 14 × 24 Stunden; Cache, Rückkehr, Watchmode-Aufholen und MotN-Überlagerung starten diese Frist nicht neu.
- Produktion zeigt keine technischen Datenlieferanten oder Katalog-/Prüfzeitstände. Erforderliche Angaben in Datenschutz sowie fachliche Film-/Vorstellungs-/Artikeldaten und die gewählten Streamingdienste bleiben erhalten.
- Max hat die reduzierte App-Verbindung zu seinem bestehenden Supabase-Backend ausdrücklich mit „Ja“ freigegeben: Kennungen, Titel, Jahr, Typ, Gesehen-/Merkliste-/Bewertet-Markierungen sowie bestehende Fristanker. Bewertungswerte und Notizen gehören nicht zu dieser Katalogabfrage. Die ursprüngliche automatische Ablehnung dieser Verbindung ist dadurch aufgelöst.
- Lieferumfang dieser Welle ist der lokale implementierte, integrierte und geprüfte Kandidat. Keine Remote-Migration, Providerwirkung, Scheduleränderung oder Veröffentlichung wurde gestartet.

## Paketownership

| Paket | Schreibfläche und gezielte Erweiterungen | Worktree / Branch |
| --- | --- | --- |
| A Backend | additive Streamingseiten-Migration, Backendtests, Backenddoku | `/private/tmp/kd-pwa-pages-backend-20260913`, `codex/pwa-pages-backend-20260913` |
| B State/Service | App, Streamingservice/-controller/-kontext/-cache, bestehende Identitätsindex-Naht und eigene Tests/Doku; konkreter Cage-Rest zusätzlich `src/controllers/useEggController.js` und `egg_controller_test.mjs` | `/private/tmp/kd-pwa-pages-state-20260913`, `codex/pwa-pages-state-20260913` |
| C UI | Streaming-/Entdecken-Darstellung, automatische Kartenfenster und CSS, Produktionshinweise in betroffenen Komponenten, fokussierte Darstellungsassertions; konkreter Entdecken-Rest zusätzlich `src/lib/entdeckenUi.js` und `entdecken_projection_index_test.mjs` | `/private/tmp/kd-pwa-pages-ui-20260913`, `codex/pwa-pages-ui-20260913` |
| Abschluss | `package.json` nur Testverdrahtung, lokale PG-/Browserharnessdateien, `docs/PWA_PROGRESSIVE_ABSCHLUSS.md`; keine dauerhaften Produktänderungen | `/private/tmp/kd-pwa-pages-final-20260913`, `codex/pwa-pages-final-20260913` |

A/B/C waren disjunkt auf gemeinsamer Planbasis. Integration ausschließlich sequenziell durch den Meister. Größere Korrekturen gingen zum zuständigen Owner. Keine Nebenagenten, kein zweiter Gesamtprüfer und keine wiederholten Pakettests durch den Meister. Die technischen Paketdokumente sind keine zusätzlichen Fortschrittsregister.

## Integriertes Ergebnis

- A: `kd_streaming_page` liest ausschließlich vorhandene neutrale Daten. Authentifizierte kleine Seiten, vollständige ausgewählte Zähler, stabile Filter/Sortierung, revisions- und kontogebundene Cursor. Bestehender Vollkatalog-RPC bleibt kompatibel. Materialisierte Schlüsseljoins erhalten Konflikt-/Mehrdeutigkeitsregeln und vermeiden den früheren Katalog×Library-Vollvergleich.
- B: erste und folgende Requests jeweils 20; serielles Vorladen bei offenem Bereich; konto-/querygebundene Sitzungsrecords; persistent nur Erstseiten, nicht blockierender Cachewrite, Ablaufprüfung vor Wiederverwendung und Schutz vor verspäteten Kontoantworten. Ein eindeutig fehlender Seiten-RPC erlaubt genau den bestehenden Legacy-Fallback.
- B Start: gespeicherter Account-Startbereich bleibt während Capability-Boot erhalten; aktuelle Guards verhindern veraltete Autoload-Closures und vorzeitige Legacy-Klicks. Der automatisch freigeschaltete Cage-Pool wartet vor seinem bestehenden einmaligen Vollkatalogversuch auf die Erstseite, ohne seinen Bedarf voreilig als erledigt zu markieren.
- C: 20 sichtbare Karten und automatische Erweiterung pro Sentinel-Begegnung, einschließlich Warten auf verspätete Daten; querygebundene Portion bei Rückkehr. Entdecken beginnt ebenfalls mit 20 statt 6 Karten. Produktionshinweise sind bereinigt.
- C Entdecken: neutraler WeakMap-Index je Known-/Discover-Snapshotpaar ersetzt wiederholte Vollscans. Die bestehenden strengen Matcher entscheiden weiter auf passenden Kandidatenmengen, einschließlich globaler Namespace-Sperre, Typ/Jahr und Mehrdeutigkeit. Profil, Status und Dienstauswahl werden frisch ausgewertet. Kein persönlicher Ergebnis- oder Profilcache.

Der vollständige Known-Katalog einschließlich MotN-Überlagerung bleibt für andere Bereiche erhalten. Bei freigeschaltetem Cage-Easteregg folgt nach Erstseite zusätzlich der vollständige Discover-Katalog. Diese beabsichtigten späteren Hintergrundabrufe werden nicht als vollständig eingesparte Datenmenge dargestellt.

## Maßgebliche Korrekturen und Belege

Die anfänglichen Pakete wurden bis Produktstand `74659f7` zusammengeführt. Eigene Abschlussdateien sind über `93e63cf`, `6aeb022` und `b3eaca2` integriert. Relevante abschließende Produktdeltas:

| Befund | Integrierte Korrektur | Beleg |
| --- | --- | --- |
| SQL mit 226 Library-Bezügen überschritt 120 s | A `13fce4a` → `0305886` | lokale PG-Fälle 15/15; reale SQL→Service→Controller-Kette 5/5 |
| 20er-Datenfolge und asynchroner Accountstart | B `155873ad` → `f9ec9b1` | State21/21, Cache10/10 |
| Observer-Kaskade / manueller Button | C `a6325ed`, `60700af` → `f36eca9`, `1186bc6` | fokussierte DOM-/Entdecken-Verträge grün |
| zusätzliche frühe Legacy-/Known-Wege | B `c17f864`, `a8ee8cf`, `9543a29` → `0449d61`, `ad8373d`, `757f95e` | fokussierte State-/Buildbelege |
| tatsächlicher vorgezogener Cage-Vollabruf | B `c746848` → `b00aef5` | Egg26/26; derselbe Abschlussprüfer: Start1/1 grün, Known112ms nach Erstseite |
| Entdecken wiederholt breite Katalogabgleiche | C `57b7088` → `232ecaa` | Index4/4, Markt18/18, Abo16/16; große Alt/Neu-Parität bytegleich |

Der Entdecken-Index wurde mit dem Fachskill `matching-guards` gebaut. Die große einmalige Richtigkeitsprobe verwendete 24.678 neutralisierte Katalogkandidaten und 50 Feedfälle. Die Meisterprüfung ließ starke IDs bei leer normalisiertem Titel sowie Namespace-Repräsentanten mit exakt gültigem Referenzjahr zusätzlich absichern; Jahreswechsel werden bei der Auswahl frisch berücksichtigt.

## Kontrollierter Abschluss

Ein Abschlussbaumeister startete `npm run test:streaming-progressive:final`. Nach konkreten Stopps wurden ausschließlich betroffene oder noch offene Abschnitte fortgesetzt. Einzelheiten und Messbedingungen stehen in `docs/PWA_PROGRESSIVE_ABSCHLUSS.md`.

Abschließend belegt:

- Gewöhnliche Mock-/Buildabschnitte einschließlich Pages72/72 sind grün; nach der 20er-Entdeckenänderung Einzeldatei-Laufzeit34/34.
- Echte lokale PostgreSQL→Service→Controller-Kette5/5: erste20 in335,6ms, nächste20 in335,7ms; volle Zähler Alles8806/Neu660/MeinProgramm82; 226 reduzierte Library-Identitäten; maximal ein paralleler Request. Synthetischer CI-Default ohne lokale Labdateien ebenfalls5/5.
- Mobiler Produktionsfluss: erste20 und volle8806, automatische40, vollständiger X-Filter17, Sitzungsrückkehr, Cache vor verzögerter Hintergrundantwort, Entdecken20→40/Rückkehr und Produktions-/Netzgates.
- Der zunächst fehlerhafte Start wurde mit einem eigenen Gate-only-Rest korrigiert und bestätigt. Temporäre Aufruferdiagnostik belegte den Cage-Starter, wurde bytegenau entfernt und nicht committed.
- Der gezielt fortgesetzte Entdecken-Abschnitt ist nach dem Index grün (1/1): Öffnen mit automatischer Erweiterung, Wechsel zu Streaming und Rückkehr zusammen 3.217ms statt 14.621ms; Script 1.841ms statt 13.396ms. Die Rückkehr selbst benötigte 509ms. Der längste Task sank von 6.774ms auf 1.004ms. Der verbleibende etwa einsekündige Task bei CPU×4 ist eine benannte Laborgrenze; keine weitere pauschale Gesamtsuite.

Harnesskorrekturen betrafen ein veraltetes Beschriftungsassert, lokale PG-Sandboxrechte, einen historischen Clean-Guard bei noch uncommitteter Testverdrahtung, die Offline-Umgebung des Einzeldateibuilds, einen falschen Suchfeld-Locator und eine fehlende neutrale Kino-Programm-Fixture. Die PG-Browserroute läuft asynchron; frühere Wallzeiten mit synchronem Adapter gelten nicht als Produktmessung. Vor dem Beenden des gezielten Entdecken-Rests wartet der Harness auf den letzten laufenden Hintergrund-RPC. Normale Tests erzeugen neutrale Fixtures selbst; die große Mac-Lab-Fixture ist expliziter Opt-in. Temporäre Pfade verwenden `tmpdir()` mit kurzem Unix-Socketpfad.

Labor: Chromium393×852, CPU×4, synthetisches Konto, blockierter Service Worker, HTTP-no-store, lokale PG-Daten und ausschließlich gemockte/blockierte nichtlokale Requests. Keine physische iPhone-/PWA-Abnahme und keine Aussage über Produktionslatenz. Diagnosebasis: `/private/tmp/kd-streaming-performance-20260913/ANALYSE.md`.

## Veröffentlichung

`.github/workflows/deploy.yml` testet und veröffentlicht das Webpaket, wendet aber keine SQL-Migrationen an. Eine spätere Veröffentlichung benötigt zuerst `supabase/migrations/20260913200000_streaming_pages_backend.sql` samt RPC-Readback, danach den geprüften Frontendkandidaten über Staging nach Produktion. Ein fehlender RPC aktiviert nur den begrenzten Legacy-Fallback und ersetzt diese Migration nicht.

Bis zum Abschluss dieser lokalen Welle sind Remote-Migration, Push, CI, Deploy, Produktionsreadback und physische iPhone-/PWA-Abnahme nicht erfolgt.
