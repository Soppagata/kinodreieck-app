# KD-REV-E03-002 · Kontoload übernimmt fehlende Server-Töpfe aus dem Gastcache

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P1 — auf dem normalen Loginpfad werden Gastinhalte als Kontoinhalte aktiv. Bei einer späteren normalen Bearbeitung können sie ohne ausdrückliche Übernahme in den eigenen Kontotopf geschrieben werden. Es gibt keinen belegten sofortigen Upload beim Login und keinen Zugriff auf fremde Serverkonten.
- Finding: E03-F002
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E03

## Fehler und Auswirkung

Hat ein Gerät Gastdaten in einem persönlichen Topf und fehlt für genau diesen Topf eine `kd_personal`-Zeile im frisch angemeldeten Konto, bleibt der Gastwert im nun aktiven Kontocache. Das wurde vollständig für `kd:master` und `kd:artikel` mit einem leeren sowie einem sparsamen Konto reproduziert. Vorhandene Remote-Töpfe werden korrekt ersetzt; nur fehlende Zeilen haben die falsche Semantik.

Die App erreicht dennoch `account-ready`. Ein anschließendes normales `store.set`/Flush schreibt den bearbeiteten Gastfilm in den eigenen Kontotopf. Der Rückholpunkt bleibt korrekt erhalten und Logout stellt den Gaststand bytegenau wieder her, verhindert aber nicht die Anzeige als Kontoinhalt oder den späteren Upload. Dies ist eine Verletzung der Gast-/Konto-Inhaltsgrenze, kein belegter RLS-Bypass, Fremdkontozugriff oder sofortiger Login-Upload.

## Auslöser, Soll und Ist

Ein Gastgerät enthält beispielsweise `kd:master`. Der Nutzer meldet sich an einem freigegebenen Konto an, dessen `kd_personal` keine Zeile für `kd:master` enthält. Beschädigte Metadaten, eine Race-Bedingung oder eine privilegierte Aktion sind nicht nötig.

Soll: Nach erfolgreichem Kontoload darf der aktive Speicher ausschließlich den Kontostand liefern. Ein fehlender Kontotopf ist lokal leer/abwesend. Der frühere Gastwert bleibt ausschließlich im bytegenau gesicherten Rückholpunkt, bis Logout ihn restauriert oder eine ausdrücklich gewählte Gastübernahme erfolgt.

Ist: `kontoUebernehmen()` bindet und sichert den Gastcache, ohne einen vollständigen leeren Kontocache herzustellen. `syncPull()` markiert eine fehlende Serverzeile nur als angelegt und lässt den lokalen Wert stehen. Nach Bestätigung ist das Konto bereit, obwohl die Gastwerte weiterhin aus dem aktiven Store gelesen werden. Der Validator sah beim leeren und beim sparsamen Konto je den Gastfilm nach Login und einen POST erst nach der Folgeänderung; während des Logins gab es keine persönlichen Writes.

## Ursache und Fundstellen

Der Fehlende-Zeile-Zweig in `syncPull()` führt mit `continue` fort, ohne den lokalen Topf zu entfernen oder durch einen leeren Kontowert zu ersetzen. Die Adoptionsroutine sichert/bindet davor lediglich den Rückholpunkt. Die folgenden Owner-, Epoch- und Transitionprüfungen verifizieren die Kontobindung, nicht die vollständige Inhaltsgleichheit der persönlichen Töpfe.

Primäre Fundstellen in der unveränderlichen Source-Kopie (bytegleich mit dem Prüfcommit):

- [`/private/tmp/kd-vollreview-20260916/source/src/lib/accountDriver.js:276`](/private/tmp/kd-vollreview-20260916/source/src/lib/accountDriver.js:276) — fehlende Remote-Zeile: `markStale(false)`, `angelegt.push`, dann `continue`; repository-relativ `src/lib/accountDriver.js:273-277` am Commit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- [`/private/tmp/kd-vollreview-20260916/source/src/services/uebernahme.js:302`](/private/tmp/kd-vollreview-20260916/source/src/services/uebernahme.js:302) und [`:330`](/private/tmp/kd-vollreview-20260916/source/src/services/uebernahme.js:330) — Cachebindung vor Pull und automatische Bestätigung; repository-relativ `src/services/uebernahme.js:298-313,319-333`.
- [`/private/tmp/kd-vollreview-20260916/source/src/services/sessionCoordinator.js:344`](/private/tmp/kd-vollreview-20260916/source/src/services/sessionCoordinator.js:344) und [`/private/tmp/kd-vollreview-20260916/source/src/services/storage.js:368`](/private/tmp/kd-vollreview-20260916/source/src/services/storage.js:368) — tatsächlicher Load- und Ready-Pfad; repository-relativ `src/services/sessionCoordinator.js:337-365` sowie `src/services/storage.js:340-370`.
- [`/private/tmp/kd-vollreview-20260916/source/src/lib/accountDriver.js:389`](/private/tmp/kd-vollreview-20260916/source/src/lib/accountDriver.js:389) und [`:577`](/private/tmp/kd-vollreview-20260916/source/src/lib/accountDriver.js:577) — späteres `set` lädt bei fehlender Revision per Insert hoch und liest/wirkt über den aktiven Driver; repository-relativ `src/lib/accountDriver.js:382-420,570-595`.
- [`/private/tmp/kd-vollreview-20260916/source/kontoautoladen_test.mjs:111`](/private/tmp/kd-vollreview-20260916/source/kontoautoladen_test.mjs:111) — der vorhandene Test entfernt die persönlichen Schlüssel selbst, bevor er den Mock-Kontowert setzt; repository-relativ `kontoautoladen_test.mjs:100-127`.

