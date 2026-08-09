# Event-Radar Phase 2 – lokaler Liefer- und STOP-Beleg

Stand: 09.08.2026
Branch: `codex/entdecken-radar-local-phase2`
Phase-1-Basis: lokaler Commit `a52a6c4` (`feat(radar): establish phase one contracts`)
Liefergrenze: `LOCAL_ONLY_NOT_ACTIVATED`

## Ergebnis

Der lokale Event-Radar-Kern und ein deterministischer, read-only
`proposal.json`-Validator sind gebaut. Die vorbereitete SQL-Migration ist eine
lokale Datei und wurde weder gegen Supabase ausgeführt noch deployed. Es wurde
kein Provider, keine KI, kein Scheduler und keine Routine aufgerufen oder
aktiviert. Die Personen-Automatik bleibt nach dem `NO_GO` aus §6.1 vollständig
geparkt.

Phase 2 liegt absichtlich uncommitted am nächsten STOP. Der selektive
Phase-1-Commit bleibt davon getrennt.

## Lokaler Event-Radar

`src/lib/localEventRadar.js` implementiert ohne Netzwerknaht:

- Gast-Abos mit maximal zehn aktiven kanonischen Werk-, Serien- oder
  Franchisezielen,
- im Kontomodus ausschließlich serverbestätigte Subscription- und
  Share-Snapshots; lokale Änderungen landen getrennt in idempotenten Outboxen,
- einen registrierten persönlichen Topf `kd:radar` für Cache, Outboxen,
  Receipts und Anzeigezustand,
- monotone Serverrevision plus Checksum-Konfliktprüfung,
- getrennte, standardmäßig private Kreisfreigaben; eine aktive Freigabe
  verlangt ein aktives eigenes Abo und erzeugt keinen Providerjob,
- global gedachte Eventidentitäten ohne Datum sowie eigene, unveränderlich
  identifizierte Terminversionen,
- Bestätigung erst mit mindestens zwei Evidence-IDs aus mindestens zwei
  unabhängigen Publisherfamilien,
- eine read-only Wochenprojektion ausschließlich bestätigter Termine; eine
  Übernahme bleibt ein bestätigungspflichtiger Entwurf und schreibt weder
  Reminder noch Kalender.

Personen und unkanonische Ziele werden vom Event-Radar abgewiesen. Der
persönliche Topf enthält keine globale Target-, Event- oder Evidence-Wahrheit.

## Read-only Proposal-Validator

`src/lib/radarProposalValidator.js` akzeptiert ausschließlich das geschlossene
Format `kinodreieck-proposal` Version 1. Der Validator:

- begrenzt Rohdaten auf 256 KiB, 50 Items und fünf Evidenzen je Radar-Item,
- bindet jedes Proposal an einen separat erwarteten 64-stelligen Eingabehash,
- verwirft unbekannte Felder, unbekannte/gesperrte Quellen, fremde Domains,
  nicht-kanonische URLs, schwache Identitäten und widersprüchliche Claims,
- matcht Radarziele ausschließlich über kanonisches Target plus passende
  starke externe ID; Titel allein reicht nicht,
- dedupliziert URL und Fingerprint und zählt syndizierte Domains derselben
  Publisherfamilie nur einmal,
- bestätigt erst mit zwei erlaubten unabhängigen Familien; Gegenbelege bleiben
  `ambiguous`, unbekannte Quellen höchstens `candidate`,
- validiert Popularity-Vorschläge getrennt nach starker ID, `AT`, Zeitraum,
  Rang, Dienstverfügbarkeit und Duplikaten,
- liefert nur Vorschauobjekte mit `writes=false`, `routineActivated=false` und
  `automaticRetry=false`.

Es gibt in Phase 2 bewusst keinen Proposal-Importer. Die Fixtures verwenden
nur reservierte `.example`-Domains und enthalten keinen Providerpayload.

## Vorbereitete SQL-Basis – nicht angewandt

`supabase/migrations/20260809180000_event_radar_local_basis.sql` ist additiv
vorbereitet und beginnt in allen fünf Wirkungswegen fail-closed:

- `radar_aktiv=false`,
- `radar_shares_aktiv=false`,
- `radar_provider_aktiv=false`,
- `radar_scheduler_aktiv=false`,
- `radar_proposal_import_aktiv=false`.

Die Datei trennt globale Targets, deduplizierte Check-Routen, persönliche
Subscriptions, Kreisfreigaben, Receipts, idempotente Operationen, Events,
Terminversionen, Evidence und unveränderliche Reviews. `radar_unlimited` und
`radar_review` sind eigene Fachcapabilities; Rollen-v1-`owner` wird nicht
umgedeutet.

Browser erhalten keinen Direktzugriff auf globale Wahrheit oder Shares. Eigene
Subscription-/Receipt-Zeilen sind RLS-begrenzt; Security-Definer-RPCs prüfen
Login, `kd_account_active()` und Not-Aus. Der Kreisfeed dedupliziert Ziele und
enthält weder Account/Autor noch Share-ID, Zeitpunkt oder Subscriberzahl.

SQL-Trigger binden Evidence an eine aktive rechtegeprüfte Quelle, deren Domain,
Publisherfamilie und dieselbe Terminversion. Datum und Eventzuordnung einer
Version sind unveränderlich; bestätigte Versionen können nicht still
herabgestuft werden. Pausieren oder Entfernen eines Abos widerruft dessen
aktiven Share.

## Verifikation

Bereits grün:

- Phase-1-Verträge: 55/55,
- lokaler Radar, Proposal-Validator, statische Migration und Registry:
  94/94,
- Restore: 74/74,
- Account-Driver: 55/55,
- Übernahme: 44/44 plus Kontext 18/18,
- Logout: 18/18,
- Demo-zu-Konto-Wechsel: 10/10,
- bestehendes `kd_series_watch`: 7/7,
- Backup-Export: 10/10.

Die vollständige lokale `npm test`-Suite ist grün. Darin enthalten sind unter
anderem 140/140 Browserchecks, der Single-File- und der reguläre Vite-Build
sowie 62/62 Pages-Buildprüfungen. Sie verwendet laut `AGENTS.md`
ausschließlich Mocks.

Die SQL-Datei ist statisch geprüft, aber nicht in PostgreSQL ausgeführt: lokal
sind weder Docker/Podman noch `postgres`/`psql` vorhanden; eine Remote-Ausführung
ist in diesem Auftrag ausdrücklich verboten. Positive und negative RLS-,
Concurrency- und RPC-Laufzeittests bleiben deshalb Teil des nächsten
Remote-Migrations-STOPs und dürfen nicht als bereits empirisch bestanden gelten.

## Nächster STOP

Vor jeder Remote-Wirkung braucht es einen neuen ausdrücklichen Auftrag. Dann
erst, einzeln und ohne `db push`:

1. Zielprojekt, Remote-Migrationsstand, Rollen-v1-Matrix und aktuellen
   `kd_personal`-Constraint rücklesen,
2. Backup- und Forward-Fix-Beleg freigeben,
3. genau diese Migration anwenden,
4. alle fünf Flags als `false` rücklesen,
5. Grants/RLS/RPCs mit Wegwerfkonten positiv und negativ testen und Testreste
   vollständig entfernen.

Migration, Deploy, UI-/Routine-Aktivierung, Provider-/KI-Aufruf und Push bleiben
bis dahin außerhalb der Freigabe.
