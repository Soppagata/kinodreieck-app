# KD-REV-E07-002 · Format 8/9 verlieren ÖFI-Kinochartbelege vor der Anzeige

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — aktuelle ÖFI-Chartfilme können zwar als lokale Kino-Füller erscheinen, verlieren dabei aber zwingend ihren ÖFI-Chartbeleg, Rang und Besucherwert.
- Finding: E07-F002
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E07

## Fehler und Auswirkung

Die Livefeed-Verträge der Formate 8 und 9 transportieren für jeden ÖFI-Kinochartdatensatz zwingend weder Veröffentlichungsjahr noch externe ID. Deshalb kann der absichtlich strenge Abgleich mit dem aktuellen Kinoprogramm keinen ÖFI-Datensatz als Werk zuordnen und verwirft ihn. Entdecken kann denselben Film anschließend als lokalen Programmfüller wieder aufnehmen, aber nicht als ÖFI-Chartkarte: Quellenlink, ÖFI-Rang, Besucherzahl und Messdatum fehlen dann.

Die Auswirkung betrifft den sichtbaren Entdecken- und Quellenkartenpfad für ÖFI-Kinoeinträge der gültigen Formate 8/9. Sie belegt weder einen leeren 50er-Pool noch einen generellen Kinoausfall: lokale Füller und Format 7 mit bereits belegtem Jahr sind ausdrücklich Gegenfälle. Die lokale Reproduktion ist kein Nachweis eines aktuellen Remote-Feeds, Deployments oder einer tatsächlich betroffenen PWA-Sitzung.

## Auslöser, Soll und Ist

1. Ein gültiger Format-8- oder Format-9-Feed enthält ÖFI-Kinocharttitel.
2. Das aktuelle, nicht archivierte Kinoprogramm enthält dieselben Filme eindeutig, einschließlich Titel, Jahr, `film_at_id` und zukünftiger Vorstellungen.
3. Entdecken projiziert den Feed mit diesem Programm.

Soll: Sicher identifizierte, aktuelle ÖFI-Chartfilme dürfen mit der Programmidentität und ihrem ursprünglichen Chartbeleg angezeigt werden. Der vollständige Produzenten-, Persistenz- und Verbrauchervertrag muss die belegte Identitätsanreicherung zulassen; unzureichende oder widersprüchliche Einzelidentitäten bleiben ausgeschlossen.

Ist: Die unmodifizierte Reproduktion erzeugte je gültigem Format 15 ÖFI-Datensätze. Frontend- und Backendvalidierung akzeptierten sie, doch `matchWebDiscoveryFeed` ergab 0/15 Treffer, die Projektion führte 15 `year:null`-Kandidaten und die Kinoabstimmung behielt 0. Der Auswahlpool zeigte 15 lokale Programmfüller ohne Popularität und ohne externe Evidenz; `webDiscoveryFeedCards` enthielt keine ÖFI-Kinokarte. Mit allen vier Streamingdiensten war ein 50er-Pool weiterhin möglich, aber mit 0 ÖFI-Quellenkarten.

## Ursache und Fundstellen

Der Produzent leert die Werkidentität für öffentliche ÖFI-Einträge ausdrücklich in [`/private/tmp/kd-vollreview-20260916/source/supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js:226`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js:226) bis [`:232`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js:232): `releaseYear: null` und `externalIds: {}` (Repository: `supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`).

Diese Leere ist kein nur lokaler Adapterwert, sondern wird auf allen Vertragsgrenzen vorgeschrieben: der Backendvalidator lehnt bei ÖFI jedes Jahr oder jede externe ID ab in [`contract.js:482–490`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/entdecken-daily-task/contract.js:482), der Frontendvalidator ebenso in [`webDiscoveryFeed.js:445–456`](/private/tmp/kd-vollreview-20260916/source/src/lib/webDiscoveryFeed.js:445), und die Enddefinition des SQL-Validators delegiert Format 8/9 an diese Regeln in [`20260911123000_entdecken_flixpatrol_batch_format9.sql:285–292`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260911123000_entdecken_flixpatrol_batch_format9.sql:285). Die v8- und v9-spezifischen SQL-Guards verlangen die leeren Felder ebenfalls: [`…feed.sql:142–146`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260909210000_entdecken_flixpatrol_feed.sql:142) und [`…format9.sql:176–180`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260911123000_entdecken_flixpatrol_batch_format9.sql:176).

Der optionale Runner-Anreicherungsweg erreicht `flixpatrol-mix` nicht: [`runner.js:191–207`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/entdecken-daily-task/runner.js:191) ergänzt Annotations nur für `public-chart` und `public-mix`. Ohne IDs kann der Browser nur auf Titel/Jahr/Typ zurückfallen; [`webDiscoveryFeed.js:744–750`](/private/tmp/kd-vollreview-20260916/source/src/lib/webDiscoveryFeed.js:744) verlangt dafür ein gültiges Jahr. Die öffentliche Projektion übernimmt folgerichtig `year: null` in [`entdeckenUi.js:740–748`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:740).

