# R3/R4 – kompakte Einstellungen

Paketbasis: `46a2a2c631bf47d5bcfe4d530dbc17131b614a66`.

Die Einstellungsbereiche verwenden wieder schlichte, durch Linien getrennte
native `details`-Köpfe. Ein eigener CSS-Chevron zeigt den Zustand; die
vorhandenen Startzustände, IDs, Tour-Anker und die Browsersteuerung bleiben
unverändert. Geöffnete Inhalte behalten ihre ruhigen dunklen Innenflächen.

Die Prozent-Flexbasis der Einstellzeilen wurde entfernt. Sie wurde durch die
mobile `flex-direction: column` als Höhenbasis interpretiert und ließ besonders
die Schriftgrößenwahl beim Umschalten wachsen und als 2+1 umbrechen. Erscheinung
und KI verwenden nun zwei, die Schriftgrößenwahl drei gleich breite
Gridspalten. Alle Controls behalten eine natürliche Höhe von 44 px; Textbuttons
skalieren weiter mit dem vorhandenen Schriftfaktor und Eingaben bleiben bei
mindestens 16 px.

## Fokussierter Nachweis

```sh
npx playwright test \
  --config=/private/tmp/kd-design-settings-playwright.config.mjs
```

Das synthetische Private-v1-Fixture prüft Chromium und WebKit bei 320×760 und
393×852. Es führt den echten Wechsel Klein → Normal → Groß → Klein → Normal
durch, vergleicht die wiederholten Geometrien bytefrei über DOM-Messwerte,
prüft zwei bzw. drei gleich breite Spalten, 44px-Höhen, Hell/Dunkel, native
Klappzustände, CSS-Chevrons, die vier lokalen Schriftfamilien, skalierte
14px-Control-/15px-Abschnittsschriften, mindestens 16px Eingabeschrift,
fehlenden Seitenüberlauf und den Netzschutz des Fixtures. Live-APIs und
Anbieter wurden nicht aufgerufen. Der temporäre Playwright-Override startet
Vite auf Port 4492 mit dem ebenfalls temporären Config-Override
`/private/tmp/kd-design-settings-vite.config.mjs`; dessen `cacheDir` ist exklusiv
`/private/tmp/kd-design-settings-vite-cache-4492`. Die Produkt-Viteconfig blieb
unverändert.
