# Kinodreieck – verbindliches Gestaltungsschema

Max hat am 7. September die interaktive Studie und deren Umsetzung freigegeben: bestehende Kinoästhetik verfeinern, lokale Fonts auch in der Einzeldatei, alle Links und Buttons erfassen, Suchleiste/PWA-Tastatur prüfen, Funktionsarchitektur erhalten. Die Studie liegt unter `/Users/max/.codex/visualizations/2026/09/07/01a07c99-0ac5-78e2-a3f3-30080477cb81/kinodreieck-designstudie.html`.

## Bild und Rhythmus

Ein dunkler Kinosaal, warme Papierkarten, sparsam gesetztes Gold. Im vorhandenen hellen Foyer bleiben die Karten dunkel. Große Überschriften tragen den Charakter; Bedienung und Begleitinformationen bleiben ruhig. Die drei Leitansichten Start, Kino und Streaming sprechen dieselbe visuelle Sprache, behalten aber ihre jeweiligen Aufgaben und vorhandenen Funktionen.

| Rolle | Verbindliche Gestaltung bei normaler Schrift |
| --- | --- |
| Seitenüberschrift | Fraunces 900, 38 px mobil / bis 46 px Desktop, Zeilenhöhe 1.08, normale Groß-/Kleinschreibung; vorhandene Startbegrüßung darf gleichwertig behandelt werden |
| Abschnitt | Space Grotesk 600, 15 px / 1.4; kein weit gesperrtes Mono-Versalband |
| Filmtitel/Kartentitel | Barlow Condensed 600, 22 px / 1.2, normale Groß-/Kleinschreibung; vollständig umbrechend |
| Fließtext | Space Grotesk 400, 15 px / 1.55 |
| Button/Tab/Filter | Space Grotesk 600, 14 px / 1.35, normale Groß-/Kleinschreibung |
| Metadaten/Anbieterlabel | Space Grotesk 400–500, 12 px / 1.45; lesbare Fläche/Text-Paare |
| Datum/Uhrzeit/technische Kennung | Space Mono 400, 12 px / 1.45; Mono sparsam und zweckgebunden |
| Formular/Eingabe | Space Grotesk 400, mindestens 16 px, bei großer Schrift mitskalierend; keine iOS-Fokusvergrößerung provozieren |
| Abstände | 4 / 8 / 12 / 16 / 24 / 32 px; Seitenrand 20 px mobil (16 px bis 360 px), Kartenpadding 16 px, Abschnitte 24 px |
| Rundungen | Karte 12 px, Controls 8 px, reine Labels 5 px; keine beliebigen zusätzlichen Radien |
| Bedienflächen | Einzelne Buttons/Schaltlinks mindestens 44 × 44 px oder äquivalente volle Zeile; Textlinks im Fließtext bleiben Fließtextlinks |

Alle Textrollen folgen dem vorhandenen `--kd-schriftfaktor`; Eingabefelder unterschreiten auch bei Einstellung „klein“ 16 px nicht. Kein fester Höhenzwang auf Textkarten. Markenwortzug, Bewertungssignatur und ausdrückliche Easteregg-Gestaltung bleiben als solche erkennbar.

## Farben und Zustände

- Dunkel: Saal `#17151A`, erhöhte Fläche `#211E26`, Papier `#ECE8DF`, Tinte `#1C1A1E`, Papierbegleittext `#57525C`, Saalbegleittext `#B6AFBE`, Gold `#E3A63B`.
- Hell: Saal `#EDEAE3`, erhöhte Fläche `#FBFAF7`, Karten `#23202A`, Kartentext `#F0EDE6`, Kartenbegleittext `#C8C2D1`, Saalbegleittext `#595363`, Gold `#825B14` entsprechend der Studie.
- Karten verwenden Tinte/TinteWeich (oder explizite semantische Kartenrollen), nie blind den Saaltext `rauch`. Anbieterlabels sind neutrale Informationen und sehen nicht wie primäre Buttons aus.
- Für Akzenttext auf Karten gilt eine eigene kontrastreiche Kartenrolle. Das dunklere Gold des hellen Saals ist nicht automatisch auch auf dessen dunklen Karten lesbar. Bewertungsfarben können Punkte/Ränder markieren; der lesbare Zahlen-/Labeltext darf in der neutralen Kartenfarbe stehen.
- Primäraktion und aktive exklusive Auswahl verwenden Gold mit über `kontrastFarbe()` bestimmtem Text. Sekundäraktionen verwenden eine feine Linie; Destruktives behält seine eindeutige Beschriftung und Fehlerfarbe.
- Sichtbarer Tastaturfokus, Hover, gedrückt/ausgewählt, laufend, deaktiviert und Fehler bleiben unterscheidbar. Keine Information nur über Farbe vermitteln.
- Kein pauschales `!important` über alle Buttons/Elemente. Geteilte Primitives korrigieren, verbleibende Rollen gezielt klassifizieren; vorhandene Inline-Stile an ihrer Quelle angleichen. Fokus- und Easteregg-Regeln nicht übermalen.

