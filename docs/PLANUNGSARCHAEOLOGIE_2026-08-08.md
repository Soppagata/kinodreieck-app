# Planungsarchäologie und gemeinsames Entscheidungsregister

Stand: 08.08.2026
Referenz: Ausgangs-HEAD `3ae1300`; konsolidierter, noch nicht veröffentlichter
Arbeitsbaum auf `audit/fixbatch1`

Dieses Register beantwortet für alte Roadmaps, Claudes Übergabe und die neue
Must-Watch-Anschlussplanung jeweils vier Fragen:

1. Wurde das Vorhaben jemals committed?
2. Ist es heute erreichbar und betriebsfähig?
3. Wurde es bewusst ersetzt oder ging es still verloren?
4. Soll es während dieses Audits umgesetzt, später entschieden oder bewusst
   nicht wiederbelebt werden?

Durchsucht wurden die vollständige erreichbare Git-Historie und alle Branches,
die getrackten Projekt- und Betriebsdokumente, die ungetrackte Audit-Rohübergabe
und die externe Anschlussplanung. Historisch gelöschte Planungsdokumente wurden
nicht gefunden. Laut Claude-Zwischenstand gingen allerdings die ausführlichen
Journey-Protokolle und ungefähr 200 Screenshots mit dessen Arbeitscontainer
verloren; in Git existiert nur das textuelle Kondensat.

## 1. Externe Must-Watch-Anschlussplanung

Gefundene Datei:

`/Users/max/Desktop/Kinodreieck Meta/kinodreieck-must-watch-v2-anschlussfaehig.zip`

- Größe: 65.972 Byte
- SHA-256:
  `19edde87d0041cdb2e37999db7456163c72a3b2aeceea31cc1d633d1ea31b143`
- 17 Einträge: Manifest, Plan, Codemap, Entscheidungen, Validierung,
  Textentwurf, Vorschau und zwei Mail-Patches
- laut Manifest exakt für Branch `audit/fixbatch1`, Commit `3ae1300`
- laut Manifest wurde das Repository bei der Erstellung nicht verändert

Die beiden vorgesehenen Commitobjekte `9714dfe…` und `2f4f7e4…` existierten bei
der Bestandsaufnahme weder im Repository noch auf einem bekannten Branch. Die
damaligen Blob-Hashes entsprachen bei allen betroffenen Kern-Dateien den
Patch-Preimages; `useMustwatchController.js` fehlte. Damit ist bewiesen, dass
der Planungschat selbst nichts in das Repository übernommen hatte. Im
anschließenden Audit wurden die sicheren Teilideen unabhängig und
funktionsschonend neu implementiert; der riskante Gesamtpatch blieb verworfen.
Der heutige Arbeitsbaum enthält deshalb keine der beiden Mail-Patch-Commits,
aber die geprüften Härtungen als eigenständige Implementierung.

### Bewertung der ZIP-Bausteine

