# Etappe 9b: Betriebs- und Notfallhandbuch

Stand: 30. Juli 2026

Dieses Handbuch ist der kurze, ausführbare Rückweg für die geschlossene Beta.
Verantwortlich ist Max. Eine zweite Person darf lesen und kontrollieren, aber
nichts in Produktion ändern, solange Ziel, letzter guter Stand und Rückweg
nicht eindeutig feststehen.

## Unverhandelbare Regeln

1. Erst Schaden begrenzen, dann Ursache suchen. Bei unbekannten KI-Kosten wird
   zuerst `ai_aktiv=false` gesetzt.
2. Kein Datenbank-Restore und keine Accountlöschung wird erstmals in Produktion
   geprobt. Dafür gibt es ein Wegwerfziel beziehungsweise Wegwerfkonto.
3. Vor jedem überschreibenden Schritt entsteht eine unabhängige Sicherung.
4. Dumps, App-Backups, Tokens, Passwörter und Schlüssel liegen nie im
   Repository, Chat, Ticket oder Betriebsprotokoll.
5. `supabase config push` und `supabase db push` bleiben verboten:
   `supabase/config.toml` bildet den Live-Zustand absichtlich nicht vollständig
   ab.
6. Echte KI-Tests laufen ausschließlich budgetgeschützt nach `AGENTS.md`.
   Not-Aus, Restore und Rollback brauchen keinen Anbieteraufruf.
7. Wenn eine Kontrolle nicht eindeutig grün ist, bleibt der sichere Zustand
   aktiv. Es gibt keine Scheinbestätigung.

## Erste Entscheidung

| Störung | Erster Griff | Beleg | Rückweg |
|---|---|---|---|
| Daten verändert oder gelöscht | App auf weiteren Geräten schließen; dort nicht synchronisieren | Gerätestand und App-Backup mit Prüfsumme | App-Restore, notfalls Rückgängig-Snapshot |
| KI-Kosten auffällig oder unbekannt | `ai_aktiv=false` | Health zeigt Not-Aus und Kostenstand | alten Wert erst nach Kostenklärung zurücksetzen |
| Anbieter ausgefallen | keine Wiederholschleife; bei Unsicherheit KI aus | deterministische Kernfunktionen laufen | ohne Migration wieder einschalten |
| Supabase ausgefallen | nicht abmelden; keine Migration oder Löschung | lokale Änderung bleibt als ausstehend erhalten | nach Erholung „Ausstehende senden“ |
| Frontend-/Pages-Deployment fehlerhaft | letztes gutes Produktions-Deployment wählen | Domain-Smoke meldet erwarteten Commit | korrigierten Commit normal deployen |
| Edge Function-/Function-Deployment fehlerhaft | KI aus; letzte gute Function aus Git deployen | Function-Vertrag und kostenfreies Health grün | korrigierte Function normal deployen |
| Schlüssel kompromittiert | betroffenen Datenpfad sperren; Schlüssel widerrufen | alter Schlüssel wird abgewiesen | neuen Schlüssel nur im zuständigen Secret-Store setzen |
| Accountlöschung unvollständig | keine Erfolgsmeldung; Zustand festhalten | Auth- und Kontozeilen vollständig geprüft | erneut löschen oder eskalieren |

## Nachweisblatt

Für jede Probe und jeden Vorfall wird außerhalb des Repositories nur Folgendes
festgehalten:

- Datum, Uhrzeit, Verantwortlicher und Umgebung,
- Symptom und betroffene Funktion,
- App-Build-Commit, Function-Commit und letzte Datenbankmigration,
- erster Griff mit Uhrzeit,
- Kontrollen und Ergebnis,
- Rückweg oder Roll-forward,
- Dateiname, Größe und SHA-256 von Sicherungen, aber nicht deren Inhalt,
- bei Konten nur ein Testkürzel, niemals Passwort, Sitzungstoken oder Payload.

