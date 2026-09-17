# KD-REV-E11-001 · Standardwert 12 wird als unbegrenzte Wiederholung gespeichert

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – ein gültiger, naheliegender Editorpfad speichert eine andere Wiederholungsgrenze als die sichtbare Auswahl. Das erzeugt zusätzliche künftige Termine und einen unbegrenzten Serienexport, aber keinen belegten Datenverlust oder Kontoübergriff.
- Finding: E11-F001
- Prüfstand: 14804ce389d69114feed27b92fb11ac78423cc0e
- Zuständige Etappe: E11

## Fehler und Auswirkung

Wählt eine Person im Wochenplaneditor „nach Terminen“ und speichert die sichtbar voreingestellte Anzahl 12 ohne Änderung, wird der Reminder unbegrenzt gespeichert. Dadurch bleibt der 13. passende Termin fällig und ein daraus erzeugter Serienkalender enthält kein COUNT=12. Betroffen sind neu angelegte Reminder aller vom gemeinsamen Editor unterstützten Arten sowie entsprechende Moduswechsel im Bearbeiten-Editor. Der gemeinsame UI-Pfad besteht lokal und für angemeldete Konten; eine erfolgreiche Remote-Persistenz oder die Häufigkeit bereits betroffener Daten wurde nicht geprüft.

Dies ist ein Produktfehler im Editorzustand und seiner Normalisierung, kein Provider-, Backend- oder Betriebsfehler.

## Auslöser, Soll und Ist

1. Start → Deine Woche → Eintrag öffnen.
2. Einen gültigen Titel eingeben.
3. Bei „Wiederholen bis“ „nach Terminen“ wählen.
4. Die sichtbar vorausgefüllte „12“ nicht verändern und speichern.

Soll: Es wird ende={typ:anzahl, anzahl:12} gespeichert; der 12. passende Termin ist noch fällig, der 13. nicht, und der ICS-Serienexport enthält COUNT=12.

Ist: Das gültige Formular speichert ende={typ:nie}. Der 13. Termin bleibt daher fällig und die RRULE enthält kein COUNT. Wird 12 ausdrücklich eingegeben, funktioniert die Begrenzung.

## Ursache und Fundstellen

Der Select ersetzt ende beim Wechsel nur durch den Typ. Das danach sichtbare kontrollierte Zahlenfeld zeigt zwar den Fallback 12, schreibt ihn aber ohne change-Ereignis nicht in den Entwurf. Der Submit übergibt den Entwurf unverändert; neuerFolgenReminder normalisiert die fehlende Anzahl. Number(undefined) ist nicht ganzzahlig und normalisiereEnde fällt deshalb auf typ:nie zurück. Die spätere Persistenz kann diese verlorene Absicht nicht rekonstruieren.

- Eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/components/Wochenplan.jsx, Zeilen 140-146 (Submit), 201-205 (Typwechsel und Anzeigen-Fallback), 293-307 (Speicherpfad). Übertragbar: src/components/Wochenplan.jsx am Commit 14804ce389d69114feed27b92fb11ac78423cc0e.
- Eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/wochenplan.js, Zeilen 102-107 (Normalisierung), 151-157 (neuerFolgenReminder), 190-199 (Fälligkeitsgrenze). Übertragbar: src/lib/wochenplan.js am Prüfcommit.
- Eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/kalenderExport.js, Zeilen 145-169; COUNT wird nur für typ:anzahl ergänzt. Übertragbar: src/lib/kalenderExport.js am Prüfcommit.

## Belege und Gegenproben

Statische Beweiskette:

- Der öffentliche Einstieg liegt im Wochenplan und übergibt den gespeichert normalisierten Eintrag; der Submit besitzt keinen Default-Write.
- Die Fälligkeitslogik begrenzt nur typ:anzahl, der ICS-Export fügt COUNT nur für diesen Typ ein.
- Die Quellenidentität der zentralen Dateien ist im Coverage-Manifest dokumentiert: /Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/coverage.json.

Ausgeführte Reproduktion:

- /private/tmp/kd-vollreview-20260916/tests/E11-F001/validator/reproduce.mjs lief mit Exit 0 gegen die echte eingefrorene React-Komponente in Chromium 151.0.7922.34. Erfolgreiche Persistenz war lokal gemockt, nutzte aber die echte Normalisierung und einen localStorage-JSON-Roundtrip; Browser-Requests wurden lokal abgefangen.
- Ergebnis: /private/tmp/kd-vollreview-20260916/tests/E11-F001/validator/result.json. Unveränderte 12: Eingabe und Formular gültig, gespeichertes ende={typ:nie}, thirteenthDue=true, RRULE ohne COUNT. Explizite 12: ende={typ:anzahl, anzahl:12}, thirteenthDue=false, RRULE mit COUNT=12; keine pageErrors.

Gegenproben:

- 11 und danach 12 einzugeben erzeugt korrekt typ:anzahl; Zählalgorithmus und ICS-COUNT sind bei vorhandener Anzahl korrekt.
- required/min/max verhindern den Auslöser nicht: Die Browser-Reproduktion bestätigte checkValidity=true für Feld und Formular bei sichtbarer 12.
- Bestehende Anzahltests setzen die Anzahl explizit; sie decken diesen Editor-Defaultpfad nicht ab. Sie wurden im Validator nicht als vollständige Suite ausgeführt.
- Bereits korrekt begrenzte Reminder bleiben begrenzt, sofern ihr Ende-Typ nicht neu gewählt wird.

Abgrenzung der Testwerkzeuge: Ein vorbereitender Chromium-Start scheiterte an einer Sandbox-Mach-Port-Beschränkung; ein erster Lauf an einem zu engen Selektor. Nach gezielter Korrektur lief die vollständige lokale Reproduktion. Diese vorbereitenden Toolprobleme sind weder Produkt-PASS noch Produktfehler.

## Korrekturziel und Abnahme

Im ReminderEditor beim Wechsel auf typ:anzahl eine gültige Anzahl im State initialisieren und sichtbaren sowie gespeicherten Wert stets identisch halten. Der funktionierende Wiederholungsalgorithmus, Provider, Schema und Infrastruktur bleiben außerhalb der Korrekturgrenze. Bereits als typ:nie gespeicherte Reminder dürfen nicht pauschal migriert werden, weil sie nicht zuverlässig von bewusst unbegrenzten Einträgen unterscheidbar sind.

Abnahmekriterien:

1. Ein neuer gültiger Reminder mit „nach Terminen“ und unverändert sichtbarer 12 speichert ende={typ:anzahl, anzahl:12}.
2. Der 12. passende Termin ist fällig, der 13. nicht; der Serien-ICS enthält COUNT=12.
3. Explizit eingegebene Zahlen und bestehende begrenzte Reminder bleiben korrekt.
4. Beim Wechsel von nie oder datum nach anzahl stimmen sichtbarer und gespeicherter Wert auch im Bearbeitungsmodus überein.
5. Nach erfolgreichem Speichern und JSON-Readback bleibt die Anzahl erhalten; bewusstes nie und ein Enddatum behalten ihre bisherige Bedeutung.

## Abhängigkeiten und offene Punkte

Keine Abhängigkeit zu Provider- oder Schemaänderungen. Nicht geprüft sind Live-/Produktions- und iPhone-PWA-Verhalten, konkrete Kontodaten, Remote-Persistenz sowie die Anzahl historisch betroffener Reminder.

## Herkunft und Master-Abnahme

Validatorergebnis: /private/tmp/kd-vollreview-20260916/validations/E11-F001.json. Master-Proposal: /Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E11-F001.json. Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E11/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E11/KD-REV-E11-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
