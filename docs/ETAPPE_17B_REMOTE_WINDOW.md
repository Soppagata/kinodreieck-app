# Etappe 17B – Echte Remote- und Migrationsfenster (Runbook)

## Geltungsbereich

- Scope: Edge Function `ai-task` und Migrationspfad für `20260817120000_blog_profile_extract_config.sql`.
- Ausfuehrender Vertrag ist ausschliesslich der gemeinsame Helper
  `tools/e17b-remote-window.mjs` mit den unten genannten sieben getrennten Modi;
  dieses Dokument ist das Runbook, nicht der Executor.
- Baseline-Commit wird beim Start über `git rev-parse HEAD` als 40-hex Kandidat ermittelt und mit
  der gleichen Remote-Ref (`git ls-remote`) exakt verifiziert.
- Nicht erlaubt: echter KI-Provider-Lauf (`npm run test:ai:live`), Live- oder
  Eval-Lauf außerhalb des späteren gesonderten Auftrags.
- Für den Start ist der finale Branch/Commit nach `HEAD` auf die gleiche Remote-Ref
  zu pushen und per `git ls-remote` exakt zu verifizieren.

## Zielidentität

- Function: `ai-task`
- Migration: `20260817120000_blog_profile_extract_config.sql`
- Ledger-Zielzeile (E17B): `blog_profile_extract_config`
- Remote-Window-Status (vor Lauf): `REMOTE_PAYLOAD_PENDING`

## Keychain-/Infra-Matrix

- Live/Smoke-Readiness: Service `at.kinodreieck.codex.live-tests.shared`, Account `KD_TESTA_PASS`
  (`TestB` wird in diesem Lauf nicht benötigt).
- Infrastruktur: Service `at.kinodreieck.codex.supabase.bscjgwcntapobyxsiyce`, Accounts
  `SUPABASE_ACCESS_TOKEN` und `DB_POSTGRES_PASSWORD`.

## Feste Modi (genau diese sieben)

1. `local-contract`
2. `read-preflight`
3. `backup-restore`
4. `function-release`
5. `db-apply`
6. `postflight`
7. `cleanup-local`

## Zwingende Betriebsregeln

- Kein `all`, kein Autoresume, kein Retry.
- Management/Health nur ueber festen Node-`fetch` gegen Auth und exakt
  `https://bscjgwcntapobyxsiyce.supabase.co/functions/v1/ai-task`, mit festen
  Timeouts und nur gegen den eigenen Responsevertrag.
- Vor erfolgreichem Parsing gilt `REMOTE_PAYLOAD_PENDING`.
- Keine Shell, `curl`, `jq`, `gh`, `rm`, `.pgpass` oder `PGPASSFILE`;
  Kindprozesse laufen immer mit `shell:false`, festen Argv-Arrays sowie
  absoluten, gelockten Binaries und festen Timeouts.
- Kein lokaler Keychain- oder Secret-Wert darf in Logs, Doku, Commits oder Artefakten landen.
- `PGPASSWORD` und `SUPABASE_ACCESS_TOKEN` nur kindlokal im erlaubten Child-Environment; keine Umgebungsvererbung außerhalb des Runs.
- `package.json` im Kernpaket enthält nur den lokalen Mocktest; Remote-Write-Skripte
  (`db push`, `config push`, `migration repair`) sind in diesem Window verboten.
- Zulässige dynamische Werte sind nur:
  - exakt ein validierter 40-hex Commit
  - ein Child-Runverzeichnis unter `/private/tmp` mit `realpath`/mode/owner-Prüfung
- Alle Owner-Gates sind fremd-/owner-provided und checkpointgebunden; der Helper darf
  keine neuen Function- oder DB-Freigaben erzeugen.

## Evidence-Vertrag (nummeriert)

`00-contract` → `10-read-preflight` → `11-function-preimage` →
`12-db-preimage` → `20-backup-manifest` → `21-restore-proof` →
`22-canonical-detail` → `23-canonical-detail` → `30-function-checkpoint` →
`31-function-apply` → `32-function-postflight` → `40-db-checkpoint` →
`41-db-apply` → `42-db-postflight` → `90-remote-delta` → `91-rollback-plan` →
`98-credential-cleanup` → `99-final-checkpoint`

- Evidence enthält nur allowlist-geparste Nichtgeheimwerte, Statuscodes und
  nicht-sensitive Hashes.
- Rohe Payloadbytes der ersten echten Probe werden vor Parser-Akzeptanz nur
  prozessintern und transient fuer die empirische Adapterfreigabe gehalten.
  Sie gelangen niemals in Evidence, Datei, Chat oder Uebergabe und werden nach
  der Auswertung tatsaechlich verworfen.
- Evidence speichert keine Rohpayloads und keine rohen CLI-/SQL-/HTTP-Outputs.

## Ablauf (lokaler Pflicht-Runbook-Vertrag)

### A. Lokale Bereitstellung und Referenz