Ein Beleg ist erst vollständig, wenn sowohl der gewünschte Zustand als auch
sein Rückweg geprüft wurden.

Betriebs-, Diagnose- und Releaseartefakte enthalten keine vollständigen
Suchanfragen, Blogtexte, Scanbilder, Notizen, Profilbelege, Anbieterantworten
oder persönlichen Inhalte wie Personennamen, E-Mail-Adressen und
Konto-Payloads.

## 1. App-Backup und Restore

### Backup erzeugen

1. Mit einem Wegwerfkonto anmelden und warten, bis kein Sync-Konflikt oder
   ausstehender Bereich mehr angezeigt wird.
2. Unter **Einstellungen → Gesamt-Backup** auf
   **Gesamt-Backup herunterladen** klicken.
3. Enthält die JSON-Datei `_warnungen`, ist sie kein bestätigtes Vollbackup:
   Ursache beheben und erneut exportieren.
4. Datei verschlüsselt außerhalb des Repositories ablegen und Größe sowie
   Prüfsumme notieren:

   ```bash
   shasum -a 256 "/absoluter/pfad/kinodreieck_backup_JJJJ-MM-TT.json"
   wc -c "/absoluter/pfad/kinodreieck_backup_JJJJ-MM-TT.json"
   ```

5. Sichtbare Stückzahlen für Masterliste, Blog, Pins, Merkliste, Must-Watch und
   Profilsignale notieren. Ein Backup enthält keine Sitzungstokens.

### Restore proben

1. Vorher ein zweites Backup des aktuellen Zielstands erzeugen.
2. Nur im Wegwerfkonto kontrolliert einen Datensatz ändern.
3. Unter **Einstellungen → Gesamt-Backup → Backup wiederherstellen** die erste
   Datei wählen und die Ersetzen-Warnung bestätigen.
4. Den Zählbericht prüfen, neu laden und auf einem zweiten Gerät kontrollieren.
5. **Rückgängig** ausführen, neu laden und den Zustand vor dem Restore prüfen.
6. Den Restore erneut ausführen und sicherstellen, dass **Ausstehende senden**
   den Kontostand erreicht.
7. Je eine beschädigte JSON-Datei und eine Datei mit falschem `format` müssen
   sichtbar abgelehnt werden; ein Restore ohne gesicherten lokalen Snapshot
   muss vor dem ersten Überschreiben abbrechen.

Der Restore ersetzt vorhandene Felder, führt sie nicht zusammen. Fehlende
Felder bleiben unverändert. Das Geschmacksprofil wird als vollständiger
Objekttopf übernommen. Bei Konflikten niemals raten: beide Seiten zuerst
exportieren.

**Nachweis:** zwei Prüfsummen, Zählbericht, zweites Gerät und erfolgreicher
Rückgängig-Lauf.

**Rückweg:** der lokale Restore-Snapshot oder das unmittelbar vorher erzeugte
zweite Backup.

## 2. Supabase-Datenbank: Entscheidungstor

Vor 9c wird genau eine Variante mit Datum und Verantwortlichem festgelegt.
Für Kinodreieck wurde am 30. Juli 2026 **Free** gewählt; verantwortlich ist
Max. Der akzeptierte maximale Datenverlust beträgt sieben Tage.

| Variante | Mindestverfahren | Entscheidung |
|---|---|---|
| Free | wöchentlicher logischer Dump, zusätzlich vor Migration, Löschung und Produktionsrelease; Restore-Probe vor 9c und nach jeder Schemaänderung | gewählt; jeweils sonntags sowie vor jedem genannten Eingriff |
| Pro | tägliche Plattform-Backups mit derzeit sieben Tagen Aufbewahrung; trotzdem logischer Dump vor riskanten Eingriffen und unabhängige Restore-Probe | Empfehlung vor fremden Konten, wenn der laufende Preis akzeptiert ist |

