# KD-REV-E08-003 · Bestehende Personen-Abos lassen sich mit leerem Katalog nicht entfernen

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — eine sichtbare und berechtigte Kontoverwaltungsaktion endet still ohne Mutation; das bestehende serverbestätigte Personen-Abo bleibt gespeichert.
- Finding: E08-F003
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E08

## Fehler und Auswirkung

In der Kontoradarverwaltung kann ein bereits serverbestätigtes Personen-Abo sichtbar sein und einen aktiven „Aus dem Radar entfernen“-Button besitzen. Der Klick liefert aber `unresolved` mit `writes: 0`, ohne Storage-Write oder Mutations-RPC. Das Abo bleibt unverändert sichtbar und gespeichert. Da der Dialog den Rückgabestatus nicht auswertet und der Controller in diesem Pfad keinen Fehler setzt, erhält die Person keine Erklärung.

Betroffen sind bestehende strukturierte Personen-Abos in Konten, für die die Radarverwaltung erreichbar ist; aktiv und pausiert sind statisch betroffen. Der Validator führte ein aktives Nicolas-Cage-Abo aus. Freitextziele und normale Werk-Abos verwenden andere Änderungspfade. Es gibt keine Behauptung zu vorhandenen Live-Konten oder deren Anzahl.

## Auslöser, Soll und Ist

**Auslöser.** Online-Kontomodus mit aktivem Radarclient, `remoteKontoAktiv` und erlaubter Suche. Der eigene valide Feed enthält ein serverbestätigtes Personen-Abo, beispielsweise `person:wikidata:Q42869:actor`; im Dialog „Entdecken verwalten“ wird „Aus dem Radar entfernen“ gewählt.

**Soll.** Ein eigenes serverbestätigtes Personen-Abo wird anhand seiner bekannten starken Personen-ID und Rolle über die kontogebundene Outbox entfernt und nach bestätigtem Feed-Sync ausgeblendet. Ein Katalog zur Neuanlage darf die Entfernung eines bestehenden Abos nicht blockieren.

**Ist.** Der Controller fragt auch für `remove` die Identität im Standardkatalog nach. Dieser ist leer; die kanonische Identität wird `null`, die Validierung beendet den Vorgang vor Outbox und Serverroute mit `{ status: "unresolved", writes: 0 }`. Im ausgeführten UI-Pfad blieben zusätzliche Storage-Writes und RPCs bei 0, Fehlernachrichten leer und das Abo vorhanden.

## Ursache und Fundstellen

Die Controllerfunktion koppelt jede Personenaktion einschließlich `remove` an `findPersonRadarCatalogIdentity` ohne übergebenen Katalog. Der absichtlich leere Standardkatalog führt dadurch eine gültige, aus dem eigenen bestätigten Feed stammende Identität zu `null`. Der alternative lokale Pfad setzt einen injizierten Gast-Executor voraus und ist für den Kontopfad nicht einschlägig. App bindet den Controller ohne Kataloginjektion an die UI.

- Der Standardkatalog ist leer; die Lookup-Funktion akzeptiert einen Treffer nur aus dem übergebenen bzw. Standardkatalog: [eingefrorene Quelle: `/private/tmp/kd-vollreview-20260916/source/src/lib/personRadarCatalog.js:13`](/private/tmp/kd-vollreview-20260916/source/src/lib/personRadarCatalog.js:13) und [Zeile 38](/private/tmp/kd-vollreview-20260916/source/src/lib/personRadarCatalog.js:38) — Repository-Pfad `src/lib/personRadarCatalog.js:13-16, 38-46`, Prüfcommit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- `aenderePersonRadar` führt Lookup und Validierung vor jeder Aktion aus und erreicht erst danach die Account-Outbox: [eingefrorene Quelle: `/private/tmp/kd-vollreview-20260916/source/src/controllers/useEntdeckenRadarController.js:414`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useEntdeckenRadarController.js:414), [Zeile 416](/private/tmp/kd-vollreview-20260916/source/src/controllers/useEntdeckenRadarController.js:416) und [Zeile 429](/private/tmp/kd-vollreview-20260916/source/src/controllers/useEntdeckenRadarController.js:429) — Repository-Pfad `src/controllers/useEntdeckenRadarController.js:414-443`, gleicher Prüfcommit.
- Feed-Reconciliation übernimmt bestehende serverseitige Personen-Abos ohne lokalen Katalogabgleich in den sichtbaren State: [eingefrorene Quelle: `/private/tmp/kd-vollreview-20260916/source/src/lib/localEventRadar.js:1537`](/private/tmp/kd-vollreview-20260916/source/src/lib/localEventRadar.js:1537) — Repository-Pfad `src/lib/localEventRadar.js:1518-1553`, gleicher Prüfcommit.
- Der ManageDialog zeigt für bestätigte Personeneinträge den Entfernen-Button, wertet dessen asynchrones Ergebnis aber nicht aus: [eingefrorene Quelle: `/private/tmp/kd-vollreview-20260916/source/src/tabs/EntdeckenTab.jsx:148`](/private/tmp/kd-vollreview-20260916/source/src/tabs/EntdeckenTab.jsx:148) und [Zeile 152](/private/tmp/kd-vollreview-20260916/source/src/tabs/EntdeckenTab.jsx:152) — Repository-Pfad `src/tabs/EntdeckenTab.jsx:86-154`, gleicher Prüfcommit.
- Der vorhandene Kontoservice überträgt eine vorhandene Personen-Outbox-Operation über den bestehenden Subscription-RPC und erhält dabei externe ID und Rolle: [eingefrorene Quelle: `/private/tmp/kd-vollreview-20260916/source/src/services/radarPilot.js:356`](/private/tmp/kd-vollreview-20260916/source/src/services/radarPilot.js:356) und [Zeile 376](/private/tmp/kd-vollreview-20260916/source/src/services/radarPilot.js:376) — Repository-Pfad `src/services/radarPilot.js:356-381`, gleicher Prüfcommit.
- App reicht den Controller als `onPersonRadarChange` an die Oberfläche weiter, ohne Katalog oder lokalen Executor zu injizieren: [eingefrorene Quelle: `/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1273`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1273) und [Zeile 2012](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:2012) — Repository-Pfad `src/App.jsx:1267-1275, 2004-2012`, gleicher Prüfcommit.

