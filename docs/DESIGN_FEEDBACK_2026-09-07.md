# Feedbackliste aus dem Designaudit

Hier stehen auffällige funktionale oder dokumentarische Punkte außerhalb des Gestaltungsauftrags. Sie sind kein Auftrag zur Veränderung der Funktionsarchitektur. Stand: 7. September 2026, lokaler Quellcode und netzgesperrte Browserbeispiele.

| ID | Beobachtung und Fundstelle | Einordnung / späterer Schritt |
| --- | --- | --- |
| F01 | `FUNKTIONSBERICHT.md`, Kapitel 12.16 beschreibt einen versteckten Max-Einstieg, während die aktuelle private Oberfläche und ihr Test ausdrücklich keinen solchen Touchtarget vorsehen. | Veraltete Beschreibung mit Produktentscheidung abgleichen; keinen Trigger im Designauftrag reaktivieren. |
| F02 | `src/lib/modus.js` enthält Aktivflags für mehrere Eggs; die vorhandenen App-Verbindungen benutzen teils den globalen Schalter `EGGS_ENABLED`. Teppich/Crawl/Klaatu sind im Bestand pausiert. | Später die Dokumentation der effektiven Erreichbarkeit konsolidieren. Keine Aktivierung erforderlich. |
| F03 | Die älteren umfangreichen Suchleisten-PWA-Browsertests stehen in `tests/mobile-layout.spec.mjs`; der aktuelle Standardlauf deckt diese Datei nicht mehr vollständig ab. | Für den Designkandidaten wird die relevante Prüfung ins aktuelle private Mockkonto überführt; vorhandene Login-Grenzen bleiben unverändert. |
| F04 | Die mitgelieferten Fonts decken Deutsch/lateinische UI ab; beliebige internationale Filmtitel können weitere Schriftsysteme enthalten. | Vollständige Unicode-Abdeckung ist keine belegte Eigenschaft. Erst bei konkretem Bedarf zusätzliche lizenzierte Schriften/Subsetstrategie bewerten. |
| F05 | Installierte iPhone-PWA: Tastatur, Rotation und reale Betriebssystemleisten lassen sich im Desktop-WebKit nur simulieren. | Physische Prüfung mit neuem Kandidaten: mittig scrollen → Suche → Tastatur → Ergebnisse intern scrollen → schließen → Ausgangsposition; anschließend Rotation. |

Weitere konkrete Funde werden paketweise ergänzt. Reine Designmängel, die in diesem Auftrag behoben werden, gehören in den Liefernachweis statt als offene Funktionsfehler in diese Liste.