Bleibt die Entscheidung offen, werden keine fremden Konten eingeladen.
Plattform-Backups ersetzen weder den Nutzerexport noch die Restore-Probe.
Supabase-Storage-Objekte wären nicht im Datenbankbackup enthalten; Kinodreieck
verwendet derzeit keine solchen Objekte. Sobald sich das ändert, ist dieses
Runbook vor dem nächsten Release zu erweitern.

### Logischen Dump erzeugen

Voraussetzungen: passende Supabase CLI, PostgreSQL-Client und die
Datenbank-Verbindungs-URL aus **Connect**. Der Zielordner muss verschlüsselt und
außerhalb dieses Repositories liegen. Der normale CLI-Weg verwendet Docker
Desktop. Falls Docker nicht installiert ist, darf im Free-Plan der
`--dry-run`-Dumpauftrag der CLI mit einem offiziellen, zur Server-Hauptversion
passenden PostgreSQL-Client ausgeführt werden. Dieses client-only Verfahren
wurde am 30. Juli 2026 mit PostgreSQL 17 praktisch restauriert; die von der CLI
erzeugten Parameter dürfen dabei nicht ins Protokoll oder Repository geraten.

```bash
KD_DR_DIR="/absoluter/verschluesselter/pfad/kinodreieck-db-JJJJ-MM-TT"
mkdir -p "$KD_DR_DIR"
read -rs "?Quell-Datenbank-URL: " KD_SOURCE_DB_URL
echo
npx supabase db dump --db-url "$KD_SOURCE_DB_URL" -f "$KD_DR_DIR/roles.sql" --role-only
npx supabase db dump --db-url "$KD_SOURCE_DB_URL" -f "$KD_DR_DIR/schema.sql"
npx supabase db dump --db-url "$KD_SOURCE_DB_URL" -f "$KD_DR_DIR/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
unset KD_SOURCE_DB_URL
shasum -a 256 "$KD_DR_DIR/roles.sql" "$KD_DR_DIR/schema.sql" "$KD_DR_DIR/data.sql"
wc -c "$KD_DR_DIR/roles.sql" "$KD_DR_DIR/schema.sql" "$KD_DR_DIR/data.sql"
```

Alle drei Dateien müssen vorhanden und größer als null sein. Dateinamen,
Größen und Prüfsummen kommen ins Nachweisblatt; die Dateien selbst nicht.

### Nur in ein Wegwerfziel restaurieren

1. Ein separates, wegwerfbares Supabase-Projekt anlegen. Niemals dieselbe
   Verbindungs-URL wie Produktion verwenden.
2. Benötigte Erweiterungen aktivieren. Projektweite Auth-Einstellungen und
   Function-Secrets sind kein Bestandteil des SQL-Dumps und werden getrennt
   anhand ihrer Namen geprüft.
3. Die Ziel-URL verdeckt eingeben und den Restore in einer Transaktion starten:

   ```bash
   read -rs "?Wegwerfziel-Datenbank-URL: " KD_TARGET_DB_URL
   echo
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file "$KD_DR_DIR/roles.sql" \
     --file "$KD_DR_DIR/schema.sql" \
     --command 'SET session_replication_role = replica' \
     --file "$KD_DR_DIR/data.sql" \
     --dbname "$KD_TARGET_DB_URL"
   ```

4. Im Ziel Tabellen, Inhalte, Funktionen, Policies und Kontentrennung prüfen:

   ```bash
   psql --dbname "$KD_TARGET_DB_URL" --command "select count(*) as public_tabellen from information_schema.tables where table_schema='public';"
   psql --dbname "$KD_TARGET_DB_URL" --command "select count(*) as public_policies from pg_policies where schemaname='public';"
   psql --dbname "$KD_TARGET_DB_URL" --command "select count(*) as public_funktionen from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"
   psql --dbname "$KD_TARGET_DB_URL" --command "select count(*) as auth_konten from auth.users;"
   psql --dbname "$KD_TARGET_DB_URL" --command "select count(distinct account_id) as konten_mit_daten from public.kd_personal;"
   psql --dbname "$KD_TARGET_DB_URL" --command "select schluessel, wert from public.kd_ai_limits order by schluessel;"
   unset KD_TARGET_DB_URL
   ```