`local-contract` validiert: sauberer Worktree, Commit, Owner-Bereich,
Dateihoheit, Schreib-/Remotegrenzen, Zielkontrakt.
- Branch und Commit sind auf der konfigurierten Remote-Ref exakt verifiziert.
- Funktionelles `STOP` bei Unstimmigkeit beendet den Lauf ohne Folgeaktionen.

### B. Read-Preflight

`read-preflight` prüft:
- Function-Source/Commit
- Remote-Ledger-Stand und Open-Migrationen
- Build-/Release-Referenzen
- Flags/Runtime-Status
- ausgeschlossene parallele Schreiber/Locks
- Roh-Remote-Payload wird vor Parser-Akzeptanz einmalig nur prozessintern
  erfasst; bei erfolgreichem Parse wird `REMOTE_PAYLOAD_PENDING` aufgehoben.
- Bei Parse-Fehler bleibt `REMOTE_PAYLOAD_PENDING` aktiv, der Treffer wird
  als `STOP` dokumentiert.

### C. Backup + Restore-Validierung

`backup-restore` führt:
- frisches Snapshot-Artefakt in temporärem `runDir` unter `/private/tmp`
- `pg_dumpall --roles-only --no-role-passwords --database=postgres` für Rollenexporte, keine gemeinsame Restore-Phase mit `pg_dumpall`.
- gemeinsamer Snapshot-ID-Datensatz über exportierte Knoten `public`,
  `supabase_migrations` und `auth.users` (ID-only) ist mit exakt derselben
  Remote-Target-Identity `bscjgwcntapobyxsiyce` in allen Konsumern konsistent.
- Restore ausschließlich in temporärem, socket-only PG17-Child (lokal isoliert, `psql -h` auf Socket).
- minimale `NOLOGIN`-Rollen inkl. `supabase_admin` nur im temporären Kindpfad.
- strukturierte, gezählte und kanonische Nachsicht (Schema, Tabellensätze, Datenhash, `COLLATE C`)
- lokale Cleanup-Entsorgung nur für helper-eigene, verifizierte Pfade
  (`realpath`/Owner/Mode/Target-Identity geprüft).
- Restore-Postflight vor jedem Weiterkommen; bei Abweichung `STOP`.

Ohne grünen Restore-Postflight folgt direkt `STOP`.

### D. Function Release

`function-release` zwingt die Reihenfolge:

1. `20-backup-manifest` bis `23-canonical-detail` muessen einen gruenen
   Backup-/Restore-Checkpoint fuer dieselbe Remote-Target-Identity belegen.
2. Der fremd-/owner-provided Gate fuer `function-release` muss exakt an
   `30-function-checkpoint`, Function `ai-task` und den validierten 40-Hex-Commit
   gebunden sein; der Helper erzeugt ihn nicht.
3. Ziel-Function, vollstaendigen Function-Source-Checkpoint und Body-Preimage
   laden. `functions download ai-task` ist nur als bodygepruefte Vorstufe
   (`11-function-preimage`) zulaessig.
4. `functions deploy ai-task` nach lokaler Pruefung der gebundenen Function-Config
   (`verify_jwt=true`) ausführen.
5. Nur bei erfolgreichem Deploy: Marker-Satz nur mit exakter Syntax
   `KD_FUNCTION_BUILD_VERSION=<40hex>` auf denselben Commit setzen.
6. Anschliessend authentifizierter, kostenfreier Postflight auf TestA gegen den
   eigenen Health-Responsevertrag:
   - Health-Postflight liest `buildVersion` exakt als gesetzten Commit.
   - `verify_jwt=true` wird gegen `config.toml` geprüft.
   - `blog-profile-extract` bleibt im Fail-Closed-Zustand (`not-ready`), solange der
     DB-Lauf nicht vollständig bestätigt wurde.
7. Deployfehler: Marker unveraendert, `STOP`.
8. Marker-Writefehler nach erfolgreichem Deploy: Function neu, Marker weiterhin
   alt, `STOP`, kein DB-Apply, kein Auto-Rollback.
9. Auth-Health-Fehler nach erfolgreichem Marker-Write: Function und Marker neu, `STOP`,
   kein DB-Apply, kein Auto-Rollback.

Erlaubte Supabase-CLI-Ausführung nur per lokal gebundenen Binary:
`./node_modules/.bin/supabase`

Erlaubte CLI-Aufrufe sind ausschliesslich diese lokal gebundenen Formen:

- `./node_modules/.bin/supabase functions list --project-ref bscjgwcntapobyxsiyce`
- `./node_modules/.bin/supabase functions download ai-task --project-ref bscjgwcntapobyxsiyce`
- `./node_modules/.bin/supabase functions deploy ai-task --project-ref bscjgwcntapobyxsiyce`
- `./node_modules/.bin/supabase secrets list --project-ref bscjgwcntapobyxsiyce`
- `./node_modules/.bin/supabase secrets set KD_FUNCTION_BUILD_VERSION=<40hex> --project-ref bscjgwcntapobyxsiyce`