## Wiederkehrende Bausteine

1. **Kopf:** identische Typografie und Sektionabstände; eine dezente Lichtpunktlinie als Kinozitat. Vorhandene Navigation bleibt vollständig erhalten.
2. **Filmkarte:** Papier/Dunkelkarte, Titel 22 px, Metadaten darunter; Aktionen in einer eigenen umbrechenden Reihe. Bewertungsdreieck, Quellen, Status und alle vorhandenen Detailaktionen bleiben zugänglich.
3. **Must-Watch:** fünf vorhandene tägliche Einträge, Rang links, vollständiger Titel, darunter vollständige umbrechende Anbieter. Der schon korrigierte Screenshot-Overflow darf nicht zurückkehren.
4. **Wochenplan:** kompakte Wochentagsauswahl plus ausgewählter Tag, mit sichtbarer Möglichkeit „Ganze Woche“. Das ist lokale Darstellungswahl; alle bisherigen Einträge, Hinzufügen-/Entfernen-/Terminauswahlaktionen und Wochenwechsel bleiben vorhanden. Bei sehr kleiner Breite darf die Tagesauswahl in zwei Reihen umbrechen.
5. **Kino/Streaming:** gleiche Kartentypografie, Controlhöhen und Abstände. Filter funktionieren wie bisher. Kino-Pin bleibt vorstellungsbezogen, Streaming-Pin titelbezogen. „Mein Programm“, „Alles“, „Neu“, Jahrzehnt-Nullwert „Alle“, Toleranz-/Sortierverträge und Neu-Frist bleiben unverändert. Skalen weniger dicht beschriften, nicht die Werte verändern.
6. **Formulare/Dialogs/Hilfe:** dieselben Inputs, Buttons, Überschriften, Abstände und Fokuszustände. Keine ungestalteten Browserbuttons, unlesbar kleinen Kontrolltexte oder abgeschnittenen Aktionsleisten.
7. **Icons:** bestehende Inline-SVGs wiederverwenden; für primäre UI-Symbole bei Bedarf kleine Inline-SVGs ergänzen. Keine neuen Betriebssystem-Emoji als Controls. Accessible Names bleiben erhalten.

## Suchleiste: Astra-Befund und Erhaltungsvertrag

`GlobalSearchBar.jsx` besitzt bereits die gezielt gebaute Folge `idle → focus-pending → keyboard-open`. Ein bestätigter editierbarer Fokus und verkleinerte VisualViewport-Geometrie lösen den vorhandenen referenzgezählten Dokument-Scrolllock aus. Der direkte Anker ist `visualViewport.offsetTop + visualViewport.height − safeAreaBottom − formHeight`; CSS schaltet dann von bottom auf top um. Hintergrundwischen wird nur während dieser Phase gesperrt, die Ergebnisliste scrollt innerhalb ihrer Grenzen weiter, Mehrfinger-Gesten bleiben frei. Diese Architektur ist angemessen und wird erhalten.

Visuelles Ziel: ein äußerer Rahmen mit 12 px Radius, erhöhte Saalfläche, ruhiges Eingabefeld ohne zweiten ständigen Kasten; goldener SVG-Suchbutton, sekundärer Menübutton, jeweils mindestens 44 px. Fokus innerhalb der Leiste klar markieren, keinen Layoutsprung erzeugen. Ergebnisfenster mit derselben Fläche, klaren Titel-/Bereich-/Metadatenrollen, separatem gut erreichbarem Schließen. Keine Transition auf Tastaturanker, top/bottom/transform oder Viewportgröße.

Fokussierte Prüfung im aktuellen privaten Mockkonto (nicht nur im alten öffentlichen Browserfixture): Fokus ohne Tastatur sperrt nicht; verspätete Viewportverkleinerung nach nativem Scroll hält Eingabe sichtbar; Scroll/Offset-Änderungen bleiben am direkten Anker; Ergebnisliste ist in kleinem Viewport scrollbar; Hintergrund/Scroll-Chaining gesperrt, Multitouch frei; Schließen nur der Ergebnisse erhält Eingabefokus, Menü/Treffer/Navigation übergeben den Lock; Tastatur zu/Rotation/Zoom/Unmount räumen auf. Schrift „groß“, 320/393/430 px, WebKit und Chromium einbeziehen. Simulierte Geometrie ist keine physische iPhone-PWA-Abnahme.

