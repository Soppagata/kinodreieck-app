# KD-REV-E07-001 · Gesehen-Abgleich blendet andere Werkart bei gleicher numerischer TMDB-ID aus

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — eine tatsächlich ungesehene Serienkarte kann aus den sichtbaren Entdecken-Empfehlungen fallen; die bestätigte Wirkung ist auf den Gesehen-Filter und die daraus abgeleitete Auswahl begrenzt.
- Finding: E07-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E07

## Fehler und Auswirkung

Hat ein als gesehen qualifizierter Mediathekeintrag vom Typ Film dieselbe **numerische** TMDB-ID wie eine ungesehene Serienkarte, kann Entdecken die Serie fälschlich als gesehen behandeln. Die Karte fällt damit aus `popularPool`/„Beliebt“. „Für mich“ ist zusätzlich betroffen, aber nur, wenn die Karte den bereits vorhandenen lokalen Verfügbarkeitsguard und einen Profilgrund erfüllt.

Die bestätigte Reproduktion umfasst gültige Streamingfeeds der Formate 8 und 9. Sie zeigt keine Änderung gespeicherter Bewertungen und keine Löschung. Es gibt keinen Beleg dafür, wie oft eine solche Film-/Serien-ID-Kollision in Produktionsdaten vorkommt oder dass aktuell ein Nutzer betroffen ist.

## Auslöser, Soll und Ist

1. Ein ausgewählter Dienst liefert in einem gültigen Format-8- oder Format-9-Feed eine ungesehene Serienkarte mit `tmdb: "12345"`.
2. `master` enthält einen vollständig bewerteten (oder sonst als gesehen markierten) Mediathek-**Film** mit `tmdb_id: "12345"`.
3. TMDB ist die einzige beidseitig vorhandene starke ID, oder alle zusätzlich vergleichbaren starken IDs stimmen ebenfalls überein. Insbesondere darf keine widersprechende IMDb-ID vorliegen.

Soll: Die abweichende Werkart verhindert die Gesehen-Markierung über diese numerische TMDB-ID. Die Serienkarte bleibt in „Beliebt“; bei bestätigter lokaler Verfügbarkeit und Profilgrund auch in „Für mich“.

Ist: `sourceItemSeen` liefert im starken-ID-Zweig `true`, bevor die Werkart geprüft wird. `publicDiscoveryCandidates` schreibt diesen Wert in `seen`; `createEntdeckenRecommendations` entfernt die Karte danach aus der sichtbaren Auswahl. In der lokalen Reproduktion sinkt der gültige Prime-Video-Pool bei der Kollision von 10 auf 9 Karten; die Zielserie verschwindet aus `popularPool` und — bei bereitgestelltem Verfügbarkeitsbeleg — aus `personal`.

## Ursache und Fundstellen

Am Prüfcommit extrahiert `strongIds` TMDB als untypisierten String: [`/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:627`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:627) bis [`:636`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:636) (Repository: `src/lib/entdeckenUi.js`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`).

In [`sourceItemSeen` ab Zeile 647](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:647) wird die Werkart der Feedkarte zwar bestimmt, doch [`comparable.every(...)` in Zeilen 654–659](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:654) kehrt bei übereinstimmenden IDs bereits zurück. Die Werkart des Vergleichseintrags wird erst im Titel-/Jahr-Fallback in [`Zeilen 660–666`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:660) geprüft und erreicht den starken-ID-Fall deshalb nicht.

Der Aufrufpfad setzt die falsche Entscheidung in der öffentlichen Projektion in [`src/lib/entdeckenUi.js:713`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:713) (Repository: `src/lib/entdeckenUi.js`, gleicher Commit). Die abschließende Filterung schließt `candidate.seen` in [`Zeilen 1010–1018`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:1010) aus. Die UI ruft diese Auswahl über [`/private/tmp/kd-vollreview-20260916/source/src/tabs/EntdeckenTab.jsx:271`](/private/tmp/kd-vollreview-20260916/source/src/tabs/EntdeckenTab.jsx:271) auf (Repository: `src/tabs/EntdeckenTab.jsx`, gleicher Commit).

`matchWebDiscoveryFeed` schützt diesen Pfad nicht: Sein typgebundener Metadaten-Match entschied in der Gegenprobe `unmatched`, während die eigenständige Gesehen-Projektion weiterhin `seen=true` lieferte. Auch die im eingefrorenen SQL vorhandenen typgebundenen TMDB-Schlüssel sind Katalog-/Angebotsguards, keine Invariante, dass numerische Film- und Serien-IDs global verschieden sein müssten.

## Belege und Gegenproben

**Ausgeführte Reproduktion.** Der Validator führte unter Node `v24.18.0` ohne Netz-, Provider- oder Datenbankschritte aus:

```text
node /private/tmp/kd-vollreview-20260916/tests/E07-F001/validator/reproduce.mjs
```

Der Lauf endete mit Exit `0` und `REPRODUCED` für Feedformat 8 und 9. Das unveränderliche Ergebnis steht in [`/private/tmp/kd-vollreview-20260916/tests/E07-F001/validator/result.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E07-F001/validator/result.json); der Harness importiert die produktiven Funktionen direkt aus der eingefrorenen Quelle: [`/private/tmp/kd-vollreview-20260916/tests/E07-F001/validator/reproduce.mjs`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E07-F001/validator/reproduce.mjs).