## Belege und Gegenproben

**Ausgeführte lokale UI-Reproduktion des Validators.** `node /private/tmp/kd-vollreview-20260916/tests/E08-F003/validator/reproduce.mjs` endete mit Exit 0. Sie nutzt ausschließlich Produktmodule aus der eingefrorenen Quelle: echten Controller, EntdeckenTab/ManageDialog, Storage-Vertrag und `createRadarPilotService`; Storage und Fetch waren isoliert lokal gemockt, globales `fetch` war gegen jede unbeabsichtigte Netzanforderung gesperrt. Das Resultat in [`/private/tmp/kd-vollreview-20260916/tests/E08-F003/validator/result.log`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E08-F003/validator/result.log) belegt validierten Feed/State, sichtbaren Entfernen-Button und nach Klick `unresolved`, `writes: 0`, keine zusätzlichen Storage-Writes/RPCs, keine Fehlernachricht und verbleibendes Abo.

**Ausgeführte Kontrolle.** Dieselbe Identität wird mit einem explizit injizierten Eintragskatalog kanonisiert; `queueAccountPersonRadarChange(action: remove)` akzeptiert sie. Damit sind weder ein ungültiger Feed noch ein grundsätzlich unzulässiger lokaler Entfernungsvorgang die Fehlerursache. Der eingeschlagene Gast-Executor-Pfad ist kein Gegenbeleg, da er `authority: guest` verlangt und im reproduzierten Kontopfad nicht erreichbar ist.

**Statische Gegenbelege und Grenzen.** Die SQL-Kette enthält kuratierte Personen-Ziele und einen accountgebundenen Setter mit `removed`-Zweig; die gezielt geprüften Folgemigrationen bewahren Personenmetadaten und Subscriptions. Keine pauschale spätere Löschung oder Umwandlung aller Personen-Abos wurde gefunden. Das erklärt auch nicht, warum ein sichtbarer bestehender Eintrag von der Bestandsverwaltung ausgeschlossen wird. Diese SQL-Kette wurde statisch verfolgt, nicht als PostgreSQL-Lauf ausgeführt.

Der Befund ist ein Produktfehler im Controller-/Verwaltungsvertrag, kein Testwerkzeugfehler. Die jsdom-Reproduktion und lokalen Transport-Mocks belegen keinen realen Browser oder iPhone; fehlende Live- und Gerätebelege bleiben getrennte Betriebsbeleglücken.

## Korrekturziel und Abnahme

Die Entfernung von Neuanlage- und Suchkatalogen entkoppeln: Für `remove` die angefragte Identität gegen das eigene aktuell bestätigte Personen-Abo prüfen und dessen starke ID/Rolle in der bestehenden Account-Outbox verwenden. Account-, Kontext- und Serverguards bleiben erhalten. Ablehnung oder Speicher-/Syncfehler sind im Dialog sichtbar zu erklären. Keinen eingebauten Beispielkatalog als Umgehung wieder einführen.

- Ein gültiges eigenes aktives Personen-Abo lässt sich trotz leerem `PERSON_RADAR_CATALOG` im echten Verwaltungsdialog entfernen; genau eine passende Account-Outbox-Operation nutzt die bestehende Personen-Subscription-Route.
- Nach bestätigtem Feed-Sync ist das Abo ausgeblendet und bleibt auch nach Neuladen entfernt.
- Dasselbe funktioniert für ein eigenes pausiertes Personen-Abo, sofern die Radarverwaltung erreichbar ist.
- Unbekannte, fremde oder nicht bestätigte Identitäten dürfen keine Mutation auslösen; Accountwechsel und Kontextguards bleiben wirksam.
- Ablehnung oder Speicher-/Syncfehler erzeugen eine sichtbare Erklärung, keine vorgetäuschte erfolgreiche Entfernung.

## Abhängigkeiten und offene Punkte

- Keine abhängigen oder duplizierten Findings bekannt.
- Keine Live-Daten gelesen: tatsächliche Bestandszahl sowie Live-Deployment- und Migrationsstand sind unbekannt.
- Die Migrationen wurden statisch verfolgt; ein PostgreSQL-Integrationstest des Personenpfads wurde nicht ausgeführt.
- Die UI-Reproduktion verwendet jsdom und lokale Mock-Transportantworten, keinen realen Browser oder iPhone. `jsdom.scrollTo` war ausschließlich für Dialog-Cleanup als No-op ersetzt.
- Der Katalog für Neuanlage darf weiterhin leer bleiben; dieses Ticket verlangt nur einen korrekten Bestandsentfernungsweg.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E08-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E08-F003.json) (`confirmed`). Ursprüngliches Master-Proposal: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E08-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E08-F003.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die Master-Abnahme ist bestätigt, bis dessen gesonderter Abgleich vorliegt.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E08/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E08/KD-REV-E08-003.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
