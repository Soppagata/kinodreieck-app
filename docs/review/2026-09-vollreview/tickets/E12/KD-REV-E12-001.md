# KD-REV-E12-001 · Radar-Vorschau schneidet Kopf und Schließen-Fläche im Zwischen-Breakpoint ab

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — im vorgesehenen Radar-Bestätigungsweg liegt bei 520 < Viewportbreite <= 760 CSS-Pixeln ein Teil des Vorschauhinweises und 7 Pixel der 44-Pixel-Schließen-Fläche oberhalb des Viewports. Ein vollständiger Funktionsausfall ist nicht belegt: Der sichtbare Teil der Schließen-Schaltfläche blieb im Test bedienbar.
- Finding: E12-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E12

## Fehler und Auswirkung

Die Portal-Vorschau für „Ins Radar aufnehmen“ ist für ein bereites Remotekonto ein regulärer Bestätigungsschritt vor der Radar-Änderung. Im Web/PWA bei 520 < Breite <= 760 CSS-Pixeln startet der Dialog 24 Pixel oberhalb des Viewports. Dadurch beginnen Vorschauhinweis und obere Kante des Schließen-Buttons außerhalb der sichtbaren Fläche; der Kopf selbst einschließlich H2 bleibt im gemessenen Zustand sichtbar.

Bestätigt ist dies für den eingefrorenen Quellstand in Chromium und WebKit mit Touchunterstützung und neutralem Zoom. Es gibt keinen Backend-, Datenverlust- oder Live-Häufigkeitsbefund. Die separate Manager-Safe-Area-Ausnahme gehört nicht zum betroffenen Dialog.

## Auslöser, Soll und Ist

**Auslöser.** Einen noch nicht abonnierten kanonischen Katalogtreffer über die globale Suche mit „Ins Radar aufnehmen“ öffnen, wenn der Radar-Client mit Remotekonto und Account-Cache-Autorität bereit ist. Betroffen sind beispielsweise `521x800`, `600x800`, `667x375` und `760x800`; weder defekte Daten noch eine geöffnete Bildschirmtastatur sind Voraussetzung.

**Soll.** Vorschauhinweis, Dialogkopf und die vollständige 44-Pixel-Schließen-Fläche liegen im sichtbaren Viewport. Die mobile Vollhöhen-Darstellung muss ihr äußeres Layer-Padding berücksichtigen.

**Ist.** In beiden Engines liegt der Dialog bei den betroffenen Breiten bei `y=-24`, Kopf und Schließen-Schaltfläche bei `y=-7`. Damit sind 37 der 44 Pixel der Schließen-Fläche sichtbar; der Vorschauhinweis beginnt bei `y=-4` (Chromium) bzw. `y=-2,495…` (WebKit). Autofokus auf die Schließen-Schaltfläche sowie Setzen des Dialog-Scrolls zurück auf `0` ändern diesen Versatz nicht.

## Ursache und Fundstellen

Die CSS-Kaskade widerspricht im Zwischenbereich der Vollhöhen-Regel:

- [`/private/tmp/kd-vollreview-20260916/source/src/index.css:449`](/private/tmp/kd-vollreview-20260916/source/src/index.css:449)–[`...:461`](/private/tmp/kd-vollreview-20260916/source/src/index.css:461) (`src/index.css:449-461` am Prüfcommit) setzt bis 760px den generischen Layer auf `align-items:flex-end; padding:0` und den Dialog auf `height/max-height:100dvh`.
- [`/private/tmp/kd-vollreview-20260916/source/src/main.jsx:3`](/private/tmp/kd-vollreview-20260916/source/src/main.jsx:3)–[`...:7`](/private/tmp/kd-vollreview-20260916/source/src/main.jsx:7) lädt `design-secondary.css` später. Dessen generische Regel setzt in [`/private/tmp/kd-vollreview-20260916/source/src/styles/design-secondary.css:126`](/private/tmp/kd-vollreview-20260916/source/src/styles/design-secondary.css:126) erneut 24px Layer-Padding. Die Rücknahme auf 0 erfolgt erst bei maximal 520px in [`.../design-secondary.css:253`](/private/tmp/kd-vollreview-20260916/source/src/styles/design-secondary.css:253)–[`...:255`](/private/tmp/kd-vollreview-20260916/source/src/styles/design-secondary.css:255).
- Der dadurch 100dvh hohe Dialog richtet sich an der um 24px eingerückten Unterkante aus und erhält `top=-24px`; Dialog-Padding von 16px plus oberem 1px-Rand ergeben `y=-7` für Kopf und Schließen-Fläche. Die Vorschau verwendet nur die generischen Klassen [`/private/tmp/kd-vollreview-20260916/source/src/components/RadarSubscriptionPreview.jsx:74`](/private/tmp/kd-vollreview-20260916/source/src/components/RadarSubscriptionPreview.jsx:74)–[`...:84`](/private/tmp/kd-vollreview-20260916/source/src/components/RadarSubscriptionPreview.jsx:84), nicht die Manager-Klassen. Deshalb greift die Manager-Ausnahme in [`.../design-secondary.css:269`](/private/tmp/kd-vollreview-20260916/source/src/styles/design-secondary.css:269)–[`...:275`](/private/tmp/kd-vollreview-20260916/source/src/styles/design-secondary.css:275) nicht.

