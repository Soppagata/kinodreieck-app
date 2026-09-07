# D2 – gemeinsame Design-Foundation

Paketbasis: `7232fec6bdd523ccccbe117d27f41abaf7e52045`.

Diese Lieferung legt nur die gemeinsame Darstellung fest. Datenfluss,
Auth-/Boot-Reihenfolge, Services, Controller, Persistenz, Workflows und
Service Worker bleiben unverändert.

## Gefrorener Vertrag für die Folgewelle

- `src/styles/design-foundation.css` wird nach `index.css` und vor den drei
  reservierten Bereichsdateien geladen. Die Dateien `design-primary.css`,
  `design-secondary.css` und `design-shell.css` sind bewusst leer und gehören
  ihren späteren Write-Ownern.
- `THEMES` stellt zusätzlich `kartenText`, `kartenTextWeich`, `kartenAkzent`,
  `linie` und `wolframText` als semantische Rollen bereit. `kartenAkzent` ist
  der lesbare Goldton für Text auf einer Karte (dunkel: Papierkarte,
  hell: Dunkelkarte); `wolframText` ist der geprüfte Kontrasttext auf der
  jeweiligen Primäraktion. Bestehende Token und `setzeTheme()` bleiben
  kompatibel; die bestehenden dunkel/hell Kontrastpaare entsprechen dem
  freigegebenen Schema.
- `btnStyle(primary)`, `inputStyle` und `lightInput` behalten ihre Exporte und
  Aufrufart. Buttons und Eingaben erhalten 44px Mindesthöhe, Controlradius 8px
  und skalieren über `--kd-schriftfaktor`; Eingaben bleiben mindestens 16px.
- Die bestehenden Props von `Chip`, `SegmentedControl` und `Klappe` bleiben
  unverändert. Ihre gefrorenen Klassen sind `kd-chip`, `kd-chiprow`, `kd-seg`,
  `kd-seg-control`, `kd-klappe`, `kd-klappe-kopf`, `kd-klappe-inhalt`,
  `kd-klappe-status`, `kd-tag` und `kd-achse`.
- `Chip` und `SegmentedControl` bleiben 44px-Controls mit Radius 8px. Tags
  sind Grotesk-Metadaten in 12px mit Labelradius 5px. Innerhalb der
  Kartenklassen liegen `--kd-control-muted`, `--kd-tag-text` und
  `--kd-achse-text` auf lesbaren Kartenrollen; Kategorie- und Achsenfarben
  erscheinen dort nur ergänzend als Markierung. IDs, Labels und Werte ändern
  sich dabei nicht.
- Die gemeinsame Hero-Regel steht gezielt auch in `index.css`: 38px bis 46px,
  Fraunces 900 und Schriftfaktor. Die frühere mobile `!important`-Übersteuerung
  sowie die überholte Segment-Übersteuerung wurden entfernt, damit der
  Foundation-Vertrag tatsächlich kaskadiert.
- Verfügbare gemeinsame SVG-Exports: `IconSettings`, `IconImport`,
  `IconExport`, `IconDelete`, `IconClose`, `IconSearch`, `IconPlus`,
  `IconChevronDown`, `IconArrowRight`, `IconPin`, `IconClock`, `IconHelp`.
  Sie nehmen jeweils optional `{ size = 16 }` an und verwenden `currentColor`.
- `BereichsHero` und Privacy-Recovery erhalten ausschließlich Darstellung:
  keine neuen Zustände, Handler oder Auth-Entscheidungen. Die Privacy-
  Primäraktion nutzt `--kd-wolframText` passend zur Akzentfläche.

## Lokale Fonts

Alle tatsächlich in den `@font-face`-Blöcken von `index.css` referenzierten
WOFF2-Dateien sind lokale Quellen. `build-single.mjs` vergleicht die rohen
WOFF2-Bytes mit dem erzeugten HTML und stoppt, falls ein Face nicht eingebettet
ist. `singlefile_fonts_test.mjs` wiederholt diesen Nachweis gegen
`dist-single/Kinodreieck.html`; damit ist kein Browsernetzwerk für die
Fontprüfung nötig. Die exakten verfügbaren Gewichte und die Lizenzinventur
stehen in `src/assets/fonts/LIESMICH-FONTS.md`.

## Fokussierte Nachweise

```sh
node design_foundation_test.mjs
KD_VITE_CACHE_DIR=/private/tmp/kd-design-foundation-vite-cache npm run build:single
node singlefile_fonts_test.mjs
```

## Feedbackliste

Keine Funktionsabweichung im Foundation-Scope festgestellt. Bereichskarten,
Suche und übrige Tabs werden absichtlich erst von ihren zuständigen Paketen
klassifiziert.
