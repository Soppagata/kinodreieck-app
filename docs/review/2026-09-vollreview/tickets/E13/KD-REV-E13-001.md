# KD-REV-E13-001 · Workflow verwirft gültigen Backlog ohne bearbeiteten Job

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — der opt-in-aktivierte Betriebschecker schlägt bei einem erfolgreichen Lauf fehl und unterdrückt die Rückstandstelemetrie. Kein Datenverlust, zusätzlicher Anbieterrequest oder dauerhaft blockierter Job ist belegt.
- Finding: E13-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E13

## Fehler und Auswirkung

Der GitHub-Workflow `automatic-ai-check` kann einen vom Core erfolgreich gemeldeten Rückstand als ungültigen Antwortvertrag behandeln. Statt die Rückstandswarnung und -zusammenfassung auszugeben, endet der Parser mit Exit 3 und der Workflow wird rot. Betroffen ist allein die Antwortvalidierung beziehungsweise Rückstandsanzeige des per Repositoryvariable aktivierbaren Checkers. Der pending Job bleibt bestehen und kann in einem späteren regulären Lauf verarbeitet werden.

Die Auftretenshäufigkeit, die aktuelle Workflow-Aktivierung, Deploy-/Commit-Parität und eine Produktionswirkung sind nicht geprüft.

## Auslöser, Soll und Ist

Ein einzelner gültiger Lauf genügt: `kd_automatic_ai_retry_due_claim` findet zum eigenen `clock_timestamp()` keinen fälligen Job; zwischen diesem Claim und der anschließenden, getrennten Backlog-Inspektion wird ein regulär angelegter pending Job fällig. Die Joberzeugung bindet `check_due_at` an die Initialoperation plus sechs Stunden, nicht an einen Workflow-Zeitpunkt ([eingefrorene Quelle: Retry-Job-Erzeugung](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql:353)); Claim und Backlog vergleichen danach mit unterschiedlichen Zeitankern ([Claim](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql:401), [Backlog](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260916193000_automatic_ai_retry_backlog.sql:20)).

Soll: Der Workflow akzeptiert den Core-Vertrag `code: "backlog"`, `processedJobs: 0`, `remainingDueJobs > 0` und numerischem `oldestLagSeconds` und erreicht die Rückstandswarnung.

Ist: Der Drain-Handler beendet die Claim-Schleife bei `idle`, liest den Backlog danach separat und priorisiert positiven Rückstand vor der Zahl bearbeiteter Jobs ([eingefrorener Core](/private/tmp/kd-vollreview-20260916/source/supabase/functions/automatic-ai-check/core.js:586), [Codeauswahl](/private/tmp/kd-vollreview-20260916/source/supabase/functions/automatic-ai-check/core.js:598)). Der Workflow setzt dagegen `idle` genau mit `processedJobs === 0` gleich ([Parser](/private/tmp/kd-vollreview-20260916/source/.github/workflows/automatic-ai-check.yml:116)). Daher verwirft er den gültigen `backlog/0`-Fall, ruft `fail` auf und erreicht die Warnung nicht ([Folgepfad](/private/tmp/kd-vollreview-20260916/source/.github/workflows/automatic-ai-check.yml:129)).

## Ursache und Fundstellen

Die Workflow-Invariante verwechselt „kein Job in diesem Claim verarbeitet“ mit „kein Rückstand vorhanden“. Der Core-Vertrag bildet jedoch ein späteres, unabhängiges Backlog ab: `remainingDueJobs > 0` ergibt `backlog`, sonst ergibt ein verarbeiteter Job `drained`, andernfalls `idle`.

Fundstellen am Prüfcommit (repository-relativ; die Links zeigen auf die unveränderliche Prüfkopie):

- [`.github/workflows/automatic-ai-check.yml:116`](/private/tmp/kd-vollreview-20260916/source/.github/workflows/automatic-ai-check.yml:116): fehlerhafte Zustandsinvariante; [`:129`](/private/tmp/kd-vollreview-20260916/source/.github/workflows/automatic-ai-check.yml:129) bricht vor der Backlog-Warnung ab.
- [`supabase/functions/automatic-ai-check/core.js:586`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/automatic-ai-check/core.js:586): `idle` beendet nur die Claim-Schleife; [`:598`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/automatic-ai-check/core.js:598) liest danach Telemetrie; [`:613`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/automatic-ai-check/core.js:613) priorisiert `backlog`.
- [`supabase/functions/automatic-ai-check/index.ts:62`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/automatic-ai-check/index.ts:62) und [`:118`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/automatic-ai-check/index.ts:118): getrennte RPCs für Claim und Backlog.
- [`supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql:377`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql:377), [`:401`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql:401) und [`:424`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql:424); [`supabase/migrations/20260916193000_automatic_ai_retry_backlog.sql:26`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260916193000_automatic_ai_retry_backlog.sql:26): die zulässige Zeitgrenze im SQL-Pfad.

