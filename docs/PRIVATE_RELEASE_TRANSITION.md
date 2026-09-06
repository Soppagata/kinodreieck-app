# Kontrollierter Private-Release-Uebergang

Dieses Runbook gilt fuer den einmaligen Uebergang, bei dem die bereits
zeitgesteuerten GitHub-Workflows und die zugehoerigen Supabase Functions nicht
gleichzeitig ihren Vertrag wechseln koennen. Es ersetzt weder den lokalen
Abschlusslauf noch das abschliessende Release-Paritaetsgate.

`tools/release-transition.mjs` ist ausschliesslich ein lokaler Validator. Er
liest zwei vom Operator angegebene JSON-Dateien, den lokalen Git-HEAD, die
lokalen Migrationen und die beiden lokalen Workflowdateien. Er ruft weder
GitHub noch Supabase, Cloudflare oder einen Anbieter auf, pausiert oder startet
keinen Workflow und erzeugt keinen Live-Snapshot. Ein gruener Lauf ist daher
nur so belastbar wie die unmittelbar davor read-only beschaffte Evidenz.

## Warum die Scheduler pausiert werden

Der neue `automatic-ai-check` liefert den Zehn-Feld-Drainvertrag. Ein alter
Workflow erwartet dagegen exakt `{ok,code}` und kann erst nach bereits
erfolgter Provider-, Ledger- oder Mailwirkung rot werden. Beim Entdecken-Pfad
sendet der alte Workflow `scheduled-v1`; die neue Function akzeptiert
`scheduled-24h-v1` und bindet zwei Quellen sowie den Format-6-Readback. Eine
blosse Header-Aliasregel schliesst beide Mixed-Version-Fenster nicht.

Deshalb muessen genau diese beiden Workflows waehrend des Backend-, Staging-
und Production-Uebergangs den GitHub-Zustand `disabled_manually` besitzen:

- `.github/workflows/automatic-ai-check.yml`
- `.github/workflows/entdecken-six-day.yml`

Der zweite Workflow enthaelt auch den Radar-Job. Seine Pause pausiert deshalb
bewusst Entdecken und Radar gemeinsam.

## Evidenz echt und read-only beschaffen

Die Snapshotdateien gehoeren in ein privates temporaeres Verzeichnis und
nicht ins Repository. Zugangsdaten, Header und Antwortinhalte gehoeren nie in
die Dateien. Dieselbe eindeutige `rolloutId` bleibt ueber alle drei Phasen
erhalten. `capturedAt` muss kanonisches UTC-ISO sein und beim Gate hoechstens
zehn Minuten alt sein; jeder Checkpoint besitzt einen eigenen kanonischen
`observedAt`-Zeitpunkt.

Die Werte werden unmittelbar vor dem jeweiligen Gate aus folgenden
read-only Quellen erhoben:

- GitHub Actions API oder Actions-Oberflaeche: Workflowzustand sowie alle
  nicht abgeschlossenen Runs der beiden exakten Workflowpfade. `queued`,
  `in_progress`, `waiting`, `pending` oder ein anderer nicht abgeschlossener
  Zustand zaehlt zu `nonTerminalRuns`.
- Supabase Management-Readback: `status`, `verify_jwt` und Version jeder
  Function. `supabase functions download` darf nur in ein neues temporaeres
  Verzeichnis schreiben; der vollstaendige Download wird byteweise mit dem
  lokalen Function-Quellabschluss verglichen. Eine Plattformversion allein
  ist kein Sourcebeleg.
- Supabase-Migrationsledger: die remote angewandten IDs. Fuer diesen Uebergang
  muss `20260905180000_entdecken_vienna_day_claim` explizit vorhanden sein.
  Der spätere Joyn-freie Poolschritt
  `20260906180000_entdecken_current_diverse_pool` muss für den aktuellen
  Netflix-AT-/OeFI-Vertrag zusätzlich im vollständigen Ledger stehen.
- Cloudflare-/Domain-Readback: `build-meta.json` der atomaren Deployment-URL
  und der festen Staging- beziehungsweise Production-Domain. Beide muessen den
  exakten Releasecommit melden; erst dann ist `readbackPassed: true` zulaessig.
- GitHub Contents API auf dem Default-Branch: die Bytes beider Workflowdateien.
  Deren SHA-256 muss mit dem lokalen SHA-256 uebereinstimmen. Ein bloss gleicher
  Dateiname oder Workflowstatus genuegt nicht.

Die `expected`-Datei bindet den Releasecommit, die lokalen Source-SHA-256 der
beiden Functions, deren erwarteten Authmodus `verifyJwt: false`, den exakten
Migrationsnamen, beide Workflow-SHA-256 und das vollstaendige bestehende
`kinodreieck-release-compatibility-v1`-Manifest. Der `preResume.releaseSnapshot`
ist der echte Web-/Sechs-Functions-/Migrationsreadback fuer dieses Manifest.

## Verbindliche Reihenfolge

1. Beide Workflows in GitHub manuell deaktivieren.
2. `disabled_manually` fuer beide ruecklesen und warten, bis fuer beide
   `nonTerminalRuns` exakt `0` ist. Laufende Jobs werden nicht autonom
   abgebrochen.
3. `pre-backend` mit dem frischen Pausen-Snapshot ausfuehren. Nur Exit `0`
   erlaubt den ersten Backendschritt.
