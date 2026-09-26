# KD-API gezielt liefern und zurücknehmen

Stand: 26.09.2026. Dieser Ablauf trennt Schema, Function, Gate und Keys. Er
führt keine Migration an einem gewöhnlichen Push aus und verwendet weder
`supabase config push` noch `supabase db push`.

## Ziele und Anfangszustand

GitHub `staging` und `production` zeigen derzeit beide auf das Supabase-Projekt
`bscjgwcntapobyxsiyce` (`https://bscjgwcntapobyxsiyce.supabase.co`). Eine
Staging-Ausführung ist daher eine Wirkung am gemeinsam genutzten Backend. Die
GitHub-Umgebungen müssen jeweils `SUPABASE_URL` und das Secret
`SUPABASE_ACCESS_TOKEN` enthalten. Cloudflare Pages bleibt im vorhandenen
Workflow `.github/workflows/deploy.yml`; die API benötigt keine neue Domain
und keine Cloudflare Function.

`KD_API_ENABLED` fehlt anfangs oder ist `false`. Der erste Function-Deploy wird
mit `enabled=false` ausgeführt. Dann bleibt jeder `/v1/*`-Aufruf vor Keyprüfung,
Requestwrite und Providerpfad mit `API_DISABLED` geschlossen; nur
`/_meta/version` ist read-only erreichbar.

## Lokaler, nicht geheimer Kandidatennachweis

Auf einem sauberen, vollständig integrierten Commit:

```sh
node tools/kd-api-release-info.mjs \
  --source-commit <40-stelliger-commit> \
  --release-id <eindeutige-nicht-geheime-id>
```

Das JSON bindet den Zweifunctionsatz `ai-task` (`verify_jwt=true`) und
`kd-api` (`verify_jwt=false`) aus demselben Commit: beide statischen
Importclosures, ihre Deploy-/Quellhashes, `supabase/config.toml`, den
vollständigen lokalen Migrationssatz und dessen Byte-Hashes. Es enthält keine
Credentials. Ein PWA-`build-meta.json`
und dessen SHA ersetzen weder diesen Functionnachweis noch den Schemaabgleich.

Vor jeder Shared-Wirkung wird der Migrationssatz nach dem gezielten,
transaktionalen Verfahren in [supabase/migrations/LIESMICH.md](../supabase/migrations/LIESMICH.md)
gegen das Remote-Ledger gelesen. Danach prüft
`tools/release-compatibility.mjs` den erwarteten und beobachteten Snapshot. Die
neue Function `kd-api` gehört zum Pflichtsatz der Function-Snapshots. Eine
fehlende Migration oder Functionversion sperrt die Freischaltung.

## Schema und Function ausliefern

Diese Schritte erfolgen erst in Etappe 6 nach der dort benannten Freigabe für
das gemeinsame Backend:

### Erste Staging-Lieferung vor Aufnahme des Workflows in `main`

Der Default-Branch des Repositories ist `main`. GitHub stellt einen neuen
`workflow_dispatch`-Workflow erst bereit, wenn dessen Workflowdatei auf dem
Default-Branch vorhanden ist ([GitHub-Dokumentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)).
Ein erster Push ausschließlich auf `staging` registriert
`.github/workflows/kd-api.yml` daher nicht als manuell startbaren Workflow.
Zur Registrierung wird weder still auf `main` beziehungsweise Production
gepusht noch eine zweite Pipeline angelegt.

Für die erste ausdrücklich freigegebene Staging-Lieferung darf der Lieferowner
dieselbe unten beschriebene, commit- und zielgebundene Zweifunction-Kette lokal
ausführen. Diese lokale Ausführung gehört zur selben gebündelten Freigabe für
das gemeinsam verwendete Supabase-Backend. Sie verwendet den lokal installierten
Supabase-CLI-Weg, `tools/kd-api-release-info.mjs`, den vorhandenen
`ai-task`-Owner-Health aus `tools/live_function_readback.mjs`,
`tools/kd-api-readback.mjs` und `tools/kd-api-function-set-readback.mjs`.
Die vorhandene geschützte lokale Konfiguration und das vorhandene Owner-
Keychain-Item bleiben dabei lokal; ihre Werte werden weder in Argumente oder
Logs geschrieben noch als GitHub-Secrets kopiert.

Die Reihenfolge ist dieselbe wie im vorbereiteten Workflow: Ziel und exakten
Commit binden; Manifest erzeugen; `KD_API_ENABLED=false` setzen und rücklesen;
`ai-task` aus diesem Commit mit `verify_jwt=true` deployen; erst danach seinen
Buildmarker setzen und über den providerfreien Owner-Health rücklesen;
`kd-api` mit `verify_jwt=false` deployen; KD-API-Metadaten und den Management-
Stand beider Functions rücklesen; Schema und Zugänge nach der getrennten
Wirkungsfreigabe ausliefern; das Gate erst nach allen geschlossenen Readbacks
öffnen und anschließend erneut rücklesen. Ein unklarer oder fehlgeschlagener
Schritt wird zuerst read-only geklärt und nicht blind wiederholt.

