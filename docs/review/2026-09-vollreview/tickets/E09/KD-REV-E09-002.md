# KD-REV-E09-002 · Finder-Kinozeitfilter verwechselt einstellige Tage mit späteren Terminen

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — eine explizite tagesbezogene Kinoanfrage kann Filme und Vorstellungstermine eines anderen Tages ausgeben. Der Befund ist auf einen begrenzten Finder-/globale-Suche-Pfad eingegrenzt; keine Live-Inzidenz ist behauptet.
- Finding: E09-F002
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E09

## Fehler und Auswirkung

Beim Finder-/globalen Suchweg wird ein ungepolsterter Tagesstring als Substring gesucht. Am 6. September trifft `6.9.` dadurch auch auf `16.9.` und `26.9.`. Für „heute im Kino“ können zur Mediathek gematchte Filme mit ausschließlich späteren Terminen erscheinen; die angezeigten `zeitenAlle` nennen dann ebenfalls den falschen Tag.

Der normale film.at-Vier-Tage-Filter dämpft diesen Fall, sofern im Fenster mindestens ein Film vorhanden ist. Der Fehler bleibt aber im ausdrücklich vorgesehenen future-only-Fallback sowie in unterstützten Altformat-/normalisierten Cachebeständen mit weiter reichenden Zukunftsterminen erreichbar.

## Auslöser, Soll und Ist

Am 6. September enthält ein film.at-Snapshot für gematchte Filme ausschließlich Vorstellungen am 16. oder 26. September. Das Vier-Tage-Fenster ist deshalb leer und die Normalisierung aktiviert den produktseitigen Fallback. Eine Anfrage „heute im Kino“ enthält kein direktes Titel-Signal.

Soll: Bei expliziter Kinoquelle und `heute`/`morgen` bleiben nur Filme und ausgewiesene Termine, die tatsächlich auf den angefragten Kalendertag fallen.

Ist laut Reproduktion: „heute im Kino“ liefert am 6. September `film-16` und `film-26` mit `Mi 16.9. 20:00 · Filmcasino` bzw. `Sa 26.9. 20:00 · Filmcasino`. Für morgen bleibt neben dem korrekten 7. September auch ein Termin am 17. September.

## Ursache und Fundstellen

- [`src/lib/finder.js:323`](/private/tmp/kd-vollreview-20260916/source/src/lib/finder.js:323) bildet den ungepolsterten Schlüssel `T.M.`. [`…:361-367`](/private/tmp/kd-vollreview-20260916/source/src/lib/finder.js:361) filtert anschließend mit `s.includes(t)` und betrachtet das fälschlich gefüllte Terminarray als ausreichenden Nachweis.
- [`src/lib/programm.js:120-176`](/private/tmp/kd-vollreview-20260916/source/src/lib/programm.js:120) begrenzt den regulären film.at-Lauf auf heute plus drei Tage, führt bei leerem Fenster aber ausdrücklich alle zukünftigen Termine fort ([`…:171-174`](/private/tmp/kd-vollreview-20260916/source/src/lib/programm.js:171)). [`…:99-117`](/private/tmp/kd-vollreview-20260916/source/src/lib/programm.js:99) bereinigt Altformatdaten nur nach Vergangenheit und behält Zukunftstermine.
- Die App normalisiert Payloads und Cachewerte ([`src/App.jsx:576-586`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:576), [`…:816-826`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:816)), erzeugt die Kinozuordnung ([`src/App.jsx:1314-1316`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1314)) und übergibt das Ergebnis ohne weitere Datumsprüfung an den Finder ([`src/tabs/FinderTab.jsx:152-184`](/private/tmp/kd-vollreview-20260916/source/src/tabs/FinderTab.jsx:152)). Treffer und `kino.zeiten` werden anschließend gerendert ([`…:425-438`](/private/tmp/kd-vollreview-20260916/source/src/tabs/FinderTab.jsx:425), [`…:875-885`](/private/tmp/kd-vollreview-20260916/source/src/tabs/FinderTab.jsx:875)).

