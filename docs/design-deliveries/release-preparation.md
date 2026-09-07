# Veröffentlichung des Designs vorbereitet

Stand: 7. September 2026. Auslöser: Max sieht in installierter PWA und iPhone-Safari keine Designänderung. Die bisherige Lieferung war ausschließlich lokal; der Designzweig war nicht veröffentlicht.

## Frisch gelesener Online-Stand

- `https://kinodreieck.at/build-meta.json`: Production `3b82a7305c16d5a74ba7a24786e5db068e61db95`.
- `https://staging.kinodreieck.at/build-meta.json`: Staging `85cce31373000d9c8dfc52781f75d717376e46ee`.
- Beide Kennungen stimmen mit den frisch gefetchten Remote-Referenzen überein. Die lokalen Designcommits sind in keinem dieser Stände enthalten. Eine Neuinstallation oder Cache-Löschung ist dafür keine Lösung.

## Konkreter lokaler Kandidat

`codex/design-release-20260907`, Produktcommit `9474354a6ccb843ab4b2631767b4c26e83f7ed7e`, Worktree `/private/tmp/kd-design-release-20260907`.

Der Kandidat führt den geprüften Designstand `0dfcc25` konfliktfrei mit dem aktuellen Production-Stand `3b82a73` zusammen. Dessen neuere Streaming-/Radar-/Entdecken-Korrekturen bleiben erhalten. Gegenüber Production ändern sich keine Services, Controller, Supabase-Dateien, Workflows, Service-Worker-Dateien oder funktionalen Bibliotheken; innerhalb `src/lib` ändert sich ausschließlich `tokens.js`.

Die zusätzlichen nur auf Staging vorhandenen Änderungen gehören nicht zum Production-Kandidaten. Bei einer anschließenden autorisierten Veröffentlichung müssen sie auf Staging erhalten bleiben; Staging darf nicht durch diesen Kandidaten ersetzt oder pauschal nach main übernommen werden.

## Nachweise

- Vollständiges `npm test`: Exit 0 einschließlich beider Builds und Pages 72/72. Der erste Start war an lokalen Sandbox-Shared-Memory-Rechten der temporären PostgreSQL-Testinstanz gescheitert; der reguläre lokale Lauf außerhalb dieser Einschränkung war grün. Zwei optionale externe Beta-Datenprüfungen bleiben übersprungen.
- Gemeinsame Foundation 8/8, Shell 21 Verträge, Nebenansichten grün.
- Private Browsersuite: zunächst 52/54 grün. Beide verbleibenden Fälle erwarteten den alten Text „Ziel: Fight Club“, während Production seit `8d13718` bereits „Gefunden für: Fight Club“ zeigt. Die einzelne Erwartung wurde wie im bestehenden Staging korrigiert; danach beide betroffenen Fälle in Chromium/WebKit 2/2 grün. Produktcode dafür unverändert.
- Alle 14 verwendeten WOFF2-Faces bytegenau im neu gebauten HTML vorhanden. Die Fontdateien und Einbettungsmechanik sind gegenüber dem vorherigen Offline-Ladenachweis unverändert.
- Rohbelege: `/private/tmp/kd-design-ci-audit-evidence/release-npm-test.log`, `release-browser-test.log`, `release-radar-browser-test.log` und `release-browser-results/`.

Aktuelle lokale Einzeldatei: `/Users/max/.codex/visualizations/2026/09/07/01a07c99-0ac5-78e2-a3f3-30080477cb81/Kinodreieck-design-release-2026-09-07.html`, 1.768.126 Bytes, SHA-256 `b0254161e506b7f1f8144bf9016cb5d7dcd3d96f812d1f72b6db8b9c273aefda`.

Stand: gebaut, lokal getestet, committed. Kein Push, Remote-CI-Lauf oder Deploy in diesem Designauftrag. Der laufende Production-Stand bleibt `3b82a73`; die Veröffentlichung ist der noch ausstehende Schritt. Physische iPhone-PWA-Abnahme bleibt offen.