5. Die App auf das Wegwerfziel konfigurieren, zwei Wegwerfkonten verwenden und
   `npm run test:rls` ausführen. Dieser Test ruft keinen KI-Anbieter auf.
6. Je Konto exemplarische persönliche Bereiche vergleichen. Zusätzlich
   `kd_ai_limits`, reine Diagnosefelder aus `kd_ai_log` und die öffentlichen
   Demo-/Katalogzeilen prüfen.
7. Das Wegwerfziel erst entfernen, nachdem der Nachweis abgeschlossen ist.

Ein Produktionsrestore braucht danach eine eigene, ausdrückliche Entscheidung,
ein frisches logisches Backup des noch erreichbaren Iststands, Wartungsfenster
und denselben Prüfplan. Bei Pro wird ein Plattform-Restore nur nach dieser
Sicherung bestätigt; das Projekt ist währenddessen nicht erreichbar.

**Nachweis:** drei Dump-Prüfsummen, fehlerfreier Transaktionsrestore,
Tabellen-/Funktions-/Policy-Zahlen und grüner RLS-Test mit zwei Konten.

**Rückweg:** Wegwerfziel verwerfen. In Produktion ist der Rückweg ein zweites,
vor dem Eingriff erzeugtes Backup; niemals ein ungeprüfter weiterer Restore.

## 3. KI-Notaus, Kosten und Limits

### Not-Aus

Vorherigen Zustand lesen, dann abschalten:

```sql
select schluessel, wert, geaendert_at
  from public.kd_ai_limits
 where schluessel = 'ai_aktiv';

update public.kd_ai_limits
   set wert = 'false'::jsonb, geaendert_at = now()
 where schluessel = 'ai_aktiv'
 returning schluessel, wert, geaendert_at;
```

Danach `npm run check:ai-budget` ausführen. `health` ruft kein Modell auf; der
Schalter und der gebuchte Monatsstand müssen lesbar sein. Bei
`BUDGET_UNBEKANNT`, `AUTONOMIE_STOPP` oder Exit-Code 75 bleibt KI aus. Niemals
einen bezahlten Auftrag nur zum Beweis des Not-Aus starten. Der lokale
Mock-Beleg ist `npm run test:function`.

Erst nach geklärter Ursache wird der vorherige Wert kontrolliert zurückgesetzt:

```sql
update public.kd_ai_limits
   set wert = 'true'::jsonb, geaendert_at = now()
 where schluessel = 'ai_aktiv'
 returning schluessel, wert, geaendert_at;
```

### Beta-Limits

Vor Einladung der Kohorte:

- `tageslimit_auftraege = 10` je Konto,
- `monatsbudget_usd_cent = 1000` global,
- autonomer Testwächter weiterhin höchstens 500 US-Cent,
- `parallel_max` unverändert,
- `intelligent-search` nach grünen Function-Vertragstests von 8192 auf
  4096 Ausgabetokens drosseln; nicht unter 3072 raten,
- Preiszeile für Sonnet 5 spätestens zum 1. September 2026 auf den dann
  belegten Anbieterpreis aktualisieren.

Tages- und Antwortlimit werden nach grünen Function-Vertragstests in dieser
Reihenfolge über die geprüften Migrationen gesetzt, nicht durch einen freien
Dashboard-Klick:

1. `supabase/migrations/20260730230000_etappe9_beta_tageslimit.sql`
2. `supabase/migrations/20260730231000_etappe9_beta_antwortlimit.sql`

Danach:

```sql
select schluessel, wert, geaendert_at
  from public.kd_ai_limits
 where schluessel in (
   'ai_aktiv',
   'tageslimit_auftraege',
   'monatsbudget_usd_cent',
   'parallel_max',
   'task_max_tokens',
   'preise_usd_cent_pro_mtok'
 )
 order by schluessel;
```