Alle Links zeigen in die eingefrorene Quelle `/private/tmp/kd-vollreview-20260916/source/`; die zusätzlichen `src/...`-Angaben sind repository-relativ und gelten für Commit `14804ce389d69114feed27b92fb11ac78423cc0e`.

## Belege und Gegenproben

**Ausgeführte Reproduktion:**

`node /private/tmp/kd-vollreview-20260916/tests/E09-F002/validator/repro.mjs`

Der Validator meldet Exit 0 und reproduzierte den Fehler im future-only-film.at-Fallback, nach erneutem Normalisieren als Cache und für morgen im Altformat. Der Lauf enthält auch bestandene Kontroll-Assertions für den Vier-Tage-Guard und nicht kollidierende Termine. Die Assertions belegen das fehlerhafte Istverhalten; sie sind kein Produkt-PASS. Exakte Soll-/Ist-Listen liegen in [`result.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E09-F002/validator/result.json); der gesamte Validatorartefaktordner ist `/private/tmp/kd-vollreview-20260916/tests/E09-F002/validator/`.

**Gegenproben und Grenzen:** Ein direkter Titeltreffer darf Filter bewusst umgehen und wurde ausgeschlossen (`sig.titel.length === 0`). Eine Zeitangabe ohne explizite Kinoquelle bleibt absichtlich kein harter Ausschluss. Der Kino-Tab hat einen anderen vollständigen Datumsschlüssel-Vergleich und liegt nicht im Finderpfad. Bestehende `finder_test.mjs`-Fixtures verwenden heute/morgen/übermorgen, aber keine 6/16/26-Kollision; sie wurden nicht ausgeführt.

**Einordnung:** Produktfehler ist die unzulässige Substring-Datumszuordnung. Kein Testwerkzeugfehler ist dokumentiert: Der Node-Resolve-Hook ergänzt allein JSON-Importattribute, um unveränderte Vite-Module zu laden; Produktcode blieb unverändert. Betriebsbeleglücke: keine Live-Daten oder Browser-/React-Interaktion; Häufigkeit künftiger-only-Snapshots und weiter Altformatcachebestände im Betrieb ist offen.

## Korrekturziel und Abnahme

Im Master-Finderzweig Termine als vollständige Datumstoken vergleichen oder einen gemeinsamen, deterministischen Terminparser einsetzen. Die Prüfung muss vor Aufnahme in die Treffer und vor Übernahme der ausgegebenen Zeiten greifen. Direkte Titel-Bypässe, die weiche Zeitsemantik ohne Kinoquelle und die Normalisierungs-/Fallbacksemantik bleiben bewusst bestehen. Kein Backend-, Migrations- oder Providerumbau ist Teil dieses Tickets.

Abnahme:

- Bei eingefrorenem 6. September schließen „heute im Kino“ 16.9. und 26.9. aus — auch im film.at-Fallback und nach Cache-Re-Normalisierung.
- „Morgen im Kino“ behält 7.9., schließt 17.9. und 27.9. aus.
- Gleichdatierte Termine bleiben erhalten; ausgegebene `zeitenAlle` enthalten nur passende Tage, soweit kein dokumentierter direkter Titel-Bypass greift.
- Vorhandene Verträge für direkte Titel, Zeit ohne Kinoquelle und die Vier-Tage-Normalisierung bleiben durch gezielte Kontrollfälle erhalten.

## Abhängigkeiten und offene Punkte

Keine bekannte Duplikatbeziehung. Die Reparatur ist benachbart zu E09-F003, aber eine getrennte Ursache: dieses Ticket betrifft den **gematchten Masterzweig** und die Tokenkollision; E09-F003 den fehlenden Tagesfilter im Kino-Restzweig. Keine Live-Häufigkeit, kein physisches Gerät und keine globale Duplikatsuche sind validiert.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E09-F002.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E09-F002.json). Ursprünglicher Vorschlag: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E09-F002.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E09-F002.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E09/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E09/KD-REV-E09-002.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
