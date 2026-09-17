# KD-REV-E01-002 · Start-Pinboard sortiert Januartermine vor Dezember und kann den nächsten Termin ausblenden

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – Begrenzter saisonaler Funktionsfehler der persönlichen Terminübersicht. Ab zwei jahrübergreifenden Pins ist die Reihenfolge falsch; ab sechs passenden Pins kann der unmittelbar nächste Termin im Pinboard fehlen. Pins bleiben gespeichert und werden weiterhin an den Wochenplan übergeben.
- Finding: E01-F002
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E01

## Fehler und Auswirkung

Das Startseiten-Pinboard sortiert aktuelle Dezember- und Januar-Kino-Pins anhand eines jahreslosen Anzeige-Strings. Dadurch liegen alle Januartermine vor jedem Dezembertermin. Wegen der nachfolgenden Fünfergrenze kann ein zeitlich näherer Dezembertermin aus diesem Modul verschwinden. Betroffen sind eingeloggte Konten am Jahreswechsel mit gültigen passenden Kino-Pins aus Dezember und dem folgenden Januar.

Bei zwei Pins ist nur die Reihenfolge falsch. Bei mehr als fünf passenden Pins kann der nächste Termin fehlen. Der Befund belegt keinen Datenverlust und keine generelle Unsichtbarkeit: Die Pins bleiben gespeichert und der Wochenplan erhält sie vor Sortierung und Begrenzung.

## Auslöser, Soll und Ist

**Auslöser:** Abgeschlossener Boot, angemeldetes Konto und Start-Tab am 31.12.2026 um 10:00 Europe/Vienna. Sechs regulär erzeugbare Kino-Pins mit eindeutigen aktuellen Programmtreffern: 31.12.2026 18:00, 01.01.2027 16:00 und 20:00, 02.01.2027 16:00 und 20:00, 03.01.2027 20:00. Alle liegen im echten Vier-Tage-Fenster; ein synthetischer Film pro Pin genügt, zusätzliche `termin_iso`-Felder sind nicht nötig.

**Soll:** Die fünf chronologisch nächsten Pins erscheinen: Film 0 (31.12.), Film 1/2 (01.01.), Film 3/4 (02.01.). Film 5 (03.01.) darf ausschließlich wegen der Fünfergrenze entfallen.

**Ist:** Das gerenderte Pinboard enthält Film 1 bis Film 5; Film 0 fehlt. Mit nur zwei Pins erscheint 01.01. vor 31.12.

## Ursache und Fundstellen

`pinSortWert` extrahiert aus dem formatierten Termin ausschließlich Monat, Tag und Uhrzeit. Jahr und Bezugsdatum fehlen, also ist jeder Januarwert kleiner als jeder Dezemberwert. `StartDashboard` formatiert zuerst, sortiert mit diesem Schlüssel und schneidet danach auf fünf Einträge.

