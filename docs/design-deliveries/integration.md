# Integrierter Designstand vom 7. September 2026

Die freigegebene Kinoästhetik ist im Zweig `codex/design-ci-audit-20260907` umgesetzt. Produktstand: `9e9465b52489090b1a2f1d0eddd1432afcd0873e`, Ausgangsbasis: `98b5eca18d15f0a4ec8bed52b1d952c7cc8ec383`. Nach dem Produktcommit wurden ausschließlich Tests und diese Abschlussdokumentation präzisiert.

## Gelieferte Oberfläche

- Start, Kino, Streaming und Mediathek teilen Schrift-, Karten-, Metadaten-, Filter- und Controlrollen. Must-Watch behält fünf vollständige Einträge; Anbieter verdrängen keine Titel mehr. Die Woche zeigt eine lokale Tagesauswahl mit „Ganze Woche“; ab 372px stehen die sieben Tagesbuttons in einer Zeile.
- Entdecken, Blog, Finder, Settings, Formulare, Konto, Hilfe, Wiederherstellungs- und Fehlerflächen verwenden die gemeinsamen Bausteine und gezielte Bereichsstile. Feste kleine Overrides der gemeinsamen Button-/Inputschriften wurden entfernt.
- Die Suche hat einen ruhigen Rahmen und SVG-Symbole. Ergebnisaktionen bleiben lesbar und erreichbar. Der direkte VisualViewport-Anker, referenzgezählter Scrolllock und richtungsabhängige Wischschutz sind im Produkt unverändert.
- Vier falsche `--saal-hoch`-Referenzen wurden auf die tatsächlich vorhandene Themevariable korrigiert. Dadurch verwenden auch die Kino-/Streamingfilter im hellen Foyer die richtige Fläche. Geschlossene Selects und Streamingregler haben eine einheitliche CSS-Darstellung; native Auswahl- und Tastaturfunktionen bleiben erhalten.
- Eastereggs erhielten ausschließlich gemeinsame lokale Font-/Controlrollen. Trigger, Wahrscheinlichkeiten, Pausen, Effekte und Animationen wurden nicht verändert.

Die schmale `!important`-Ausnahme in der Foundation betrifft nur fünf Chevron-/Padding-Longhands nativer Selects, die gegen vorhandene Inline-Shorthands bestehen müssen. Schrift- und Buttonrollen erhalten keine solche pauschale Übersteuerung; der Foundationtest prüft diese Grenze.

## Architektur und vollständiger Bestand

Alle bisherigen 469 erfassten Controldefinitionen und 576 Ereignisbindungen sind erhalten. Der AST-Vergleich der Link-, Form-, Handler- und ARIA-Verträge zeigt nur zwei neue lokale Darstellungscontrols in der Woche. Services, Controller, Datenmodell, Ranking, Persistenz, Supabase, Workflows, Service Worker sowie `visualViewport.js` und `documentScrollLock.js` sind unverändert. Innerhalb von `src/lib` wurde ausschließlich `tokens.js` für die Darstellung angepasst. Es gibt keine neuen Abhängigkeiten.

## Lokale Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Vollständiges `npm test` auf Produktstand `9e9465b` | Exit 0, einschließlich Einzeldatei-/Web-Build und Pages-Prüfung 72/72 |
| Vollständige private Browsersuite | 54/54, Chromium und WebKit; synthetisches Konto und abgefangene App-Anfragen |
| Zusätzlich isolierte PWA-Szenarien | 4/4: große Schrift, VV260, direkter −8px-Anker, Hintergrund-/Mehrfingergesten, Ergebnisränder, Scrollrestore, Schließen, Treffer-/Menüübergabe, Rotation und Zoom |
| Visuelle Bestandsaufnahme | 36 Ansichten bei 320/393/430px, Dunkel/Hell und Normal/Groß; kein horizontaler Seitenüberlauf; alle gemessenen sichtbaren Buttons mindestens 44px und Eingabeschriften mindestens 16px |
| Umbruchgrenzen | Start bei 320/360/361/371/372/393/430/1024px; Login bei 320/393px ohne Seitenüberlauf |
| Foundation / Nebenansichten / Shell | Gemeinsame Rollen und Scopegrenzen grün; Foundation 8, Shell 21 Verträge |
| Eingebettete Fonts | Alle 14 WOFF2-Faces bytegenau im HTML; alle laden in beiden Browserengines ohne externe Font-Anfrage |

Der zuerst kombinierte PWA-Test hatte zwischen unabhängigen Navigations-, Menü- und Rotationsszenarien einen künstlichen Viewport/Fokuszustand weitergetragen. Die finale Prüfung trennt diese Szenarien, verwendet die native Pointer→Fokus-Reihenfolge und wartet auf den tatsächlichen Anker. Keine Produktmechanik wurde dafür umgebaut.

Der Fontnachweis öffnet die Einzeldatei in Chromium mit Offline-Emulation. Im WebKit-Testbrowser wurde dasselbe HTML byteidentisch als abgefangene Hauptantwort geladen; alle übrigen HTTP(S)-Anfragen waren gesperrt. Dessen Offline-Emulation hatte zuvor selbst die Hauptnavigation mit einem internen Browserfehler abgewiesen. Das belegt die Fonts, nicht eine physische Safari-Datei- oder iPhone-PWA-Abnahme.

Zwei optionale externe Beta-Datenchecks im Standardlauf waren ausdrücklich übersprungen; siehe F07. Reale Konten/Provider, VoiceOver und installierte iPhone-PWA wurden nicht geprüft. Die bekannten funktionalen Punkte stehen in [der Feedbackliste](../DESIGN_FEEDBACK_2026-09-07.md), insbesondere die noch fehlende Tastatur-Detailaktion einiger Bestandskarten (F06).

## Artefakt und Belege

Einzeldatei: `dist-single/Kinodreieck.html`, **1.762.876 Bytes**. SHA-256: `2c443a4fe6307db628bca3f300d8794fd439dd9a5f9a7e9f15093a22424c9be8`.

Eine identische Benutzerkopie liegt unter `/Users/max/.codex/visualizations/2026/09/07/01a07c99-0ac5-78e2-a3f3-30080477cb81/Kinodreieck-design-2026-09-07.html`.

Lokale Rohbelege: `/private/tmp/kd-design-ci-audit-evidence/` mit `final-npm-test.log`, `final-browser-pass.log`, `pwa-isolated.log`, `final-design-survey.json`, `boundaries.json`, `final-offline-fonts.json`, `ui-contract-diff-final.json` und den Browserbildern.

Die drei Terra/high-Pakete wurden auf derselben Foundation gebaut, vom koordinierenden Designreview korrigiert und lokal integriert. Es gab keinen Push, Remote-CI-Lauf oder Deploy. Der primäre Checkout wurde durch diesen Designauftrag nicht verändert; dort inzwischen vorhandene fremde Arbeitsdateien wurden weder aufgenommen noch zurückgesetzt.
