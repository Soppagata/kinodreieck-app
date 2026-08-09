# Etappe 10: Privater Betrieb (Runbook-Stand 09.08.2026)

## Scope

- Auftrag: `docs/zukunft/AUFTRAG_SOL_PRIVATPILOT_ABSCHLUSS_2026-08-09.md`
- Arbeitsgrundlage: `src/lib/personalDataRegistry.js`, `src/lib/privatePilotOps.js`,
  `src/services/accountSelfService.js`, `src/components/PrivatePilotOps.jsx`,
  `src/lib/supportBundle.js`, `docs/ETAPPE_9B_BETRIEB.md`,
  `docs/ETRAPPE_9C_BETA.md`, `docs/ETAPPE_9_ABNAHME.md`.
- Ziel: schlankes Abschluss-/Runbook ohne neue Implementierung, ohne erfundene Belege.

## Dateninventar (Belege)

Basisdaten-Töpfe aus `PERSONAL_DATA_ENTRIES`:
- Masterliste
- Blog-Artikel
- Kino-Pins
- Wochenplan
- Event-Radar
- Merkliste
- KI-Vokabular
- Settings
- Entdecken-Status
- Autor-Name
- Streaming-Dienste
- Must-Watch-Liste
- Achievements
- Kino-Zeitfilter
- Filtermenü Mediathek
- Filtermenü Kino
- Filtermenü Streaming
- Geschmacksprofil

Zusätzliche Private-Pilot-Klassen (`PRIVATE_DATA_INVENTORY`):
- auth_session
- local_rollback
- ops_metadata

Eigener Datenexport-Endpunkt validiert exakt die Felder:
`auth, access, aiLogs, seriesWatch, sharedClaims, radar, retention, deletion`.

## Provider-Registry und Fail-Closed

`privatePilotOps` definiert `PRIVATE_PROVIDER_REGISTRY` mit aktivierter
serverseitiger Zulassungspflicht (`providerActivationDecision`).
Ein Pfad ist nur freigegeben, wenn:
- Feature-Flag `true`
- Registry-Zeile `enabled=true`
- `legal_status != LEGAL_OR_PROVIDER_REVIEW_REQUIRED`
- `retentionConfirmed=true`

Aktuell vorhandene Dienste sind gelistet mit `legalStatus` je nach Stand.
Für ungeprüfte Rechts-/Providersachen gilt automatisch `LEGAL_OR_PROVIDER_REVIEW_REQUIRED`.

`src/components/PrivatePilotOps.jsx` trägt explizit: „**Externe Anbieter bleiben ohne abgeschlossene
Rechts- und Aufbewahrungsprüfung serverseitig gesperrt**“.

## Retention-Vertrag (0 / 7 / 30 / 90)

Vertragliche Technikvorgabe im Auftrag 9/10:
- 0 Tage: Rohpayloads, Prompts, vollständige Snippets, Bilder, serverseitige Exportkopien
- 7 Tage: lokale Restore-/Adoption-Snapshots
- 30 Tage: terminale Operationen/Idempotenz, verwaiste Radarobjekte, Detailfehler,
  abgeschlossenes Supportbundle
- 90 Tage: inhaltsfreie Run-/Kosten-/Capability-Metadaten und bestehendes `kd_ai_log`

Zusatz:
- aktive persönliche Daten, Receipts, Präferenzen, Shares: Zweckgrenze bis Revoke/
  Aboende/Kontolöschung
- globale Radarziele: solange aktives Abo besteht, bei Null sofort deaktivieren
  und nach 30 Tagen purgen
- kontrollierte logische Dumps: max. 30 Tage, max. vier Wochenstände

## Own-Data und Self-Delete (global off)

- Runtime-Defaults: `privateSelfServiceEnabled=false`, `accountDeleteEnabled=false`.
- `privateOpsExportStatus` gibt `accountDeletion: server-flagged-disabled-by-default`.
- Own-Data-Response wird serverseitig strikt gegen erlaubte Schlüssel geprüft
  (`auth`, `access`, `aiLogs`, `seriesWatch`, `sharedClaims`, `radar`, `retention`, `deletion`).
- Der Laufplan fordert: Own-Data und Self-Delete technisch fertig bauen, aber bei fehlendem
  Remote-Enablement nicht aktivieren.
- `privatePilotOps`-Vertrag für Self-Delete verlangt: aktuelles Konto, reauth,
  idempotenter, serverseitiger Ablauf, Auth-Check, Cascade-/Residuenkontrolle,
  keine Freischaltung über breite Account-ID, ausschließlich Wegwerfkonto-Test.

## Monitoring und Support

- Monitoring/Status ist als payloadfreie, read-only Checksumme vorgesehen.
- Checkliste umfasst mindestens:
  - Deployment-/Build-SHA und Function-Build
  - Auth/DB/Health erreichbar
  - Rollen-/Radar-/Provider-/Scheduler-/Delete-Flags
  - Budget-/Circuit-Zustand ohne bezahlte Requests
  - fällige Purge-Anzahlen
  - letzter freigeschriebener kostenfreier Smoke/CI-Lauf