## Belege und Gegenproben

Ausgeführt durch den unabhängigen Validator, pro Fall in einem frischen Node-Prozess mit echtem produktivem SessionCoordinator/Auth/Storage/Adoption/AccountDriver und ausschließlich localStorage-/fetch-Mocks:

- `cd /private/tmp/kd-vollreview-20260916/tests/E03-F002/validator && node run.mjs` endete für alle drei Fälle mit Exit 0. [`empty.stdout.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F002/validator/empty.stdout.json) und [`partial.stdout.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F002/validator/partial.stdout.json) dokumentieren `account-ready`, verbliebene Gastwerte, null persönliche Login-Writes, späteren Gast-Upload und bytegenauen Gastrestore. Exit 0 bestätigt die Assertions zum Fehler, nicht einen Produkt-PASS.
- Die Gegenprobe [`present-empty.stdout.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E03-F002/validator/present-empty.stdout.json) zeigt die Grenze: Existieren Remote-Zeilen mit explizit leeren Werten, ersetzen sie beide Gasttöpfe korrekt und es erfolgt kein Gast-Upload.
- Der Validator verfolgte den UI-Login bis zur App-Anzeige statisch und prüfte Owner/Epoch/Transition, Snapshot und relevante Migrationen. Ein Browser-Screenshot, eine reale Supabase-Instanz oder ein SQL-Lauf wurden nicht ausgeführt.

Der vorhandene `kontoautoladen_test.mjs` widerlegt den Befund nicht: Sein `kontoLaden`-Mock führt die im Produkt fehlende Leerung selbst aus. Das ist eine Testabdeckungslücke, kein festgestellter Testwerkzeugfehler. Der Gast-Rückholpunkt, Logout-Restore und explizit leere Remotezeilen funktionieren in den ausgeführten Gegenproben.

Testwerkzeugfehler: keiner festgestellt. Betriebsbeleglücke: keine echten Kontodaten, Provider- oder Remote-Schreibvorgänge, keine Produktionshäufigkeit und keine Browser-/PWA-Abnahme erhoben.

## Korrekturziel und Abnahme

Die Remote-zu-lokal-Kontoadoption so begrenzen, dass sie nach erfolgreichem Gast-Rückholpunkt, unter dem bestehenden Transitionzaun und vor `account-ready` einen vollständigen Kontobestand einschließlich fehlender Töpfe herstellt. Fehler müssen weiter sicher zum Gastrestore oder Privacy-Lock führen. Das ist keine Anweisung, jeden normalen Alltags-Pull pauschal zu leeren: echte ungesyncte Kontoänderungen und ihre Schutzregeln bleiben erhalten. Den bestehenden Mocktest durch einen Integrationstest mit dem echten Driver ergänzen.

Abnahme:

- Nichtleerer Gast plus Login in ein leeres Konto: `account-ready`, alle betroffenen persönlichen Töpfe sind leer/abwesend, der Store liefert keine Gastdaten und der Login erzeugt keine persönlichen Uploads.
- Nichtleerer Gast plus sparsames Konto: vorhandene Remote-Töpfe werden übernommen; fehlende Töpfe zeigen keine Gastreste; explizit leere Remote-Werte bleiben korrekt.
- Nach Kontoload neu angelegte oder bearbeitete Kontoinhalte enthalten keine alten Gastdatensätze, sofern keine ausdrückliche Gastübernahme gewählt wurde.
- Rückholpunkt und Logout stellen die ursprünglichen Gastrohwerte bytegenau wieder her.
- Fehler bei Snapshot, Pull oder lokaler Ersetzung aktivieren keinen gemischten Kontocache; Transition-, Owner- und Epoch-Grenzen bleiben wirksam.
- Normale Konto-Pulls bewahren echte ungesyncte Kontoänderungen; die explizite Gast-zu-Konto-Übernahme bleibt separat funktionsfähig.

## Abhängigkeiten und offene Punkte

E03-F001 betrifft ein getrenntes Pull/Write-Antwort-Rennen und ist kein Duplikat. Sichtbarkeit im React-Rendering wurde aus aktivem Speicherread und statischem Einstiegspfad abgeleitet; sie ist nicht als Browser-Lauf nachgewiesen. Der gezielte Migrationsgegencheck ersetzt keinen vollständigen Migrationsaudit.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E03-F002.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E03-F002.json). Ursprünglicher Vorschlag: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E03-F002.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E03-F002.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Master-Abnahme ist bestätigt, bis sein gesonderter Abgleich vorliegt.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E03/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E03/KD-REV-E03-002.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
