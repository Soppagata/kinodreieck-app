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
   bestaetigt. Es findet keine Migration und kein Testwrite statt.
5. Resend-/Mail-Konfiguration wird read-only bestaetigt. Eine echte Testmail
   ist eine eigene Wirkungsfreigabe und keine Voraussetzung dieses Vertrags.
6. Der genaue Kandidat besteht die physische PWA-Abnahme auf den vorgesehenen
   Geraeten. Erst danach ist die Kontoerstellung freigegeben.

## Stoppregel

Ein fehlender, widerspruechlicher oder nicht dem exakten Kandidaten
zuordenbarer Beleg bedeutet `NO-GO`. Insbesondere sind ein gruener lokaler Test,
ein gruener alter Workflow-Lauf oder eine erreichbare Domain jeweils allein
kein Freigabenachweis.
