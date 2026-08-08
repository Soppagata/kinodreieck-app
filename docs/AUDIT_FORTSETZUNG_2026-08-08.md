# Vor-Merge-Audit: belastbarer Fortsetzungsstand

Stand: 08.08.2026

Arbeitszweig: `audit/fixbatch1`

Ausgangs-HEAD: `3ae13001ff5a06d326d5802bf87b37263c6434bf`

Vergleichsbasis: `staging` / lokal bekannter `origin/staging` bei `3e7a954`

Aktueller Auditstand: konsolidierter, noch nicht veröffentlichter Arbeitsbaum

Dieses Dokument ist die korrigierte Wahrheitsbasis für die Fortsetzung des
Vor-Merge-Audits. Die historische Rohübergabe unter `_audit_handover/` bleibt
bewusst ungetrackt: Sie enthält wertvolle Belege, aber auch überholte Aussagen,
absolute Claude-Pfade und mindestens einen widerlegten High-Befund.

## 1. Auftrag und Leitplanken

Ziel ist ein belastbarer Merge-Kandidat, bei dem jede aktuell erreichbare
Funktion mindestens so stabil bleibt wie am Ausgangsstand.

- Keine stille Funktionsentfernung. Die Tour bleibt wie entschieden entfernt;
  WIE/WAS/WARUM und das Bewertungsdreieck bleiben erhalten.
- Die nicht mehr gewünschte Ableitung „Schlagseite“ ist vollständig entfernt.
- Kein Merge nach `main` ohne Max' ausdrückliche Freigabe.
- Normale Tests und Function-Tests verwenden ausschließlich Mocks.
- Echte Anbieterproben dürfen nur seriell über `npm run test:ai:live` oder
  `npm run test:ai:eval` laufen. Bei Exit 75, `AUTONOMIE_STOPP` oder
  `BUDGET_UNBEKANNT` ist sofort Schluss.
- Der Anbieterzaun begrenzt einen einzelnen Request auf 500 US-Cent und einen
  autonomen Lauf auf 1.500 US-Cent. Timeout, Lock, Modellpreis und unbekannte
  Kosten schließen fail-closed.
- Zugangsdaten, Testpasswörter und Anbieter-, Supabase- oder Cloudflare-Keys
  gehören weder in Git noch in Berichte oder Chatprotokolle.
- `src/App.jsx` hat 2.165 Zeilen; das Architektur-Gate verlangt weiterhin
  streng weniger als 2.200. Neue Logik gehört in Controller oder Libraries.

## 2. Übernommener Stand und externe Anschlussplanung

Fix-Batch 1 ist in `3ae1300` enthalten: Tour-Ruinen, Hilfetexte, Startbereich,
Topfdiagnose, `fresh`-Bereinigung, Kommentare und Safe Areas wurden korrigiert.

Die zusätzliche Planung liegt außerhalb des Repositories unter
`/Users/max/Desktop/Kinodreieck Meta/kinodreieck-must-watch-v2-anschlussfaehig.zip`.
Sie wurde gegen `3ae1300` erstellt, änderte das Repository selbst aber nicht;
ihre beiden vorgesehenen Commitobjekte existieren in keiner bekannten Ref.
Der riskante Gesamtpatch wurde nicht übernommen. Stattdessen wurden seine
sicheren Ideen funktionsschonend neu umgesetzt:

- keine neuen `filmreihe`-Werte; Legacy-Werte bleiben lesbar und verknüpft;
- serialisierte, bestätigte Must-Watch-Schreibvorgänge;
- direkte Sprünge zu Master, Kino und Streaming;
- Besitz, Beschreibung, Notiz, Blogbezüge und separater Merkliste-Export
  bleiben erhalten;
- keine automatische Merkliste-Migration und keine destruktive
  Blogreferenz-Migration.

Die vollständige Archäologie und die gemeinsam zu entscheidenden Altpläne
stehen in
[`PLANUNGSARCHAEOLOGIE_2026-08-08.md`](./PLANUNGSARCHAEOLOGIE_2026-08-08.md).

## 3. Lokale Abnahme des konsolidierten Arbeitsbaums

