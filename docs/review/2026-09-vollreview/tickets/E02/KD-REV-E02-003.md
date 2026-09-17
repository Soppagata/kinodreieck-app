# KD-REV-E02-003 · Transportfehler im RLS-Test überspringt die Bereinigung eigener Testproben

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – ein ausdrücklich gestarteter RLS-Test kann nach erfolgreich angelegter eigener Probe mit Fehlerexit enden und diese Probe im Testkonto hinterlassen. Folgeläufe verlieren dadurch Wiederholbarkeit und Datenhygiene.
- Finding: E02-F003
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E02

## Fehler und Auswirkung

Betroffen ist ausschließlich der aktive RLS-Testharness und dessen Testkonten. Nach einem Transportfehler unmittelbar nach T7 verbleibt die erfolgreich von A angelegte persönliche Probe. Ein Folgelauf erkennt diesen Topf als belegt, weicht auf einen anderen freien Topf aus und kann bei demselben Abbruch eine weitere eigene Probe hinterlassen.

Der Befund ist kein fälschlich grüner RLS-Lauf: Der Kindprozess endet weiterhin fehlerhaft. Er belegt weder einen RLS-Durchbruch noch den Verlust vorhandener Nutzerdaten. Die Vorprüfung schützt bestehende Töpfe vor Überschreiben; das Problem ist die fehlende Bereinigung der eigenen, bereits angelegten Proben nach einem geworfenen Transportfehler.

## Auslöser, Soll und Ist

Ein expliziter aktiver RLS-Lauf verwendet zwei verschiedene aktive Testkonten und findet einen für beide freien Testtopf. T7 schreibt As Probe erfolgreich und erhält die erwartete 201-Antwort. Der anschließende T3-GET wirft einmalig eine Fetch-Transport-Exception; weitere Requests könnten wieder erfolgreich sein.

Soll ist: Nach dem Abbruch wird die identitätsgebundene Bereinigung der bereits registrierten Probe versucht. Der auslösende Testfehler bleibt sichtbar und führt zu Fehlerexit; nicht entfernte eigene Proben erhalten sichere Recovery-Angaben.

Ist ist: Die Fetch-Rejection verlässt `rest` und beendet die Top-Level-Testsequenz vor dem Cleanup. Im isolierten Lauf blieben keine Produkt-DELETEs zurück, sondern jeweils eine Probe: zunächst `kd:vokabular`, im Folgelauf zusätzlich `kd:filter-kino`. Das Skript schreibt keine Recovery-Angaben.

## Ursache und Fundstellen

`rest` erwartet die Fetch-Antwort direkt; nur Fehler beim JSON-Lesen werden gefangen. Die T7/T3-Sequenz läuft als Top-Level-`await` ohne umschließendes `try/finally`; Cleanup und Probenverwaltung werden erst weit danach erreicht. Die dort vorhandene Account-/Key-/Wertprüfung kann nach der Rejection deshalb nicht wirken. Der normale Wrapper startet dieses Skript als Kindprozess und propagiert dessen Exit; sein `finally` gibt für den RLS-Modus nur einen nicht belegten KI-Lock frei, ohne Datenbereinigung.

Maßgebliche Fundstellen am Prüfcommit:

- [eingefrorene Quelle: rls_test_personal.mjs](/private/tmp/kd-vollreview-20260916/source/tools/rls_test_personal.mjs:145) – Fetch-Rejections aus `rest` werden nicht gefangen; der JSON-Parse-Fallback deckt diesen Pfad nicht ab. Repository: `tools/rls_test_personal.mjs:145-152` @ `14804ce389d69114feed27b92fb11ac78423cc0e`.
- [eingefrorene Quelle: rls_test_personal.mjs](/private/tmp/kd-vollreview-20260916/source/tools/rls_test_personal.mjs:377) – T7 erzeugt As Probe, T3 folgt ohne Abbruchbehandlung. Repository: `tools/rls_test_personal.mjs:377-394` @ `14804ce389d69114feed27b92fb11ac78423cc0e`.
- [eingefrorene Quelle: rls_test_personal.mjs](/private/tmp/kd-vollreview-20260916/source/tools/rls_test_personal.mjs:891) – der sichere normale Cleanup startet erst bei Zeile 913 und filtert nach Konto, Key und exaktem eigenen Wert. Repository: `tools/rls_test_personal.mjs:891-944` @ `14804ce389d69114feed27b92fb11ac78423cc0e`.
- [eingefrorene Quelle: keychain_runner.mjs](/private/tmp/kd-vollreview-20260916/source/tools/keychain_runner.mjs:196) und [keychain_runner.mjs](/private/tmp/kd-vollreview-20260916/source/tools/keychain_runner.mjs:684) – `npm run test:rls` startet das Zielskript; die Wrapper-Finally-Klausel enthält keine RLS-Bereinigung. Repository: `package.json:46`, `tools/keychain_runner.mjs:196-199,684-712` @ `14804ce389d69114feed27b92fb11ac78423cc0e`.

