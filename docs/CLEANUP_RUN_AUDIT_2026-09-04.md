# GitHub-Actions-Run-Audit zum Privatrelease-Cleanup

Stand: 04.09.2026, read-only erhoben vor der lokalen B3-Änderung

Basis: `9b54577c165806c2124e4543ad9575a38642aa99` (damals `origin/main` und
`origin/staging`)

Register: R-04, R-09, R-16, U-11, D-10

Während dieses Audits wurde kein Workflow gestartet, wiederholt, abgebrochen
oder durch Secret-, Flag- oder Environmentänderungen beeinflusst. Die Zahlen
sind Workflowabschlüsse der letzten 30 Tage, keine Summe einzelner Jobs. Ein
wartender Environment-Job wird deshalb nicht als fehlgeschlagener Workflow
gezählt.

## 30-Tage-Bilanz

| Workflow | Trigger / nominelle Kadenz | Erfolg | Fehler | Abgebrochen | Übersprungen / aktiv / wartend beim Audit | Letzter belegter Lauf |
|---|---|---:|---:|---:|---:|---|
| Automatic AI six-hour checker | Schedule, stündlich um Minute 37 | 4 | 0 | 0 | 0 / 0 / 0 | `33884160800`, grün |
| Test and deploy Cloudflare Pages | Push/PR auf `main` oder `staging`, manueller Dispatch | 74 | 24 | 2 | 0 / 0 / 0 | Staging `33811726603`, Production `33813068469`, beide grün |
| Entdecken und Radar im Sechs-Tage-Takt | täglicher Trigger 02:00 UTC, fachlicher Radar-Abstand 144 h | 2 | 3 | 0 | 0 / 0 / 0 | `33845243484`, grün |
| Supabase Keep-alive | alle drei Tage um 06:17 UTC plus Dispatch | 10 | 1 | 0 | 0 / 0 / 0 | `33866939340`, rot |
| Private Ops Monitor | täglich 05:23 UTC plus Dispatch | 0 | 3 | 0 | 0 / 0 / 0 | `33859926378`, rot |

## Ursachenklassen und Wiederholungsrisiko

### Automatic AI six-hour checker

- **Erster fachlicher Schritt:** `Einen faelligen automatischen KI-Job
  pruefen`; der Endpoint claimt atomar genau einen fälligen Job.
- **Bisherige Klasse:** vier grüne Läufe; `idle`, `initial-succeeded` und
  `retry-finished` sind die drei eng erlaubten 200-Verträge.
- **Backlogrisiko:** Bei mehreren gleichzeitig fälligen Jobs wird derzeit nur
  einer pro Stunde entwässert. Restanzahl und ältester Lag fehlen im
  Produktivvertrag. Ein Mehrfach-Drain würde die mögliche Zahl bezahlter
  Provider- und Mailoperationen pro Scheduleraufruf erhöhen und ist ohne
  ausdrückliche Kostenfreigabe **WIRKUNGSGESPERRT**. Bis dahin bleibt höchstens
  ein aktiver Retry pro Invocation zulässig.
- **Wiederholung/Mail:** kein Curl-Retry, `cancel-in-progress: false`; ein
  paralleler Tick wartet an derselben Concurrency-Gruppe. Eine fachlich
  abgeschlossene Retryprüfung darf genau eine inhaltsfreie Betriebs-Mail
  claimen. Blindes Wiederholen ist nicht vorgesehen.

### Test and deploy Cloudflare Pages

- **Erste ursächliche Flächen der roten Klassen:** je nach Lauf `npm test`,
  `npm run test:function`, Chromium/WebKit, Deploy-Environment-Prüfung oder
  Domain-Readback. Der Sammeljob `test` macht einen vorgeschalteten roten,
  abgebrochenen oder übersprungenen Testzweig absichtlich ebenfalls rot.
- **Abbrüche:** zwei Runs wurden durch die Ref-bezogene Test-Concurrency
  ersetzt; das ist eine eigene Konkurrenzklasse, kein Produktfehler.
- **Warten:** `deploy-production` hängt an der geschützten GitHub-Environment
  `production` mit einem Required Reviewer. „Production deployment awaits
  review“ ist eine wartende Freigabe, kein fehlgeschlagener Run. Die jüngste
  Production-Freigabe wurde erteilt und der Lauf endete grün.
- **Aktueller Releasebeleg:** die jüngsten grünen Staging-/Production-Runs
  prüften denselben Commit `9b54577…`; Push, CI, Deployment und praktische
  iPhone-PWA-Abnahme bleiben trotzdem getrennte Beleggrenzen.

### Entdecken und Radar im Sechs-Tage-Takt

