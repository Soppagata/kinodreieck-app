# D5 – Nebenansichten und Formulare

Paketbasis: `36772f32c2f170e199c803d551f80eda86d897d8`.

Die Nebenansichten verwenden die Rollen der Foundation mit ihrer eigenen,
eng gescopten Ergänzung in `design-secondary.css`. Das umfasst warme
12px-Karten, 16px Innenabstand, Barlow-Condensed-Titel, Grotesk-Metadaten,
44px-Controls, mindestens 16px Eingabeschrift sowie sichtbare Fokus- und
Disabled-Zustände. Keine Daten-, Rechte-, URL- oder Handlerverträge wurden
geändert.

## Abdeckung

- **Entdecken:** Empfehlungen, beliebte Titel, Radar, Leer-/Fehler-/Pending-
  Zustände, Quellenlinks, Pins, Subtabs, Radarverwaltung, Suche, Ziele,
  Neuigkeiten, aufgeklappte Folgen und Radarvorschau.
- **Blog:** private Artikelliste, Vorschau, Aktionsreihe, Erstellen,
  Bearbeiten, Referenzabgleich, Löschbestätigung und Leseansicht bleiben
  erreichbar; die sichtbaren Karten folgen dem Karten- und Titelvertrag.
- **Finder:** Suchfeld, Suchen/Neue Suche, Hilfeantworten, Treffergruppen,
  KI-Angebot/Lauf-/Fehlerzustand und Eintrag-Erstellen bleiben unverändert
  bedienbar.
- **Settings und Kontoflächen:** Darstellung, Quellenwahl, KI- und
  Profilbereiche, Vokabular, Sicherung, Datenschutz, Datenrechte,
  Kontolöschanfrage, anonymes Feedback und Owner-gebundene Diagnoseflächen
  sind als lesbare Karten, Klappen, Formulare und Aktionsreihen gestaltet.
- **Komponenten:** `BlogProfilAnalyse`, `GeschmackBereich`,
  `GeschmackOnboarding`, `ProfilAnsicht`, `PrognoseBereich`,
  `FilmwissenBereich`, `DreiFragen`, `StapelImport`, `TeilenBlock`,
  `StreamingEinstellungen`, `RadarSubscriptionPreview`, `PrivatePilotOps`
  und `PrivateMailRequests` erhalten dabei passende Form-, Dialog-,
  Status- oder Kartenrollen.

## Fokussierte Nachweise

```sh
node design_secondary_test.mjs
node findertab_test.mjs
node geschmackui_test.mjs
node blogprofilanalyse_ui_test.mjs
node private_mail_ui_test.mjs
npm run test:private-release-surface
KD_PRIVATE_V1_TEST_PORT=4492 playwright test --config=/private/tmp/kd-design-secondary-playwright.mjs
```

Der Browsernachweis lief mit privatem, netzgesperrtem Mockkonto auf Port
4492: Chromium und WebKit bei 320, 393 und 430 px, jeweils Saal/Normal und
Foyer/Groß. Er prüft Erreichbarkeit der Entdecken-Subtabs, Blogvorschau und
Settings-Controls; dabei werden das echte Theme über „Saal/Foyer“ und die
Schriftgröße über die Settings-Control gesetzt. Der Test misst die vom
Theme-Setter gesetzte `--kd-saal`-Palette, die skalierte Blogtitelgröße,
einen aufgeklappten Blogzustand und fehlendes Seiten-Overflow. Frische Screenshots bei 320 px für Chromium Saal/Normal und WebKit
Foyer/Groß wurden zusätzlich visuell geprüft.

## Typografie-Nachtrag

Die verbleibenden lokalen `btnStyle`- und `inputStyle`-Schriftgrößen von 11–13 px wurden an ihren Quellen entfernt. Textbuttons folgen damit der gemeinsamen skalierbaren 14-px-Rolle; die beiden JSON-Textfelder behalten nur die Monospace-Familie und folgen der mindestens 16-px-Feldrolle.

## Feedbackliste

Keine funktionale Abweichung im P2-Scope beobachtet. Der zuvor gemessene
Settings-Überlauf ist durch umbruchfähige Einstellzeilen und `min-width: 0`
an den lokalen Flex-/Grid-Teilnehmern behoben; Inhalte werden nicht
abgeschnitten.