Bei auffälligen Kosten: KI aus, nur Metadaten aus `kd_ai_log` prüfen
(Aufgabe, Status, Modell, Token, Kosten, Dauer, Fehlerklasse, Versionen,
Zeitstempel) und mit der Anbieterabrechnung abgleichen. Keine Prompts,
Suchanfragen, Notizen, Antworten oder Konto-Payloads protokollieren.

**Nachweis:** alter und neuer Schalterwert, kostenfreies Health-Ergebnis,
Limitabfrage und unveränderter Kostenstand.

**Rückweg:** vorherige Konfigurationswerte gezielt wiederherstellen; niemals
eine Limitzeile löschen, denn fehlende Grenzen sperren den Endpunkt.

## 4. Supabase- und Anbieterausfall

### Supabase

1. Keine Person abmelden und keine App-Daten löschen.
2. Keine Migration, Accountlöschung oder Function-Auslieferung beginnen.
3. Einen kleinen lokalen Wegwerf-Eintrag anlegen; er muss als ausstehend
   erhalten bleiben.
4. Cloudflare-App-Hülle und lokale Exporte getrennt prüfen. Ein grüner
   Pages-Smoke beweist nicht, dass Auth, RLS oder Sync gesund sind.
5. Nach Erholung Sitzung erneuern lassen, **Ausstehende senden** wählen,
   Sync-Konflikte prüfen und ein Gesamt-Backup erzeugen.
6. Auf einem zweiten Gerät vergleichen. Bei Abweichung beide Stände sichern,
   keinen automatischen Merge erzwingen.

### Anbieter

1. Keine schnellen Wiederholungen und keine Modell- oder Datenmigration.
2. Funktionieren deterministische Kernfunktionen, den sichtbaren
   Fehlerzustand akzeptieren; bei wiederholten Fehlern oder unklarer
   Abrechnung KI abschalten.
3. Nach Anbietererholung zuerst kostenfreies `health` und lokale
   Function-Tests prüfen. Ein echter Smoke ist nur ausdrücklich geplant und
   budgetgeschützt erlaubt.

**Nachweis:** lokale Änderung überlebt, spätere Übertragung ist sichtbar,
Kernfunktionen laufen ohne KI.

**Rückweg:** keine Datenmigration; ausstehende Änderungen senden
beziehungsweise den zuvor dokumentierten KI-Schalter zurücksetzen.

## 5. Cloudflare-Pages-Rollback

1. Im Pages-Projekt **Deployments** öffnen.
2. In **All deployments** den letzten nachweislich gesunden
   Produktions-Deploy anhand des Commit-SHA wählen. Preview-Deployments sind
   kein Rollbackziel.
3. Drei-Punkte-Menü → **Rollback to this deployment** → Ziel nochmals prüfen
   und bestätigen.
4. Den zurückgerollten Commit gegen die feste Domain prüfen:

   ```bash
   APP_URL=https://kinodreieck.at \
   EXPECTED_BUILD_VERSION=<GUTER_COMMIT_SHA> \
   npm run check:remote
   ```

5. Startseite, `/download/`, Manifest, Service Worker und einen tiefen
   App-Zustand neu laden. Wenn der Smoke mangels öffentlicher Supabase-Werte
   die Katalogprüfung überspringt, Demo-Katalog zusätzlich sichtbar prüfen.
6. Deployment-ID, Commit und Ergebnis notieren. Der Rollback verändert nur
   statische Dateien, nicht Supabase-Daten.

**Nachweis:** `build-meta.json` meldet den guten Commit und der Domain-Smoke ist
grün.

**Rückweg:** Fehler im Feature-/Staging-Pfad korrigieren und den korrigierten
Commit durch den normalen GitHub-Workflow deployen; `main` nicht verdeckt
handbearbeiten.

## 6. Function-Rollback

Supabase besitzt hier keinen migrationsartigen Rückrollknopf. Der Rückweg ist
die eine Function-Datei aus dem im Releaseprotokoll festgehaltenen guten
Git-Commit.