| Vorhaben | Ist- und Historienbefund | Einordnung / nächster Schritt |
|---|---|---|
| Eintrag-löschen-Button | Bereits aktiv in `FilmCard.jsx`; die Löschplanung erhält Blogtexte als Rotlinks und Must-Watch-Zeilen ohne Masterlink. Historisch durch `5455eec` und `f79dbc2` aufgebaut. | **Umgesetzt und zu erhalten.** Regressionsschutz ausbauen, nicht neu bauen. |
| Keine neuen Einträge vom Typ `filmreihe` | Die Schreibgrenzen sind inzwischen geschlossen; alte Master-, Paket- und Blogwerte werden weiterhin als `film` gelesen und verknüpft. | **Umgesetzt und regressionsgetestet.** Kein Legacy-Datenverlust, kein eigener neuer Typ. |
| Must-Watch-Grundsystem | Seit `afe48d6` aktiv: eigener Topf `kd:mustwatch`, Flag-Migration, explizite Master-/Kino-/Streamingbezüge, Suche und Einzellöschung. | **Umgesetzt.** Keine zweite Komponente, kein zweiter Topf und kein neuer Tab. |
| Must-Watch-Schreibserialisierung | Ein eigener Controller berechnet und speichert Änderungen seriell; ein beschädigter oder noch nicht sicher geladener Topf sperrt Mutationen. Besitz, Beschreibung, Notiz und Blogbezüge bleiben erhalten. | **Umgesetzt und regressionsgetestet**, ohne automatische Merkliste-Migration. Mehrtopf-Löschungen, Import, Startmodus und Demo-Bereinigung koordinieren Artikel, Must-Watch und Master bestätigt mit Revision und Kompensation. |
| Direkte Must-Watch-Sprünge | Master-, Kino- und Streamingbezüge nutzen inzwischen die vorhandenen stabilen Fokuspfade. | **Additiv umgesetzt und regressionsgetestet.** Der reine Sprungplan deckt Master, gematchtes Kino, reines Programm und Streaming ab; die Komponentenverdrahtung bleibt zusätzlich strukturell gesichert. |
| Streaming-Merkliste in Must-Watch überführen | Heute existieren zwei aktive Wahrheiten: `kd:merkliste` mit Stern, Dashboardanzeige und eigenem Export sowie `kd:mustwatch`. | **Produkt- und Migrationsentscheidung.** Nur mit Übergangszeit, Ersatzexport und dauerhaft bestätigtem Ziel-Write. Quelle nie nach einem bloß lokalen Erfolg löschen. |
| Automatische Blogreferenz-Migration | Der ZIP-Effekt wandelt alle `mw_`-Referenzen in Masterlinks oder Rotlinks um. Schon ein Must-Watch-Lesefehler wird im Entwurf wie eine leere Liste behandelt. | **In der vorliegenden Form ablehnen.** Read-Fehler und „wirklich leer“ unterscheiden; Bloginhalt und Rückheilung erhalten. |
| Besitz und Beschreibung | Der aktuelle Must-Watch-Weg besitzt `im_besitz`, Besitz-Badge und ein separates Beschreibungsfeld. Patch 2 entfernt diese Funktionen. | Unter der Erhaltungsregel **behalten**. Neue Jahr-/Typfelder nur additiv einführen. |
| Blog ↔ Must-Watch | Neue Blogreferenzen, Rücklinks und Rotlink-Heilung sind heute aktiv. Patch 2 baut sie zurück. | **Behalten** und in Controller-/Migrationstests festschreiben. |
| Separater Merkliste-Export | Heute erreichbar; Patch 2 entfernt ihn während der Konsolidierung. | Bis zu einem mindestens gleichwertigen Must-Watch-/Übergangsexport **behalten**. |
| Jahr, Typ, Filter und Sortierung | Patch 2 ergänzt sinnvolle Metadaten- und Ansichtsoptionen. | Additiv nach Controller-Härtung; bestehende Felder und Verweise dürfen nicht entfallen. |
| Schlagseite entfernen | War in Regler, Mediathekfilter, Grundscore, Finder-Ranking, Anzeige, Hilfe und Tests aktiv. | **Owner-Entscheid 08.08.2026: vollständig entfernen.** Dreieck und seine drei Einzelwerte bleiben; entfernt werden nur Ableitung, Filter, Bonus, Finder-Signal, Anzeige und zugehörige Texte. |
| Echte Textgröße | Die heutige Option skaliert Container über CSS-`zoom` und verändert damit Geometrie und mobil teils die Breite. Kein Umsetzungscommit vorhanden. | Sinnvoll offen, aber breitflächiger UI-Eingriff. Nach Auditblockern mit Design-Tokens, Overflow- und Großschrifttests. |
| Visual-Viewport-Basis | Tastaturverschiebung und Zoom-Erlaubnis wurden bereits in `ff65a34`/`cd8ca10` aufgebaut. | **Vorhanden und zu erhalten.** |
| Visual-Viewport-Härtung | `scale`, `width`, `offsetLeft` und reale Trefferlistenhöhe fehlen; Pinch-Zoom kann noch als Tastatur fehlgedeutet werden. | Nach Textgrößenarbeit, anschließend echtes iOS-/Android-Gerät. |
| Interne Mediathek-Verweise | Kein `verweise`-Feld und kein entsprechender Commit existieren. Blog-Rotlinks und die inzwischen bestätigten Mehrtopf-Controller liefern nur eine technische Grundlage. Die reale B2-Messung liegt mit 400 Filmen und rekonstruierter Storage-Hülle bei 212.448 von 1.048.576 Bytes. | Neuer Funktionsblock mit ausreichendem aktuellem Größenpuffer, aber weiterhin nur mit Import-, Backup-, Demo-, Privacy-, Lösch- und erneuten Größentests. |
| Mehrfachauswahl und Titellisten | Keine Auswahl-IDs, Checkboxen oder Titellistenfunktion im Verlauf. | Read-only-Variante später separat: temporäres `Set`, Kopieren und schlankes JSON ohne private Felder. |
| Mehrfachlöschen | Einzellöschung koordiniert Master, Must-Watch und Artikel inzwischen serialisiert und kompensierbar. Ein eigener Mehrfachplan, eine gemeinsame Vorschau und ein serverseitig atomarer Mehrtopfvertrag existieren nicht. | Zuletzt und mit eigenem Batch-/Fehlervertrag; niemals als Schleife über `deleteFilm`. |
| Hilfe vereinheitlichen | Fix-Batch 1 korrigierte tote Zielnamen, aber HilfeSheet, Langhilfe und `appHilfe` sind weiter getrennte Wahrheiten; manche Texte erklären interne Technik statt Nutzung. | Ganz am Ende aus einer gemeinsamen Inhaltsquelle und am endgültigen Verhalten ausrichten. |
| „Gesehen – übernehmen“ | Die ZIP vertagt dies wegen der kombinierten Master-/Must-Watch-Mutation. | **Bewusst später.** |
| Push-/Release-Erinnerungen und fuzzy Titelmatch | Keine verlässlichen Releasedaten; fuzzy Matching widerspricht der stabilen-ID-Doktrin. | **Nicht in diesen Audit aufnehmen.** |
| Zweiter Must-Watch-Key, `MustWatchV2`, Tab „Filme für dich“, gespeicherte Verfügbarkeit oder Zoomsperre | Vom ZIP selbst als Nicht-Ziele benannt. | **Nicht implementieren.** |

