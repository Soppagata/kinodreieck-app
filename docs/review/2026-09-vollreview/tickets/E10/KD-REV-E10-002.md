# KD-REV-E10-002 · Modelldiagnose meldet Body-Timeout und unlesbares JSON als erfolgreichen leeren Katalog

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – Der tokenfreie Diagnosepfad protokolliert und antwortet bei einem Fehler als Erfolg. Das verschleiert die Ursache; ein bezahlter Modellpfad oder Budget-Bypass ist nicht belegt.
- Finding: E10-F002
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E10

## Fehler und Auswirkung

Im Pfad `anbieter-modelle` kann eine bereits empfangene HTTP-200-Response bei einem nachfolgenden Body-Abort, ungültigem JSON oder JSON-`null` als erfolgreicher leerer Modellkatalog erscheinen. Der Handler antwortet mit HTTP 200 und `ok:true`, beendet die Diagnosezeile mit Status `fertig`, `p_fehlerklasse=null` und Kosten 0. Die konkrete Fehlerursache wird damit im API- und Log-Ergebnis verloren.

Der Smoke-Test P8 bleibt dabei fail-closed: Ein leerer Katalog erfüllt dessen Anforderung mindestens einer Modell-ID nicht und stoppt vor zahlenden Proben. Der Befund betrifft den separaten tokenfreien Modell-Diagnosepfad, nicht den bezahlten `rufeAnbieter`-Pfad.

## Auslöser, Soll und Ist

Voraussetzung ist ein regulär zugelassener `anbieter-modelle`-Aufruf: authentifiziertes aktives Konto mit `personal_ai`, aktivierter KI-Task/`ai_aktiv`, Providerfreigabe, vorhandener Anbieterschlüssel sowie erfolgreiche Nullkosten-Reservierung. Der Anbieter sendet HTTP-200-Header; sein Body bleibt bis zum Abort offen, enthält ungültiges JSON oder liefert JSON-`null`.

Soll: Ein Body-Timeout oder eine unlesbare/strukturell ungültige Katalogantwort erzeugt `ok:false` mit Fehlerstatus, beendet die Diagnose als `fehler` mit sicherer unterscheidbarer Fehlerklasse und behält den Nullkostencharakter bei.

Ist: Die Response bleibt gesetzt; Fehler beim Bodylesen führen über Fallbacks zu `modelle: []`, `diagBeende("fertig")` und HTTP 200/`ok:true`.

## Ursache und Fundstellen

`antwort` wird unmittelbar nach Empfang der Header gesetzt. Der äußere Catch setzt bei einem Abort zwar `diagZeitUeberschritten`, der auswertende Fehlerzweig prüft jedoch nur `!antwort`. Deshalb läuft bei vorhandener HTTP-200-Response der Erfolgspfad weiter. Ein gewöhnlicher Parsefehler setzt `daten = null`; der Nullish-Fallback erzeugt `[]` und der Erfolgsabschluss erfolgt unbedingt.

- Fetch, Bodydecode und äußere Fehlererfassung: [eingefrorene Quelle `index.ts:4400-4421`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:4400) – Repository: `supabase/functions/ai-task/index.ts`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- Ausschließlich auf fehlende Response beschränkter Fehlerpfad: [eingefrorene Quelle `index.ts:4421-4439`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:4421) – derselbe Repositorypfad und Commit.
- Nullish-Katalogfallback und unbedingter Erfolgsabschluss: [eingefrorene Quelle `index.ts:4441-4450`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:4441) – derselbe Repositorypfad und Commit.

## Belege und Gegenproben