1. KI ausschalten.
2. Den guten Commit und dessen Function-Diff prüfen.
3. Einen temporären, abgetrennten Worktree verwenden; den aktuellen
   Arbeitsstand nicht umschalten:

   ```bash
   KD_GOOD_COMMIT=<GUTER_FUNCTION_COMMIT>
   KD_FN_PARENT="$(mktemp -d)"
   KD_FN_TREE="$KD_FN_PARENT/tree"
   git worktree add --detach "$KD_FN_TREE" "$KD_GOOD_COMMIT"
   cd "$KD_FN_TREE"
   npm ci
   npm run test:function
   npx supabase functions deploy ai-task
   ```

4. Deploy-Ausgabe, Commit und Function-Name festhalten. Niemals
   `supabase config push` oder `supabase db push` ergänzen.
5. Kostenfreies `health` und die App-Fehlermeldung prüfen. KI bleibt aus, bis
   Vertrag, Limits und Ursache geklärt sind.
6. Nach der Probe den Worktree vom Haupt-Repository aus entfernen:

   ```bash
   cd /Users/max/Documents/GitHub/kinodreieck-app
   git worktree remove "$KD_FN_TREE"
   rmdir "$KD_FN_PARENT"
   unset KD_FN_TREE KD_FN_PARENT KD_GOOD_COMMIT
   ```

**Nachweis:** grüner Function-Vertrag, Deploy-Ausgabe, guter Function-Commit
und kostenfreies Health.

**Rückweg:** korrigierte Function aus einem neuen, geprüften Commit auf
demselben Weg ausliefern; erst danach KI bewusst wieder einschalten.

## 7. Schlüsselrotation

Immer nur den betroffenen Schlüssel drehen. Zuerst den zugehörigen Datenpfad
sperren, dann alten Schlüssel widerrufen, neuen mit Minimalrechten setzen und
den alten Wert wirkungslos belegen.

| Schlüssel | Sofortmaßnahme | Neuer Ablageort | Kostenfreie Kontrolle |
|---|---|---|---|
| Anthropic | KI-Notaus, alten Key beim Anbieter sperren | Supabase Function Secret `ANTHROPIC_API_KEY` | `health` meldet Secret vorhanden; Gültigkeit erst in ausdrücklich budgetgeschütztem Smoke |
| Cloudflare API Token | alten Token widerrufen | GitHub Environment Secrets `staging` und `production` | Staging-Workflow und Domain-Smoke |
| Supabase Service-Role/API Secret | betroffene Serverpipeline stoppen, alten Wert widerrufen | nur zuständiger lokaler/Plattform-Secret-Store | neuer Schlüssel führt genau einen nötigen, nicht schreibenden Pipeline-Check aus; alter wird abgewiesen |
| Datenbankpasswort | alte Verbindungen beenden, Passwort drehen | Passwortmanager; nur verdeckte Prozesseingabe | neuer logischer Testdump |
| Supabase-/GitHub-Zugriffstoken | Token beim Herausgeber widerrufen | lokaler CLI-Secret-Store beziehungsweise GitHub Secret | nur benötigten Lese-/Deployvorgang prüfen |
| Testkonto-Passwort | im Auth-Dashboard ersetzen | macOS-Schlüsselbund | Anmeldung des Wegwerfkontos |

Für den Anbieter-Key ist die verdeckte CLI-Eingabe aus dem bestehenden
Runbook zulässig:

```bash
read -rs "?Neuer Anthropic-Key: " KD_PROVIDER_KEY
echo
npx supabase secrets set ANTHROPIC_API_KEY="$KD_PROVIDER_KEY"
unset KD_PROVIDER_KEY
```

Keine Schlüsselwerte, Endungen oder Screenshots ins Nachweisblatt aufnehmen.
Öffentliche Publishable-Werte sind keine Secrets; ihre Änderung ist trotzdem
ein koordinierter App-Konfigurationswechsel und keine spontane
Incident-Maßnahme.

