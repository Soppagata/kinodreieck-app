# D4–D6 – Shell, Suche und Bedienflächen

Paketbasis: `36772f32c2f170e199c803d551f80eda86d897d8`.

Die mobile Shell nutzt einen gemeinsamen 12px-Suchrahmen mit ruhiger erhöhter
Saalfläche. Die Eingabe hat keinen zweiten Dauerrahmen; Suche und Menü bleiben
je 44px groß. Die Suche verwendet die vorhandenen Inline-SVGs für Suche und
Schließen. Ergebnisse zeigen Bereich, vollständigen Titel und Metadaten in
einem intern scrollbaren Feld mit sticky Kopf und eigener 44px-Schließaktion.

Die bestehende Folge `idle → focus-pending → keyboard-open` wurde nicht
verändert. Insbesondere bleiben VisualViewport-Anker, native Pointer-zu-Fokus-
Reihenfolge, referenzgezählte Scrollsperre, Ergebnis-Scrollrichtung und freie
Mehrfinger-Gesten in `GlobalSearchBar` bestehen. Die Styles enthalten keine
Transition für Viewport-Anker, `top`, `bottom`, `transform` oder Größenwerte.

Die gemeinsame Fixture `tests/private-v1/fixtures.mjs` bleibt unverändert. Die
Viewport-Doppelung lebt ausschließlich in `design-search-shell.spec.mjs` als
lokale `test.extend`-Fixture: Nach dem Init-Script lädt sie die vorhandene
private App neu, damit `GlobalSearchBar` den Harness beim Mount abonniert.

## Abdeckung

- `App.jsx`: vorhandener Kopf und Desktopnavigation erhalten eine eng
  gekapselte Shell-Darstellung; kein State, Controller oder Datenpfad geändert.
- `AppNavigation.jsx`, `GlobalSearchBar.jsx`, `ZurueckObenKnopf.jsx`: vollständiges
  mobiles Menü, 44px-Bedienflächen, ruhige Suche und SVG-Suche/Schließen.
- `EinstiegsGate.jsx`, `KontoBereich.jsx`, `KontoUebernahme.jsx`,
  `KatalogZugang.jsx`: Eingaben, Kontoflächen und Programmdaten-Dialog folgen
  den Foundation-Radien, Mindestgrößen und sicheren Scrollflächen. Bestehende
  Textbuttons nach `btnStyle` haben keine festen 12/13px-Overrides mehr und
  übernehmen damit die skalierbare 14px-Control-Rolle.
- `InstallationCard.jsx`, `AppUpdateHinweis.jsx`, `AppErrorBoundary.jsx`,
  `GlobalErrorQueue.jsx`, `LocalDataSafety.jsx`, `Erklaerstuecke.jsx`,
  `FeldHinweis.jsx`, `FilmBatchLoeschDialog.jsx`, `SyncStatusChip.jsx`:
  bestehende Hinweise, Hilfen, Fehler, Sicherheits- und Löschdialoge werden
  durch die P3-spezifische Schicht lesbar, fokussierbar und mit 44px-Aktionen
  gehalten.
- `CageAlphabet.jsx`, `DeepSpaceHorrorOverlay.jsx`, `NecronomiconRand.jsx`,
  `Crawl.jsx`, `Teppich.jsx`, `ModusOverlay.jsx`, `NeonNoirOverlay.jsx`:
  geprüft, aber gemäß Delta-Auftrag nicht kreativ oder funktional verändert.
  Necronomicon-Glyphen, Kapitel und Siegel verwenden nur Fraunces 900 normal;
  der Lesetext und Teppich-Kicker verwenden Fraunces 400 italic. Der
  Necronomicon-Schließenknopf ist 46px und die bestehenden Cage-/Teppich-
  Schließenaktionen folgen bereits den 44px-Controls. Trigger, Pausen, Fokus,
  Persistenz und Animationen bleiben unverändert.

## Fokussierte Nachweise

```sh
node design_shell_test.mjs
node visual_viewport_test.mjs
KD_PRIVATE_V1_TEST_PORT=4499 KD_VITE_CACHE_DIR=/private/tmp/kd-design-shell-vite-cache-4499 \
  npx playwright test --config=playwright.private-v1.config.mjs tests/private-v1/design-search-shell.spec.mjs
```

Die private Browserfixture prüft Chromium und WebKit bei 320×640, 393×852 und
430×932; 393px enthält zusätzlich den großen Schriftmodus. Die lokale
VisualViewport-Simulation belegt den nativen Fokus vor Keyboard-Öffnung, das
verspätete Viewport-Ereignis, den direkten `-8px`-Anker nach einer
`offsetTop`-Änderung, VV260 mit sichtbarer Schließenaktion, Scrollstand nach
Keyboardschluss sowie Rotation und Zoom-Cleanup.

Die Touch-Prüfung löst echte cancelable `touchstart`/`touchmove`-Events gegen
die montierte Suche aus: eine Fingerbewegung am Hintergrund wird während des
Keyboardzustands verhindert, zwei Finger bleiben frei. In der Ergebnisliste
ist der Weg in die Liste frei; oberes und unteres Ende sperren das
Edge-Chaining. Schließen stellt den Fokus zur Suche zurück und hält die
Sperre, ein Treffer- oder Menü-Handoff hebt sie wieder auf.

Der Test legt `p3-search-dark-vv260.png`, `p3-shell-hell.png` und
`p3-login.png` im jeweiligen Playwright-Testresultat ab. Visuell geprüft
werden der dunkle Suchtreffer bei VV260, die helle reguläre Shell und das
Login bei 393×852. `kd-doku-hilfe` trifft die echte Hilfe-Wurzel in
`Erklaerstuecke.jsx`; `kd-film-batch-dialog` die echte Dialog-Wurzel in
`FilmBatchLoeschDialog.jsx`. Die übrigen P3-Dialogflächen wurden über ihre
eigenen Klassen und Quell-Styles auf Radius, 44px-Aktionen und Scrollgrenzen
geprüft. Das sind simulierte Browsernachweise; eine physische iPhone-PWA-
Abnahme ist damit nicht belegt.

## Feedbackliste

Keine Funktionsabweichung im P3-Scope festgestellt. Der Einstiegsdialog nutzt
absichtlich weiterhin die dunkle Saalfläche, auch wenn die nachfolgende Shell
hell eingestellt ist; die helle Darstellung ist für die reguläre App-Shell
belegt. Die separate kreative Ausgestaltung der Eastereggs bleibt bewusst für
spätere Einzelchats offen.