| Gate | Ergebnis |
|---|---:|
| `npm test` | Exit 0, vollständige Mock-/Build-/Pages-Kette |
| `npm run test:function` | 285/285 |
| `npm run test:mobile` | 106/106, Chromium und WebKit |
| `profil_test.mjs` | 286/286 |
| `geschmack_test.mjs` | 124/124; E und M mangels privater externer Beta-Datei übersprungen |
| Finder | 84/84 + 155/155; Forderungen 11/11 |
| `willkommen_test.mjs` | 47/47 |
| `geschmackui_test.mjs` | 256/256, einschließlich E 23/23 und M 25/25 |
| `extraktion_test.mjs` | 391/391 |
| `kischalter_test.mjs` | 82/82 |

Die Diagnoseausgaben enthalten kein echtes `○ OFFEN`. Der einzige echte Skip
ist der ausdrücklich externe Beta-Datensatz in `geschmack_test.mjs`; die
produktnahe Geschmacks-UI-Suite ist vollständig gelaufen. Das Mobile-Gate
enthält reale Browserfälle für Musikquelle, Wochenplan, Offlinezustände,
Backupzugang, Suche und beide Browserengines.

Kein echter, kostenpflichtiger oder sonstiger Anbieter-KI-Aufruf wurde für
diese Abnahme gestartet.

## 4. Korrigierte Befundmatrix

### A1 bis A7

Alle sieben Befunde sind behoben: Tour-Ruinen, lebende Hilfetexte,
Startbereichsvalidierung, Topfdiagnose, `fresh`-Bereinigung, Ausgangskommentare
und Safe Areas. Claudes Patch darf nicht erneut angewandt werden.

### B1 bis B5

| ID | Endstatus | Beleg / Restrisiko |
|---|---|---|
| B1 Desktop-/iPad-Suche | **Behoben** | Eigener Navigationseintrag; mobil bleibt die globale Suche ohne Dublette. |
| B2 1-MiB-Grenze | **Gemessen, Behauptung einer Überschreitung widerlegt** | Reales Backup mit 400 Filmen: 212.448 / 1.048.576 UTF-8-Bytes (20,3 %). Bei großen neuen Feldern neu messen. |
| B3 Filmwissen-Reaper | **Widerlegt** | Migration und Schema enthalten die Altersbereinigung; der Produktionspfad ruft sie auf. |
| B4 mobiles Backup | **Behoben** | Warnung und Gesamt-Download sind mobil erreichbar; Restore/Wartung bleiben bewusst Desktop. Echter iPhone-Download bleibt Teil der Live-Abnahme. |
| B5 Einzeldatei | **Behoben** | Demo, archiviertes Kino und Streaming sind eingebettet; keine Sidecar-Abhängigkeit, kein verstecktes Polling. Chromium und WebKit öffnen `file://` mit genau der HTML-Anfrage. |

### C1 bis C11

| ID | Endstatus | Umsetzung |
|---|---|---|
| C1 Backupwächter | **Behoben** | Exakte exportierte Master-/Artikelrevisionen, owner- und generationgebunden; Gesamtbackup bindet Pull und alle Reads an einen Storage-Kontext. |
| C2 Feldhilfe | **Behoben** | Hover, Fokus, Touch, Escape und Außenklick; belastbares Touchziel. |
| C3 Wochenplan-Link | **Behoben** | Auto-Link vor dem Speichern sichtbar, Opt-out und Lösen dauerhaft; Jahresänderung invalidiert alte Referenz. |
| C4 Fehlerstring | **Behoben** | Gesonderte, deduplizierte Queue mit Scopes, maximal fünf Einträgen und einzelnem Schließen. |
| C5 mobile Kinohilfe | **Behoben** | Verweist nur auf mobil tatsächlich erreichbare Wege. |
| C6 fehlende Reminderquelle | **Behoben** | Persönlicher Reminder bleibt sichtbar, aber ohne tote Zielaktion. |
| C7 Statuswahrheit | **Behoben** | Offline-, Cache-, Snapshot- und Verbindungszustände werden getrennt benannt. |
| C8 ungültiges `fresh` | **Behoben** | Sichtbare, ehrliche Warnung; Teilfehler behaupten nicht mehr „nichts gelöscht“. |
| C9 Finder-KI für Gast | **Behoben** | Bezahlter Pfad erscheint nur bei passendem Konto-/KI-Gate. Chips sind semantisch und kontrastseitig unterscheidbar. |
| C10 Filmwissen-Schalter | **Behoben** | Neuer expliziter Standard-AUS-Schalter; Lesen bleibt accountgebunden, Recherche verlangt Account, Ready, Personal-AI, Global- und Funktions-Opt-in. |
| C11 Touchziele | **Behoben für WCAG 2.2 AA** | Der letzte bestätigte Rest `★`/`✓` in Entdecken hat mindestens 24×24 px und eindeutige Screenreader-Namen. Kein pauschaler 44-px-Umbau. |