### Warum Patch 2 nicht unverändert angewandt werden darf

Neben sichtbaren Funktionsentfernungen enthält der Entwurf zwei konkrete
Datenrisiken:

1. Der Controller behandelt einen Must-Watch-Lesefehler wie eine erfolgreich
   gelesene leere Liste. Der anschließende Startup-Effekt kann daraufhin alle
   Blogreferenzen zu Rotlinks oder Masterlinks umschreiben.
2. Beim Konto-Treiber bestätigt `store.set` den lokalen Schritt, bevor der
   Remote-Commit feststeht. Must-Watch-Schreiben und Leeren von
   `kd:merkliste` können zudem pro Key parallel laufen. Die Quelle könnte damit
   serverseitig zuerst verschwinden, während das Ziel am 1-MiB-Limit, an einem
   Revisionskonflikt oder am Netz scheitert.

Eine spätere Migration braucht daher einen expliziten Zustand wie „Quelle
gelesen → Ziel remote bestätigt → Ziel erneut verifiziert → Quelle leeren“,
Wiederanlauf ohne Duplikate und einen Export vor der Löschung. Bis dieses
Protokoll steht, bleiben beide Töpfe unangetastet.

Weitere Bedingungen für eine sichere Teilübernahme:

- Ein Must-Watch-Lesefehler, ungültiges JSON und eine gültige leere Liste sind
  drei verschiedene Zustände. Beschädigte Ziel- oder Quelldaten dürfen niemals
  durch eine vermeintlich erfolgreiche Migration überschrieben werden.
- Die zusammengeführte UTF-8-Größe wird vor jedem Ziel-Write gegen das
  tatsächliche Limit geprüft. Im Kontobetrieb reicht ein lokales `store.set`
  nicht als Dauerhaftigkeitsbeleg; Flush plus Remote-Inventur oder Prüfsumme
  müssen den Zielstand bestätigen.
- `syncPull()` muss lokale Abweichungen mit `zuGross` oder `schemaVeraltet`
  ebenso gegen Überschreiben schützen wie bereits wartende oder konfliktäre
  Änderungen. Sonst kann ein späterer Pull den nur lokal vorhandenen Zieltopf
  wieder durch den alten Remotestand ersetzen.
- Der Streaming-Stern darf nur einen reinen, durch diesen Stern erzeugten
  Eintrag unmittelbar löschen. Enthält er Notiz, Beschreibung, Besitz oder
  Blogbezüge, braucht es Bestätigung oder Navigation in die Detailansicht.
- Optimistische Änderungen benötigen bei lokalem Schreibfehler Rollback oder
  einen sichtbaren, wiederholbaren „nicht gespeichert“-Zustand.
