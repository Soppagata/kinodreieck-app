# KD-REV-E03-003 · Gültige Löschschutz-Fixture lässt Titel-Pins ungültig

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P3 — ein nicht in reguläre `npm test`-/CI-Pipelines eingebundener Standalone-Regressionstest bricht deterministisch ab. Dadurch bleiben sechs Sicherheitschecks unerreicht; eine aktuelle Kontolöschung, ein Datenverlust oder ein Fehler des Produktionsschutzes ist nicht belegt.
- Finding: E03-F003
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E03

## Fehler und Auswirkung

Die als gültig bezeichnete Ausgangsfixture von `local_data_safety_test.mjs` erzeugt für den registrierten Titel-Pin-Topf `kd:entdecken-pins` einen vorhandenen, aber ungültigen Nicht-JSON-Wert. Deshalb verweigert der Löschschutz den Safety-Copy-Download korrekt und der positive Löschfall endet nach drei erfolgreichen Checks. Die folgenden sechs Kontextwechsel-, Rollback- und Kontowechselchecks werden nicht ausgeführt.

Der Befund betrifft die Testvorlage und ihre Regressionserkenntnis. Der Validator bestätigte ausdrücklich, dass der Produktionsschutz bei ungültigen persönlichen Daten vor jeder Löschung sperrt und die Diagnose dabei keine Daten löscht. Es gibt keinen Befund einer aktuellen Kontolöschung, regulär roten CI oder fehlerhaft gelöschter Nutzerdaten.

## Auslöser, Soll und Ist

Standalone-Ausführung von `node local_data_safety_test.mjs` mit installierten Projektabhängigkeiten am eingefrorenen Prüfstand. `fuelleGueltigenLoeschstand()` setzt zunächst alle Löschschlüssel auf `wert:<key>` und überschreibt danach nur 18 Registrywerte. `K.entdeckenPins` fehlt in dieser Map, obwohl der Registryvertrag 19 persönliche Töpfe enthält.

Soll: Die gültige Fixture liefert für jeden registrierten Topf einen vom jeweiligen Registryvertrag akzeptierten Rohwert, ermöglicht das vollständige Backup und lässt den positiven Löschfall sowie alle folgenden Sicherheitschecks laufen.

Ist: `kd:entdecken-pins` bleibt als `wert:kd:entdecken-pins` gespeichert. JSON-Projektion und Backup erzeugen genau dafür eine Warnung und den Status `UNVOLLSTAENDIG`; `controller.download()` wirft an Testzeile 138 `safety-copy-failed`. Die unveränderte Einzeltestkopie endet mit Exit 1 nach drei Checks. Eine separate Testkopie, die ausschließlich `[K.entdeckenPins, "[]"]` ergänzt, endet mit `LOCAL-DATA-SAFETY-TEST BESTANDEN (9/9)` und Exit 0.

## Ursache und Fundstellen

Die Fixture initialisiert alle Löschschlüssel mit präfixiertem Text, definiert dann die angeblich vollständige `registryRohwerte`-Map, lässt darin aber `K.entdeckenPins` aus. Der Registryeintrag für Titel-Pins ist ein `jsonEintrag`: `JSON.parse` warnt bei dem noch vorhandenen Nicht-JSON-Text. Die Vollständigkeitsprüfung sperrt deshalb den Download-Guard. Diese Sperre ist das korrekte Produktverhalten; die Ursache liegt allein in der vermeintlich gültigen Testfixture.

Fundstellen in der unveränderlichen Source-Kopie (bytegleich mit dem Prüfcommit):

- [`/private/tmp/kd-vollreview-20260916/source/local_data_safety_test.mjs:80`](/private/tmp/kd-vollreview-20260916/source/local_data_safety_test.mjs:80) und [`:84`](/private/tmp/kd-vollreview-20260916/source/local_data_safety_test.mjs:84) — allgemeine Präfixinitialisierung und der vorhandene Pin-Map-Eintrag für Kino, aber kein entsprechender Eintrag für `K.entdeckenPins`; repository-relativ `local_data_safety_test.mjs:79-102` am Commit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- [`/private/tmp/kd-vollreview-20260916/source/local_data_safety_test.mjs:138`](/private/tmp/kd-vollreview-20260916/source/local_data_safety_test.mjs:138) — abgewiesener Download im positiven Löschfall; repository-relativ `local_data_safety_test.mjs:132-147`.
- [`/private/tmp/kd-vollreview-20260916/source/src/lib/personalDataRegistry.js:37`](/private/tmp/kd-vollreview-20260916/source/src/lib/personalDataRegistry.js:37) und [`:116`](/private/tmp/kd-vollreview-20260916/source/src/lib/personalDataRegistry.js:116) — JSON-Fehlerwarnung und Registryvertrag für Titel-Pins; repository-relativ `src/lib/personalDataRegistry.js:34-46,115-135`.
- [`/private/tmp/kd-vollreview-20260916/source/src/lib/backup.js:42`](/private/tmp/kd-vollreview-20260916/source/src/lib/backup.js:42) und [`/private/tmp/kd-vollreview-20260916/source/src/controllers/localDataSafetyController.js:128`](/private/tmp/kd-vollreview-20260916/source/src/controllers/localDataSafetyController.js:128) — Backup-Warnung macht den Beleg unvollständig; der Controller verweigert anschließend korrekt die Löschfreigabe; repository-relativ `src/lib/backup.js:39-52` und `src/controllers/localDataSafetyController.js:122-138`.