- Jahrloser Schlüssel: [eingefrorene `src/tabs/StartTab.jsx:24`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:24) bis [`:28`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:28) (repository-relativ `src/tabs/StartTab.jsx:24-28`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`).
- Finale Sortierung und Fünferkappung: [eingefrorene `src/tabs/StartTab.jsx:196`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:196) bis [`:200`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:200).
- Reguläre Produktbedienung erstellt die betroffenen Pins über `toggleKinoPin`: [eingefrorene `src/tabs/KinoTab.jsx:439`](/private/tmp/kd-vollreview-20260916/source/src/tabs/KinoTab.jsx:439) bis [`:446`](/private/tmp/kd-vollreview-20260916/source/src/tabs/KinoTab.jsx:446), weiter zu [eingefrorene `src/App.jsx:518`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:518) bis [`:525`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:525).
- Die Ablaufprüfung behandelt den Jahreswechsel und entfernt die sechs Zukunftspins nicht: [eingefrorene `src/App.jsx:506`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:506) bis [`:512`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:512). Die Programmnormierung begrenzt auf vier Tage: [eingefrorene `src/lib/programm.js:126`](/private/tmp/kd-vollreview-20260916/source/src/lib/programm.js:126) bis [`:152`](/private/tmp/kd-vollreview-20260916/source/src/lib/programm.js:152). Der Katalogabgleich verwendet dagegen reale lokale Terminwerte mit Jahreswechselbezug: [eingefrorene `src/lib/wochenplan.js:445`](/private/tmp/kd-vollreview-20260916/source/src/lib/wochenplan.js:445) bis [`:474`](/private/tmp/kd-vollreview-20260916/source/src/lib/wochenplan.js:474) sowie [`:514`](/private/tmp/kd-vollreview-20260916/source/src/lib/wochenplan.js:514) bis [`:534`](/private/tmp/kd-vollreview-20260916/source/src/lib/wochenplan.js:534). Keine dieser Vorstufen korrigiert die spätere Pinboard-Sortierung.

## Belege und Gegenproben

**Statische Beweiskette.** Der Validator verfolgte den regulären Pin-Button, Persistenz, Ablaufprüfung, Programmnormierung, eindeutigen Katalogabgleich und die finale Start-Tab-Sortierung. Der zugrunde liegende Verdacht wurde durch die Validierung präzisiert: [Validator JSON](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E01-F002.json), ursprüngliches [Master-Proposal](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E01-F002.json).

**Tatsächlich ausgeführte lokale Reproduktion.** `node /private/tmp/kd-vollreview-20260916/tests/E01-F002/validator/repro.cjs` endete mit Exit 0. Die Reproduktion nutzt echtes React-SSR-Markup von StartTab samt Kindern, echte `normalisiereProgramm`- und Katalogauflösung sowie die bytegetreu aus dem Prüfstand extrahierte Funktion `pinAbgelaufen`; nur `useSyncStatus` ist gemockt, die lokale Uhr ist fest und Netzwerk gesperrt. Ergebnis: Im Sechs-Pin-Jahreswechsel läuft die Auflösung für alle sechs Einträge, gerendert werden allein Film 1–5; Film 0 fehlt. Die Zwei-Pin-Kontrolle stellt Film 1 vor Film 0 dar. Die Gleichjahres-Kontrolle liefert Film 1, Film 2, Film 0 korrekt. Resultat und Provenienz: [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E01-F002/validator/result.json); gerenderte Fälle: [rollover-six.html](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E01-F002/validator/rollover-six.html), [rollover-two.html](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E01-F002/validator/rollover-two.html) und [same-year-control.html](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E01-F002/validator/same-year-control.html). Der erfolgreiche Reproduktionslauf belegt den Fehler, keine bestandene Produktabnahme.

**Testwerkzeugfehler getrennt.** Ein erster SSR-Harnessversuch bündelte React getrennt vom Renderer und brach mit `Invalid hook call` ab. Der Harness wurde auf dieselbe vorhandene React-Installation korrigiert. Das ist ausschließlich ein Harness-Fehler; nur der anschließende erfolgreiche Lauf ist Reproduktionsbeleg.

**Gegenproben und Grenzen.**

- Das echte Vier-Tage-Fenster begrenzt die Auslösbarkeit. Die Reproduktion verteilt deshalb fünf Januartermine auf 01.–03.01.; alle passieren den Filter tatsächlich.
- `pinAbgelaufen` und `findeKinoPinImKatalog` lassen die sechs Pins im Szenario bestehen; die Verdeckung entsteht erst bei der Schluss-Sortierung.
- Innerhalb eines Kalenderjahres ist die ausgeführte Kontrollprobe chronologisch korrekt.
- `src/tabs/KinoTab.jsx:59-64` enthält statisch eine ähnliche jahreslose Sortierung, aber ohne dieselbe Fünferkappung. Das ist kein separat laufzeitvalidierter Produktbefund und erweitert dieses Ticket nicht.

## Korrekturziel und Abnahme

Die lokale Start-Pinboard-Sortierung auf reale lokale Terminwerte mit Jahreswechselbezug umstellen und erst danach auf fünf Einträge begrenzen. Rohtermininformation muss vor einer Anzeigeformatierung erhalten bleiben; bei ISO-Eingaben sind Terminjahre mit der bestehenden lokalen Uhrzeit zu berücksichtigen. Persistenz, Backend, Pinanzahl und Programmfenster sind nicht Teil dieser Korrektur. Eine mögliche Abstimmung der verwandten KinoTab-Sortierung braucht eigenen Scope und Beleg.

Abnahme:

1. Bei festem 31.12.2026 10:00 Europe/Vienna und den sechs nach echter Programmnormierung gültigen Fixtures zeigt das Pinboard Film 0, 1, 2, 3, 4; Film 5 entfällt durch das Limit.
2. Bei zwei gültigen Pins vom 31.12. und 01.01. steht der Dezembertermin zuerst.
3. Gleichjährige Pins bleiben nach Tag und Uhrzeit korrekt geordnet; die Fünfergrenze bleibt bestehen.
4. Katalogauflösung und Ablaufprüfung bleiben aktiv; kein fehlender Programmtreffer wird künstlich zur Testerfüllung verwendet.
5. Falls ein gemeinsamer Parser verwendet wird, berücksichtigt er ISO-Terminjahre vor der Anzeigeformatierung und erhält die bestehende lokale Uhrzeitsemantik.

## Abhängigkeiten und offene Punkte

- Kein verwandtes Finding als Duplikat bestätigt.
- Nicht ausgeführt und daher **nicht belegt**: kompletter App-Mount, Browserklicktest, physische iPhone-/PWA-Abnahme, reales Konto, Live-Kinoprogramm, Providerzugriff und Häufigkeit sechs solcher Pins im Produktbetrieb.
- Der UI-Nachweis ist echtes React-SSR-Markup; er misst weder Sichtbarkeit noch Layout in einem Browser.
- SQL wurde nur entlang gezielter Pin-Verweise betrachtet. Dieses Ticket beansprucht keine vollständige Migrationslektüre.

## Herkunft und Master-Abnahme

Validatorergebnis: [E01-F002.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E01-F002.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E01/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E01/KD-REV-E01-002.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
