# KD-REV-E04-004 · Karteneditor verwirft unvollständige Must-Watch-Jahreseingaben

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — schrittweises Eingeben oder Korrigieren eines Jahres auf einer bestehenden Must-Watch-Karte kann das gespeicherte Jahr auf null setzen. Ein vollständiges Einsetzen bleibt ein Ausweichweg; kein allgemeiner Listenverlust oder Remotevorfall ist belegt.
- Finding: E04-F004
- Prüfstand: 14804ce389d69114feed27b92fb11ac78423cc0e
- Zuständige Etappe: E04

## Fehler und Auswirkung

Der Editor einer bestehenden Must-Watch-Karte reicht jede einzelne Änderung des kontrollierten Jahrfeldes sofort an den Controller weiter. Teilstrings wie 1, 19 oder 198 werden an der Schreibgrenze als ungültig zu null normalisiert, erfolgreich gespeichert und in den Kartenwert zurückgeschrieben. Daher kann ein Jahr nicht schrittweise eingetippt werden. Wird ein vorhandenes Jahr 1982 per Backspace auf 198 gekürzt, wird das zuvor gültige Jahr still zu null.

Betroffen ist die Kartenbearbeitung nach regulärem Laden bei funktionierender Speicherung, unabhängig davon, ob Gast- oder Kontobetrieb denselben Clientpfad nutzt. Die Neuanlage besitzt einen lokalen Jahrentwurf und ist nicht betroffen. Es gibt keine Aussage über reale Account-Synchronisierung oder Servernachbearbeitung.

## Auslöser, Soll und Ist

Auslöser: Mediathek, Must-Watch, eine bestehende Karte ohne Such- oder Jahrzehntfilter öffnen. In Jahr optional die Ziffern 1, 9, 8, 2 nacheinander eingeben und zwischen den Eingaben den normalen React- und Storage-Abschluss zulassen. Alternativ bei 1982 die letzte Ziffer löschen.

Soll: Ein unvollständiges Jahr bleibt als lokaler Textentwurf bestehen. Erst eine definierte abgeschlossene Eingabe normalisiert und persistiert ein gültiges Jahr oder eine absichtliche Leerung. Der Zwischenstand 198 darf einen zuvor gespeicherten Wert nicht löschen.

Ist: Nach jeder einzelnen Ziffer bleiben DOM-Feld leer, Controller-State null und gespeicherter Topf jahr:null. Das Einsetzen von 1982 in einem Ereignis funktioniert. Die anschließende Kürzung auf 198 leert DOM und State und speichert null ohne Fehlermeldung.

## Ursache und Fundstellen

MetaFelder ist ein kontrolliertes Input ohne eigenen Entwurf; die Karteninstanz bezieht value direkt aus e.jahr und ruft onUpdate bei jeder Änderung:

- Gemeinsames kontrolliertes Jahrfeld: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/components/MustWatchListe.jsx:32](/private/tmp/kd-vollreview-20260916/source/src/components/MustWatchListe.jsx:32), repository-relativ src/components/MustWatchListe.jsx:32-52, Commit 14804ce389d69114feed27b92fb11ac78423cc0e.
- Die bestehende Karte leitet jede Jahresänderung unmittelbar als jahr an onUpdate weiter: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/components/MustWatchListe.jsx:552](/private/tmp/kd-vollreview-20260916/source/src/components/MustWatchListe.jsx:552), repository-relativ src/components/MustWatchListe.jsx:552-562.
- Der Controller normalisiert jedes explizite jahr schon an der Schreibgrenze: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/controllers/useMustwatchController.js:17](/private/tmp/kd-vollreview-20260916/source/src/controllers/useMustwatchController.js:17), repository-relativ src/controllers/useMustwatchController.js:17-22 und 324-336.
- Erfolgreiche Writes übernehmen den normalisierten Wert in den lokalen State: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/controllers/useMustwatchController.js:156](/private/tmp/kd-vollreview-20260916/source/src/controllers/useMustwatchController.js:156), repository-relativ src/controllers/useMustwatchController.js:156-179.
- mustwatchJahr verwirft nichtleere Werte außerhalb 1870 bis 2999 zu null: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/mustwatch.js:60](/private/tmp/kd-vollreview-20260916/source/src/lib/mustwatch.js:60), repository-relativ src/lib/mustwatch.js:60-67.

Im Unterschied dazu verwaltet das Anlageformular jahr als lokalen State und speichert erst beim Abschicken: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/components/MustWatchListe.jsx:221](/private/tmp/kd-vollreview-20260916/source/src/components/MustWatchListe.jsx:221), repository-relativ src/components/MustWatchListe.jsx:221-252. Die zentrale Persistenznormalisierung ist fachlich sinnvoll; fehlerhaft ist ihre Anwendung auf jeden Bearbeitungszwischenstand.