- Statisch: Der zugelassene Diagnosepfad samt Gates wurde im Validator verfolgt; die Entscheiderdatei und der P8-Smoke wurden bytegenau gegen den Prüfcommit abgeglichen. Siehe [Validatorergebnis](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E10-F002.json) und [Provenienz](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E10-F002/validator/provenance.json).
- Ausgeführt, lokal mit Mocks: `node /private/tmp/kd-vollreview-20260916/tests/E10-F002/validator/repro.mjs` lief unter Node v24.18.0 mit dem vollständigen unveränderten Produkthandler, TypeScript-Transformation sowie gemocktem Supabase-SDK und `fetch`. Response-, ReadableStream-, AbortController- und Timer-Objekte wurden echt instanziiert; es gab keine Netzwerk- oder DB-Verbindung. Die sieben Fälle (valide Liste, Bodyabort nach Headern, ungültiges JSON, JSON-`null`, Netzfehler vor Headern, HTTP 503, abgelehnter Start) ergaben die in [results.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E10-F002/validator/results.json) festgehaltenen Antworten und Abschluss-RPC-Argumente.
- Gegenproben: Netzfehler vor Headern und HTTP-Fehler bleiben Fehler; eine abgelehnte Start-RPC verhindert den Anbieteraufruf. Der zahlende Pfad behandelt einen Body-Abort getrennt als `AufrufFehler`. Die vorhandenen Tests H5/H5b/H5c/H6 testen valide Liste, Startablehnung, Fetch- und HTTP-Fehler, aber nicht Bodyabort oder Parsefehler nach HTTP 200. Sie wurden gelesen, nicht als Suite ausgeführt.
- Der nachgelagerte P8-Check in [eingefrorener Quelle `tools/ai_smoke.mjs:495-513`](/private/tmp/kd-vollreview-20260916/source/tools/ai_smoke.mjs:495) verlangt HTTP 200 und mindestens eine Modell-ID. Für die problematischen Antworten ergibt die lokale Auswertung daher `smokeWouldPass=false`; ein echter Smoke-Lauf wurde nicht gestartet.

Das erfolgreiche Ende des Mocklaufs ist ein Fehlernachweis, keine Produktabnahme.

## Korrekturziel und Abnahme

Nur den Antwort- und Fehlerabschluss des Zweigs `anbieter-modelle` korrigieren. Body-/Fetchfehler müssen unabhängig von einer bereits gesetzten Response behandelt werden; Erfolg setzt vollständig dekodierte und gültige Katalogdaten voraus. Timeout und unlesbare Antwort getrennt klassifizieren. Nullkosten, vorhandene Gates und der P8-Stop bleiben erhalten; keine Änderung an Provider-, Budget- oder Migrationsarchitektur.

- HTTP 200 mit Bodyabort nach Headern liefert `ok:false`, Fehlerstatus, Grund `anbieter-zeitgrenze` und genau einen Fehlerabschluss mit Kosten 0.
- HTTP 200 mit ungültigem JSON oder fehlender gültiger Katalogstruktur liefert einen definierten Antwortfehler statt 200/`[]`.
- Eine gültige Modellliste bleibt HTTP 200/`ok:true` und wird genau einmal fertig abgeschlossen.
- Netzfehler vor Headern, HTTP-Fehler und abgelehnte Start-RPCs behalten ihre Fehler- bzw. Sperrwirkung; bei Startablehnung erfolgt kein Anbieteraufruf.
- P8 bleibt ohne Modell-ID gesperrt; die bestehenden Sicherheitsgrenzen regressieren nicht.

## Abhängigkeiten und offene Punkte

- Produktfehler: Der lokale Mocklauf belegt den falschen Erfolg und Fehlerabschluss im unveränderten Handler.
- Testwerkzeuggrenze: keine Deno-/deployte Edge-Runtime; Auth, Datenbank und Anbieter waren Mocks. Die Testfrist von 25 ms ist laut Produktvalidator zulässig, misst aber keinen realen Anbieter.
- Betriebsbeleglücke: Produktionshäufigkeit, aktuelle Gates und reale Logzeilen wurden nicht untersucht. Keine Aussage über bezahlte Tokens, Kosten oder einen laufenden Smoke-Test.
- Eine syntaktisch und strukturell gültige leere Anbieter-Modellliste wird nicht als eigener Fehler bewertet.

## Herkunft und Master-Abnahme

Validatorergebnis: [E10-F002.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E10-F002.json). Ursprungsproposal: [E10-F002.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E10-F002.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E10/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E10/KD-REV-E10-002.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
