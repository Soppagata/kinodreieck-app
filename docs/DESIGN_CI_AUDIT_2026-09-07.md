# Kinodreieck: Design-, CI- und Easteregg-Audit

Stand: 7. September 2026. CI bedeutet hier Corporate Identity. Quellbasis: `98b5eca18d15f0a4ec8bed52b1d952c7cc8ec383`. Der Hauptcheckout bleibt unverändert. Dieses Dokument trennt nachgewiesene Befunde, Gestaltungsvorschläge und noch ausstehende Abnahme.

Max hat im laufenden Audit ausdrücklich die Richtung **„Bestehende Kinoästhetik verfeinern“** gewählt.

## Ergebnis

Kinodreieck besitzt eine erkennbare Identität: dunkler Kinosaal, warmes Papier, Wolframgold, das dreifarbige Bewertungsdreieck, Leuchtreihen und Ticketdetails. Die Uneinheitlichkeit entsteht vor allem durch unterschiedliche Schriftrollen, Kartenhierarchien und unabhängig gewachsene Bedienelemente. Die vorhandene Identität sollte präzisiert werden.

Das Screenshot-Problem ist ein Layoutfehler: unverkürzbare Anbieter-Badges stehen neben einem schrumpfbaren Titel in einer einzigen Flexzeile. Schon wenige lange Dienste verbrauchen die gesamte Breite. Das Ziel ist ein vollständig lesbarer Titel mit einer separaten, umbrechenden Verfügbarkeitszeile.

## Umfang und Evidenz

- Eingangsbeleg: iPhone-Screenshot `Bildschirmfoto 2026-09-07 um 17.58.47.png`.
- Aktueller Code: alle acht Tabs, gemeinsame UI-Bausteine, Tokens, Basistyles, Kino-Filter, Navigation/Suche, Schriftdateien, Egg-Konfiguration, Controller und Effektstyles.
- Lokale Browseransichten bei 393 CSS-Pixeln: Start, Kino, Streaming/Mein Programm, Streaming/Alles, Mediathek, Entdecken, Settings; zusätzlich Start und Kino mit der Einstellung Groß.
- Der Browser verwendete synthetische Kontodaten und abgefangene Backendantworten aus dem vorhandenen Private-v1-Harness. Alle nichtlokalen App-Anfragen wurden beantwortet oder blockiert; keine echte Anmeldung, kein realer Kontozugriff oder Anbieteraufruf. Neun Ansichten, keine JavaScript-Seitenfehler. Das normale Fixture hatte keinen horizontalen Seitenüberlauf; der Screenshot-Stressfall wird gesondert geprüft.
- Lokale Rohbelege: `/private/tmp/kd-design-ci-audit-evidence/baseline-*.png` und `baseline-measurements.json`. Die Baseline ist eine Kopie des gebundenen Commits und enthält keine späteren Produktänderungen.
- Nicht abgedeckt: vollständige manuelle Durchklickabnahme jedes Dialogzustands, reale Datenbestände, Installation/Viewport/Tastatur auf einem physischen iPhone, VoiceOver, Live-Deploy oder eine vollständige WCAG-Zertifizierung. Die interaktive Designstudie ist ein Vorschlag, kein Screenshot eines ausgerollten Produkts.

## Priorisierte Befunde

