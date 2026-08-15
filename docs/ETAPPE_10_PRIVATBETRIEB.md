# Etappe 10: Privater Betrieb (Runbook-Stand 09.08.2026)

## E16B2 Scope-Kontrolle

- E16B2 ist ein Source-Only-Kandidat auf Basis des SQL-Checkpoints `0358278519d7bbd88b995cfcfc9b233ff8972772` für Private-Export/Radar-Pilot-Kompatibilität mit default-off-Vertrag.
- Die Datenprojektionskette bleibt `schemaVersion: 1`, weil die vorgegebene Remote-Situation keine positive Pilot-/Exportaktivierung zeigte.
- Remote-Stand ist vorgegeben als: `20260809180000`, `20260809220000`, `20260810120000` vorhanden; `20260814120000` und `20260815120000` fehlen.
- Own-Data-Validierung ist für diese Etappe auf exakt (`radar.capabilities`, `radar.importOperations`) verengt:
  - `capabilities`: exakt `radar_unlimited`, `radar_review`, `radar_pilot`, `updated_at`; erste bis dritte Boolean, `updated_at` string.
  - `importOperations`: Array aus Zeilen mit exakt `operation_id`, `request_hash`, `result`, `terminal_at`, `expires_at`, `created_at`.
  - `actor_id` darf in `importOperations` nicht erscheinen.
- `VITE_RADAR_PILOT_CLIENT_ENABLED` und `VITE_PRIVATE_SELF_SERVICE_ENABLED` sind in Staging nur bei exakter Variable `vars.STAGING_... == 'true'` auf `"true"` gesetzt, sonst `"false"`.
- `VITE_ACCOUNT_DELETE_ENABLED` ist hart `"false"` in Staging, und Produktion härtet alle drei Flags ebenfalls hart auf `"false"` ab.
- `account-self-service`-Edge-Function, Private-Ops-Monitor, Delete-Schalter und Remote-Write bleiben unverändert; es erfolgt **kein** Remote-Write, keine Funktionenschaltung, keine `account-delete`-Aktivierung.
- `20260809180000`, `20260809220000`, `20260810120000` sind als Remote-Stand bestätigt; `20260814120000` und `20260815120000` bleiben nicht bestätigt.
- `export_enabled` ist im bestätigten Remote-Stand vollständig nicht vorhanden; die Addierung erfolgt erst in `20260815120000` mit Additiv-default `false`.
- `account-self-service` ist remote nicht deployed.
- `kd_radar_pilot_import_operations` ist in diesem bestätigten Remote-Stand nicht vorhanden, daher nicht als leer verifizierbar.
- Globale Radar- und Private-Ops-Flags stehen remote auf `false`.
- Ergebnis ist weiterhin Source-only: kein STAGING_GREEN, keine Backend-Aktivierung und kein behaupteter Remoteerfolg.

## E15A Scope-Kontrolle

- E15A ist ausschließlich ein lokaler, statischer Source-Kandidatenstand.
- Radar-Migrationen, Private-Ops-Migrationen, Retention-Migrationen, `account-self-service`-Function und Monitor-Schedule bleiben in E15A `SAFE_SKIPPED`; sie sind nicht angewendet, nicht deployed und nicht aktiviert.
- Pages-Staging kann in diesem Schritt nur Frontend/Quellstand zeigen; keine produktionsnahe Backend-Aktivierung ist Bestandteil.
- Der Private-Ops-Check in diesem Stand validiert ausschließlich den lesenden Kontrollpfad auf `export_enabled` + Private-Flags als Sicherungsstatus ohne Remote-Seiteneffekte.

## Scope

- Auftrag: `docs/zukunft/AUFTRAG_SOL_PRIVATPILOT_ABSCHLUSS_2026-08-09.md`
- Arbeitsgrundlage: `src/lib/personalDataRegistry.js`, `src/lib/privatePilotOps.js`,
  `src/services/accountSelfService.js`, `src/components/PrivatePilotOps.jsx`,
  `src/lib/supportBundle.js`, `docs/ETAPPE_9B_BETRIEB.md`,
  `docs/ETAPPE_9C_BETA.md`, `docs/ETAPPE_9_ABNAHME.md`.
- Ziel: technischer Privatbetrieb mit vollständigem Datenvertrag, fail-closed
  Self-Service, Retention, Monitoring und Supportdiagnose; keine erfundenen
  Remote- oder Rechtsbelege.

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
- ops_terminal
- ops_metadata

Eigener Datenexport-Endpunkt validiert exakt die Felder:
`auth, access, personal, aiLogs, seriesWatch, sharedArticles, sharedClaims,
radar, retention, deletion`. Radar enthält seinerseits Capabilities,
Account-State, Abos, Receipts, Shares, beide Operationsklassen und Reviews.

## Provider-Registry und Fail-Closed