## Belege und Gegenproben

Die statische Beweiskette verfolgt die App-Übergabe von updateMustwatch zu MediathekTab und MustWatchListe, die serialisierte Schreibkette, Normalisierung, erfolgreiche Persistenz und Zustandsübernahme. Es gibt keine Zwischenkomponente, die den Kartenwert puffert. Der Validator verweist dafür auf src/App.jsx:879-885,1981-1982 und src/tabs/MediathekTab.jsx:668-681 am Prüfcommit.

Ausgeführt wurde [reproduce.mjs](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E04-F004/validator/reproduce.mjs): unveränderte MustWatchListe, echtes useMustwatchController mit Queue und mustwatchJahr, mit erfolgreicher In-Memory-Storage-Fassade. Nach jeder Ziffer wartete der Test einen React-act und Eventloop-Tick. Der finale Lauf endete mit Exit 0. Er bestätigte vier verworfene Ziffern und vier null-Writes, vollständiges Einsetzen 1982, Verlust bei Kürzung auf 198, vollständiges Ersetzen, absichtliches Leeren sowie funktionierende schrittweise Neuanlage. Die detaillierten Werte stehen in [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E04-F004/validator/result.json); [run.log](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E04-F004/validator/run.log) ist das Laufartefakt. Exit 0 ist erfolgreiche Fehlerreproduktion, kein Produkt-PASS.

Gegenproben:

- Vollständiges Einsetzen oder vollständiges Ersetzen durch 1982 beziehungsweise 1983 speichert korrekt.
- Die Neuanlage nimmt 1, 19, 198 und 1982 als lokalen Entwurf an und persistiert erst bei Submit 1982.
- Vollständiges absichtliches Leeren speichert erwartbar null; der Fehler ist die fehlende Unterscheidung vom unvollständigen Zwischenstand.
- Der vorhandene Karten-DOM-Test setzt Delta-Werte direkt im lokalen State und umgeht die Controller-Normalisierung. Er wurde nur gelesen und liefert keinen Gegenbeweis für den produktiven Pfad.

Der erste Assertion-Lauf blieb nach Abschluss wegen offener JSDOM-Handles aktiv und wurde beendet. Nach explizitem Unmount sowie Artefaktschreiben endete der identische begrenzte Lauf regulär mit Exit 0. Das unterscheidet den produktiven Befund von einem temporären Harness-Teardown-Problem.

## Korrekturziel und Abnahme

Die Bearbeitung bestehender Karten braucht für das Jahr einen lokal begrenzten String-Entwurf mit klarer Commit- und Abbruchregel. Die zentrale Normalisierung gültiger persistierter Jahre bleibt unverändert. Absichtliches Leeren muss vom temporär unvollständigen Korrekturwert unterschieden werden; eine Storage- oder Datenbankmigration ist nicht erforderlich.

Abnahme:

1. Ein Integrationstest mit MustWatchListe und echtem useMustwatchController zeigt 1, 19, 198 und 1982 über einzelne React- und Storage-Ticks sichtbar als Entwurf; der Commit persistiert numerisch 1982.
2. Bei bestehendem 1982 darf Backspace auf 198 nicht zu stillschweigendem jahr:null führen; Ergänzen auf 1983 und Commit funktionieren.
3. Bewusstes Leeren und Bestätigen kann das optionale Jahr weiterhin auf null setzen. Eine ungültige nichtleere abgeschlossene Eingabe überschreibt kein gültiges Jahr still.
4. Vollständiges Einsetzen, schrittweise Neuanlage, Abbruch und fehlgeschlagene Speicherung bleiben verständlich; die Persistenz enthält nur gültige Jahreszahlen oder null.

## Abhängigkeiten und offene Punkte

Browser- oder iPhone-Tastaturautomation, vollständiger App-Mount, globale Testsuite, Remote-Synchronisierung und Provider wurden nicht ausgeführt. Der Reproduktionstest erzeugt echte DOM-input-Ereignisse in JSDOM und prüft nach jedem React-act; die Storage-Grenze ist lokal gemockt. Der Produktfehler betrifft die lokale Eingabe-/Controller-Grenze, nicht den Validator oder eine belegte Serverwirkung.

## Herkunft und Master-Abnahme

Validatorergebnis: [E04-F004.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E04-F004.json). Ursprünglicher Verdacht: [E04-F004.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E04-F004.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E04/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E04/KD-REV-E04-004.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