Der anschließende Guard ist fachlich korrekt: [`reconcileCinemaDiscoveryCandidates` in `/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenProjection.js:126–151`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenProjection.js:126) lässt nur einen eindeutigen, aktuellen Werkmatch passieren. `createEntdeckenRecommendations` ruft ihn verpflichtend auf und füllt erst danach mit lokalen Kinokandidaten auf in [`/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:1010–1046`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:1010) (Repository: `src/lib/entdeckenUi.js`, gleicher Commit). Der Fehler ist daher der unvereinbare vorgelagerte Formatvertrag, nicht eine Lockerung dieses Guards.

## Belege und Gegenproben

**Ausgeführte lokale Reproduktion.** Der Validator führte ohne Netz-, Provider- oder Datenbankzugriffe die originalen Module aus der eingefrorenen Quelle aus:

```text
node /private/tmp/kd-vollreview-20260916/tests/E07-F002/validator/repro.mjs
```

Exit `0`, Status `REPRODUCED`; beide Formate bestanden ihre Frontend- und Backendvalidierung. Das vollständige Messresultat steht in [`/private/tmp/kd-vollreview-20260916/tests/E07-F002/validator/result.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E07-F002/validator/result.json), der reproduzierbare Harness in [`/private/tmp/kd-vollreview-20260916/tests/E07-F002/validator/repro.mjs`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E07-F002/validator/repro.mjs).

**Diagnose- und Gegenproben.** Ergänzt der Harness nur am bereits projizierten Diagnoseobjekt ein bekanntes Testjahr, passieren 15/15 ÖFI-Karten den vorhandenen Reconciliation-Guard mit ihrem Chartbeleg. Das ist ausdrücklich kein gültiger Livefeed und kein Vorschlag für einen unsicheren Titelabgleich: Schon das Hinzufügen von Jahr oder IMDb-ID im Feed lehnen beide Originalvalidatoren ab. Der vom Validator ausgeführte enge Gegencheck `node entdecken_kino_availability_test.mjs` endete mit `8/8`; seine positiven Chartfälle verwenden jedoch den eingebetteten Format-7-Pool mit explizitem Jahr und widerlegen den Format-8/9-Vertrag nicht.

**Statische Beweiskette.** Der Validator verfolgte den Entdecken-Aufruf, Projektion, Reconciliation, Quellenkarten und die letzte SQL-Definition sowie die optionalen Facts-/Annotation-Pfade. Kein alternativer Identitätsweg für gültige Format-8/9-ÖFI-Einträge wurde belegt. Vollständiges Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E07-F002.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E07-F002.json).

**Beleggrenzen.** Dies ist ein bestätigter Produktvertragsfehler im eingefrorenen Code und keine nachgewiesene Fehlfunktion des Testwerkzeugs. Die erfolgreiche Reproduktion ist keine Produktabnahme. SQL wurde statisch, nicht gegen PostgreSQL geprüft; ÖFI-Adapter, Liveanbieter, Remotezustand und physische PWA wurden nicht ausgeführt. Die Häufigkeit realer Überschneidungen zwischen ÖFI-Feed und Wiener Programm bleibt offen.

## Korrekturziel und Abnahme

Vor der Kinoabstimmung muss eine belastbar belegte ÖFI-Werkidentität verfügbar werden und der dazu nötige Produzenten-, Persistenz-/SQL- und Browservertrag konsistent angepasst werden. Ein Feld allein freizuschalten genügt nicht: Jahre oder IDs dürfen nicht aus einem nur gleichnamigen Programmeintrag geraten werden. Fehlende Identität, Remakes, Typkonflikte und mehrdeutige Zuordnungen bleiben weiter ausgeschlossen; der strenge Matcher und die aktuelle Vorstellungspflicht bleiben bestehen.

Abnahme:

- Mindestens ein vom realen Produzentenvertrag erzeugter gültiger Feed mit sicher angereichertem ÖFI-Film passiert Server-, Persistenz- und Browservalidierung und erscheint bei passendem aktuellem Programm genau einmal mit `film_at_id`, unverändertem ÖFI-Rang, Besucherzahl, Messdatum und Quellenlink.
- Beide weiterhin unterstützten Liveformate — oder ihre ausdrücklich kompatible Migration — sind abgedeckt; eine nur auf Format 7 beruhende Prüfung genügt nicht.
- Fehlende Identitätsbelege, Remakes, Typkonflikte, mehrdeutige Treffer sowie fehlende oder veraltete Vorstellungen erzeugen weiter keine Chartkarte.
- Lokale Füller ohne ÖFI-Nachweis erhalten keine künstliche Popularität; Streaming-Dienstfilter und 50er-Pool bleiben erhalten.

## Abhängigkeiten und offene Punkte

Das eingefrorene Master-Proposal liegt unter [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E07-F002.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E07-F002.json). Format 9 war zum Prüfzeitpunkt separat gegated und ist nicht als live bestätigt; der gleichartige Format-8-Befund besteht unabhängig davon. Die konkrete sichere Quelle und Vertragsversion für eine ÖFI-Identitätsanreicherung sind Teil der späteren Reparaturentscheidung, nicht durch diesen Review vorentschieden.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E07-F002.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E07-F002.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Master-Abnahme ist bestätigt, bis sein gesonderter Abgleich Finding → Validierung → Ticket vorliegt.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E07/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E07/KD-REV-E07-002.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
