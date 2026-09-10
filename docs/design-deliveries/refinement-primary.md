# R1, R2 und R6 – gezielte Designkorrektur

Paketbasis: `46a2a2c631bf47d5bcfe4d530dbc17131b614a66`.

## Lieferung

- Kino hält „Läuft auch, nicht in deiner Liste“ als eigene ruhige
  Nebenlistenvariante: 17px-Barlow-Titel, 12px-Metadaten, transparenter
  Hintergrund und feine Trennung. Persönliche Programmempfehlungen verwenden
  unverändert die bestehende Kartenvariante; Pins, Details, Quellen, Termine
  und der Eintragsweg bleiben im selben `KompaktEintrag`.
- Mediathek zeigt die drei Ansichten als kompakte Dreierreihe direkt vor der
  leiseren Typenreihe. Die vier Typen bleiben normal nebeneinander; bei 320px
  oder großer Schrift ordnen sie sich kontrolliert in zwei Reihen. Ansichten,
  Fachfilter, Sortierung, Auswahl sowie Draft- und Formular-Mounts bleiben
  unverändert.
- Radar-Neuigkeiten sind visuell eigenständige Karten. Sie zeigen Titel,
  Datum/Kategorie/Plattform, die vorhandenen Evidenzdomains und „Gefunden für“
  getrennt lesbar. Fehlende Quellen oder Daten erhalten einen neutralen
  Fallback. Es wurden keine Aktionen ergänzt; vorhandene Staffel-/Folgendetails
  bleiben erhalten und ihr Summary besitzt mindestens 44px Höhe.

## Fokussierter Nachweis

Die Private-v1-Fixture sperrt alle unbekannten Netzpfade. Die neue
Browserprüfung lief mit isoliertem Vite-Cache auf Port 4491:

```sh
npx playwright test --config /private/tmp/kd-design-followup-primary-playwright-4491.mjs tests/private-v1/design-refinement-primary.spec.mjs --project=chromium
npx playwright test --config /private/tmp/kd-design-followup-primary-playwright-4491.mjs tests/private-v1/design-refinement-primary.spec.mjs --project=webkit
```

Beide Browserläufe sind grün. Sie prüfen 393px sowie 320px/große Schrift,
Touchflächen und Raster der Mediathek, die Kino-Nebenlistenrolle sowie die
Radar-Karte mit Quelle und Zielherkunft. Der vollständige Build und die
gesamte Mocksuite bleiben beim Meister.
