# KD-REV-E11-003 · Legacy-Streamingabgleich verknüpft Konfliktfälle mit falschem Mediathekwerk

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – im vorgesehenen Legacy-Fallback kann ein vom strengen Resolver abgelehnter Katalogtitel als vorhandenes, aber falsches Mediathekwerk erscheinen. Das führt zu falscher Navigation und unterdrückt statisch das Angebot zur eigenen Erstellung; kein Masterdaten-Overwrite oder Accountübergriff ist belegt.
- Finding: E11-F003
- Prüfstand: 14804ce389d69114feed27b92fb11ac78423cc0e
- Zuständige Etappe: E11

## Fehler und Auswirkung

Im nicht-progressiven StreamingTab wird ein Nicht-MotN-Katalogtitel mit widersprüchlicher starker Identität nach einem korrekten strengen Katalogabgleich erneut locker mit der Mediathek verknüpft. Die Karte zeigt „in deiner Mediathek · Zum Eintrag“ und der Link navigiert zur falschen Mediathek-ID. Bei gesetzter mediathek_id ist das Erstellen eines eigenen Eintrags im Renderpfad verborgen.

Der konkret verfolgte Einstieg ist der ausdrücklich implementierte Missing-RPC-Kompatibilitätsfallback. Betroffen sind Nicht-MotN-Titel in dessen nicht-progressiver Ansicht, wenn etwa TMDb-ID geteilt wird, Werkart, Bezugsjahr oder eine weitere starke ID jedoch widersprechen. Der normale progressive Pfad ist davon nach geprüfter Gegenprobe nicht umfasst. Dies ist ein clientseitiger Matchingfehler, kein nachgewiesener Provider-, Backend-, Datenverlust- oder Betriebsausfall.

## Auslöser, Soll und Ist

1. Ein angemeldeter Nutzer erreicht den Legacy-Fallback, beispielsweise weil kd_streaming_page als fehlend erkannt wird.
2. Ein Nicht-MotN-Katalogtitel und ein vorhandenes Mediathekwerk teilen eine starke ID, widersprechen sich aber in Werkart, Bezugsjahr oder einer anderen starken ID.
3. Katalog und Dienstauswahl machen den Titel in „Alles“ sichtbar.

Soll: Die vom strengen Resolver festgestellte widersprüchliche Identität darf keine automatische Mediathekstatus-Zuordnung, keinen Link zu diesem Werk und keine Unterdrückung der eigenen Erstellung auslösen.

Ist: baueStreamingAnsichten lässt den Konflikttitel korrekt in Entdecken. Der anschließende Legacy-Abgleich setzt dennoch status=erstellt und mediathek_id auf das falsche Werk. Ein ausgeführter JSDOM-Klick rief onEintragKlick mit dieser ID auf; die Erstellungsschaltfläche ist bei mediathek_id im statischen Renderpfad verborgen.

## Ursache und Fundstellen

gleicheMediathekStatusAb nutzt im Nicht-MotN-Zweig die erste gemeinsame Watchmode-, IMDb- oder TMDb-ID in Masterreihenfolge. Dieser Pfad prüft weder Typ/Jahr noch widersprechende andere IDs oder Mehrdeutigkeit. Die Nachbereinigung akzeptiert jede noch existente mediathek_id. bestaetigteMediathekNavigationId wiederholt den lockeren Abgleich und bestätigt nur erneut irgendeine gemeinsame ID; der zuvor erkannte Konflikt wird nicht wiederhergestellt.

- Eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/staffeln.js, Zeilen 106-145 (lockerer Nicht-MotN-Resolver, Statuswrite und Bereinigung). Übertragbar: src/lib/staffeln.js am Commit 14804ce389d69114feed27b92fb11ac78423cc0e.
- Eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/tabs/StreamingTab.jsx, Zeilen 55-75 (Navigation), 463-469 (Legacy-Statusabgleich) und 918-932 (Mediathek-Link). Übertragbar: src/tabs/StreamingTab.jsx am Prüfcommit.
- Eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/lib/katalog.js, Zeilen 544-590 (strenger Resolver, der Konflikttitel in Entdecken belässt). Übertragbar: src/lib/katalog.js am Prüfcommit.
- Eingefrorene Quelle: /private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingPageController.js, Zeilen 192-202 (Legacy-Deaktivierung nach Fallback). Übertragbar: src/controllers/useStreamingPageController.js am Prüfcommit.

## Belege und Gegenproben

Ausgeführte Reproduktion:

- node /private/tmp/kd-vollreview-20260916/tests/E11-F003/validator/reproduce.mjs lief mit Exit 0. Der Test bündelte unveränderte Produktmodule und acht Prüfgruppen: vollständige Projektion bis Status/Navigation, Typ-, Jahres- und weitere-ID-Konflikte, Kontrollen für MotN, progressiven Mapper und gelöschtes Ziel, gültige Identität, echten Controller mit gemocktem Missing-RPC sowie React/JSDOM-Render mit Klick und lokalem Statuswriter.
- Ergebnis: /private/tmp/kd-vollreview-20260916/tests/E11-F003/validator/results.json. Aus leerem Status entsteht für Watchmode 900001 mediathek_id=anderer-film; der gerenderte Link liefert opened=[anderer-film]. Der strenge Katalogschritt setzt bekannteId zuvor nicht. Fetch war im Harness gesperrt; es gab keine Provider-, Remote- oder Konto-Schreibzugriffe.
- Die elf zentral untersuchten Produktdateien wurden bytegleich zum Prüfcommit belegt: /private/tmp/kd-vollreview-20260916/tests/E11-F003/validator/source-provenance.json.

Statische Beweiskette:

- App aktiviert Paging; der Controller erkennt den Missing-RPC-Fall, führt legacyFallback aus und deaktiviert Paging. App lädt und projiziert dafür den Legacy-Katalog und übergibt ihn an StreamingTab. Der vollständige App-Boot wurde nicht im Browser ausgeführt.
- Der strenge Katalogresolver hält Konfliktfälle in Entdecken, aber der spätere Statusabgleich überschreibt diese Schutzwirkung mit einer lockeren Zuordnung.

Gegenproben:

- Im normalen bereiten Accountpfad verwendet die progressive Ansicht die streng abgeleitete library_id und überspringt den Legacy-Statusabgleich. Mit demselben Konflikt lieferte der progressive Mapper keine library_id.
- Die aktuelle Migration definiert kd_streaming_page weiter; bei vollständig migriertem und erreichbarerm Backend ist der Missing-RPC-Trigger nicht der Normalfall. Seine aktuelle Live-Nutzung wurde nicht geprüft.
- Der MotN-Zweig verwendet den strengen Resolver und erzeugt bei demselben Konflikt keinen Eintrag.
- Ein gelöschtes Ziel wird durch Nachbereinigung und Navigation verworfen; ein lebendes, aber falsches Ziel nicht. Gültige eindeutige Identitäten bleiben korrekt.
- Vorhandene staffeln-Tests prüfen positive eindeutige Zuordnung, Legacy-Status und Löschung, nicht die Konfliktsperre; sie wurden hier nicht als vollständige Suite ausgeführt.

Die acht lokal „bestandenen“ Prüfgruppen sind Fehlernachweise und Gegenkontrollen, keine Produktabnahme. Sie belegen keine reale RPC-Verfügbarkeit, keine Produktion und keine physische Geräteansicht.

## Korrekturziel und Abnahme

Die Statuszuordnung und die Bestätigung der Legacy-Navigation müssen denselben konfliktbewussten Identitätsvertrag verwenden wie der Katalogresolver. Widersprüche oder Mehrdeutigkeit dürfen auch bei vorhandener gespeicherter mediathek_id nicht durch die bloße Existenz eines Zielrecords fortbestehen. Vorhandener Legacy-Gesehen-Status und unbekannte Zusatzfelder sind zu bewahren; fehlende historische Typ-/Jahrdaten müssen bewusst behandelt werden. Paging, Provider und Backend werden nicht neu aufgebaut.

Abnahmekriterien:

1. Gleiche TMDb-ID bei widersprüchlicher Werkart oder Bezugsjahr führt nach baueStreamingAnsichten zu keinem Mediathekstatus und keinem Navigationsziel.
2. Gemeinsame ID mit widersprechender weiterer starker ID sowie mehrere widersprüchliche Kandidaten erzeugen unabhängig von Masterreihenfolge keine automatische Verknüpfung.
3. Eine bereits falsch gespeicherte, noch existente mediathek_id bleibt bei erneut bestätigtem Konflikt weder gültige Zuordnung noch Link; gesehen und unabhängige historische Felder bleiben erhalten.
4. Der gerenderte Legacy-Alles-Pfad zeigt keinen falschen „Zum Eintrag“-Link und ermöglicht für den Konflikttitel eine eigene Erstellung.
5. Gültige eindeutige Identitäten und bestehende strenge Known-/progressive Zuordnungen funktionieren weiter; der Missing-RPC-Fallback bleibt mit Mocks testbar.

## Abhängigkeiten und offene Punkte

Keine Paging-, Provider- oder Backend-Neuarchitektur erforderlich. Nicht geprüft sind Live-RPC-Verfügbarkeit, echte Konto- oder Produktionsdaten, Auftretenshäufigkeit, vollständiger App-Boot, echte Remote-Persistenz und physisches iPhone/PWA. Die verwendeten Konfliktdaten sind synthetische vertragskonforme Fixtures und keine Behauptung eines aktuellen realen Kollisionsrecords. Aus dem begrenzten Validatorauftrag folgt kein vollständiger Duplikatabgleich mit fremden Findings.

## Herkunft und Master-Abnahme

Validatorergebnis: /private/tmp/kd-vollreview-20260916/validations/E11-F003.json. Master-Proposal: /Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E11-F003.json. Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E11/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E11/KD-REV-E11-003.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