- **Erster ursächlicher Job/Schritt der roten Klasse:**
  `radar-six-day-trigger` / `Faellige Radar-Ziele ... seriell pruefen`; ein
  HTTP-Status außerhalb 200/204 beendet ohne Curl-Retry rot. Frühere
  Scheduler-/Function-Vertragsabweichungen können beim täglichen Trigger
  erneut sichtbar werden, bis der ausgelieferte Functionvertrag passt.
- **Entdecken-Vertragslücke:** `refresh.status=failed` wurde bislang zwar als
  fachlicher Fehler erkannt, aber nur als Warning ausgegeben; der Workflow
  blieb dadurch irreführend grün. B3 ändert nur diesen Terminalzweig auf
  `::error` plus Exit 1. `not_due`, `outside_window`, `in_progress` und `held`
  bleiben erwartete grüne No-ops.
- **Concurrency:** Radar läuft maximal zehn Claims seriell; `204` beendet als
  ehrlich leer. Es gibt keinen automatischen Curl-Retry.

### Supabase Keep-alive

- **Erster ursächlicher Schritt:** `Anon-Read gegen kd_store` im Lauf
  `33866939340`.
- **Klasse:** Vertragsdrift nach der privaten ACL-Härtung; ein anonymer
  `kd_store`-Read ist kein zulässiger Gesundheitscheck mehr. Ein erneuter
  Schedule hätte deshalb voraussichtlich wieder eine rote Mail erzeugt.
- **Kleinste Korrektur:** Der read-only Livebeleg vor dem Bau zeigte für
  `/auth/v1/health` mit Publishable Key HTTP 200 und exakt die JSON-Schlüssel
  `description`, `name`, `version`; ohne Key kam HTTP 401. B3 prüft deshalb
  diesen begrenzten Auth-Health-GET ohne Privatinhalt oder Mutation. Status,
  Content-Type, exakte Schlüssel, nichtleere Strings und Timeout sind
  fail-closed; der Payload wird nicht ausgegeben.

### Private Ops Monitor

- **Erster ursächlicher Schritt:** `Read-only operational checks` im Lauf
  `33859926378`.
- **Klasse:** Vertragsdrift der Flagannahme. Der Checker verlangte pauschal
  `false`, obwohl der belegte gemeinsame Pilotstand absichtlich
  `private.provider_requests_enabled=true` sowie
  `radar_aktiv=true`, `radar_provider_aktiv=true` und
  `radar_scheduler_aktiv=true` führt.
- **Kleinste Korrektur:** B3 bindet explizite Staging-/Production-Matrizen.
  Private Sollwerte sind `true,false,false,false,false` in der Reihenfolge
  Provider/Scheduler/Purge/Delete/Export; Radar ist
  `true,false,true,true,false` in der Reihenfolge
  Radar/Shares/Provider/Scheduler/Proposal-Import. Unbekannte Umgebung,
  fehlendes Feld, Extrafeld, abweichender Boolwert oder nicht lesbare
  Singleton-Zeile bleibt fail-closed rot.
- **Wiederholung/Mail:** täglicher Schedule ohne automatischen Retry. Nach der
  lokalen Korrektur ist erst ein späterer autorisierter CI-/Run-Readback ein
  Betriebsbeleg; B3 startet selbst keinen Run.

## Einheitliche Zustandssemantik (D-10)

| Workflow | Erfolg | Erwarteter No-op | Warten | Fehler |
|---|---|---|---|---|
| Automatic AI | exakt validierter Jobabschluss | `idle` | Concurrency-Queue | HTTP-/Schema-/Ledger-/Backlog-Unklarheit rot; Mehrfach-Drain wirkungsgesperrt |
| Pages | alle benötigten Tests und der gewählte Deploy-/Readbackpfad grün | nicht zutreffender Deployjob bleibt übersprungen und wird nicht als Erfolg behauptet | Production-Reviewer | erster roter Test-, Build-, Deploy- oder Readbackschritt macht den Run rot |
| Entdecken/Radar | `refreshed`, Radar-200 oder leerer Radar-204 | `not_due`, `outside_window`, `in_progress`, `held` | Radar-Concurrency | HTTP-/Vertragsfehler und nun auch `refresh.status=failed` rot |
| Keep-alive | belegter Auth-Health-GET liefert HTTP 200 und exaktes JSON | keiner | keiner | Konfiguration, Timeout, HTTP-, Content-Type- oder Vertragsfehler rot |
| Private Ops | alle Read-only-Verträge und die exakte Umgebungsmatrix stimmen | `PURGE_DUE` ist sichtbare Warnung, kein Write | Concurrency-Queue | fehlende Konfiguration, unbekannte Umgebung oder Vertragsabweichung rot |

Benachrichtigungen werden nicht pauschal stummgeschaltet. Nach diesen
Korrekturen soll eine rote Mail einen unerwarteten, handlungsrelevanten Zustand
bezeichnen; erwartete No-ops bleiben grün und werden im Log benannt.
