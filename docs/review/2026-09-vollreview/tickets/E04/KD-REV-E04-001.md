# KD-REV-E04-001 · Blogabgleich verwirft bekannte Must-Watch-Metadaten

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — bei normaler Bearbeitung können gleichnamige Werke falsch stabil verlinkt und passende Serien als Rotlink belassen werden. Ein konkreter Produktionsvorfall oder bereits betroffene Konten sind nicht belegt.
- Finding: E04-F001
- Prüfstand: 14804ce389d69114feed27b92fb11ac78423cc0e
- Zuständige Etappe: E04

## Fehler und Auswirkung

Der deterministische Blogabgleich behandelt Must-Watch-Einträge mit bereits bekanntem Jahr und Typ so, als seien beide Angaben unbekannt beziehungsweise Film. Dadurch kann ein Blogeintrag The Thing (2011, Film) automatisch auf den Must-Watch-Eintrag The Thing (1982, Film) zeigen. Ein eindeutiger Blogeintrag Dark (2017, Serie) bleibt dagegen ohne Link, wenn der Must-Watch-Eintrag als Serie vorliegt.

Die fehlerhafte Referenz wird im Artikel gespeichert. Beim späteren Abgleich bleibt eine noch vorhandene Ref-ID erhalten, ohne Jahr und Typ erneut zu prüfen. Zusätzlich kann die automatische Rotlinkheilung den Fehler auslösen. Betroffen ist der Blogabgleich gegen Must-Watch nach regulärem Laden und Speichern; eine nachweisbare laufende Import- oder Startmodus-Auswirkung der zweiten Projektionsstelle ist nicht belegt.

## Auslöser, Soll und Ist

Auslöser: Ein regulärer Must-Watch-Eintrag enthält The Thing mit Jahr 1982 und Typ Film, der Master enthält keinen weiteren exakten Treffer. Ein neuer oder bearbeiteter Bloglisteneintrag enthält The Thing mit Jahr 2011 und Typ Film. Alternativ enthält Must-Watch Dark (2017, Serie), während der Blogeintrag dieselben Metadaten angibt.

Soll: Bekannte Must-Watch-Jahre und -Typen begrenzen das Referenzuniversum. Der 2011er Eintrag darf nicht automatisch auf den 1982er Eintrag verweisen; der eindeutige Serienfall soll verlinkt werden. Fehlende Altmetadaten bleiben weiterhin als fehlend behandelbar.

Ist: Die Must-Watch-Projektion setzt Jahr auf null und Typ auf Film. Der Jahresguard akzeptiert unbekannte Jahre; beim einen verbleibenden Titelmatch entsteht die falsche Ref. Der Typguard lehnt die dadurch als Film dargestellte Serie ab. Bereits gesetzte und noch gültige Ref-IDs überspringen anschließend den Metadatenabgleich.

## Ursache und Fundstellen

Primäre Ursache ist die verlustbehaftete Projektion der Must-Watch-Einträge:

- Eingesetztes Referenzuniversum: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/libraryProjection.js:22](/private/tmp/kd-vollreview-20260916/source/src/lib/libraryProjection.js:22), repository-relativ src/lib/libraryProjection.js:22-28, Commit 14804ce389d69114feed27b92fb11ac78423cc0e.
- Duplizierte Projektion im Masterersetzungsplan: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/libraryProjection.js:274](/private/tmp/kd-vollreview-20260916/source/src/lib/libraryProjection.js:274), repository-relativ src/lib/libraryProjection.js:274-280, derselbe Commit.
- Jahres- und Typfilter: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/artikel.js:52](/private/tmp/kd-vollreview-20260916/source/src/lib/artikel.js:52), repository-relativ src/lib/artikel.js:52-66.
- Bestehende Ref wird bei gültiger ID beibehalten; die Rotlinkheilung ruft denselben Abgleich auf: [eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/artikel.js:110](/private/tmp/kd-vollreview-20260916/source/src/lib/artikel.js:110), repository-relativ src/lib/artikel.js:110-149.

