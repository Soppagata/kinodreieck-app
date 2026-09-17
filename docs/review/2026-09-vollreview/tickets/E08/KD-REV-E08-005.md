# KD-REV-E08-005 · Freitext-Abnahmesmoke lehnt zulässige Antworten mit mehreren Websuchen ab

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — ein aktiver Abnahmesmoke erzeugt für zulässige Produktantworten einen falschen negativen Qualitätsbefund. Keine direkte Radar-Produktfehlfunktion, Budgetüberschreitung oder tatsächlich beobachtete Live-Fehlalarmserie ist belegt.
- Finding: E08-F005
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E08

## Fehler und Auswirkung

Der Freitextpfad S8/P25 des kombinierten Acht-Pfade-Smokes kann eine erfolgreiche Textantwort mit genau einem Providerrequest und zwei bis vier Websearch-Toolaufrufen erhalten. Der Produktvertrag erlaubt diesen Rahmen. Der lokale Smoke-Readback bewertet ihn dennoch als `function-request-count-invalid`; `ai_smoke` übernimmt dieses Ergebnis direkt in `radarOk` und markiert den Pfad rot.

Dies ist ein Fehler des Abnahmeharnesses, nicht ein nachgewiesener Produktfehler. Ein erfolgreicher Produktlauf mit zwei bis vier Suchen wurde nur lokal und synthetisch durch den Validator reproduziert. Es gab keinen gestarteten Live-Smoke, keine Anbieteranfrage, keine Supabase-/HTTP-Liveausführung und keine Aussage zu tatsächlichen früheren Fehlalarmen.

## Auslöser, Soll und Ist

**Auslöser.** Der kombinierte Acht-Pfade-Smoke erreicht S8/P25. Textziel, Setup, Reservierung und Feedreadback sind gültig. Genau ein Providerrequest liefert eine erfolgreiche Antwort mit zwei, drei oder vier Websearch-Aufrufen und korreliertem Providerbeleg.

**Soll.** Der Freitext-Readback akzeptiert ganzzahlige `searchRequests` von 1 bis 4, solange `providerRequests` exakt 1 ist, `phaseCode` `provider-complete` lautet und die bestehenden Präsentations-, Receipt-, Ergebnis- und Feedprüfungen gültig bleiben.

**Ist.** `bewerteRadarFreitextLiveReadback` verlangt `searchRequests === 1`. Für 2, 3 und 4 ist `function-request-count-invalid` der einzige Readbackfehler. Der aktive Smoke setzt `radarOk` auf `false` und sein Label behauptet weiterhin genau eine Websuche.

## Ursache und Fundstellen

Der Freitext-Smoke enthält den veralteten Ein-Suchaufruf-Vertrag. Der Textadapter baut dagegen `max_uses: 4`, akzeptiert bei der Auswertung exakt 1 bis 4 tatsächliche Suchaufrufe und reicht den Zähler unverändert über Telemetrie und Functionantwort durch. Der Fehler entsteht erst im Testwerkzeug-Readback.

- Der fehlerhafte Readback koppelt `providerRequests` und `searchRequests` auf 1: [`tools/radar_freitext_live_contract.mjs:102`](/private/tmp/kd-vollreview-20260916/source/tools/radar_freitext_live_contract.mjs:102) — Prüfcommit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- Der aktive S8/P25-Aufrufer nutzt dieses Readback als `radarOk`; auch der Meldungstext ist veraltet: [`tools/ai_smoke.mjs:1365`](/private/tmp/kd-vollreview-20260916/source/tools/ai_smoke.mjs:1365), [`:1376`](/private/tmp/kd-vollreview-20260916/source/tools/ai_smoke.mjs:1376).
- Der Textadapter setzt `max_uses: 4` und validiert 1 bis 4 Suchen: [`anthropicAdapter.js:18`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/radar-websearch-task/anthropicAdapter.js:18), [`:290`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/radar-websearch-task/anthropicAdapter.js:290), [`:594`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/radar-websearch-task/anthropicAdapter.js:594).
- Die Function gibt `telemetry.searchRequests` unverändert weiter: [`index.ts:740`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/radar-websearch-task/index.ts:740).
- Die Textfund-Migration erweitert allein den Textvertrag auf 1 bis 4 Suchaufrufe: [`20260830140000_radar_text_findings.sql:181`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260830140000_radar_text_findings.sql:181).

## Belege und Gegenproben

**Ausgeführte lokale Mock-Reproduktion des Validators.** `node /private/tmp/kd-vollreview-20260916/tests/E08-F005/validator/repro.mjs` endete mit Exit 0. Sie importiert echten Adapter, Runner, Providerbeleg-Evaluator und Smoke-Readback. Reservierung, Settlement, Repository und HTTP waren lokale Mocks; globales `fetch` war gesperrt. Kein Live-Entry-Point wurde gestartet.

Für 1, 2, 3 und 4 Suchaufrufe entstanden jeweils genau ein Mock-Fetch, `max_uses: 4`, ein gültiger Providerreceipt, `providerRequests: 1`, `phaseCode: provider-complete` und Settlement `fertig`. Der Readback akzeptierte 1, lehnte 2, 3 und 4 ausschließlich mit `function-request-count-invalid` ab. 0 und 5 werden bereits vom Adapter mit `provider-usage-invalid` abgewiesen; `providerRequests: 2` bleibt abgewiesen.

Die Resultate liegen in [`result.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E08-F005/validator/result.json) und [`stdout.txt`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E08-F005/validator/stdout.txt).

Strukturierte Werk-, Personen- und Titelgruppenpfade bleiben absichtlich auf eine Suche begrenzt; S8/P25 nutzt jedoch den Freitextpfad. Browser und separater Radar-Einmallauf akzeptieren für Textantworten bis vier Suchen. Der vorhandene Freitext-Readbacktest deckt nur `searchRequests: 1` ab.

## Korrekturziel und Abnahme

Nur Freitext-Smoke-Zählerprüfung, Meldungstext und fokussierte Regressionstests an den Textvertrag angleichen. Providerrequest-Anzahl, Budgets, Adapter, SQL-Reservierung, Live-Autorisierung sowie Feed- und Receipt-Prüfungen bleiben unverändert.

- Readback akzeptiert genau einen Providerrequest und `searchRequests` 1, 2, 3 oder 4.
- 0, 5, negative, gebrochene, nichtnumerische oder fehlende Zähler sowie `providerRequests` ungleich 1 bleiben abgewiesen.
- `phaseCode`, Präsentation, Receipt-Provenienz sowie Feed- und Ergebnisprüfungen bleiben wirksam.
- Ein fokussierter Mocktest führt mindestens eine Drei-Suchen-Antwort durch echten Adapter/Runner und Readback; der Smoke-Meldungstext beschreibt den Textvertrag korrekt.

## Abhängigkeiten und offene Punkte

- Keine abhängigen oder duplizierten Findings bekannt.
- Keine echte Anbieteranfrage, kein Supabase-/HTTP-Live-Lauf, keine ausgeführte Migration und keine globale Testsuite.
- HTTP-Functionhülle und SQL-Gates wurden statisch verfolgt.
- Live-Setup, Deploymentparität und Häufigkeit mehrerer Websuchen sind nicht geprüft.

## Herkunft und Master-Abnahme

Validatorergebnis: [`E08-F005.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E08-F005.json) (`confirmed`). Ursprüngliches Master-Proposal: [`E08-F005.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E08-F005.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die Master-Abnahme ist bestätigt.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E08/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E08/KD-REV-E08-005.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