- Support-Paket ist auf feste Felder/Enums begrenzt (keine Titel, Bewertungen,
  Account-ID, Query, Inhalte, Secrets; siehe `src/lib/supportBundle.js`).
- 9c-Runbook fordert tägliche read-only GitHub-Checks (je Testlauf <=5 min, 20s Network-Check)
  und Fehlverhalten als `BUILD_MISMATCH / DATABASE_UNAVAILABLE / FUNCTION_UNAVAILABLE / NOT_CONFIGURED` etc
  über Support-Bundle-Payload.

## Incident-Runbook (Ergänzung aus vorhandenen Runbooks)

| Schweregrad | Owner | Erstmaßnahme | Beleg | Abschluss |
|---|---|---|---|---|
| P0 / kritisch | Owner-Verantwortlicher Betrieb | betroffene Funktion stoppen/isolieren, `ai_aktiv` auf aus setzen | aktueller Zustand + Kontrollprotokoll | Rückweg durchgeführt oder Ursache offen dokumentiert |
| P1 / hoch | Owner-Verantwortlicher Betrieb | gezielte Daten-/Konto-Lage sichern, kein sofortiges Löschen | Snapshot, Counts, Testausgabe | stabiler Rückweg (Restore/Undo/Rollback) definiert |
| P1 / hoch | Owner-Verantwortlicher Betrieb | Provider-/Scheduler-/Delete-Schalter sofort auf Off prüfen | Dashboard/Workflow-Status, Beleg-Hashes | `SAFE_SKIPPED` falls ungeprüft |
| P2 / mittel | Owner-Verantwortlicher Betrieb | Ausfall-Klassen gemäß 9b-Runbook (KI, Anbieter, DB, Deployment, Schlüssel) abarbeiten | Schrittprotokoll und Wiederholungstest | Behebungsregel erfüllt oder Fall eskaliert |


## Recovery

- Lokaler Datenpfad: Benutzer-Backup vor kritischen Schritten + Restore/Undo-Test
  (inkl. beschädigte Datei/Format verweigern) ist definiert in 9b-Runbook.
- DB-Disaster-Restore nur gegen logisches Dump außerhalb von Repo + separater Wegwerf-
  restore + RLS-/Dump-/Restore-Checks; Produktivrestore nur nach separater Freigabe.
- App-seitige Recovery-Pfade: Restore/Undo, zweites Gerät, lokale Snapshot-Rückgabe,
  `npm run test:rls` erst im kontrollierten Phase-6-Kontext.

## Scheduler SAFE_SKIPPED (aktuelle Betriebsentscheidung)

- Auftrag definiert den Schutzzustand: fehlende sichere Pre-Write-Konstellation →
  Remotewrites insgesamt `SAFE_SKIPPED`.
- Explizit festgehalten: Scheduler steht aktuell nicht als produktiv ausgelöster Laufpfad;
  Betriebsstand wird als "gebaut, manuell betreibbar, Scheduler SAFE_SKIPPED" geführt.

## Fehlende Backup-Voraussetzung

- Fallback-Matrix verlangt: **kein Shared-Backend-Write**, wenn der Backup-Nachweis
  fehlt oder ungeprüft ist.
- Ergebnis für diese Etappe: Backup-Precondition bleibt als hartes Eingangskriterium geführt.

## Filmscan / Bloganalyse / 9c / Öffentlich

- Filmscan: ersetzt durch externen Foto-/Textbatch mit Matrix
  Poster / Ticket / Programmheft, Kandidatenabgleich, Korrektur, expliziter
  Bestätigung, Bildverwerfung.
- Nicht abgedeckte Kino-/Datum-/Zeitdetails gelten als Zukunftsteil, nicht als
  live-gemeldete Hauptfunktion.
- Bloganalyse: bewusst geparkt, kein Gate.
- Formale 9c: **nicht gewählt, nicht durchgeführt**.
- Öffentlicher Start: offen als geparkt (inkl. Registrierung/Stores/Public Status/
  Supportkanal).

## Offene Widersprüche / Reviewpunkte

- `LEGAL_OR_PROVIDER_REVIEW_REQUIRED` für mehrere Providerfakten mit offenem
  DPA-/Transfer-/Aufbewahrungsstand (u. a. Anbieter außerhalb der klaren DPA-
  Baseline).
- Supportkontakt/öffentlicher Supportkanal ist im lokalen Auftrag nicht gesetzt;
  entsprechend nur Supportdaten-Download/Copy als Fallback vorgesehen.
- Produktionsweite Self-Delete-/Delete-Pfade und Remote-Deployment-Recovery
  sind für belastbare Konto-Löschtests als "Releasevertrag fertig, Live-Enablement
  global off" dokumentiert.
- `STAGING_GREEN` ist nicht belegt, solange der vollständige Remote-Write-/
  Shared-Backend-Schritt als `SAFE_SKIPPED` ausgewiesen wird.