**Rückweg:** Bei einem fehlerhaften neuen Schlüssel bleibt der betroffene
Datenpfad aus. Einen kompromittierten alten Schlüssel niemals reaktivieren;
stattdessen einen weiteren neuen Schlüssel erzeugen.

## 8. Accountlöschung

Nur mit einem Wegwerfkonto proben. Eine echte Löschung ist absichtlich
irreversibel.

1. Anmeldung und Testkürzel eindeutig zuordnen.
2. Auf Wunsch der Person ein Gesamt-Backup erzeugen, Prüfsumme prüfen und
   sicher übergeben. Ohne Wunsch keine zusätzliche Kopie anlegen.
3. Vorher nur Zeilenzahlen für `kd_personal` und `kd_ai_log` notieren.
4. **Supabase → Authentication → Users → Nutzer löschen**.
   Beide Tabellen referenzieren `auth.users` mit `on delete cascade`.
5. Im SQL-Editor mit der nur für diesen Lauf bekannten UUID prüfen:

   ```sql
   select
     not exists(select 1 from auth.users where id = '<WEGWERF-UUID>') as auth_entfernt,
     not exists(select 1 from public.kd_personal where account_id = '<WEGWERF-UUID>') as personal_entfernt,
     not exists(select 1 from public.kd_ai_log where account_id = '<WEGWERF-UUID>') as ai_log_entfernt;
   ```

6. Alle drei Werte müssen `true` sein. Danach `npm run test:rls` mit den zwei
   verbleibenden Testkonten ausführen.
7. Auf Geräten können lokale Daten und eine alte Sitzung weiterliegen. Das im
   Löschhinweis klar sagen; lokale Websitedaten nur mit Zustimmung der Person
   entfernen.

Schlägt ein Schritt fehl, bleibt der Vorgang offen: keine Löschbestätigung,
erneut prüfen und gegebenenfalls an Supabase eskalieren. Die UUID kommt nicht
ins dauerhafte Nachweisblatt.

**Nachweis:** drei boolesche `true`, grüner Isolationstest und dokumentierter
Hinweis auf lokale Gerätekopien.

**Rückweg:** Für das gelöschte Auth-Konto gibt es keinen Rückweg. Falls die
Person zurückkehrt, neues Konto anlegen und nur ihr zuvor verifiziertes
App-Backup einspielen.

## 9. Abnahmecheck 9b

- [ ] App-Backup, zweites Gerät, Restore und Rückgängig praktisch grün
- [x] Free oder Pro entschieden und Verantwortlichkeit terminiert
- [x] logischer Dump außerhalb des Repos, Prüfsummen vorhanden
- [x] Restore im Wegwerfziel, direkte RLS-Kontentrennung und produktiver RLS-Vertrag grün
- [x] KI-Notaus ohne Anbieteraufruf belegt
- [x] Beta-Limits abgefragt und Tageslimit 10
- [ ] Supabase-/Anbieterausfall als Trockenlauf nachvollziehbar
- [ ] Pages-Rollback samt Domain-Smoke geprobt
- [ ] Function-Rollback aus bekanntem Commit geprobt
- [x] Schlüsselorte und Minimalrechte geprüft, keine Werte protokolliert
- [x] Accountlöschung am Wegwerfkonto vollständig belegt
- [x] `npm test` und `npm run test:function` grün
- [x] finaler Build-, Bundle- und Secret-Scan grün

## Veränderliche Plattformquellen

Vor einem echten Disaster-Restore die Befehle nochmals gegen die aktuelle
Herstellerdokumentation prüfen:

- Supabase Backups:
  <https://supabase.com/docs/guides/platform/backups>
- Supabase CLI Backup/Restore:
  <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- Supabase Function Deployment:
  <https://supabase.com/docs/guides/functions/deploy>
- Cloudflare Pages Rollback:
  <https://developers.cloudflare.com/pages/configuration/rollbacks/>
