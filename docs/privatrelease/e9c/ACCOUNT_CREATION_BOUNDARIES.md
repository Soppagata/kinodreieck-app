# E9c: Betriebsgrenzen vor der Kontoerstellung

## Zweck

Dieser Vertrag beschreibt den kleinsten sicheren Weg zu einem privaten Pilot:
dedizierte Pilotkonten auf dem bestehenden privaten Backend. Er erklaert das
gemeinsame Staging-/Production-Backend ausdruecklich **nicht** zu einer
isolierten Sandbox.

Die Kontoerstellung bleibt gesperrt, solange eine der unten genannten
Remote- oder Geraetepruefungen fehlt. Unbekannt ist kein Gruen:
`UNKNOWN_BLOCKS_ACCOUNT_CREATION`.

## Harte Betriebsgrenzen

- `DEDICATED_PILOT_ACCOUNTS_ONLY`: Jedes Pilotkonto wird nur fuer diesen Pilot
  angelegt. Es enthaelt keine vorbestehenden persoenlichen Daten und wird nicht
  fuer Sandbox- oder Migrationstests verwendet.
- `NO_SANDBOX_EFFECTS`: Solange Staging und Production dasselbe Supabase-Projekt
  verwenden, gibt es keine Migration, Function-Aenderung, Scheduler-Aenderung,
  Providerprobe, Loeschprobe oder Datenkopie fuer Sandboxzwecke. Der
  `STAGING_SANDBOX_SCHUTZVERTRAG.md` bleibt dafuer massgeblich und `BLOCKED`.
- `SELF_DELETE_DISABLED`: Der Frontend-Deploy setzt Account-Loeschung in
  Staging und Production hart auf `false`; der Private-Ops-Monitor erwartet
  serverseitig `delete_enabled: false`. Abweichung sperrt den Pilot.
- `PAID_AI_SCHEDULERS_DISABLED`: `.github/workflows/automatic-ai-check.yml` und
  `.github/workflows/entdecken-six-day.yml` muessen unmittelbar vor der
  Kontoerstellung read-only als `disabled_manually` belegt sein. Ein lokaler
  Test kann diesen GitHub-Zustand nicht ersetzen. Beide Workflows duerfen
  keinen `workflow_dispatch`-Einstieg erhalten.
- `SUPABASE_REMOTE_PROVENANCE`: Die an den Pilot gebundene Project Ref, die
  angewandte Remote-Migrationsliste und die Source-Closure jeder verwendeten
  Edge Function muessen zum erwarteten lokalen Stand passen. Fuer die Function-
  Closure werden Pfade, Dateizahl und SHA-256 des heruntergeladenen Remote-
  Source gegen den Kandidaten verglichen; eine gleichwertige unveraenderliche
  Deployment-Attestation muss dieselben Angaben und die Function-Konfiguration
  binden. `FUNCTION_HEALTH_IS_NOT_SOURCE_PROOF`: Ein `buildVersion`-Healthwert,
  `ACTIVE` oder eine passende JWT-Einstellung allein belegt keine Byte-Paritaet.
- `PUBLIC_SIGNUP_DISABLED`: Ein aktueller, an dieselbe Supabase-Project-Ref
  gebundener Auth-Konfigurations-Readback muss die oeffentliche Registrierung
  ausdruecklich als deaktiviert ausweisen. Ein alter Screenshot, eine lokale
  Einstellung oder die erfolgreiche Anmeldung eines bestehenden Kontos reicht
  nicht.
- `RESEND_READ_ONLY_READY`: Die Resend-Absenderdomain `kinodreieck.at` ist im
  aktuellen Provider-Readback `verified`; ihre verlangten SPF-/DKIM-DNS-Werte
  stimmen mit dem autoritativen DNS-Readback ueberein. Die Function
  `private-mail-request` ist `ACTIVE`, `verify_jwt=true` und ihre vollstaendige
  heruntergeladene Source-Closure ist bytegleich zum Kandidaten. Der
  Secret-Readback belegt nur Namen/Versionen beziehungsweise Digests der
  benoetigten Bindungen (`RESEND_API_KEY`, `KD_PRIVATE_MAIL_SENDER`,
  `KD_PRIVATE_MAIL_RECIPIENT`, `KD_PRIVATE_MAIL_HMAC_SECRET` und
  `KD_PRIVATE_MAIL_TRANSPORT_ACTIVATION_SECRET`), niemals Werte. Diese Bindung
  muss auf den bereits belegten Zustellnachweis zurueckfuehrbar sein und darf
  seither keine unbekannte Aenderung enthalten. Dafuer wird keine Testmail
  gesendet.

## Reihenfolge der letzten Read-only-Belege

1. Der Kandidat ist auf `staging` gepusht, von CI erfolgreich gebaut und auf
   der kanonischen Staging-Domain bytegenau zur erwarteten Commit-ID lesbar.
