# KD-REV-E13-003 · ai-task-Release-Hash und lokaler Dirty-Check lassen drei eingebundene Quellen aus

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — relevante lokale Änderungen können im ausgegebenen ai-task-Source- und Deploy-Contract-Hash sowie im eingeschränkten CLI-Dirty-Check unsichtbar bleiben. Der vollständige Runbook-Dirty-Check und der wechselnde Commitmarker begrenzen die Auswirkung; kein falscher Produktionsdeploy oder Sicherheitsbypass ist belegt.
- Finding: E13-F003
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E13

## Fehler und Auswirkung

`npm run check:function-release` soll den aus Git reproduzierbaren ai-task-Quellstand vor und nach einem Deploy nachweisen. Seine feste Acht-Dateien-Liste lässt aber drei aktuelle, tatsächlich eingebundene lokale Module aus:

- `supabase/functions/_shared/externalTitleIdentity.js`
- `supabase/functions/_shared/flixpatrolFacts.js`
- `supabase/functions/_shared/flixpatrolFactsContext.js`

Eine Änderung an einem dieser Dateien bleibt für den CLI-Dirty-Check unsichtbar. Nach einem Commit bleibt auch `sourceSha256` und damit `deployContractSha256` gleich, obwohl sich der Quellinhalt beziehungsweise das Verhalten ändern kann. Betroffen ist der lokale Release-/Provenienznachweis, nicht eine nachgewiesene Runtime-, Provider-, Account- oder Datenbankfunktion.

## Auslöser, Soll und Ist

Ein ansonsten gültiger Git-Stand mit gültiger `supabase/config.toml` genügt; Accounts, Anbieter, Datenbankzustand oder KI-Aktivierung sind nicht erforderlich. Nach einer lokalen oder ausschließlich committeten Änderung an einer der drei fehlenden Dateien wird `npm run check:function-release` aufgerufen ([Script](/private/tmp/kd-vollreview-20260916/source/package.json:17)).

Soll: Der als ai-task-Quellabschluss dokumentierte Dirty-Check erfasst jede lokale, direkt oder transitiv eingebundene Quelle. Jede committed Byteänderung daran ändert `sourceSha256` und folglich `deployContractSha256`.

Ist: `releaseInfo` nutzt dieselbe veraltete Konstante sowohl für `git status` als auch für die Auswahl der Git-Blobs des Source-Hash ([Liste](/private/tmp/kd-vollreview-20260916/source/tools/function-release-info.mjs:8), [Dirty-Gate](/private/tmp/kd-vollreview-20260916/source/tools/function-release-info.mjs:193), [Hashbildung](/private/tmp/kd-vollreview-20260916/source/tools/function-release-info.mjs:200)). Der Entry-Point importiert `flixpatrolFactsContext.js` und `externalTitleIdentity.js` direkt ([Imports](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:89)); `flixpatrolFactsContext.js` importiert außerdem transitiv `flixpatrolFacts.js` und `externalTitleIdentity.js` ([Closure-Kante](/private/tmp/kd-vollreview-20260916/source/supabase/functions/_shared/flixpatrolFactsContext.js:1)). Der aktuelle lokale Importabschluss enthält somit elf statt acht Dateien.

## Ursache und Fundstellen

Die DATEIEN-Konstante wurde nach drei hinzugekommenen Importen nicht erweitert. Die fokussierte Vertragsprüfung dupliziert dieselbe Acht-Dateien-Liste und behauptet lediglich deren Gleichheit mit der Toolausgabe; sie bestimmt oder validiert keine tatsächliche Importabdeckung ([Testliste](/private/tmp/kd-vollreview-20260916/source/function_release_test.mjs:18), [Gleichheitstest](/private/tmp/kd-vollreview-20260916/source/function_release_test.mjs:71)).

Fundstellen am Prüfcommit (repository-relativ; die Links zeigen auf die unveränderliche Prüfkopie):

- [`tools/function-release-info.mjs:8`](/private/tmp/kd-vollreview-20260916/source/tools/function-release-info.mjs:8): unvollständige Liste mit acht Dateien; [`:193`](/private/tmp/kd-vollreview-20260916/source/tools/function-release-info.mjs:193) verwendet sie als Pathspec und [`:200`](/private/tmp/kd-vollreview-20260916/source/tools/function-release-info.mjs:200) als Source-Hash-Eingabe.
- [`supabase/functions/ai-task/index.ts:89`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:89) und [`:93`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:93): direkte Imports der ausgelassenen Context- und Identity-Module.
- [`supabase/functions/_shared/flixpatrolFactsContext.js:1`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/_shared/flixpatrolFactsContext.js:1) und [`:9`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/_shared/flixpatrolFactsContext.js:9): transitive Kanten zu Identity und Facts; [`supabase/functions/_shared/flixpatrolFacts.js:1`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/_shared/flixpatrolFacts.js:1) zeigt die weitere Identity-Abhängigkeit.
- [`function_release_test.mjs:18`](/private/tmp/kd-vollreview-20260916/source/function_release_test.mjs:18), [`:71`](/private/tmp/kd-vollreview-20260916/source/function_release_test.mjs:71), [`:100`](/private/tmp/kd-vollreview-20260916/source/function_release_test.mjs:100) und [`:181`](/private/tmp/kd-vollreview-20260916/source/function_release_test.mjs:181): doppelte Liste, Selbstvergleich und auf diese Liste begrenzte Dirty-Fälle.