- Die Demo-Bereinigung darf nur protokollierte Seed-IDs löschen. Ein bloßer
  Watchmode-ID-Treffer kann inzwischen ein angereicherter eigener Eintrag sein.
  Die Seed-Marke darf erst nach erfolgreich bestätigten Schreibvorgängen
  verschwinden.
- Alte Einträge ohne Typ dürfen nicht pauschal als Film erscheinen. Typ und
  Jahr werden eindeutig aus dem Master/Katalog ergänzt oder als unbekannt
  angezeigt.
- Die Startmodus-Warnung zählt beide Legacy-Töpfe, solange die Migration nicht
  nachweislich abgeschlossen ist.

Pflicht-Regressionen für eine spätere Migration sind mindestens:

1. Zielschreiben fehlschlägt: Quelle lokal und remote unverändert.
2. Quellenleeren fehlschlägt: beide Stände vorhanden; zweiter Start erzeugt
   keine Duplikate.
3. Offline, Konflikt, `zuGross` und `schemaVeraltet`: kein Quellverlust und kein
   überschreibender Pull.
4. Beschädigter Must-Watch- oder Merkliste-Topf: Warnung statt Überschreiben.
5. Zusammengeführter Wert knapp unter und knapp über dem Serverlimit.
6. Besitz, separate Beschreibung, Dashboard-Badge, Blog-Rücklinks,
   Rotlink-Heilung und `merkliste.json` über Anlegen, Bearbeiten, Reload und
   Export erhalten.
7. Ein angereicherter Streaming-Eintrag wird nicht ohne Bestätigung gelöscht;
   eine Legacy-Serie wird nicht als Film bezeichnet.
8. Demo → Konto, Konto → Gast, Konto A → Konto B und zweites Gerät mit beiden
   Töpfen; Backup/Restore vor, während und nach einer unterbrochenen Migration.

## 2. Im Projekt liegen gebliebene oder still verlorene Vorhaben

