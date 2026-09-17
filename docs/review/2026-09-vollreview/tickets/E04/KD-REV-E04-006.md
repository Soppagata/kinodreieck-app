# KD-REV-E04-006 · Blog-Rotlink speichert nach Film-Serien-Wechsel den alten Typ

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — ein begrenzter, regulär erreichbarer Blog-Anlagepfad kann einen Mediathekeintrag still in die falsche Typgruppe speichern und damit typabhängiges Folgeverhalten verfälschen. Keine Aussage zu Häufigkeit oder bereits betroffenen Daten.
- Finding: E04-F006
- Prüfstand: 14804ce389d69114feed27b92fb11ac78423cc0e
- Zuständige Etappe: E04

## Fehler und Auswirkung

Bei einer unverknüpften Blogreferenz bleibt nach direktem Wechsel des äußeren Typs Film zu Serie oder Serie zu Film der Save-Payload beim zuvor initialisierten Typ. Der äußere Selektor und die einzige Option des inneren Selektors zeigen den Zieltyp, der an onAddFilm übergebene Eintrag enthält jedoch den alten Typ. Nach bestätigtem Add wird die Blogreferenz auf die neue ID gesetzt.

Betroffen sind eigene Blogartikel im Abgleich-Popup und in der privaten Leseansicht, wenn ein Rotlink über FilmForm offen ist und direkt zwischen Film und Serie wechselt. Die öffentliche Leseansicht stellt nur Text dar und bietet keine Rotlinkanlage. KI-Prognosen sind in diesem Blogpfad nicht erreichbar und nicht als Folgeschaden bestätigt.

## Auslöser, Soll und Ist

Auslöser: Eigener Blogartikel mit unverknüpfter Referenz, gültigem Titel und Jahr, ohne kollidierenden Mediathekeintrag. Im Abgleich + Neu anlegen oder in der privaten Leseansicht den Rotlink öffnen, im äußeren Typselektor Film zu Serie ändern und Hinzufügen klicken. Die umgekehrte Richtung verhält sich entsprechend.

Soll: Sichtbare Auswahl, innerer Selektor, Formularvalidierung und onAddFilm-Payload verwenden denselben aktuellen Typ. Film zu Serie speichert typ=serie, Serie zu Film speichert typ=film.

Ist: Bei Film zu Serie zeigen beide Selektoren Serie, onAddFilm erhält trotzdem typ=film. Bei Serie zu Film bleibt typ=serie. Der Fehler tritt auf, ohne dass der innere Selektor einen weiteren Change auslösen muss oder kann.

## Ursache und Fundstellen

BlogTab verändert beim äußeren Wechsel nur neuTyp beziehungsweise rotTyp und übergibt damit neue typOptionen. Film und Serie verbleiben beide im selben hatDreieck-Zweig ohne wechselnden Key; FilmForm bleibt dieselbe Komponenteninstanz:

- Abgleich-Popup, äußerer Selektor und FilmForm-Aufrufer: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/tabs/BlogTab.jsx:148](/private/tmp/kd-vollreview-20260916/source/src/tabs/BlogTab.jsx:148), repository-relativ src/tabs/BlogTab.jsx:148-174, Commit 14804ce389d69114feed27b92fb11ac78423cc0e.
- Private Leseansicht mit entsprechendem Rotlink-Aufrufer: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/tabs/BlogTab.jsx:233](/private/tmp/kd-vollreview-20260916/source/src/tabs/BlogTab.jsx:233), repository-relativ src/tabs/BlogTab.jsx:233-260.
- FilmForm initialisiert f.typ einmalig aus typOptionen[0]: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/components/EintragForm.jsx:40](/private/tmp/kd-vollreview-20260916/source/src/components/EintragForm.jsx:40), repository-relativ src/components/EintragForm.jsx:40-87.
- Validierung und Payload verwenden danach f.typ; der innere Select zeigt nur typOptionen, ohne den State bei Propwechsel zu synchronisieren: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/components/EintragForm.jsx:139](/private/tmp/kd-vollreview-20260916/source/src/components/EintragForm.jsx:139), repository-relativ src/components/EintragForm.jsx:139-158 und 286-290.

App.addFilm übernimmt den Payload, und ensureIds normalisiert nur historische Typnamen. Beide gültigen Werte film und serie bleiben daher unverändert; der ausgewählte äußere Blogtyp ist nach dem Add nicht mehr rekonstruierbar:

- [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/App.jsx:1236](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1236), repository-relativ src/App.jsx:1236-1260.
- [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/match.js:138](/private/tmp/kd-vollreview-20260916/source/src/lib/match.js:138), repository-relativ src/lib/match.js:138-179.
- Die Artikelreferenz wird nur nach bestätigter nichtleerer String-ID gesetzt: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/controllers/confirmedIdController.js:1](/private/tmp/kd-vollreview-20260916/source/src/controllers/confirmedIdController.js:1), repository-relativ src/controllers/confirmedIdController.js:1-8.

## Belege und Gegenproben

Die Validator-Reproduktion [reproduce.mjs](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E04-F006/validator/reproduce.mjs) mountete unveränderten BlogTab und FilmForm aus der eingefrorenen Quelle mit React/ReactDOM in JSDOM. Reale DOM-change- und click-Ereignisse bedienten beide Aufrufer; nur Persistenzcallbacks waren gemockt und fetch war als werfender Mock gesperrt. Der finale Lauf endete mit Exit 0 und null Netzwerkaufrufen.

Acht Szenarien wurden geprüft: Die vier direkten Richtungswechsel in Abgleich und privater Leseansicht reproduzieren den alten Payloadtyp bei korrekter Anzeige. Vier Gegenproben sind korrekt. ensureIds behält den empfangenen Typ, und der Referenzcallback läuft jeweils erst mit bestätigter String-ID. Einzelwerte, DOM-Identität und Referenzbestätigung stehen in [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E04-F006/validator/result.json). Exit 0 belegt die erfolgreiche Reproduktion des Ist-Fehlers, nicht Produkt-PASS.

Gegenproben begrenzen den Befund:

- Ohne Typwechsel speichert ein anfänglicher Serientyp in beiden Ansichten korrekt.
- Film zu Musik zu Serie remountet über MedienForm und speichert korrekt Serie; der Fehler betrifft nicht jeden Typwechsel.
- Der sichtbare innere Select widerlegt den Befund nicht: Er zeigt nur die neue einzige Option, löst aber keinen Change von f.typ aus.
- Die spätere Normalisierung und Migration korrigieren gültige film- oder serie-Werte nicht.
- private_release_blog_surface_test.mjs enthält keine Regression für den äußeren Film-Serien-Wechsel und wurde nicht ausgeführt.

Der erste Testlauf blieb nach allen Assertions wegen offener importierter Service-Handles aktiv und wurde beendet. Der finale Harness beendete sich nach Assertions ausdrücklich und lief mit Exit 0. Diese Teardown-Beobachtung ist getrennt vom reproduzierten Produktverhalten.

## Korrekturziel und Abnahme

Die Typsteuerung zwischen BlogTab und FilmForm muss eindeutig synchronisiert werden: Der sichtbare äußere Typ ist zugleich Quelle für inneren Selektor, Validierung und Save-Payload. Beide Blog-Aufrufer gehören zur Korrektur. Andere eingegebene Entwurfsfelder sollen beim direkten Wechsel möglichst erhalten bleiben. Backendmigration und breiter Architekturumbau sind nicht erforderlich.

Abnahme:

1. In Abgleich und privater Leseansicht speichert Film zu Serie typ=serie und Serie zu Film typ=film.
2. Äußerer Selektor, innerer Selektor, Validierung und Save-Payload verwenden durchgehend denselben aktuellen Typ.
3. Ohne Wechsel und beim Wechsel über Musik oder Sonstiges bleibt die bisher korrekte Anlage erhalten.
4. Direkter Typwechsel verwirft andere gültige Formulareingaben nicht unbeabsichtigt.
5. Die Referenz wird weiterhin erst nach bestätigter Anlage gesetzt; Regressionstests benötigen keine Netz- oder Provideraufrufe.

## Abhängigkeiten und offene Punkte

Es gab keinen realen Account, keine produktive Datenbank, keine physische Browser- oder iPhone-Abnahme. Die UI-Reproduktion verwendete gemockte Persistenzcallbacks; der nachgelagerte App- und Speicherpfad ist statisch belegt. Anzahl und Häufigkeit bereits falsch gespeicherter Einträge sind unbekannt.

## Herkunft und Master-Abnahme

Validatorergebnis: [E04-F006.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E04-F006.json). Ursprünglicher Verdacht: [E04-F006.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E04-F006.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E04/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E04/KD-REV-E04-006.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