Der Workflow bleibt für eine spätere ausdrücklich autorisierte Aufnahme in
`main` vorbereitet. Sowohl in der GitHub-Umgebung `staging` als auch auf
Repository-Ebene fehlen derzeit
`SUPABASE_ACCESS_TOKEN`, `KD_READBACK_OWNER_USER`,
`KD_READBACK_OWNER_PASSWORD` und `MAIL_DOMAIN`; vor einem späteren
Workflowstart müssen diese Werte sowohl in der `staging`-Umgebung als auch,
soweit der spätere Aufruf es verlangt, auf Repository-Ebene bewusst und
geschützt eingerichtet werden. Dieser offene GitHub-Anschluss blockiert die
autorisierte lokale Erstlieferung nicht.

1. Ausschließlich die freigegebenen neuen Migrationen einzeln, transaktional
   und mit dem Ledger-Verfahren aus `supabase/migrations/LIESMICH.md` anwenden.
   Danach Objekt-, Grant- und Migrationsstand read-only rücklesen. Es gibt
   keinen automatischen Migrationsschritt im Workflow.
2. Den manuellen GitHub-Workflow `Deploy kd-api function set` auf dem exakt
   geprüften `source_commit` starten. `target`, `release_id` und zunächst
   `enabled=false` binden. Der Workflow serialisiert beide GitHub-Ziele gegen
   das gemeinsame Supabase-Projekt und prüft die Releasehülle. Er setzt zuerst
   `KD_API_SOURCE_COMMIT`, `KD_API_RELEASE_ID` und `KD_API_ENABLED=false`.
   Solange das neue API-Gate geschlossen ist, deployt er aus demselben Commit
   zuerst `ai-task` mit unverändertem `verify_jwt=true`, setzt dessen
   `KD_FUNCTION_BUILD_VERSION` erst nach erfolgreichem Deploy und liest den
   Commit über den vorhandenen providerfreien Owner-Health zurück. Danach
   deployt er `kd-api` mit `verify_jwt=false`, liest dessen exakten
   Versionsendpunkt und den ACTIVE-/JWT-Stand beider Functions aus dem
   Managementpfad zurück. Andere Functions werden nicht deployt.
3. Den nicht geheimen Workflow-Nachweis sowie den Remote-Schema-/Function-
   Snapshot dem Kandidaten zuordnen. Ein grüner Pages-Deploy allein genügt
   dafür nicht.

Der unabhängige Readback lautet:

```sh
node tools/kd-api-readback.mjs \
  --base-url https://bscjgwcntapobyxsiyce.supabase.co/functions/v1/kd-api \
  --expected-source-commit <40-stelliger-commit> \
  --expected-release-id <release-id> \
  --expect-enabled false
```

Umleitungen, Zusatzfelder, falsches Gate sowie Commit- oder Release-Drift sind
Fehler.

Der authentifizierte `ai-task`-Health benötigt in der gewählten GitHub-
Umgebung `KD_READBACK_OWNER_USER` und `KD_READBACK_OWNER_PASSWORD` als
Secrets sowie `MAIL_DOMAIN`, `SUPABASE_PUBLISHABLE_KEY` und `APP_URL` als
Variablen. Diese Werte werden nicht ausgegeben. Der Health-Aufruf ist
providerfrei. Fehlt sein exakter Commitmarker, bleibt `kd-api` geschlossen
und der Workflow stoppt vor dessen Deploy oder Freischaltung.

Dieser Workflow verändert bewusst auch die gemeinsam verwendete Function
`ai-task`. Damit aktualisiert er den internen `X-KD-API-Job`-/`kdApiJobId`-
Anschluss für bestehende Umgebungen; es handelt sich auch bei Ziel
`staging` um eine Shared-Backend-Wirkung. Scheitert der Ablauf nach dem
`ai-task`-Deploy, wird nicht blind erneut gestartet: zuerst werden Function-
Status und Buildmarker read-only geklärt. Das geschlossene KD-API-Gate bleibt
dabei die Wirkungsgrenze für den neuen API-Pfad.

## Keys ausgeben, rotieren und widerrufen

Der geschützte Adminweg liest das Service-Credential aus dem macOS-
Schlüsselbunddienst `at.kinodreieck.supabase.admin`, Account
`SUPABASE_SERVICE_ROLE_KEY`. Es wird weder als Argument noch aus der CLI
ausgegeben. Die Einrichtung dieses bestehenden Betriebscredentials und die
Bindung der echten Zielkonten gehören zur freigegebenen E6-Wirkung.

