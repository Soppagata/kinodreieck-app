# R5 – Kompaktes Rechtshänder-Menü

Basis: `46a2a2c631bf47d5bcfe4d530dbc17131b614a66`.

Das mobile Menü ist ein unten rechts verankertes, maximal 340px breites
Paneel. Es nutzt sechs gleichwertige Flächen in zwei Spalten: Start/Kino,
Mediathek/Streaming und Entdecken/Settings. Jede Fläche zeigt ein lokales
Inline-SVG; der aktive Bereich bleibt ruhig und erhält nur einen Goldmarker.
Die offene Sicherung am Settings-Eintrag bleibt erhalten.

Die Fußzeile liegt innerhalb des Paneels: links schließt `Navigation schließen`
das bestehende Menü, rechts löst `Nach oben` den unveränderten App-Handler aus.
Der Scrim behält seinen eindeutigen Namen `Menü schließen`. Portal, Escape,
Tab-Fokusfalle, Scrolllock, Fokusrückgabe, Navigation und `aria-current` wurden
nicht umgebaut. Das separate `ZurueckObenKnopf`-Element bleibt unverändert.

Fokussierter Browsernachweis mit der bestehenden synthetischen Private-v1-Fixture:

```sh
npx playwright test --config=/private/tmp/kd-design-refinement-menu-playwright.config.mjs \
  --grep 'kompaktes|Menu actions'
```

Der temporäre lokale Playwright-Override startet Vite mit
`/private/tmp/kd-design-refinement-menu-vite.config.mjs`; dieser übernimmt die
unveränderte Produktkonfiguration und setzt ausschließlich den isolierten
Cachepfad `/private/tmp/kd-design-refinement-menu-vite-cache-4493`.

Der Test läuft in Chromium und WebKit bei 320×560, 393×852, 430×932 und
760×430 (quer). Er prüft alle sechs Bereiche, SVGs, aktive Fläche, beide
Schließen-Wege, Escape, Fokusfalle, Mindesttouchflächen, Nach-oben über den
echten App-Handler sowie fehlende Seitenüberbreite. Die erzeugten Screenshots
belegen die dunklen 320/393/430/760-Zustände und einen echten hellen
430-Zustand. Sie sind Browser-Simulation; eine physische iPhone-PWA-Abnahme
ist damit nicht belegt.