2. Solange die korrigierte Workflow-Datei nur auf `staging` liegt, ist genau ein
   ausdruecklich autorisierter `workflow_dispatch` auf dem Ref `staging` gruen.
   GitHub-Schedules laden ihre Workflow-Datei aus dem Default-Branch; ein
   natuerlicher Lauf kann die Korrektur daher erst belegen, nachdem sie diesen
   Branch spaeter erreicht hat. Ab dann muss auch der naechste natuerliche Lauf
   gruen sein. Der Job liest die Environment `staging`, checkt den Ref `staging`
   aus und leitet das App-Build-Soll aus diesem Checkout ab. Seine Konto- und
   Service-Secrets werden weiterhin nur als GitHub-Secrets bezogen.
3. Die beiden bezahl- oder providerwirksamen Scheduler sind weiterhin
   `disabled_manually`; sie werden nicht probeweise gestartet oder aktiviert.
4. Supabase-Projekt, RLS-/Rollenvertrag und private Flags werden read-only
   bestaetigt. Die vollstaendige angewandte Remote-Migrationsliste wird gegen
   die erwartete Liste des Kandidaten geprueft: keine fehlende, zusaetzliche
   oder anders eingeordnete Migration. Fuer jede pilotrelevante Edge Function
   liegt die oben definierte Source-/SHA-Provenienz vor. Healthmarker werden
   nur als zusaetzlicher Laufzeitbeleg gewertet. Es findet keine Migration und
   kein Testwrite statt.
5. Der aktuelle Auth-Konfigurations-Readback belegt fuer genau diese Project Ref
   die deaktivierte oeffentliche Registrierung. Erst dann darf der unten
   definierte Konto-Bootstrap zur separaten Wirkungsfreigabe vorgelegt werden.
6. Resend, DNS, Function und Secret-Verknuepfung erfuellen
   `RESEND_READ_ONLY_READY`. Eine echte Testmail ist eine eigene
   Wirkungsfreigabe und keine Voraussetzung dieses Vertrags.
7. Der genaue Kandidat besteht die physische PWA-Abnahme auf den vorgesehenen
   Geraeten. Erst danach ist die spaetere Kontoerstellung freigabefaehig; dieses
   Dokument selbst erstellt kein Konto.

## Atomarer Bootstrapvertrag fuer die spaetere Kontoerstellung

`ACCOUNT_BOOTSTRAP_ATOMIC` ist eine fail-closed aeussere Transaktion mit
kompensierendem Rollback, weil Auth-Admin und `public.kd_account_access` keine
gemeinsame Datenbanktransaktion anbieten. Sie wird pro Konto seriell und nur
nach einer eigenen ausdruecklichen Remote-Write-Freigabe ausgefuehrt:

1. Preflight: exakte Project Ref und dedizierte, noch nicht vorhandene
   Loginadresse binden; Auth-User und Access-Zeile muessen beide nachweislich
   fehlen. Kontoanzahl und Ziel werden ohne IDs oder Zugangsdaten im Bericht
   festgehalten.
2. Genau ein neues dediziertes Authkonto ueber den Adminweg anlegen und dessen
   zurueckgegebene ID nur innerhalb des geschuetzten Laufs halten. Kein Retry
   nach Timeout oder unklarem Ergebnis; zuerst per gebundener Loginadresse und
   ID read-only aufloesen.
3. Fuer exakt diese ID genau eine `kd_account_access`-Zeile mit
   `role=member`, `active=true` und `personal_ai=false` anlegen. Keine weiteren
   Rollen-, Provider- oder Datenwrites ausloesen.
4. Commit-Readback: genau ein Authkonto und genau eine zugehoerige Access-Zeile
   mit exakt dieser Matrix muessen sichtbar sein. Erst danach gilt der
   Bootstrap als abgeschlossen und erst danach duerfen Startzugangsdaten ueber
   den getrennt festgelegten vertraulichen Weg ausgegeben werden.
5. Bei jedem Fehler vor dem Commit-Readback bleiben Zugangsdaten gesperrt. Eine
   vorhandene Access-Zeile und danach das neue Authkonto werden in umgekehrter
   Reihenfolge kompensierend entfernt; der Abschluss-Readback muss fuer beide
   wieder null Zeilen ergeben. Unbekannter Write- oder Rollbackzustand ist
   `PARTIAL_ACCOUNT_BLOCKED`: kein Retry, kein weiteres Konto und manuelle
   Klaerung, bis entweder der exakte Commitzustand oder der exakte Nullzustand
   belegt ist. So wird kein halbes Konto an Tester uebergeben.

## Stoppregel

Ein fehlender, widerspruechlicher oder nicht dem exakten Kandidaten
zuordenbarer Beleg bedeutet `NO-GO`. Insbesondere sind ein gruener lokaler Test,
ein gruener alter Workflow-Lauf oder eine erreichbare Domain jeweils allein
kein Freigabenachweis.