4. `automatic-ai-check` deployen; danach `ACTIVE`, `verifyJwt=false`, Version
   und bytegleichen vollstaendigen Sourceabschluss ruecklesen.
5. Migration `20260905180000_entdecken_vienna_day_claim` anwenden und ihren
   Eintrag sowie den ersetzten Claimvertrag ruecklesen.
6. Als späteren Poolschritt Migration
   `20260906180000_entdecken_current_diverse_pool` anwenden und den
   Joyn-freien Netflix-AT-/OeFI-Vertrag rücklesen.
7. `entdecken-daily-task` deployen und denselben Function-Readback ausfuehren.
8. Exakt denselben Releasecommit auf Staging ausliefern; atomare URL und feste
   Staging-Domain ruecklesen.
9. Exakt denselben Commit nach `main` und Produktion bringen; atomare URL und
   feste Production-Domain ruecklesen.
10. Beide Scheduler erneut als `disabled_manually` und ohne nicht abgeschlossene
   Runs ruecklesen. Die neuen Workflowbytes vom Default-Branch laden. Danach
   die vollstaendige Web-/Function-/Migrationsparitaet erfassen und
   `pre-resume` ausfuehren.
11. Nur nach gruenem `pre-resume` beide Workflows wieder aktivieren und den
    Zustand `active` ruecklesen.
12. Je Workflow den ersten nach der Aktivierung natuerlich durch `schedule`
    gestarteten Lauf abwarten. Beide muessen im ersten Versuch
    (`runAttempt: 1`) `completed/success` erreichen; erst dann darf
    `post-resume` gruen werden. Ein GitHub-Rerun behaelt zwar das Ereignis
    `schedule`, ist aber mit `runAttempt > 1` ausdruecklich kein natuerlicher
    Erstlauf. Kein manueller Ersatzlauf und kein Retry zaehlt als Nachweis.

Aufruf in jeder Phase:

```text
npm run check:release-transition -- --phase pre-backend --expected /privater/pfad/expected.json --observed /privater/pfad/pre-backend.json
npm run check:release-transition -- --phase pre-resume --expected /privater/pfad/expected.json --observed /privater/pfad/pre-resume.json
npm run check:release-transition -- --phase post-resume --expected /privater/pfad/expected.json --observed /privater/pfad/post-resume.json
```

Das CLI beendet jeden Vertragsfehler mit Exit `75`. Es veraendert dadurch
nichts; der Operator stoppt an dieser Stelle die Releasekette.

## Snapshotvertrag

Jeder Snapshot besitzt exakt `format`, `phase`, `rolloutId`,
`candidateCommit`, `capturedAt` und `checkpoints`. Unerwartete oder fehlende
Felder failen geschlossen. Die Checkpoints wachsen streng in dieser
Reihenfolge:

```text
paused
automaticFunction
migration
entdeckenFunction
staging
production
preResume
resume
naturalRuns
```

`pre-backend` enthaelt nur `paused`, `pre-resume` endet bei `preResume`, und
`post-resume` enthaelt alle neun Checkpoints. Die beiden Workflowlisten sind
immer exakt und duplikatfrei. `preResume` und `resume` tragen zusaetzlich die
beobachteten Workflow-SHA-256. `naturalRuns` enthaelt je Workflow genau einen
Run mit `runId`, `runAttempt`, `event`, `status`, `conclusion`, `startedAt`
und `completedAt`. Fuer jeden Run gilt streng
`resume.observedAt < startedAt <= completedAt <= naturalRuns.observedAt <= capturedAt`.

## Harte STOPs

- `TRANSITION_EXPECTED_INVALID`, `TRANSITION_PHASE_INVALID` oder
  `TRANSITION_SNAPSHOT_INVALID`: Form, Feldmenge oder Phase ist nicht exakt.
- `TRANSITION_SNAPSHOT_STALE` oder `TRANSITION_ORDER_INVALID`: Evidenz ist zu
  alt, nicht kanonisch oder nicht streng in Release-Reihenfolge entstanden.
- `WORKFLOW_SET_DRIFT`, `WORKFLOW_NOT_DISABLED_MANUALLY` oder
  `WORKFLOW_RUN_ACTIVE`: Pause oder Ruhe der exakt zwei Scheduler ist nicht
  belegt.
- `FUNCTION_AUTH_DRIFT`, `FUNCTION_SOURCE_DRIFT` oder
  `FUNCTION_RELEASE_PARITY_DRIFT`: Functionstatus, Authmodus, Byteabschluss
  oder ihre Zuordnung zum Gesamtmanifest weicht ab.
- `MIGRATION_MISSING`, `RELEASE_COMMIT_DRIFT`,
  `LOCAL_WORKFLOW_SOURCE_DRIFT`, `WORKFLOW_SOURCE_DRIFT` oder
  `RELEASE_PARITY_FAILED`: Datenbank, Webrelease oder Workflowbytes sind nicht
  exakt der Kandidat.
- `WORKFLOW_NOT_ACTIVE_AFTER_RESUME` oder `NATURAL_RUN_READBACK_INVALID`:
  Wiederaktivierung oder die beiden spaeteren natuerlichen Erfolgslaeufe sind
  nicht belegt.

Nach einem STOP wird kein naechster Wirkungs-Schritt begonnen. Nach bereits
erfolgter Aussenwirkung wird zuerst deren Iststand read-only geklaert; ein
Deploy, eine Migration oder ein Schedulerlauf wird nie blind wiederholt.