Der Fehler liegt nicht im bewusst permissiven Jahresguard selbst, sondern darin, dass bekannte Metadaten vor diesem Guard verworfen werden. Der normale Datenpfad ist statisch belegt: Must-Watch-Formular und Controller erfassen Jahr/Typ, das Blogformular erzeugt Listenreferenzen mit Jahr/Typ, und App.jsx ruft baueRefUniversum sowie gleicheArtikelAb beim Anlegen und Bearbeiten auf. Die Validatorbelege verweisen dafür auf src/components/MustWatchListe.jsx:221-251, src/controllers/useMustwatchController.js:316-322, src/tabs/BlogTab.jsx:37-49 und src/App.jsx:969-1013,1254-1257 am Prüfcommit.

## Belege und Gegenproben

Statische Beweiskette:

- Die Produktverdrahtung über Formular, Controller, Blog-CRUD und Rotlinkheilung wurde verfolgt.
- Die Jahres-/Typguards sowie das Bewahren einer existierenden Ref wurden getrennt geprüft.
- Die Projektionsduplizierung in planeMasterErsetzung ist auf Funktionsniveau bestätigt; aktuelle Produktaufrufer von ersetzeMaster oder transformiereGrunddaten sind nicht nachgewiesen.

Ausgeführt wurde ausschließlich die lokale Validator-Reproduktion [reproduce.mjs](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E04-F001/validator/reproduce.mjs) gegen die eingefrorene Source-Kopie. Sie endete mit Exit 0 und bestätigte acht erwartete Ist-Fälle, einschließlich falschem Filmlink, fehlendem Serienlink, Rotlinkheilung, zweiter Projektion und der Kontrollen. Die strukturierten Beobachtungen liegen in [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E04-F001/validator/result.json). Exit 0 bedeutet erfolgreiche Reproduktion des Fehlers, nicht Produkt-PASS oder Abnahme.

Gegenproben begrenzen den Befund:

- Ein zusätzlicher Mastereintrag mit exakt passendem Jahr verhindert im ausgeführten Fall den falschen Must-Watch-Autolink.
- Ohne expliziten Blogtyp kann eine Must-Watch-Serie trotz falscher Projektion über den Titel verlinkt werden.
- Mehrere verbleibende Exakttreffer führen zu einer Auswahlentscheidung statt einem Autolink.
- Alte Must-Watch-Einträge ohne Jahr und Typ entsprechen der bisherigen null/Film-Altsemantik; sie rechtfertigen nicht das Überschreiben bereits vorhandener Angaben.
- Must-Watch-Quelldaten behalten ihre Metadaten; nur die Matching-Projektion verliert sie.

## Korrekturziel und Abnahme

Die beiden Referenzprojektionen sollen bekannte Must-Watch-Jahre und -Typen erhalten und eine gemeinsame Projektion verwenden. Die bestehenden Jahres-/Typguards sollen nicht global gelockert werden. Fehlende Metadaten müssen als bewusster Altbestandfall weiterhin nachvollziehbar bleiben. Bereits gespeicherte Ref-IDs dürfen nicht pauschal umgeschrieben werden; eine eventuelle Bestandskorrektur ist ein separates, nachvollziehbares Vorhaben.

Abnahme:

1. Must-Watch The Thing (1982, Film), leerer Master und Blog The Thing (2011, Film) ergeben keinen automatischen Must-Watch-Link.
2. Ein eindeutiger Must-Watch-Eintrag Dark (2017, Serie) wird aus dem gleichartigen Blogeintrag korrekt verlinkt.
3. Beide Fälle gelten für baueRefUniversum plus gleicheArtikelAb beziehungsweise heileRotlinks sowie für planeMasterErsetzung.
4. Bekannte Metadaten bleiben in allen Projektionen erhalten; Eingabeobjekte werden nicht mutiert.
5. Kontrollfälle decken korrekten Master-Jahrestreffer, Mehrdeutigkeit, Altbestand ohne Metadaten und bewusst gesetzte bestehende Refs ab.

## Abhängigkeiten und offene Punkte

Keine Datenmigration, Providerwirkung oder Änderung von Must-Watch-Verknüpfungen ist Teil dieses Tickets. Browserinteraktion und reale Persistenz wurden nicht ausgeführt; die UI- und Speicherpfade wurden statisch verfolgt, die Funktionspfade lokal reproduziert. Umfang bereits gespeicherter falscher Referenzen ist unbekannt; Konten und Remote-Daten wurden nicht gelesen.

## Herkunft und Master-Abnahme

Validatorergebnis: [E04-F001.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E04-F001.json). Ursprünglicher Verdacht: [E04-F001.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E04-F001.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E04/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E04/KD-REV-E04-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