Die statische Migrationsgegenprobe zeigt für die getesteten eigenen Töpfe einen erreichbaren Insert und eine spätere Eigenlöschung unter aktivem Konto; sie liefert keinen probenbezogenen Ablauf- oder Rollbackmechanismus. Repository: `supabase/migrations/20260725120000_kd_personal.sql:18-24,47-65`, `supabase/migrations/20260809121000_rollen_v1_access_enforcement.sql:70-102,394-395`, `supabase/migrations/20260914230000_entdecken_pins_personal.sql:8-19` @ Prüfcommit.

## Belege und Gegenproben

Ausgeführt wurde ausschließlich ein lokaler Reproduktionsrunner, der das unveränderte Modul aus der eingefrorenen Quelle in zwei isolierten Node-Kindprozessen bis zum echten T3-Abbruch lädt; Fetch war vollständig ersetzt, ein Netzwerkzugriff ausgeschlossen: [reproduce.mjs](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E02-F003/validator/reproduce.mjs), Ergebnis [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E02-F003/validator/result.json), Detailberichte [run-1.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E02-F003/validator/run-1.json) und [run-2.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E02-F003/validator/run-2.json).

Der Runner selbst endete mit Exit 0, weil er die Fehlerbeobachtung erfolgreich prüfte; beide Produkt-Kindprozesse endeten wie erwartet mit Exit 1. Alle R0/T1/T2/T7-Checks wurden vor dem T3-Abbruch erfolgreich durchlaufen. Lauf 1 hatte null Produkt-DELETEs und ließ `kd:vokabular` zurück. Lauf 2 übernahm diesen Zustand, ließ den alten Rest unverändert, nutzte `kd:filter-kino` und ließ auch diese Probe mit null Produkt-DELETEs zurück.

Als Gegenprobe führte nur der Validator nach Abbruch je einen account-/key-/wertgebundenen GET und DELETE aus; je Probe wurde eine Zeile gelesen und eine gelöscht. Diese Requests sind als `observer=true` markiert und zählen ausdrücklich nicht als vorhandenes Produkt-Cleanup. Der Blob der eingefrorenen Quellkopie stimmt mit dem Prüfcommit überein (`600956d53aad8c0e29690866caa9326a432f911a`; Nachweis im [Validatorergebnis](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E02-F003.json)). Testwerkzeugfehler wurden nicht festgestellt.

Betriebsbeleglücke: Kein realer Supabase-Lauf, keine lokale SQL-Engine und kein Keychain-Wrapper-Start wurden ausgeführt. Weitere Fehlerpositionen, Prozesssignale und harte Prozessenden sind nicht getestet.

## Korrekturziel und Abnahme

`tools/rls_test_personal.mjs` eng abbruchsicher strukturieren: Probeidentitäten und Bereinigungszustände vor riskanten `await`s registrieren, gemeinsame Bereinigung auch bei Fehlern über `finally` ausführen und Cleanup-Fehler pro Probe isolieren. Die bestehenden Account-/Key-/Wertfilter und der Schutz vorhandener Daten bleiben erhalten. Der ursprüngliche Fehlerexit bleibt erhalten; nicht entfernte Proben müssen ohne Tokens oder Passwörter sicher einer Lauf-/Account-/Key-Zuordnung zugeordnet und für Recovery ausgewiesen oder lokal persistiert werden. Keine Schema- oder RLS-Lockerung ist Teil der Korrektur.

Abnahme:

- Mit vollständig gemocktem Fetch: T7 ist erfolgreich, T3 wirft einmalig; As eigene Probe wird danach account-/key-/wertgebunden gelöscht und der Lauf endet weiterhin fehlerhaft.
- Ist ein Cleanup-Request nicht erreichbar oder fehlerhaft, werden weitere registrierte Proben trotzdem separat behandelt; nicht entfernte Proben erhalten sichere Zuordnung und Fehlerstatus.
- Vorhandene oder zwischenzeitlich geänderte Werte werden nie gelöscht; Freitopf- und Rollen-Guards bleiben aktiv.
- Nach erfolgreicher Abbruchbereinigung kann ein Folgelauf denselben zuvor freien Topf wieder nutzen. Ein Abbruch vor der ersten Probe löst keine Löschung fremder Daten aus.
- Beim regulären Abschluss werden eigene A-/B-/Profil-/Shared-Proben weiter bereinigt und vorhandene Profildaten bewahrt.

## Abhängigkeiten und offene Punkte

Keine bestätigte Abhängigkeit zu E02-F001 oder E02-F002: Die Befunde betreffen unterschiedliche Auslöser und Korrekturgrenzen.

Die statisch geprüften Migrationen belegen nur den Quellvertrag, nicht den realen Datenbestand oder den deployten Stand. Die erfolgreiche Recovery-Gegenprobe stammt vom Validator nach Modulabbruch und ist keine bereits vorhandene Produkt-Recovery. Bestehende Preflight-Tests prüfen Modus, Rollen-Preflight und Rechteerwartungen, nicht den Abbruch nach einem erfolgreichen Probe-Insert.

## Herkunft und Master-Abnahme

Validatorergebnis: [E02-F003.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E02-F003.json) (`confirmed`). Eingefrorenes Master-Proposal: [E02-F003.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E02-F003.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E02/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E02/KD-REV-E02-003.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