| ID | Priorität | Befund und Wirkung | Beleg | Empfohlene Änderung |
| --- | --- | --- | --- | --- |
| UI-01 | Hoch | Must-Watch-Titel verschwinden bei mehreren langen Anbietern; Badges verlassen die Karte. | Screenshot; `StartTab.jsx`, `.kd-dash-zeile`, `.kd-dash-ztitel`, `.kd-dash-badge` | Rang separat; Titel erhält die verfügbare Breite; Verfügbarkeit darunter; vollständige Namen umbrechen. |
| UI-02 | Hoch | Grauviolett auf Papier erreicht nur **2,565:1**, Gold auf Papier **1,755:1**. Das betrifft u. a. Besitz-Badges und Terminmetadaten; Goldziffern sind zusätzlich sehr blass. | `tokens.js`, `.kd-dash-badge`, `.kd-dash-meta`, `.kd-dash-rang`; Browserfarben bestätigt | Eigene Textfarbe je Fläche. Auf Papier `tinteWeich` (6,208:1), Gold für kleine Akzente/Flächen. |
| UI-03 | Hoch | Die Schriftgrößeneinstellung wirkt ungleichmäßig. Start-H1 bleibt bei Normal/Groß 40/40 px, Kino-H1 wächst 42/47,04 px. Must-Watch-Titel bleiben in der Baseline 17/17 px, Badges 10/10 px. | Browsermessung; feste Größen in `index.css` | Gemeinsame skalierende Textrollen, zunächst alle Kernflächen; Reflow mit großer Schrift prüfen. |
| UI-04 | Hoch | Streaming-Reglerskalen sind mobil nur 5–7 px groß; Anfangsbuchstaben und Jahrzehnte lassen sich kaum ablesen. | `index.css`, mobile `.kd-streamfilter-abc-skala` und `-dekade-skala`; Browserbild | Reglerverhalten erhalten; wenige lesbare Skalenanker und hervorgehobener aktueller Wert. Keine neue Filterlogik. |
| UI-05 | Mittel | Derselbe Film wird in Kino mit Fraunces 20 px, in Streaming/Mein Programm mit Barlow 22 px in Versalien und in Streaming/Alles mit Barlow 17 px in gemischter Schreibweise gezeigt. Start nutzt Barlow 17 px. | `ui.jsx:KinoTicket`, `FilmCard.jsx`, `StreamingTab.jsx`, `StartTab.jsx`; Browserbilder | Eine Filmtitelrolle; kompakte und ausführliche Karten dürfen sich in Informationsmenge unterscheiden. |
| UI-06 | Mittel | Start-Sektionsköpfe sind Mono-Kicker, Kino-Sektionsköpfe große goldene Versalien, Streaming nutzt vorwiegend Umschalter. Start besitzt einen eigenen Hero mit abweichenden Abständen. | `StartTab.jsx:Modul`, `BereichsHero.jsx`, `KinoTab.jsx`, Basistyles | Gemeinsamer Bereichskopf und Sektionskopf; Datum oder Trefferzahl als optionale Zusatzzeile. |
| UI-07 | Mittel | Sieben große Tageskarten lassen einen fast leeren Wochenplan mobil sehr lang werden. Must-Watch liegt weit unterhalb der ersten Ansicht. | Start-Browserbild und `Wochenplan.jsx` | Kompakte Wochenleiste plus ausgewählter Tag; volle Woche weiterhin erreichbar. Alternativ leere Tage flacher. Das ist eine zu entscheidende Produktänderung. |
| UI-08 | Mittel | Kino und Streaming besitzen verschiedene Filterköpfe und Panelrahmen. Streaming/Mein Programm hat zusätzlich zur festen Suche ein lokales Suchfeld. | `kino-filter.css`, `StreamingTab.jsx`, `GlobalSearchBar.jsx` | Gleicher Filterknopf, aktiver Filterzähler, Zurücksetzen und Panelabstand. Suchzustand und Ergebnisse vor dem Entfernen eines lokalen Feldes abgleichen. |
| UI-09 | Mittel | „Weitere 44 Titel anzeigen“ in Entdecken erscheint als nativer grauer Browserbutton. | lokales Entdecken-Browserbild; `EntdeckenTab.jsx` | Gemeinsamen sekundären Button verwenden; gleiche Schrift, Höhe und Zustände. |
| UI-10 | Mittel | Die mobile Suche hat einen goldenen Außenrahmen plus mehrere Innenrahmen. Ihr starker Schatten konkurriert mit den Karten. | Screenshot; mobile `.kd-globalsuche` | Ein ruhiger gemeinsamer Rahmen, klarer Suchbutton, konsistente Radien. Bestehende Safe-Area- und VisualViewport-Logik erhalten. |
| UI-11 | Mittel | Im hellen Foyer erreicht die Paarung `tinte` auf `wolfram` nur 3,070:1; `SegmentedControl` verwendet sie direkt. `Chip` und `btnStyle` haben bereits eine Kontrastberechnung. | `tokens.js`, `ui.jsx:SegmentedControl` | Gemeinsame Farbe für aktive Controls; vorhandene `kontrastFarbe()` konsequent verwenden. |
| UI-12 | Mittel | Karten und Controls haben mehrere Padding-, Radius- und Schattenkonventionen; teils zeigt eine ganze Karte Handcursor, obwohl einzelne innere Controls separat handeln. | `FilmCard.jsx`, `MustWatchListe.jsx`, `StreamingTab.jsx`, `index.css` | Ein Kartenrahmen mit klar benanntem Hauptklickziel und stabiler Aktionsposition; semantische Buttons/Links für Tastatur. |
| UI-13 | Niedrig | Leere Module wirken wie Fehlermeldungen ohne nächsten Schritt. Der sichtbare Ticker in „Zuletzt hinzugefügt“ ist eine Zahl ohne offensichtlichen Nutzen für den Leser. | Screenshot; `StartTab.jsx` | Kurze Einladung mit passender Aktion; bei neuen Einträgen verständliche Zeitangabe statt interner Reihenfolgenzahl. Chronologieregeln erhalten. |
| UI-14 | Niedrig | „Settings“, „Pinboard“, „Must-Watch“, „Für später merken“ und „Merken“ bilden keine durchgängige Begriffswahl. Icons mischen Raute, SVG-Pin, Stern und Textzeichen. | Navigation, Start, Kino, Streaming, Mediathek | Kleines verbindliches Glossar und Iconset. Terminpin, Titelpin, Must-Watch und Gesehen müssen fachlich unterscheidbar bleiben. |
| UI-15 | Niedrig | Dokumentation und Styles tragen veraltete Designaussagen: Fraunces sei nur für Eggs; `setzeTheme` kenne keine Root-Variablen; der Max-Einstieg sei verfügbar. | `index.css`, `tokens.js`, `FUNKTIONSBERICHT.md` gegenüber aktueller Verdrahtung | Ein aktueller Designvertrag als Quelle; veraltete Kommentare gezielt korrigieren. Keine Archivlöschung aus dieser Feststellung ableiten. |