`privatePilotOps` definiert `PRIVATE_PROVIDER_REGISTRY` mit aktivierter
serverseitiger Zulassungspflicht (`providerActivationDecision`).
Ein Pfad ist nur freigegeben, wenn:
- Feature-Flag `true`
- Registry-Zeile `enabled=true`
- Rechte bestätigt
- DPA/Transfer bestätigt
- `legal_status=APPROVED`
- `retentionConfirmed=true`
- Preis/Budget bestätigt
- Review höchstens 90 Tage alt

Aktuell vorhandene Dienste sind gelistet mit `legalStatus` je nach Stand.
Für ungeprüfte Rechts-/Providersachen gilt automatisch `LEGAL_OR_PROVIDER_REVIEW_REQUIRED`.

Die lokale Empfänger-/Quellenliste ist bewusst keine Rechtsfreigabe. Alle
Einträge bleiben technisch geschlossen, bis Betreiber-, DPA-/Transfer-,
Aufbewahrungs-, Rechte- und Budgetfakten einzeln bestätigt wurden.

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

Die Migration setzt Terminal-/Ablaufmarker per Trigger, entfernt widerrufene
Shares statt sie zwecklos aufzubewahren, entfernt Receipts beim Aboende und
markiert Ziele bei der letzten Referenz atomar als verwaist. Der Purge setzt
für den kontrollierten Löschpfad das Schutzflag, verarbeitet 30 Tage verwaiste
Targets ohne aktives Abo zeilenweise, löscht die zugehörigen Reviews und
anschließend per Kaskade den vollständigen Target→Event→Version→Evidence-Graphen;
Fehler werden pro Target gezählt und der Lauf wird fortgesetzt.

## Own-Data und Self-Delete (global off)

- Runtime-Defaults: `privateSelfServiceEnabled=false`, `accountDeleteEnabled=false`.
- `privateOpsExportStatus` gibt `accountDeletion: server-flagged-disabled-by-default`.
- Own-Data-Response wird im Client gegen die vollständige erforderliche
  Top-Level- und Nested-Allowlist geprüft; serverseitig kommen alle
  accountgebundenen Projektionen aus demselben Löschklassenvertrag.
- Der Laufplan fordert: Own-Data und Self-Delete technisch fertig bauen, aber bei fehlendem
  Remote-Enablement nicht aktivieren.
- `privatePilotOps`-Vertrag für Self-Delete verlangt: aktuelles Konto, reauth,
  idempotenter, serverseitiger Ablauf, Auth-Check, Cascade-/Residuenkontrolle,
  keine Freischaltung über breite Account-ID, ausschließlich Wegwerfkonto-Test.
- Die UI erzwingt zuerst den Server-Eigendatenexport, dann eine frische
  Passwortbestätigung und den exakten Löschsatz. Erst nach bestätigter
  serverseitiger Auth-Löschung trennt der Session-Koordinator den lokalen
  Kontocache. Beide Runtime-Schalter und der zusätzliche Edge-Schalter bleiben
  bis zur grünen Wegwerfkonto-Probe aus.

## Monitoring und Support

- Monitoring/Status ist als payloadfreier, read-only Workflow gebaut.
- Checkliste umfasst mindestens:
  - Deployment-/Build-SHA und Function-Build
  - Auth/DB/Health erreichbar
  - Rollen-/Radar-/Provider-/Scheduler-/Delete-Flags
  - Budget-/Circuit-Zustand ohne bezahlte Requests
  - fällige Purge-Anzahlen
  - letzter freigeschriebener kostenfreier Smoke/CI-Lauf
- `NOT_CONFIGURED`, eine fehlende/inaktive Rollen-v1-Zeile und unbekannte
  Budget-/Flagzustände machen den Workflow rot; `PURGE_DUE` bleibt eine
  sichtbare Warnung ohne Payload.
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
- App-seitige Recovery-Pfade: Restore/Undo, zwei isolierte Browserprofile,
  lokale Snapshot-Rückgabe,
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

## Offizielle Primärquellen (Abruf 09.08.2026)

Die URLs belegen nur den jeweiligen offiziellen Dokumentationsstand. Sie sind
keine automatische Freigabe; offene Produkt-, Vertrags-, Regionen- und
Aufbewahrungszuordnungen bleiben `LEGAL_OR_PROVIDER_REVIEW_REQUIRED`.

- Supabase Security: https://supabase.com/docs/guides/security
- Cloudflare DPA: https://www.cloudflare.com/cloudflare-customer-dpa/
- GitHub Privacy: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- Anthropic Retention für Covered Models: https://privacy.claude.com/en/articles/15425996-data-retention-practices-for-covered-models
- Watchmode API: https://api.watchmode.com/docs/
- Wikidata Data Access: https://www.wikidata.org/wiki/Wikidata:Data_access
- Library of Congress APIs: https://www.loc.gov/apis/
- film.at: https://www.film.at/
- nonstopkino Datenschutz (Weiterleitung auf offiziellen Policy-Host): https://nonstopkino.at/datenschutz/
- Cloudflare Pages Branch-Kontrollen: https://developers.cloudflare.com/pages/configuration/branch-build-controls/
- Supabase Reauthentication: https://supabase.com/docs/reference/javascript/auth-reauthenticate
- Supabase serverseitige Kontolöschung: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