Jeder lokale Zugang bekommt einen nicht geheimen Alias. Die CLI erzeugt den
Rohkey kryptographisch lokal und schreibt ihn über stdin direkt in den festen
Dienst `at.kinodreieck.kd-api.access-v1`; der Alias ist dort der Keychain-
Account. Ein aktiver Eintrag hat die Envelope-Version `kd-api-keychain-v1`
und die geschützte Form `{version, alias, command, request, rawKey, metadata}`.
Der Assistentenadapter erhält nach erfolgreicher Ausgabe nur die beiden Labels
`KD_API_KEYCHAIN_SERVICE=at.kinodreieck.kd-api.access-v1` und
`KD_API_KEYCHAIN_ACCOUNT=<lokaler-alias>`. Sein Reader liest ausschließlich
den aktiven Alias. Einträge mit den internen Suffixen `::issue-pending`,
`::rotate-pending`, `::revoke-pending` oder `::revoked` sind keine
Clientcredentials. Nur Digest und Fingerprint erreichen den service-only RPC:

```sh
node tools/kd-api-keychain.mjs issue \
  --base-url https://bscjgwcntapobyxsiyce.supabase.co \
  --keychain-account <lokaler-alias> \
  --account-id <gebundene-konto-uuid> \
  --assistant-profile <personal_owner-oder-member> \
  --permissions <kommagetrennte-permissions>

node tools/kd-api-keychain.mjs rotate \
  --base-url https://bscjgwcntapobyxsiyce.supabase.co \
  --keychain-account <lokaler-alias> \
  --access-id <access-uuid> \
  --expected-key-epoch <epoch>

node tools/kd-api-keychain.mjs revoke \
  --base-url https://bscjgwcntapobyxsiyce.supabase.co \
  --keychain-account <lokaler-alias> \
  --access-id <access-uuid> \
  --expected-key-epoch <epoch> \
  --reason-code OWNER_REQUEST
```

Vor dem ersten RPC speichert die CLI Rohkey, Vorgangs-ID und Eingaben als
Pending-Eintrag. Bei Timeout oder unklarem Transportausgang nennt sie nur
Vorgangs-ID, festen Dienst und Alias. Derselbe Befehl verwendet danach
denselben Pending-Key und dieselbe Operation; kein zweiter Zugang und kein
zweiter Rotationskey wird
blind erzeugt. Erfolg wird über denselben idempotenten RPC aus dem
Operationsergebnis zurückgelesen. Erst danach wird ein neuer Key aktiv oder ein
widerrufener lokaler Rohkey gelöscht. `--operation-id` ist für einen bewusst
gebundenen Wiederanlauf zulässig, enthält aber niemals den Rohkey.
Die erfolgreiche stdout-Projektion nennt Dienst, Alias und Envelope-Version
sowie nicht geheime Lifecycle-Metadaten. Die private `accountId` wird ebenso
wie der Rohkey und die ursprünglichen Eingaben nicht ausgegeben.

Der Admin-Keychain-Eintrag für den geschützten Lifecycle-RPC ist lokal noch
nicht eingerichtet. Seine Anlage unter Dienst
`at.kinodreieck.supabase.admin`, Account `SUPABASE_SERVICE_ROLE_KEY`, gehört
zur später ausdrücklich freigegebenen Zugangsausgabe. Bis dahin werden weder
echte Owner-/Member-Keys ausgegeben noch Lifecycle-RPCs gegen das gemeinsame
Backend aufgerufen.

## Freischalten, abschalten und Function-Rollback

Freischalten geschieht nach Schema-, geschlossenem Function- und Key-Readback
durch denselben manuellen Workflow auf demselben Commit und derselben
Release-ID mit `enabled=true`. Danach muss `kd-api-readback.mjs` mit
`--expect-enabled true` passen. Ein Member-Key wird zusätzlich an den
negativen KI-/Diagnosewegen geprüft; ein echter Providerrequest ist davon
getrennt und bleibt an die Projekt-Budgetregeln gebunden.

Bei einem Vorfall zuerst denselben belegten Functioncommit mit neuer
Release-ID und `enabled=false` deployen und `enabled:false` rücklesen. Danach
betroffene Zugänge einzeln mit `revoke` sperren und die erhöhte `keyEpoch`
rücklesen. Für einen Function-Rollback wird ein zuvor belegter gemeinsamer
Git-Commit mit dem manuellen Workflow als zusammengehöriger Satz aus
`ai-task` und `kd-api` deployt, während das API-Gate geschlossen bleibt. Erst
nach Owner-Health, KD-API-Version, Management- und Kompatibilitätsreadback darf
das Gate geöffnet werden. Ein isolierter `kd-api`-Rollback wäre kein Beleg für
den internen KI-Jobanschluss.

Ein Function-Rollback rollt keine Migration und keine bereits erfolgte
Fachdatenmutation zurück. Additive Schemaobjekte bleiben geschlossen; eine
Schema- oder Datenrücknahme braucht eine eigene benannte Migration beziehungsweise
Wirkungsfreigabe.