### D1 bis D23

| ID | Endstatus | Kurzurteil |
|---|---|---|
| D1 | **Behoben** | „Ohne Bewertung“ wird erst nach bestätigtem Speichern zurückgesetzt. |
| D2 | **Behoben** | Musik/Sonstiges nutzen im Hauptpfad `MedienForm`; CD/Quelle wird gespeichert und in Chromium/WebKit geprüft. |
| D3 | **Behoben** | ICS mit `Europe/Vienna`, `VTIMEZONE` und UTC-`UNTIL`. |
| D4 | **Behoben** | Jahr vor Wochenplan-Anlage erforderlich; bestätigter Write und kanonische ID. |
| D5 | **Behoben** | Shared-Steuerung nur im Konto, Busy-/Await-Schutz, Gastbearbeitung verliert ein bestehendes Shared-Flag nicht. |
| D6 | **Behoben** | Kostenpflichtige KI-Eingaben/Knöpfe folgen den Schaltern; Offline-Wörter bleiben nutzbar. |
| D7 | **Widerlegt** | Manueller `file://`-Refresh meldet den Fehler sichtbar. |
| D8 | **Behoben** | Updatehinweis wird pro Build/Sitzung geschlossen; ein neuer Build erscheint wieder. |
| D9 | **Produktentscheidung** | Browser-Zurück verlässt die App; echtes History-/Scroll-Konzept nötig. |
| D10 | **Behoben** | Profil-/Einwilligungstext stimmt für Gast und Konto. |
| D11 | **Behoben** | Finder-Kicker verspricht im Ohne-KI-Modus keine KI-Deutung. |
| D12 | **Produktentscheidung** | Clean entfernt persönliche Demo-Daten; gemeinsamer Demokatalog bleibt bewusst sichtbar. |
| D13 | **Behoben** | Eingebetteter Streamingstand ist als Build-/Archivstand benannt. |
| D14 | **Plattformentscheidung** | `file://`-Origin-Isolation ist browserabhängig; eigener Datei-Namespace wäre ein neuer Produktvertrag. |
| D15 | **Behoben** | Service-Worker-Kommentar stimmt mit dem Guard überein. |
| D16 | **Produktentscheidung** | `masterlist-enrichment` bleibt ein registrierter `NOT_IMPLEMENTED`-Platzhalter. |
| D17 | **Produktentscheidung** | `TeilenBlock` und Paketaustausch sind gebaut, aber nicht gemountet. |
| D18 | **Cleanup offen** | Totes Bereichsfilter-Event beziehungsweise ungenutzte Props erst nach Senderentscheidung entfernen. |
| D19 | **Cleanup offen** | Unerreichbaren `onRefresh`-Zweig entfernen oder bewusst verdrahten. |
| D20 | **Produktentscheidung** | Bild-Infrastruktur besitzt keinen Runtime-Verbraucher. |
| D21 | **Behoben** | Historischer Pfad im Architekturaudit auf `StreamingEinstellungen.jsx` korrigiert. |
| D22 | **Cleanup offen** | Alte nummerierte Topfkommentare aktualisieren. |
| D23 | **Produktentscheidung** | Beendete Reminder sind manuell löschbar; keine stille Auto-Löschung ohne Archivregel. |

## 5. Zusätzliche Daten- und Kontohärtung

Der ZIP-Anschluss legte ältere Mehrtopf- und Kontogrenzen offen. Diese sind im
aktuellen Arbeitsbaum nicht mehr fire-and-forget:

- Master, Must-Watch und Blogartikel werden über feste Lockreihenfolge,
  bestätigte Queues, Revisionen und Kompensation koordiniert.
- Import, Startmodus, Demo-Bereinigung und Einzellöschung lösen tote Referenzen
  funktional gegen den jeweils bestätigten Stand.