Verboten in diesem Ablauf: andere Subcommands, `--no-verify-jwt`, `--prune`,
Retries.

### E. DB-Anwendung

`db-apply` ist separiert und enthält exakt eine neue Ledgerzielzeile:
- Vor Lauf ist die Ledgerzeile `(version='20260817120000',name='blog_profile_extract_config')`
  in `supabase_migrations.schema_migrations(version,name,statements)` absent.
- `db-apply` bindet exakt diese Zielzeile und ein echtes leeres Array:
  - `version='20260817120000'`
  - `name='blog_profile_extract_config'`
  - `statements=ARRAY[]::text[]`
- Datensatz darf nach Lauf exakt einmal vorhanden sein; nicht mehr als ein
  Eintrag wird ergänzt.
- Status/Datensatz wird erst nach vollständigem, autorisierten Lauf ergänzt.
- Nur der committed SQL-Inhalt aus `20260817120000_blog_profile_extract_config.sql`
  und genau diese eine Ledgerzeile werden als helpererzeugter exakter
  UTF-8-Bytestrom in EINER global validierten aeusseren BEGIN/COMMIT-Transaktion
  geschrieben. Es gibt keine Cross-System-Atomaritaet mit Function oder Health.
- Vor `db-apply` gilt: Marker gesetzt (`KD_FUNCTION_BUILD_VERSION`), authentifizierter
  Health-Postflight auf TestA positiv mit `buildVersion=<40hex>` und
  `blog-profile-extract=not-ready`, sowie aktueller DB-Prewrite-Checkpoint vorab
  bestätigt.
- Der frische fremd-/owner-provided Gate fuer `db-apply` ist exakt an
  `40-db-checkpoint`, Remote-Target-Identity, committed Migration und diese eine
  Ledgerzeile gebunden; der Helper erzeugt ihn nicht.
- Datenvertrag: am Key `blog-profile-extract` werden nur drei vorhandene JSON-Objekte
  mit `klein / 2048 / 5` ergänzt; sämtliche anderen Keys/Zeilen/Flags/ACL/RLS/Struktur/Counts/Datahashes bleiben unverändert.
- E17B nutzt keine `db query`; die SQL-Anwendung läuft als helpererzeugter
  UTF-8-Byte-Stream in global validierter BEGIN/COMMIT-Transaktion.
- `db push`, `config push`, `migration repair` sind im E17B-Pfad verboten.

### F. Postflight

`postflight` prüft:
- Function-Hook/Post-Health-Postimage
- Konfigurations-Leseback: `task_modell`, `task_max_tokens`, `task_max_reservierung_usd_cent`
- Ledger- und Build-Korrelation (lokal)
- unveränderte Not-Aus- und Kostenkette.
- Der erste authentifizierte TestA-Health nach Deploy und Marker muss
  `buildVersion=<40hex>` exakt sowie `blog-profile-extract=not-ready` melden.
- Erst danach darf die separate DB-Transaktion laufen. Nach erfolgreichem
  `db-apply` folgt ein zweiter authentifizierter TestA-Health, der denselben
  Build exakt und `blog-profile-extract=ready` melden muss.

### G. Cleanup-Local

`cleanup-local` beendet alle Kindprozesse und verwirft deren lokale
Credential-Umgebungen. Danach prueft es `realpath`, Owner, Modus,
Remote-Target-Identity und exakten helper-eigenen Zielpfad erneut und entfernt
tatsaechlich nur diesen Wegwerfpfad. `98-credential-cleanup` dokumentiert
ausschliesslich den bereinigten Status; `99-final-checkpoint` schliesst mit:

- letztem validierten Commit,
- letztem abgeschlossenen Checkpoint,
- fehlenden Restpunkten oder STOP-Begruendung.

## Echte Owner-STOPs

- falscher Commit/Dirty-State
- Scope- oder Rechteabweichung
- fehlender Restore- oder Health-Nachweis
- nicht eindeutig erlaubte Secret-Nutzung
- nicht geparste Remote-Payload (`REMOTE_PAYLOAD_PENDING`)
- neue Stopps/Time-Outs/Exit-Errors aus dem Live/Infra-Teilfenster

## Recovery-Stand

- Paket- und Skriptstand bleibt auf das vereinbarte Kernset begrenzt.

- Funktions-Recovery ist nur nach einem neuen fremd-/owner-provided,
  checkpoint- und objektgebundenen Gate erlaubt: Forward-Redeploy des komplett
  gesicherten und bodyverifizierten Function-Source-Preimages, danach dessen
  zugehoeriger alter validierter 40-Hex-Buildmarker.
- DB-Recovery nur nach einem neuen fremd-/owner-provided, checkpoint- und
  objektgebundenen Owner-STOP als separat reviewter Conditional Forward-Fix;
  Full Restore ist ein eigener Owner-STOP, kein automatischer Rollback im selben
  Lauf.