| Priorität | Vorhaben | Was Historie und Code belegen | Entscheidungsvorschlag |
|---|---|---|---|
| P0 | Interner Stapelimport | UI, Client und Edge-Task wurden in `0a8826f`, später als Textweg in `2e32e96`, gebaut. Migration `20260801194500` ist laut Supabase-Dokumenten bewusst nie remote angewandt; `current_schema.sql` enthält den Task nicht. Ohne `task_max_reservierung_usd_cent` beendet die Function den Auftrag vor dem Anbieter. Der letzte dokumentierte Function-Deploy `c91c2b0` ist älter. | **Gebaut, aber kein Betriebsbeleg.** Migration, Function-Deploy, Budgetgate und gezielte Liveprobe als ein Releasepaket; vorher UI ehrlich sperren oder kennzeichnen. |
| P0 | Teilen & Tauschen / Paketaustausch | Paketlogik, `TeilenBlock`, Autorname, Übernahmehandler und Quellenklärung existieren. Die Oberfläche wurde in `7d94909`/`7213742` gemountet, in `76c78e3` entfernt, in `3d09e9e` teilweise zurückgebracht und in `0a8826f` erneut unmountet. | **Stärkster still verlorener Funktionskandidat.** Gemeinsam zwischen vollständiger Wiedereinbindung und sauberer Entfernung aller Ruinen entscheiden. |
| P0/P1 | Filmscan und Bloganalyse | Roadmap und Etappe-8-Unterlagen nennen beide ausdrücklich als Beta-Gates; es gibt keinen Task, Datenfluss, Opt-in oder UI-Commit. Die widersprüchliche Vollständig-Markierung in `ETAPPE_9C_BETA` ist im Audit wieder geöffnet. | Entscheiden, ob echte Beta-Gates oder Zukunftsbacklog. Vorher keine „Etappe 8 vollständig“-Aussage. |
| P1 | Desktop-/iPad-Suche | Finder-Navigation war in `f79dbc2` entfernt worden, die Ersatzleiste per CSS nur bis 760 px sichtbar. | **Behoben:** eigener Desktop-/iPad-Navigationseintrag; mobile Leiste und mobiles Menü bleiben ohne Dublette. |
| P1 | Individueller Serienradar | Browser, Tabelle, RPC und Tests sind gebaut. Laut `WOCHENPLAN_SERIEN.md` konsumiert der externe Streamingjob die synchronisierten Watchmode-IDs noch nicht; im Repo liegen nur Entwurf und Mocktests. | Externe Pipeline anschließen oder Oberfläche und Doku ehrlich auf die vorhandene Reichweite begrenzen. |
| P1 | Praktische Etappe-9-Abnahme | App-Backup über ein zweites Gerät, Ausfalltrockenlauf, Function-Rollback, echte iOS-/Android-Installation, Testkonten, Feedbackkanal und Beta-Kohorte sind weiter offen. | Bestandteil der finalen Livephase, nicht durch Mocktests als erledigt markieren. |
| P1 | Programmdaten-Lizenzierung | Keine Programmquelle ist als lizenziert dokumentiert; mehrere Anbieteranfragen und ein freigegebener Pilotadapter sind geplant. | Externer Blocker vor öffentlichem Start, nicht als Codeversäumnis behandeln. |
| P2 | Vollständiger Masterlisten-Import | Der heutige Stapelimport deckt ungefähr 60 Textzeilen ab. Ältere Planung umfasste Dateien, Fortschritt/Wiederaufnahme, Konfliktentscheidungen, Filmwissen, Kostenvorschau und portables Paket. | Als teilweise ersetztes größeres Vorhaben neu priorisieren; nicht still als vollständig dokumentieren. |
| P2 | In-App-Fotoerkennung | In `0a8826f` gebaut, in `ff65a34` eingegrenzt und in `2e32e96` bewusst durch Text-Batches plus externen Fotoablauf ersetzt. | Kein stiller Verlust. Nur wieder aufnehmen, wenn der externe Weg als Produktentscheidung nicht genügt. |
| P2 | Teppich, Star-Wars-Crawl, Klaatu/Necronomicon | In `cd7eae2` pausiert und in `56abef1` aus dem App-Wiring entfernt; Komponenten liegen noch im Baum. Ein Kommentar behauptet fälschlich, Flags allein würden sie reaktivieren. | Überarbeiten und korrekt verdrahten oder Ruinen entfernen; nicht per Flag blind einschalten. |
| P2 | `masterlist-enrichment` | Seit `99959ae` registrierter Platzhalter; antwortet kontrolliert `NOT_IMPLEMENTED` mit veraltetem Etappe-6-Grund. | Als geparkt dokumentieren oder aus öffentlichem Taskangebot nehmen; nicht mit dem Stapelimport verwechseln. |
| P2 | Etappe 10 / öffentlicher Start | Rechtstexte, KI-Transparenz, getrennte Opt-ins, Löschfristen, Selbstbedienungs-Accountlöschung, Monitoring, Support, Registrierung und Storefrage sind bewusst später geplant. | **Nicht stecken geblieben.** Bleibt Zukunftsphase. |
| P3 | Finder-Kleinlücken | `doku → dokumentation` verweist auf ein nicht existentes Genre und `ß` normalisiert unschön. Chipkontrast, Semantik und Desktop-Erreichbarkeit sind im Audit behoben. | Die zwei reinen Vokabular-/Normalisierungsfragen bleiben kleiner Backlog. |
| P3 | Vorbewertung/Filmwissen-Ausbau | Batchprognosen, Neuberechnung, weitere Quellen, redaktionelle Korrektur, anonyme Belege und breiterer Bericht sind ausdrücklich als Zukunftsbacklog dokumentiert. | Nicht in den Vor-Merge-Audit ziehen. |

## 3. Bewusst ersetzt oder verworfen — nicht automatisch wiederbeleben

- Die Tour wurde auf Owner-Entscheid entfernt (`3ae1300`).
- „Kino für dich“ wurde in `846906b` als Kinovorschläge in „Deine Woche“
  integriert, nicht ersatzlos gelöscht.
- „Jetzt streambar“ verschwand in `59cc2fe` beim Umbau zum Ticket-Dashboard.
- Alte Streaming-Relevanz-/User-Scores und „Könnte dir gefallen“ wurden in
  `66b6f42` zugunsten belegbarer Katalogdaten vereinfacht.
- Das manuelle Vokabularformular wurde in `f79dbc2` durch KI-Deutung mit
  speicherbarer Offline-Regel ersetzt.
- NERV wurde ausdrücklich durch Neon Noir ersetzt (`62af34a`).
- Der alte In-App-Fotoweg wurde ausdrücklich durch Text plus externen Fotoweg
  ersetzt (`2e32e96`).
- Die ungemergte Branchspitze `codex/wochenplan` enthält keinen verlorenen
  Funktionsblock; ihr Inhalt wurde als `9257c05` integriert.