- Wochenplan und Streamingstatus committen sichtbaren State erst nach dem
  bestätigten Storage-Write; schnelle Folgeaktionen werden queue-zeitig
  berechnet.
- Backup und Restore sind an Owner und Storage-Generation gebunden; ein
  Konto-/Treiberwechsel bricht fail-closed statt Daten zu mischen.
- Kontoübernahme und Logout verwenden einen persistenten Transitionmarker,
  verifizierten Owner und Aktivierungs-Epoch. Veraltete Tabs dürfen nach einem
  Übergang weder lesen noch schreiben oder fremde Tokens verwenden.
- Kann ein Kontocache nicht sicher vom Gast getrennt werden, maskiert die App
  persönliche Töpfe und zeigt nur die Wiederherstellung mit demselben Konto.
- Tote Import-Snapshots und Geheimnisreste stillgelegter Git-/Supabase-Treiber
  werden beim Upgrade entfernt.

## 6. Noch offene, gemeinsam zu entscheidende Vorhaben

Keine dieser Positionen wird still als „Fehlerbehebung“ eingebaut:

1. `Teilen & Tauschen` wieder vollständig mounten oder die Ruinen entfernen.
2. Filmscan und Bloganalyse als echte Beta-Gates bauen oder als Zukunftsbacklog
   kennzeichnen.
3. Die externe Serienradar-Pipeline an die synchronisierten Watchmode-IDs
   anschließen oder ihre Reichweite begrenzen.
4. Merkliste und Must-Watch langfristig zusammenführen oder getrennt behalten.
5. Teppich/Crawl/Klaatu überarbeiten oder verbliebene Ruinen entfernen.
6. Browser-History, Datei-Kopienisolation, Reminderarchiv und Bildinfrastruktur
   als eigene Produktentscheidungen behandeln.
7. Interne Mediathek-Verweise, Titellisten und Mehrfachlöschen erst als neue,
   größen- und transaktionsgeprüfte Funktionsblöcke planen.

## 7. Restrisiken und nächster Arbeitsblock

- Ein bereits zuvor vorhandenes Multi-Tab-Auth-Rennen bleibt als
  Verfügbarkeitsrisiko: Ein alter Refresh/Logout kann ohne Compare-and-set eine
  inzwischen gespeicherte neue Sitzung überschreiben oder löschen. Die neuen
  Konto-/Token-/Cache-Gates verhindern dabei Daten- oder Privacy-Leaks. Späterer
  Minimalfix: Session-Fingerprint vor dem finalen Credential-Write erneut
  vergleichen.
- Der private Beta-Datensatz für zwei Messgruppen von `geschmack_test.mjs` ist
  lokal nicht vorhanden. Das ist ein Fixture-/Messbeleg, kein verdeckter
  Produktfehler; vor Staging sollen die Belege gegen den aktuellen Korpus neu
  erzeugt werden.
- Echte Actions-Laufzeit, Staging-SHA, Konto-/Gast-/Multi-Tab-Journey,
  Backup/Restore/Undo, Ausfall/Rollback, echtes iPhone und reale KI bleiben
  ausdrücklich ungeprüft, bis der Commit veröffentlicht und ausgerollt ist.

## 8. Definition of Done

Der lokale Implementierungsblock ist abgeschlossen. Der gesamte Vor-Merge-
Audit ist erst abgeschlossen, wenn zusätzlich:

1. der konsolidierte Arbeitsbaum versioniert und der exakte Commit auf den
   freigegebenen Remote-Zweig gepusht ist;
2. CI dieselben Mock-, Function- und Browsergates grün ausführt;
3. Staging exakt diesen Commit ausliefert;
4. Konto-/Gast-/Sync-/Multi-Tab- und Privacy-Recovery-Journeys protokolliert
   sind;
5. Backup, Restore, Undo, Ausfall und Function-Rollback praktisch geprüft sind;
6. der echte iPhone-Gegencheck einschließlich Safe Area, Tastatur,
   Installation, Download und lokalem Speicher erfolgt ist;
7. ausschließlich die erlaubten KI-Entry-Points seriell unter funktionierendem
   Budgetwächter gelaufen sind; und
8. Max die Restentscheidungen und die Merge-Empfehlung erhalten und den Merge
   ausdrücklich freigegeben hat.