## Belege und Gegenproben

Statisch verfolgt wurde der Pfad Workflow-POST → `Deno.serve` → Drain-Handler → `claimDue` → `inspectBacklog` → Workflow-Parser. Der reguläre Scheduler legt nach erfolgreicher Kostenreservierung für die Initialoperation den pending Job an ([`supabase/functions/radar-websearch-task/index.ts:611`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/radar-websearch-task/index.ts:611)).

Die unabhängige Mock-Reproduktion [repro.mjs](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E13-F001/validator/repro.mjs) lief mit Node v24.18.0 und Exit 0. Sie importierte den unveränderten Core und extrahierte den unveränderten YAML-Parser; PostgreSQL wurde nicht ausgeführt. Bei Claim `12:37:00.000`, Fälligkeit `12:37:00.100` und Inspektion `12:37:00.200` lieferte der Core HTTP 200 mit `backlog/0/1`, Lag `0` und `stopReason: idle`; der Parser endete reproduzierbar mit Exit 3. Es wurden genau `claimDue` und `inspectBacklog` aufgerufen, keine Provider-, Mail- oder Finish-Effekte. Die vollständigen maschinenlesbaren Ergebnisse und Quellhashes liegen in [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E13-F001/validator/result.json).

Kontrollen: Ein noch nicht fälliger Job ergab `idle/0/0` und Parser Exit 0; `processed-backlog` sowie `drained` wurden akzeptiert; Backlog mit `oldestLagSeconds: null` blieb korrekt ungültig. Vorhandene Tests prüfen leeres `idle` und Backlog nach drei Jobs ([`automatic_ai_check_test.mjs:668`](/private/tmp/kd-vollreview-20260916/source/automatic_ai_check_test.mjs:668), [`:794`](/private/tmp/kd-vollreview-20260916/source/automatic_ai_check_test.mjs:794)); ihr ungültiger `backlog/0`-Fall enthält null Lag und widerlegt daher den gültigen Fall nicht. Diese vorhandenen Tests wurden für diesen Befund nicht ausgeführt.

Nicht belegt: eine echte PostgreSQL-Zeitgrenzen- oder Sperrkonkurrenzreproduktion. `SKIP LOCKED` wäre ein zusätzlicher, nicht erforderlicher Auslöser. Kein GitHub-Actions-Lauf, keine Live-DB, kein Anbieterrequest und kein Mailversand wurden ausgeführt.

## Korrekturziel und Abnahme

Nur die Zustandsregel des Workflow-Parsers an den Core-Vertrag angleichen und gezielte Vertragstests ergänzen. Kein Eingriff in Claiming, Retry-/Mailpfade, Providerfreigaben oder Schedulerfrequenz.

- Ein unveränderter Core-Lauf mit `idle`-Claim und danach positivem, gültigem Backlog wird akzeptiert, auch mit `processedJobs: 0` und Lag `0`.
- Diese Antwort erreicht die Rückstandswarnung, nicht „ungültiger Antwortvertrag“.
- `idle` mit `0/0`, `drained` mit `>0/0` und `backlog` mit `>0/>0` bleiben gültig.
- Inkonsistente Code-/Backlogzustände, ungültiger Lag, falsche Zählersummen, Zusatzfelder und überschrittene Limits bleiben fail-closed abgewiesen.
- Die fokussierte Mock-Regression belegt, dass der Zeitgrenzenfall keine zusätzlichen Claims, Providerrequests oder Mails auslöst.

## Abhängigkeiten und offene Punkte

Kein Duplikat im abgegrenzten Validatorauftrag festgestellt; ein vollständiger Katalogabgleich steht aus. Die Ticketannahme erfordert keine Änderung am Datenmodell. Die Master-Abnahme ist bestätigt.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E13-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E13-F001.json). Ausgangsverdacht: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E13-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E13-F001.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E13/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E13/KD-REV-E13-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
