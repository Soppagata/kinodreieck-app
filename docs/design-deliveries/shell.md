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

## Abdeckung

- `App.jsx`: vorhandener Kopf und Desktopnavigation erhalten eine eng
  gekapselte Shell-Darstellung; kein State, Controller oder Datenpfad geändert.
- `AppNavigation.jsx`, `GlobalSearchBar.jsx`, `ZurueckObenKnopf.jsx`: vollständiges
  mobiles Menü, 44px-Bedienflächen, ruhige Suche und SVG-Suche/Schließen.
- `EinstiegsGate.jsx`, `KontoBereich.jsx`, `KontoUebernahme.jsx`,
  `KatalogZugang.jsx`: Eingaben, Kontoflächen und Programmdaten-Dialog folgen
  den Foundation-Radien, Mindestgrößen und sicheren Scrollflächen.
- `InstallationCard.jsx`, `AppUpdateHinweis.jsx`, `AppErrorBoundary.jsx`,
  `GlobalErrorQueue.jsx`, `LocalDataSafety.jsx`, `Erklaerstuecke.jsx`,
  `FeldHinweis.jsx`, `FilmBatchLoeschDialog.jsx`, `SyncStatusChip.jsx`:
  bestehende Hinweise, Hilfen, Fehler, Sicherheits- und Löschdialoge werden
  durch die P3-spezifische Schicht lesbar, fokussierbar und mit 44px-Aktionen
  gehalten.
- `CageAlphabet.jsx`, `DeepSpaceHorrorOverlay.jsx`, `NecronomiconRand.jsx`,
  `Crawl.jsx`, `Teppich.jsx`, `ModusOverlay.jsx`, `NeonNoirOverlay.jsx`:
  geprüft, aber gemäß Delta-Auftrag nicht kreativ oder funktional verändert.
  Trigger, Pausen, Fokus, Persistenz und Animationen bleiben unverändert.

## Fokussierte Nachweise

```sh
node design_shell_test.mjs
node visual_viewport_test.mjs
KD_PRIVATE_V1_TEST_PORT=4499 KD_VITE_CACHE_DIR=/private/tmp/kd-design-shell-vite-cache-4499 \
  npx playwright test --config=playwright.private-v1.config.mjs tests/private-v1/design-search-shell.spec.mjs
```

Die private Browserfixture prüft Chromium und WebKit bei 320×640, 393×852 und
430×932 sowie den verzögerten VisualViewport nach Fokus, Anker, Scrolllock,
Ergebnisgesten, Schließen/Fokus, Menü-Handoff, Rotation und Zoom. Das sind
simulierte Browsernachweise; eine physische iPhone-PWA-Abnahme ist damit nicht
belegt.

## Feedbackliste

Keine Funktionsabweichung im P3-Scope festgestellt. Die separate kreative
Ausgestaltung der Eastereggs bleibt bewusst für spätere Einzelchats offen.