## Lokale Fonts und Einzeldatei

Die bestehenden WOFF2-Dateien in `src/assets/fonts` sind die Quelle. Web/PWA laden sie aus demselben Build; `dist-single/Kinodreieck.html` muss sämtliche verwendeten Fontdaten enthalten. Keine Google-Fonts-CDN-, `local()`- oder Systemfont-Voraussetzung für die gestaltete deutsche UI. Tatsächliche Gewichte/Schnitte verwenden, keine erfundenen semibold/italic-Schnitte. OFL-Lizenzen und Fontinventar vervollständigen. Eine Prüfung muss die WOFF2-Bytes der verwendeten Faces im erzeugten HTML und deren Laden ohne Netz belegen. Browserrasterung kann unterschiedlich sein; das Gestaltungsgerüst darf davon nicht abhängen. Nicht abgedeckte fremde Schriftsysteme in dynamischen Filmtiteln gegebenenfalls ehrlich in der Feedbackliste aufführen.

## Unveränderte funktionale Verträge

Keine Änderungen an `src/services`, Controllern, Rankings, Datenmodell, Persistenz-/Kontogrenzen, Supabase, Workflows, Providern, Service Worker oder Funktionen. Keine neuen Abhängigkeiten. Ereignishandler, href/Targets, Formvalidierung, Such-/Filterwerte, IDs/Tour-Anker, Accessibility-Beziehungen, Datenmengen und Rechte bleiben erhalten. Neue Klassen und rein lokale Darstellungsauswahl sind erlaubt. Keine versteckten Funktionen oder deaktivierten Eastereggs reaktivieren. Bei einem Funktionsverdacht: konkreter Pfad/Beobachtung in die Feedbackliste; nicht nebenbei Architektur reparieren.

**Präzisierung von Max während der Umsetzung:** Eastereggs werden später in separaten Chats einzeln kreativ ausgearbeitet. In diesem Auftrag ausschließlich ihre Schriften und Bedienelemente vereinheitlichen; keine zusätzliche Effekt-, Theme- oder Animationsgestaltung. Der Schwerpunkt bleibt die gemeinsame App-Oberfläche.

## Ergebnisregister und Baufolge

| ID | Nutzbares Ergebnis | Lokaler Abschluss |
| --- | --- | --- |
| D1 | Must-Watch auf kleinen Displays vollständig lesbar | DONE: fünf Einträge, vollständige Titel/Anbieter; Browserregression nach Integration grün |
| D2 | Gemeinsame Schrift-, Größen-, Farb- und Abstandsrollen, vollständig lokale Fonts | DONE: Foundation, Kontrastrollen und 14 eingebettete WOFF2-Faces; ohne externe Font-Anfragen geprüft |
| D3 | Einheitliche Start-/Kino-/Streaming-/Mediathek-Karten und Controls | DONE: Titel-, Abschnitts-, Karten- und Filterrollen; lesbare Skalen und getrennte Streaming-Aktionen |
| D4 | Kompakte Startwoche und ruhige, stabile mobile Such-/Menüleiste | DONE lokal: Tagesauswahl/Ganze Woche; bestehende PWA-Mechanik unverändert und im privaten Fixture geprüft |
| D5 | Alle übrigen Tabs, Formulare, Buttons, Links und Dialoge folgen dem Schema | DONE im dokumentierten Bestandsscope: gemeinsame Controls und Bereichsstile; alle bisherigen Link-/Form-/Handlerverträge erhalten; native Tastatur und F06 bleiben Grenzen |
| D6 | Eastereggs erhalten; konkrete Feedbackliste und nachvollziehbare lokale Abnahme | DONE: nur Font-/Controlvereinheitlichung, Feedbackliste und lokale Abnahme; kreative Effekte liegen außerhalb dieses Auftrags |

Produktstand: `9e9465b52489090b1a2f1d0eddd1432afcd0873e`. Der vollständige Liefer- und Prüfbeleg steht in [design-deliveries/integration.md](design-deliveries/integration.md). Physische iPhone-PWA-Abnahme und externe Lieferung werden daraus nicht abgeleitet.

Baufolge: gemeinsame Foundation → drei disjunkte Terra/high-Pakete auf demselben Nicht-main-Commit → Integration und einmaliger lokaler Abschluss. Astra besitzt Gestaltung, Suchleisten-Erhaltungsvertrag und Integration. Main und der primäre Checkout bleiben unberührt. Externe Lieferung ist nicht Teil dieses lokalen Designauftrags.