## Belege und Gegenproben

Die unabhängige Reproduktion [repro.mjs](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E13-F003/validator/repro.mjs) verwendete kopierte Originalblobs, frisches lokales Git und das unveränderte npm-Script — ohne Git-Stubs, Netzwerk, Provider, Deployments oder Shared Writes. Sie setzte jede der drei ausgelassenen Dateien einzeln dirty: Jedes Mal war der vollständige Git-Status dirty, `npm run --silent check:function-release` endete dennoch mit Exit 0. Die gelistete `providerContract.ts` war die Positivkontrolle: dirty führte sie erwartungsgemäß zu Exit 1.

In einem separaten, sauberen Fixture-Commit änderte ausschließlich `externalTitleIdentity.js` die IMDb-Normalisierung für `tt12345` tatsächlich von `tt12345` auf `null`. Der Commit und `buildVersion` wechselten, `sourceSha256` und `deployContractSha256` blieben identisch. Die maschinenlesbaren Importkanten, der 11/8-Vergleich, die einzelnen Fälle und Hashes liegen in [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E13-F003/validator/result.json).

Der vorhandene enge Test [function_release_test.mjs](/private/tmp/kd-vollreview-20260916/source/function_release_test.mjs) wurde auf dem eingefrorenen Stand ausgeführt: Exit 0 mit 41 Checks. Das bestätigt nur die derzeitige, selbstreferentielle Abdeckung und ist kein Gegenbeweis zur Reproduktion. Keine globale Testsuite wurde ausgeführt.

Gegenbelege und Grenzen: Beide Deploy-Runbooks enthalten zusätzlich einen vollständigen `git status --porcelain`-Check ([Runbook](/private/tmp/kd-vollreview-20260916/source/docs/FUNCTION_RELEASES.md:47), [Supabase-Anleitung](/private/tmp/kd-vollreview-20260916/source/supabase/README.md:78)); der dokumentierte Deploy-Pfad soll deshalb keinen dirty Stand ausliefern. Für bereits committed Änderungen ist dieses Gate erwartungsgemäß nicht einschlägig und die Hash-Lücke bleibt. Commit und `buildVersion` ändern sich und erlauben bei exakter Commitbindung eine Unterscheidung. Der separate Readback kann vollständige, vom Aufrufer übergebene Dateien byteweise vergleichen ([`tools/live_function_readback.mjs:74`](/private/tmp/kd-vollreview-20260916/source/tools/live_function_readback.mjs:74)), wird aber nicht durch `check:function-release` aufgerufen und ergänzt dessen Liste nicht.

## Korrekturziel und Abnahme

Korrektur auf `tools/function-release-info.mjs` und dessen fokussierte Vertragsprüfungen begrenzen: den vollständigen lokalen Importabschluss des ai-task-Entry-Points deterministisch erfassen oder eine zentrale Liste durch eine unabhängige Importabdeckungsprüfung absichern. Dieselbe vollständige Menge muss für Dirty-Gate und Source-Hash gelten. Byte-Rahmung, Config-/JWT-Bindung sowie getrennte Deploy-/Readback-Gates bleiben unverändert. Keine Produktlogik, Migrationen oder Deploy-Automatik ändern.

- Die aktuelle Closure umfasst alle elf lokalen Dateien, einschließlich der drei ausgelassenen Module.
- Nicht committete Änderungen an jeder direkt oder transitiv eingebundenen Datei werden vom CLI abgewiesen; eine weitere lokale Abhängigkeit kann nicht still fehlen.
- Eine ausschließlich committete Byte- oder Verhaltensänderung jeder Closure-Datei ändert `sourceSha256` und `deployContractSha256`; gleiche Inputs bleiben deterministisch.
- Regressionstests bestimmen oder prüfen die Importabdeckung unabhängig von einer duplizierten festen Erwartungsliste.
- Config-/JWT-Prüfung, rohe Git-Blob-Hashbildung, der vollständige Runbook-Dirty-Check und die separaten Readback-Schutzschritte bleiben wirksam.

## Abhängigkeiten und offene Punkte

Die elf Dateien bezeichnen den statischen lokalen Importabschluss dieses Prüfstands; externe npm-Abhängigkeiten und ihr Lock-/Versionsvertrag sind nicht Teil des Befunds. Der semantische Test lebt nur im isolierten Validator-Fixture; ein kompletter ai-task-Request wurde nicht ausgeführt und ist für den nachgewiesenen CLI-/Hashfehler nicht erforderlich. Kein vollständiger Finding-Katalogabgleich wurde durchgeführt; im zugeteilten Sachverhalt ist kein Duplikat belegt. Master-Abnahme ist bestätigt.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E13-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E13-F003.json). Ausgangsverdacht: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E13-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E13-F003.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E13/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E13/KD-REV-E13-003.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