**Statische Beweiskette.** Die Validator-Analyse belegt den oben genannten Aufrufpfad bis zur Entdecken-Ansicht sowie, dass der Datenvertrag `typ`, Bewertung und numerische `tmdb_id` bei optionaler IMDb zulässt. Die sechs unmittelbar relevanten Quelldateien wurden byteweise gegen `git show 14804ce389d69114feed27b92fb11ac78423cc0e:<path>` abgeglichen. Vollständiges Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E07-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E07-F001.json).

**Gegenproben.** Ohne Sehbeleg, mit abweichender TMDB-ID oder mit widersprechender IMDb-ID bleibt die Zielkarte sichtbar. Eine tatsächlich gesehene Serie gleicher Werkart wird weiterhin korrekt ausgeblendet. Ohne lokalen Katalog-/Verfügbarkeitsbeleg ist ausschließlich der Verlust aus „Beliebt“ belegt; der „Für mich“-Teil wurde erst mit einem regulären lokalen Serien-Katalogeintrag erreicht.

**Beleggrenzen.** Dies ist ein bestätigter Produktfehler im eingefrorenen lokalen Code und der tatsächlichen Node-Projektion, kein nachgewiesener Testwerkzeugfehler. Der erfolgreiche Reproduktionslauf ist jedoch keine bestandene Produktabnahme. Browserlauf, Datenbankmigration, Liveanbieter und Produktionsdaten wurden nicht ausgeführt; diese fehlenden Betriebsbelege dürfen nicht als Livewirkung ausgegeben werden.

## Korrekturziel und Abnahme

Die Korrektur bleibt auf `sourceItemSeen` beziehungsweise seinen Identitätsvergleich beschränkt: Bei einer numerischen TMDB-Übereinstimmung muss eine beidseitig normalisierte, widersprüchliche Werkart den Gesehen-Treffer verhindern. Die vorhandene Behandlung widersprechender gemeinsamer IDs, die Kriterien für „gesehen“ und der Titel-/Jahr-/Typ-Fallback bleiben erhalten. Feeds, Anbieter, SQL und das Ranking sind nicht umzubauen.

Abnahme:

- Gültige Format-8- und Format-9-Feeds: gleiche numerische TMDB-ID bei Film versus Serie erzeugt in beiden Richtungen kein `seen=true`.
- Unter sonst gleichen Voraussetzungen bleibt die Zielkarte in `popularPool`; bei bestätigter lokaler Verfügbarkeit und Profilgrund bleibt sie auch in `personal`.
- Gleiche Werkart bei bestätigter gleicher Identität wird weiterhin als gesehen ausgeblendet; ein unbewerteter Eintrag ohne anderes Sehmerkmal nicht.
- Widersprechende gemeinsame IDs führen weiterhin zu keinem Gesehen-Treffer; der bestehende typgebundene Titel-/Jahr-Fallback bleibt wirksam.
- Die Regression deckt `master` und als gesehen markierte `catalogCandidates` ab; sie benötigt keinen Liveanbieteraufruf.

## Abhängigkeiten und offene Punkte

Keine Korrekturabhängigkeit zu einer Datenbankmigration ist belegt. Relevante Herkunft ist das eingefrorene Master-Proposal [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E07-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E07-F001.json). Nicht geklärt sind reale Kollisionshäufigkeit, Produktionsbetroffenheit, Browserverhalten und physische Abnahme.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E07-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E07-F001.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Master-Abnahme ist bestätigt, bis sein gesonderter Abgleich Finding → Validierung → Ticket vorliegt.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E07/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E07/KD-REV-E07-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