Der reguläre Aufruf wird unter `src/App.jsx:2124-2126` gerendert; die Runtime-Capability ist in `src/config/runtime.js:82-97` begrenzt. Der Validator hat den Pfad `src/tabs/FinderTab.jsx:227 -> src/lib/entdeckenUi.js:176 -> src/App.jsx:1381 -> src/components/GlobalSearchBar.jsx:352 -> src/controllers/useEntdeckenRadarController.js:623 -> src/App.jsx:2124 -> src/components/RadarSubscriptionPreview.jsx:74` statisch verfolgt. Alle genannten repository-relativen Fundstellen beziehen sich auf `14804ce389d69114feed27b92fb11ac78423cc0e`; die verlinkten Originale liegen ausschließlich in der eingefrorenen Quelle unter `/private/tmp/kd-vollreview-20260916/source/`.

## Belege und Gegenproben

**Statische Beweiskette.** Der Validator prüfte Importreihenfolge, Breakpoints, CSS-Kaskade, Manager-Ausnahme und den regulären Aufrufpfad. Die 17 hierfür verwendeten Quelltexte sind bytegenau gegen den Prüfcommit belegt: [`/private/tmp/kd-vollreview-20260916/tests/E12-F001/validator/source-provenance.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E12-F001/validator/source-provenance.json) (`17/17` Treffer).

**Ausgeführte Reproduktion.** [`reproduce.mjs`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E12-F001/validator/reproduce.mjs) rendert die originale React-Komponente einschließlich Portal, Original-Fokus-/Scroll-Sperrlogik und aller sieben App-Stylesheets in einem isolierten lokalen Harness mit synthetischen gültigen Props und Mock-Callbacks. Der Lauf endete mit Exit 0, maß acht Breiten in Chromium und WebKit (16 Szenarien) und erzeugte die vollständigen Messwerte in [`results.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E12-F001/validator/results.json). Es gab keine externen Requests und keine Browser-JavaScriptfehler. Die visuelle Gegenprobe liegt u.a. in [`webkit-667x375.png`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E12-F001/validator/webkit-667x375.png).

**Kontrollen und Grenzen.** Bei `393x852` und `520x800` liegt der Dialog bei `y=0`; bei `761x800` und `1280x900` ist der Desktopdialog vollständig im Viewport. Das Setzen des Scrolls zurück auf 0 erhielt im Zwischenbereich `y=-24`. Nur im Harness verschob eine zuletzt eingefügte `padding:0`-Regel den Dialog auf `y=0` und den Kopf/Schließen-Button auf `y=17`; Produktdateien wurden dabei nicht verändert. Der sichtbare Teil des Schließen-Buttons war in allen 16 Szenarien per Touch nutzbar (`partialCloseTapWorks=true`); ein vollständig unerreichbarer Button oder blockierter Dialog ist daher ausdrücklich **nicht** bestätigt. Abbrechen, Escape und Scrim bleiben weitere Schließwege im Code.

Vorhandene JSDOM- und CSS-String-Tests belegen Text/Bestätigung beziehungsweise Regeltexte, aber keine reale Layoutmessung im betroffenen Breitenbereich. Dies ist ein Produktfehler im eingefrorenen CSS-Verhalten, kein Fehler der Testwerkzeuge. Eine physische iPhone-/PWA-Abnahme, ein Live-Deployment-Check und eine dynamische Voll-App-Anmeldung wurden nicht ausgeführt; das sind Betriebs- bzw. Abnahmebeleglücken, keine Widerlegung des lokal bestätigten Befunds.

## Korrekturziel und Abnahme

Die Korrektur soll die generische Layer-Padding-Kaskade und den bis 760px geltenden Vollhöhen-Dialog konsistent machen, ohne Radar-Daten, Providerpfade, Accountgates oder die Manager-Safe-Area-Ausnahme umzubauen. Ob dies über eine engere spätere Padding-Regel oder eine konsistente Höhenberechnung geschieht, bleibt der Implementierung vorbehalten.

- Mit der originalen Radar-Vorschau und finaler CSS-Importreihenfolge liegen bei `521x800`, `600x800`, `667x375` und `760x800` Dialog, Vorschauhinweis, Dialogkopf und die gesamte 44-Pixel-Schließen-Fläche innerhalb des Viewports.
- Nach dem originalen Autofokus und bei `scrollTop=0` sind die Elemente unmittelbar sichtbar; kein Fokus- oder Scroll-Trick ist nötig.
- `393x852` und `520x800` behalten die funktionierende mobile Darstellung; `761x800` und `1280x900` behalten den zentrierten Desktopdialog.
- Touch-Schließen, Abbrechen und Keyboard-Escape funktionieren weiterhin. Die Manager-Safe-Area-Ausnahme bleibt unverändert wirksam.
- Mindestens Chromium und WebKit decken die Grenzbreiten ab. Eine physische iPhone-/PWA-Safe-Area-Prüfung ist zusätzlich erforderlich, falls eine entsprechende Geräteabnahme behauptet werden soll.

## Abhängigkeiten und offene Punkte

- Keine Code-Abhängigkeit zu Backend, Radar-Daten, Provideraufrufen oder SQL-Migrationen festgestellt.
- Der Befund gilt für den Prüfcommit, nicht als Aussage über eine aktuelle öffentliche Auslieferung, aktive Accounts oder Featureflags.
- Nicht geprüft: Safari-Browserchrom, Bildschirmtastatur, nicht-null `env(safe-area-inset-*)` im Harness und eine physische Swipe-Geste. Die Scrollgrenze wurde per DOM geprüft, Touch-Tap auf den sichtbaren Schließen-Bereich tatsächlich ausgeführt.
- Master-Abnahme ist bestätigt; sie wird nicht durch die erfolgreiche Fehlerreproduktion ersetzt.

## Herkunft und Master-Abnahme

- Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E12-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E12-F001.json), Status `confirmed`.
- Eingefrorenes Master-Proposal: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E12-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E12-F001.json).
- Autor: Terra/xhigh. Zuständiger Master: Astra/high. Master-Abnahme: **bestätigt**.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E12/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E12/KD-REV-E12-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