Die Kontrastwerte sind aus den sRGB-Hexfarben berechnet, ohne Antialiasing. Für gewöhnlichen Text ist 4,5:1 der WCAG-AA-Mindestkontrast. Gold kann als dekorativer Marker bleiben; bei bedeutungstragendem Text reicht ein angenehmer Farbeindruck allein nicht. Quellen: [W3C Kontrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

## Gestaltungsvorschlag: „Saal & Leinwand“, verbindlich angewendet

### Schriftrollen

Alle vier vorhandenen Familien sind lokal eingebunden und besitzen OFL-Lizenzdateien. Ein neuer Fontdownload ist für diese Richtung unnötig.

| Rolle | Familie | Mobile Richtgröße | Regel |
| --- | --- | --- | --- |
| Bereichstitel | Fraunces 900 | 36–40 px | Einmal pro Bereich; gleiche Größe und Abstände auf Start/Kino/Streaming. |
| Film-/Serientitel | Barlow Condensed 600–700 | 20–22 px, Zeilenhöhe 1,15–1,25 | Gleich auf allen Karten; in der Studie gemischte Schreibweise. Versalien als vergleichbare Variante. |
| Sektionsüberschrift | Barlow Condensed 600 | 20 px | Kurze Überschrift; untergeordneter Bereichslink in derselben Zeile, mobil umbrechbar. |
| Fließtext | Space Grotesk 400 | 15–16 px, Zeilenhöhe 1,5 | Lesbar auch auf schmalen Screens; keine Monospace-Absätze. |
| Controls | Space Grotesk 500–600 | 14–16 px | Einheitliche Buttons, Umschalter und Formfelder. |
| Metadaten/Badges | Space Grotesk 400–500 | 12–13 px | Lesbarkeit vor dekorativer Sperrung; Anbieter dürfen umbrechen. |
| Datum/Uhrzeit/kleiner Kicker | Space Mono 400 | 12 px | Gezielter Akzent für kurze Angaben; keine Mini-Alphabetskala. |

Die mobile Vorlage und die Desktopvariante teilen Rollen; sie werden nicht auf dieselbe Inhaltsdichte gezwungen. Keine feste Kartenhöhe für variable Titel. Die Einstellung Klein/Normal/Groß multipliziert dieselben Rollen. 200-Prozent-Textvergrößerung und 320-CSS-Pixel-Reflow gehören in die spätere Gesamtprüfung.

### Abstände und Elemente

- Skala: **4 / 8 / 12 / 16 / 24 / 32 px**. 16 px Karteninnenraum, 12 px zwischen verwandten Inhalten, 24–32 px zwischen Abschnitten; mobiler Seitenrand 16–20 px.
- Kartenradius 12 px, Controls 8 px, kompakte Statusmarken 4–6 px. Runde Formen für echte Chips oder Iconflächen gezielt verwenden.
- Genau eine optisch starke Aktion pro Gruppe. Gold zeigt Auswahl, Hauptaktion oder einen kleinen Markenakzent. Anbieterinformationen bekommen eine ruhigere Fläche als Hauptbuttons.
- Ein Kartenvertrag: Titel → Jahr/Art → Verfügbarkeit bzw. Termin → Bewertung, falls vorhanden → Aktionen. Unbewertete Katalogtitel bekommen keine erfundene Bewertung und kein Bewertungsdreieck.
- Kontur, Hover, Fokus, aktiv, deaktiviert und Ladezustand zusammen gestalten. Touchflächen als Produktziel mindestens 44 × 44 px; das ist eine Gestaltungsentscheidung, keine Behauptung über das WCAG-AA-Minimum.
- Ticketperforation und Leuchtpunkte an wenigen wiederkehrenden Stellen. Trennlinie, Punktreihe, Rahmen, Schatten und Badge müssen nicht gleichzeitig Aufmerksamkeit verlangen.
- Dunkler Saal und helles Foyer teilen Flächenrollen. `onCanvasMuted` und `onCardMuted` sollen unterschiedliche Tokens sein; fachliche Farben des Dreiecks bleiben erhalten, Textwerte bekommen zusätzlich ausreichenden Kontrast.

## Vollständiges Easteregg-Inventar des aktuellen Codes

| Element | Aktueller Status / Auslösung | Gestaltung und Grenzen | Maßgebliche Dateien |
| --- | --- | --- | --- |
| Saal / Foyer | Regulär in Darstellung wählbar | Dunkler Saal mit Papierkarten; helles Foyer mit dunklen Karten | `tokens.js`, `DatenTab.jsx` |
| Showa | Implementiert und aus gespeicherter Moduswahl ladbar. Der frühere Max-Einstieg ist aktuell entfernt. | Schwarzweiß-Filmpapier, Tokio-Miniatur, Kaiju, Filmkorn; eigene optische Welt | `ModusOverlay.jsx`, `index.css`, `tokens.js`, `App.jsx` |
| Neon Noir | Implementiert und aus gespeicherter Moduswahl ladbar. Kein aktueller Einstieg über Max. | Dunkles Nachtblau, Stadt/Regen, warmes Interface-Gold | `NeonNoirOverlay.jsx`, `styles/neon-noir.css`, `tokens.js` |
| Deep Space Horror | Aktiv verdrahtet. Achievement ab vier unterschiedlichen Referenzwerken; Eintritt nur innerhalb Neon Noir. 1:10 beim berechtigten Eintritt, drei Kalendertage nach Fehlwurf, fünf nach Treffer, Halloween-Sonderversuch, maximal ein Versuch pro Tag/Profil. | Flüchtiger Korridor bzw. mobiler Wartungsschacht, Dampf, Lichtaussetzer, Funken, Warnleuchte; kein Wesen. Nur Neon Noir wird als Modus gespeichert. Reduzierte Bewegung hat eine statische Variante. | `deepSpaceHorror.js`, `useDeepSpaceHorror.js`, `DeepSpaceHorrorOverlay.jsx`, `styles/deep-space-horror.css` |
| Cage-Alphabet | Aktiv. Schwelle fünf passende Mediathek-Einträge aus der Referenzliste; 1:30 Tageschance beim Appstart, höchstens einmal täglich. | Goldene Karte; Buchstabenfolge; Ergebnis aus passenden aktuell verfügbaren Titeln. Escape/Fokusbehandlung und Reduced-Motion-Pfad vorhanden. | `eastereggs_config.json`, `eggs.js`, `eggFrequenz.js`, `useEggController.js`, `CageAlphabet.jsx` |
| Choose Life / Teppich | Pausiert, nicht im normalen App-Pfad erreichbar. Konfiguration/Komponente vorhanden. | Schwelle drei Referenzeinträge; vorbereitete Scrollauslösung mit 1:10 Tageschance. Das beschreibt die Bibliothek, keine aktive Funktion. | `modus.js`, `eastereggs_config.json`, `eggFrequenz.js`, `Teppich.jsx` |
| Star-Wars-Crawl / 4. Mai | Pausiert. Datumslogik und Szene vorhanden. | Vorbereiteter Galaxis-Modus/Crawl; kein aktiver saisonaler Startpfad | `modus.js`, `momentEggs.js`, `Crawl.jsx`, `index.css` |
| Klaatu → Necronomicon | Pausiert. Tolerante Sprucherkennung vorhanden. | Zwei passende Wörter in kurzer Eingabe; Buch-/Randinszenierung | `modus.js`, `momentEggs.js`, `NecronomiconRand.jsx` |
| Kurosawa / Grindhouse / NERV | Alte Modi werden migriert: Kurosawa/Grindhouse zu Standard, NERV zu Neon Noir. | Kompatibilität alter Einstellungen, keine zusätzlichen aktuellen auswählbaren Themes | `App.jsx` |

**Dokumentationsabweichung:** `FUNKTIONSBERICHT.md` 12.16 beschreibt noch den versteckten Modusknopf hinter Max. Der aktuelle `DatenTab.jsx` rendert Max als gewöhnlichen Span; `private_release_settings_surface_test.mjs` verlangt ausdrücklich keinen versteckten Modus-Touchpunkt. Die alte Beschreibung ist keine Erlaubnis, diesen Zugang automatisch wieder einzubauen.

**Gestaltungsentscheidung für Eggs:** Geheimnis und Atmosphäre behalten. Gemeinsam bleiben lesbare Größen, Positionen der Hauptaktionen, Kartenabstände und die Bedeutung von Farben/Icons. Derzeit überschreibt Deep Space viele Hauptbereichsbuttons und Karten global mit `!important`; eine neue gemeinsame Komponente muss in diesen Kontexten bewusst geprüft werden. Das ist ein konkretes Integrationsrisiko, noch kein belegter neuer Fehler in jedem Effektzustand.

Die Bühne darf anders aussehen; die Bedienung soll vertraut bleiben. Reduced Motion, sauberes Schließen, Fokus-Rückgabe, kein Verdecken von Formularen und kein Anspringen während einer kritischen Eingabe sind die Abnahmepunkte. Die vorhandenen Zufalls-/Freischaltregeln werden im ersten Designfix nicht verändert. Zum Umgang mit abschaltbarer Interaktionsanimation: [W3C Animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Ergebnisregister für diesen Designpfad

| Ergebnis | Inhalt | Stand dieses Audits |
| --- | --- | --- |
| D1 — Lesbare Must-Watch-Vorschau | Screenshot-Overflow korrigieren, vollständige Titel/Anbieter, große Schrift, Navigation | DONE lokal: Produktcommit `46bba9a806349c9f70c9fce75998246032fa210b`, vollständiger lokaler Abschluss grün |
| D2 — Einheitliche lesbare Typografie | Rollen, Kontraste, Schriftfaktor | Befunde und Vorschlag vollständig dokumentiert; Gesamtumsetzung offen |
| D3 — Wiedererkennbare Karten und Controls | Start/Kino/Streaming, Filter, Pinaktionen, Zustände | Befunde und interaktive Designrichtung vorbereitet; Gesamtumsetzung offen |
| D4 — Klare mobile Prioritäten | Wochenplan, Sektionen, Suche, leere Zustände | Vorschlag; Verdichtung des Wochenplans noch zu entscheiden |
| D5 — Durchgängige Bedienbarkeit | Tastatur, Zoom, Umbruch, Touchflächen, Themes | Lokaler Basisvergleich vorhanden; vollständige praktische Abnahme offen |
| D6 — Bewusste Easteregg-Integration | Bestand, erreichbare Trigger, Bewegungs-/Layoutgrenzen | Inventar abgeschlossen; Triggerreaktivierung und Effektpolitur offen |

Empfohlene Reihenfolge: D1 abschließen → D2 und die gemeinsamen Bausteine von D3 → Start/Kino/Streaming gemeinsam angleichen → übrige Tabs und D4 → D5/D6 auf dem Gesamtkandidaten. Die Film-, Katalog-, Ranking-, Tagesauswahl- und Pinverträge werden dabei beibehalten.

Dies ist eine lokale Audit- und Gestaltungsgrundlage. Ein lokaler Build oder Mocknachweis belegt keinen Push, CI-Lauf, Deploy oder installierte iPhone-PWA-Abnahme.

## Abgeschlossener erster Fix

Produktcommit `46bba9a806349c9f70c9fce75998246032fa210b` auf `codex/design-ci-audit-20260907`:

- Ausschließlich Must-Watch-Markup in `src/tabs/StartTab.jsx`, zwölf zugehörige CSS-Zeilen und eine Browserregression.
- Rang/Titel getrennt von der vollständigen umbrechenden Anbieterzeile; Schriftfaktor berücksichtigt. Zeilenbuttons, Navigation, Tagesauswahl und Verfügbarkeitsprojektion unverändert.
- Browserregression 10/10 grün: Chromium und WebKit, ausgewählte Kombinationen aus 320/393/430 px, hell/dunkel und normal/groß. Prüft tatsächliche Textgrenzen, Überlagerungen, komplette Anbieternamen, Tastaturnavigation und konkreten Sprung zum Mediathekseintrag.
- Must-Watch-Tests 65/65, Controller-Tests 82/82; vollständiges `npm test` Exit 0 einschließlich Single-File-/Web-Build und Pages-Prüfung 72/72.
- Screenshot: `/private/tmp/kd-design-ci-audit-evidence/mustwatch-webkit-dunkel-gross-393.png`. Logs: `mustwatch-browser-test.log`, `mustwatch-npm-test.log` im selben Ordner.

Die separate interaktive Studie vergleicht Start, Kino und Streaming mit derselben Typografie/Kartensprache und synthetischen Beispielen. Sie illustriert zusätzlich eine kompaktere Wochenansicht, ruhigere Anbieterlabels und den gemeinsamen Suchrahmen. Diese größeren Entwurfsänderungen sind **noch nicht in der App umgesetzt**. Die Studie zeigt zur Erklärung drei Must-Watch-Zeilen; die App behält ihre fünf täglichen Einträge.

Lieferstand: **gebaut / lokal getestet / committed**. **Nicht gepusht**, kein neuer Remote-CI-Lauf oder Deploy; physische iPhone-Abnahme **NICHT BELEGT**.
