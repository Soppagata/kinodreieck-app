# Kompakte Navigation und hervorgehobene Neuigkeiten

Die iPhone-Rückmeldung vom 7. September konkretisiert die gewünschte Dichte:
Mediathek wieder als Kopfmenü, stabile Schriftwahl, schlichte Settings-Klappen,
ein kleineres Menü für die rechte Hand und bewusst zurückgenommene Kino-Nebenlisten.
Die anschließend gewünschten Neuigkeiten verwenden die Kartenfamilie der Filmeinträge.

Basis ist der bereits auf Staging ausgelieferte Commit `46a2a2c`.
Alle Korrekturen R1–R6 stehen im gemeinsamen [Designschema](../DESIGN_SCHEMA_2026-09-07.md).

## Integration

- R3/R4: `b8da051` → `26255a5`, Settings.
- R1/R2/R6: `9235682` → `5c5b588`, Hauptansichten und Neuigkeiten.
- R5: `9df82f3` → `9ada016`, mobiles Menü.

Bei der Bildkontrolle wurde der Umbruch „Norm/al“ auf 320px mit großer Schrift
korrigiert: ein lokaler CSS-Padding-Wert ersetzt die zu breiten Standardabstände
der Schriftwahl. Der Standardwert des gemeinsamen Controls bleibt unverändert.
Die Mediathek-Ansichten skalieren nun ebenfalls mit der Schriftwahl. Radar-Karten
verwenden exakt die vorhandene Leinwandfläche für beide Themes; Quelle und
Zielherkunft bleiben getrennt lesbar. Der Streaming-SVG-Pfeil zeigt nach rechts.

Die alte mobile Testannahme für einen frei stehenden Nach-oben-Knopf mit 60px
Abstand wurde an die angeforderte Fußzeile angepasst. Der statische Shell-Check
prüft die Mindesttouchhöhe, statt eine überholte exakte Buttonhöhe festzuschreiben.

## Lokaler Nachweis

- Drei integrierte Private-v1-Pakete: 18/18 Fälle in Chromium/WebKit grün.
- Abschließender Settings-Padding-Wert: die vier betroffenen Browserfälle erneut
  grün, einschließlich echter wiederholter Schriftwechsel und einzeiliger Labels.
- Gerenderte Ansichten in Chromium/WebKit: Mediathek, Klein/Groß bei 393/320px,
  Neuigkeiten dunkel/hell sowie das Menü nach abgeschlossener Öffnungsanimation.
- Mediathek-Auswahl und Draft-Erhalt: 120/120 DOM-Checks; Kino-Empfehlungen 5/5;
  Radar-Oberfläche 9/9; Foundation 8/8, Shell und Nebenansichten grün.
- Die visuellen Fixtures blockieren unbekannte externe Anfragen. Der erste
  Bildlauf wartete nach erneutem Öffnen von Entdecken fälschlich auf den Radar-Tab;
  nach dem ausdrücklich ergänzten Tabwechsel war der Rundgang grün.

Temporäre Belege und Konfigurationen liegen unter
`/private/tmp/kd-design-ci-audit-evidence/refinement-*`.
Der finale Web-/Single-File-Build, CI und der Domainabruf gehören zur anschließenden
Staging-Lieferung. Der Single-File-Builder prüft sämtliche referenzierten WOFF2-Bytes.

Die Produktänderungen betreffen ausschließlich Präsentationskomponenten und CSS.
Suche/Tastaturanker, Datenmodelle, Services, Controller, Provider, Workflows und
Service Worker bleiben gegenüber `46a2a2c` unverändert. Main wird nicht verändert.
Die bestehende [Feedbackliste](../DESIGN_FEEDBACK_2026-09-07.md) bleibt maßgeblich;
Desktop-WebKit belegt keine physische iPhone-PWA-Abnahme.