## Belege und Gegenproben

Ausgeführt durch den unabhängigen Validator mit unveränderter Originaltestkopie und bytegleichen eingefrorenen `src`-Modulen; Node v24.18.0, lokale installierte Abhängigkeiten nur lesend per Symlink:

- `cd /private/tmp/kd-vollreview-20260916/tests/E03-F003/validator && node local_data_safety_test.mjs` endete mit Exit 1, exakt drei Checks und `safety-copy-failed` an Zeile 138. Log: [`local_data_safety_test.mjs.log`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F003/validator/local_data_safety_test.mjs.log).
- Die isolierte Gegenprobe [`corrected_fixture_test.mjs`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F003/validator/corrected_fixture_test.mjs) ergänzt nur den gültigen Rohwert `[]` direkt nach `K.kinoPins`; Produktmodule bleiben unverändert. Ihr Lauf endet mit Exit 0 und 9/9 Checks. Log: [`corrected_fixture_test.mjs.log`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F003/validator/corrected_fixture_test.mjs.log).
- Der Zusatztest [`diagnostic.mjs`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F003/validator/diagnostic.mjs) bestätigt dieselbe Ursache: 19 Registryeinträge, eine Warnung ausschließlich für `kd:entdecken-pins`, keine Löschung bei verweigertem Download und vollständiges Backup nach Ergänzung von `[]`. Der Lauf endete mit Exit 0.
- [`run-summary.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F003/validator/run-summary.json) bestätigt die Bytegleichheit von Originaltest und Produktkopie zur Source-Kopie.

Gegenbelege: Legacy-Arrays sind für Titel-Pins ein akzeptierter minimaler Wert; ein fehlender Registrywert hätte einen zulässigen Fallback, aber die Fixture hinterlässt tatsächlich ungültigen Text. Der separate statische Test `cleanup_b1_test.mjs` stützt die gewünschte Semantik (leeres Register vollständig, Backup-Warnung sperrt), wurde hier jedoch nicht ausgeführt. Ein statischer Pipelinecheck fand keine Referenz von `local_data_safety_test.mjs` in Package-Skripten, Workflows oder Tools; `test:data-safety` startet andere Tests. Daher keine Aussage über allgemein rote CI.

Testwerkzeugfehler: keiner festgestellt — die vorhandene Schutzprüfung verhält sich wie vorgesehen, die Testfixture ist unvollständig. Betriebsbeleglücke: keine komplette Testsuite, Browser-, Live- oder CI-Ausführung; Pipelineaussage nur aus statischer Verdrahtung am Prüfcommit.

## Korrekturziel und Abnahme

Nur die gültige Fixture um einen vom aktuellen Registryvertrag akzeptierten Rohwert für `K.entdeckenPins` ergänzen, zum Beispiel `[]`. Optional die Fixture vor dem positiven Fall direkt gegen die Registryvollständigkeit prüfen. Produktions-Backup, Vollständigkeitsprüfung und Löschguards bleiben unverändert. Eine spätere CI-Einbindung ist eine getrennte Entscheidung.

Abnahme:

- `node local_data_safety_test.mjs` läuft mit der gültigen Fixture am Prüfstand vollständig und meldet alle 9 Checks.
- Die gültige Fixture enthält für `K.entdeckenPins` gültiges JSON; ihr Backup erzeugt keine Warnung und gilt als vollständig.
- Vorhandener ungültiger Pin-JSON-Text sperrt die Löschfreigabe weiterhin vor jeder Löschung.
- Kontextwechsel, stille Teilfehler mit Rollback und Kontowechsel werden nach dem positiven Fall tatsächlich erreicht.

## Abhängigkeiten und offene Punkte

Kein Duplikat zu E03-F001 oder E03-F002: Diese betreffen Account-Sync bzw. Kontoadoption, nicht den Standalone-Löschschutztest. Die produktive Löschsperre soll gerade unverändert bleiben. Ob der Standalone-Test künftig in CI laufen soll, ist außerhalb dieses Fehlers zu entscheiden.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E03-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E03-F003.json). Ursprünglicher Vorschlag: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E03-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E03-F003.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Master-Abnahme ist bestätigt, bis sein gesonderter Abgleich vorliegt.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E03/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E03/KD-REV-E03-003.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