- Alte Befunde zu `programm_demo`, Tageslimits und Etappe-7-Übergaben wurden
  später erledigt und dürfen nicht aus veralteten Dokumentstellen neu eröffnet
  werden.
- Der alte Befund einer Filmwissen-Sperre ohne Altersfenster ist falsch.

## 4. Gemeinsames Entscheidungspaket

Vor Produktänderungen sind folgende Entscheidungen sinnvoll. Die fett gesetzte
Variante ist die konservative Empfehlung unter der Vorgabe, keine vorhandene
Funktion zu verlieren.

1. Teilen & Tauschen: **vollständig wieder erreichbar machen** oder alle
   verbliebenen Pfade bewusst entfernen?
2. Filmscan und Bloganalyse: echte Beta-Gates oder klarer Zukunftsbacklog?
3. Desktop-Suche: **entschieden und umgesetzt — Navigationseintrag**;
   mobil bleibt die vorhandene globale Suchleiste.
4. In-App-Foto: **externer Fotoweg bleibt endgültig** oder spätere Rückkehr?
5. Serienradar: externe Pipeline jetzt anschließen oder Reichweite sichtbar
   begrenzen?
6. Teppich/Crawl/Klaatu: überarbeiten oder verbliebene Ruinen entfernen?
7. Streaming-Merkliste: in Must-Watch konsolidieren oder beide Funktionen
   behalten? Bei Konsolidierung sind Übergang und Export Pflicht.
8. Must-Watch-Besitz, Beschreibung und Blogbezüge: **entschieden — behalten**
   und durch Controller-/Regressionstests absichern.
9. Schlagseite: **entschieden am 08.08.2026 — vollständig entfernen**, bei
   unverändertem Dreieck und unveränderten Einzelwerten WIE/WAS/WARUM.
10. Filmscan-/Stapelimport-Migrationen: sofort als Betriebsrelease ausrollen
    oder UI bis zum späteren Rollout ehrlich sperren?
11. Interne Verweise und Titellisten: B2 ist mit 20,3 % Belegung unkritisch;
    als neuer Funktionsblock beginnen oder post-merge verschieben?
12. Mehrfachlöschen: erst nach atomarem Fehlerkonzept; ist dieser Umfang den
    zusätzlichen Daten- und Bedienrisiken überhaupt wert?

## 5. Empfohlene Umsetzungsreihenfolge

1. Audit-Wahrheitsbasis und lokale Pflichtgates abschließen (**erledigt:
   `npm test`, Function 285/285, Mobile 106/106 in Chromium und WebKit**).
2. Reale `kd:master`-Größe messen und B2 entscheiden (**erledigt: 212.448 von
   1.048.576 Bytes bei 400 Filmen; keine Grenzmigration nötig**).
3. Bestätigte Sicherungs-/Datenfehler B5, C1, C4 und C6 beheben
   (**umgesetzt und regressionsgetestet**).
4. Desktop-Suche und mobile Sicherung lösen (**Navigationseintrag sowie
   mobiler Gesamt-Backupweg umgesetzt; Restore bleibt Wartung/Desktop**).
5. Den kleinen `filmreihe`-Patch kompakt portieren (**umgesetzt**).
6. Must-Watch-Controller und direkte Sprünge additiv portieren; Besitz,
   Beschreibung, Blogbezüge und Exporte erhalten (**umgesetzt und getestet**).
7. Erst dann über Merkliste-Migration, Filter und Metadaten entscheiden.
8. Stapelimport nur als gemeinsames Migration-/Function-/Budget-/Livepaket
   betriebsfähig machen (**Code und Budgetzaun lokal grün, Live-Rollout offen**).
9. Textgröße und anschließend Visual Viewport auf echten Geräten härten.
10. Optionale neue Funktionen in der Reihenfolge interne Verweise, read-only
    Mehrfachauswahl/Titellisten und zuletzt Mehrfachlöschen behandeln.
11. Hilfe, Funktionsbericht, Roadmap und Beta-Checklisten am finalen Verhalten
    vereinheitlichen (**Auditregister und Funktionsbericht werden im
    Abschlusscommit aktualisiert**).
12. Staging-, Konto-, Ausfall-, Backup-, KI- und Geräteabnahme durchführen;
    danach Restrisiken und Merge-Empfehlung vorlegen.
