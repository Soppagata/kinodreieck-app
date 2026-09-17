# Lokale Behebung der 49 bestaetigten Reviewtickets

Einziges zentrales Register. Originaltickets bleiben unveraendert unter `../2026-09-vollreview/tickets`. E13-F005 bleibt separat UNGEKLAERT und ist nicht Teil der 49.

## Basis und Grenzen

- Primaercheckout unveraendert: main `98b5eca18d15f0a4ec8bed52b1d952c7cc8ec383`; vorhandene Aenderungen bleiben dort.
- Frisch mit `git ls-remote` bestaetigt: origin/main und origin/staging = `14804ce389d69114feed27b92fb11ac78423cc0e`. Derselbe Commit liegt auf `codex/automatic-ai-status-fix-20260916`.
- Integrationsworktree: `/private/tmp/kd-review49-integration-20260917`; Zielbranch `codex/review49-integration-20260917`.
- Vor Produktbau sauberer Nicht-main-Basiscommit: `4a5cc52` (Register-/Ticket-Snapshot; Produktcode identisch mit frisch bestaetigtem 14804ce).
- Master Astra/xhigh; Baumeister Astra/high; Abschlusspruefer laut konkretem Abschlussauftrag Astra/xhigh. Maximal drei Baumeister; kein Nebenchat in Parallelwellen.
- Lokal: Implementierung, Mock-/Browser-/isolierte SQL-Tests, Commits, Integration. Kein Push, Deployment, Live-Anbieteraufruf oder bestehender Serverdatenwrite.
- Modus: PARALLEL_WAVE, W1–W4, danach gekoppeltes SOLO-Paket P10. Produktdateien waehrend Paketbau nur Baumeister.

## Nutzerergebnisse

| ID | Ergebnis | Status | Pakete | Finaler Kandidat / Evidenz |
|---|---|---|---|---|
| M1 | Sichere Sitzung und kontogetrennte, stabile Daten | GEBAUT | P01 P02 | e45e2ba + 2b9b92a; P01/P02 |
| M2 | Persoenliche Eintraege und Profilangaben bleiben korrekt erhalten | OFFEN | P04 | — |
| M3 | Katalog, Streaming, Entdecken und Radar zeigen identitaetstreue, frische Inhalte | OFFEN | P05 P07 P08 | — |
| M4 | Filmwissen und KI behandeln Werkart und Fehler verlaesslich | OFFEN | P06 | — |
| M5 | Pins, Terminplanung, Suche und Navigation erreichen das richtige Ziel | OFFEN | P09 P10 P11 | — |
| M6 | Pruefwerkzeuge und lokale Betriebsvertraege liefern belastbare Nachweise | OFFEN | P03 P12 | — |

## Pakete und Parallelmatrix

Gemeinsame Vertraege bleiben innerhalb einer Welle eingefroren. Ein Paket besitzt auch seine eigenen Tests/Fixtures und `evidence/Pxx.md`. Dependencies/Lockfile und package.json bleiben eingefroren; Master darf spaeter gelieferte Testbefehle als kleine Integrationsnaht registrieren. Neue SQL-Migrationen je Paket eindeutiger Zeitstempel. Keine fremden Commits einziehen.

| Paket | Welle / Modus | Ergebnis | Abhaengigkeit | Owner / Worktree | Write-Ownership | Status | Basis / Commit |
|---|---|---|---|---|---|---|---|
| P01 | W1 / PARALLEL_WAVE | Sitzungen | keine | Baumeister-P01 / `/private/tmp/kd-review49-p01` | src/lib/authDriver.js inkl. lokalem atomarem Commit-Mutex ohne Web Locks; authdriver_test.mjs; neue review49_p01_* Tests | INTEGRATED | 4a5cc52 / e45e2ba |
| P02 | W1 / PARALLEL_WAVE | Kontodaten | keine | Baumeister-P02 / `/private/tmp/kd-review49-p02` | src/lib/accountDriver.js; src/services/uebernahme.js; src/services/storage.js; Konto-/Adoptiontests; neue review49_p02_* Tests | INTEGRATED | 4a5cc52 / 2b9b92a |
| P03 | W1 / PARALLEL_WAVE | Pruefwerkzeuge | keine | Baumeister-P03 / `/private/tmp/kd-review49-p03` | blogprofilanalyse_test.mjs; local_data_safety_test.mjs; tests/private-v1/private-v1.spec.mjs; tools/rls_test_personal.mjs; tools/radar_freitext_live_contract.mjs; tools/function-release-info.mjs; zugehoerige Werkzeugtests; neue review49_p03_* Tests | INTEGRATED | 4a5cc52 / 84cde78 |
| P04 | W2 / PARALLEL_WAVE | Persoenliche Eingaben | W1/P02,P03 | Baumeister-P04 / `/private/tmp/kd-review49-p04` | App.jsx; persoenliche Eingabekomponenten/-controller/-lib und deren Tests (bei DISPATCH praezisiert) | RUNNING | 84cde78 / — |
| P05 | W2 / PARALLEL_WAVE | Radar und Faktenkontext | W1; E05-002 vor E14-001 intern | Baumeister-P05 / `/private/tmp/kd-review49-p05` | Radarclient/-contract/-runner, Faktencontext, Radarpreview; src/styles/design-secondary.css; eigene Migrationen und Tests (bei DISPATCH praezisiert) | RUNNING | 84cde78 / — |
| P06 | W2 / PARALLEL_WAVE | Filmwissen und KI-Fehler | W1/P03 | Baumeister-P06 / bei DISPATCH | ai-task/index.ts; filmwissen-task; Filmwissenclient; eigene Migrationen und Tests | PLANNED | — |
| P07 | W3 / PARALLEL_WAVE | Streaming und Katalog | P04/App | Baumeister-P07 / bei DISPATCH | App.jsx; Streamingcontroller/-libs; StreamingTab/KinoTab; TitelKartenAktionen; eigene Migrationen und Tests | PLANNED | — |
| P08 | W3 / PARALLEL_WAVE | Entdecken-Belege | W2 | Baumeister-P08 / bei DISPATCH | entdeckenUi/Projection; webDiscoveryFeed; entdecken-daily-task Producervertrag; eigene Format8/9-Migrationen und Entdecken-Tests | PLANNED | — |
| P09 | W4 / PARALLEL_WAVE | Wochenplan und Termine | P07/App | Baumeister-P09 / bei DISPATCH | App.jsx; Wochenplan.jsx; StartTab.jsx; wochenplan/programm; eigene Termin-/Browsertests | PLANNED | — |
| P10 | W5 / SOLO | Pins und Fokusnavigation | P09/App | Baumeister-P10 / bei DISPATCH | App.jsx; MediathekTab/KinoTab/StartTab; entdeckenPins; eigene Navigations-/Browsertests | PLANNED | — |
| P11 | W3 / PARALLEL_WAVE | Finder-Zeitfilter | W2; programm read-only | Baumeister-P11 / bei DISPATCH | src/lib/finder.js; Finder-Tests; keine App-/programm-Aenderung | PLANNED | — |
| P12 | W1b / PARALLEL_WAVE | Betriebsvertraege | keine; disjunkt zu P01/P03 | Baumeister-P12 / `/private/tmp/kd-review49-p12` | .github/workflows/automatic-ai-check.yml; neue Retentionmigration; private-ops-check; zugehoerige Tests | RUNNING | 4a5cc52 / — |

Kollisionspruefung: Dateien/Generatoren, Exports, Schema/State, Config/Styles, Dependencies/Lockfile, Tests/Fixtures, Output-Abhaengigkeiten und Worktrees beruecksichtigt. W1: P01×P02×P03 disjunkt. W2: App/Persoenliches=P04, Radar/Faktencontext=P05, KI/Filmwissen=P06; gemeinsame read-only Identitaetsvertraege eingefroren. W3: App/Streaming/Kino=P07, Entdeckenprojektion=P08, Betrieb=P12. W4: App/Planung=P09, Finderlogik=P11. App-Schreiber laufen ausschliesslich in Folgewellen.

E14-Abhaengigkeiten: E02-001 vor E02-002 innerhalb P01; E05-002 vor vollstaendiger E14-001-Serienabnahme innerhalb P05; E13-003 vor kuenftiger Function-Auslieferung; E13-004 vor Browserpflichtgate. Werkzeugkorrekturen P03 vor ihrer Verwendung als Abnahmenachweis.

## Vollstaendige Ticketzuordnung

| Rang | Ticket | Prioritaet | Paket | Verantwortlicher | Status | Fixcommit | Pruefnachweis |
|---:|---|---|---|---|---|---|---|
| 1 | [E02-001](../2026-09-vollreview/tickets/E02/KD-REV-E02-001.md) | P1 | P01 | Baumeister-P01 | GEBAUT | e45e2ba | [P01](evidence/P01.md); lokal fokussiert belegt |
| 2 | [E03-002](../2026-09-vollreview/tickets/E03/KD-REV-E03-002.md) | P1 | P02 | Baumeister-P02 | GEBAUT | 2b9b92a | [P02](evidence/P02.md): 154 Checks; 22 neue Sollszenarien |
| 3 | [E03-001](../2026-09-vollreview/tickets/E03/KD-REV-E03-001.md) | P2 | P02 | Baumeister-P02 | GEBAUT | 2b9b92a | [P02](evidence/P02.md): 154 Checks; 22 neue Sollszenarien |
| 4 | [E09-001](../2026-09-vollreview/tickets/E09/KD-REV-E09-001.md) | P2 | P04 | Baumeister-P04 | OFFEN | — | — |
| 5 | [E08-002](../2026-09-vollreview/tickets/E08/KD-REV-E08-002.md) | P2 | P05 | Baumeister-P05 | OFFEN | — | — |
| 6 | [E05-003](../2026-09-vollreview/tickets/E05/KD-REV-E05-003.md) | P2 | P04 | Baumeister-P04 | OFFEN | — | — |
| 7 | [E10-004](../2026-09-vollreview/tickets/E10/KD-REV-E10-004.md) | P2 | P06 | Baumeister-P06 | OFFEN | — | — |
| 8 | [E04-004](../2026-09-vollreview/tickets/E04/KD-REV-E04-004.md) | P2 | P04 | Baumeister-P04 | OFFEN | — | — |
| 9 | [E04-005](../2026-09-vollreview/tickets/E04/KD-REV-E04-005.md) | P2 | P04 | Baumeister-P04 | OFFEN | — | — |
| 10 | [E04-006](../2026-09-vollreview/tickets/E04/KD-REV-E04-006.md) | P2 | P04 | Baumeister-P04 | OFFEN | — | — |
| 11 | [E04-001](../2026-09-vollreview/tickets/E04/KD-REV-E04-001.md) | P2 | P04 | Baumeister-P04 | OFFEN | — | — |
| 12 | [E08-004](../2026-09-vollreview/tickets/E08/KD-REV-E08-004.md) | P2 | P05 | Baumeister-P05 | OFFEN | — | — |
| 13 | [E02-002](../2026-09-vollreview/tickets/E02/KD-REV-E02-002.md) | P2 | P01 | Baumeister-P01 | GEBAUT | e45e2ba | [P01](evidence/P01.md); lokal fokussiert belegt |
| 14 | [E08-003](../2026-09-vollreview/tickets/E08/KD-REV-E08-003.md) | P2 | P05 | Baumeister-P05 | OFFEN | — | — |
| 15 | [E06-002](../2026-09-vollreview/tickets/E06/KD-REV-E06-002.md) | P2 | P07 | Baumeister-P07 | OFFEN | — | — |
| 16 | [E11-003](../2026-09-vollreview/tickets/E11/KD-REV-E11-003.md) | P2 | P07 | Baumeister-P07 | OFFEN | — | — |
| 17 | [E05-001](../2026-09-vollreview/tickets/E05/KD-REV-E05-001.md) | P2 | P07 | Baumeister-P07 | OFFEN | — | — |
| 18 | [E06-001](../2026-09-vollreview/tickets/E06/KD-REV-E06-001.md) | P2 | P07 | Baumeister-P07 | OFFEN | — | — |
| 19 | [E14-002](../2026-09-vollreview/tickets/E14/KD-REV-E14-002.md) | P2 | P07 | Baumeister-P07 | OFFEN | — | — |
| 20 | [E06-003](../2026-09-vollreview/tickets/E06/KD-REV-E06-003.md) | P2 | P07 | Baumeister-P07 | OFFEN | — | — |
| 21 | [E07-001](../2026-09-vollreview/tickets/E07/KD-REV-E07-001.md) | P2 | P08 | Baumeister-P08 | OFFEN | — | — |
| 22 | [E11-001](../2026-09-vollreview/tickets/E11/KD-REV-E11-001.md) | P2 | P09 | Baumeister-P09 | OFFEN | — | — |
| 23 | [E12-003](../2026-09-vollreview/tickets/E12/KD-REV-E12-003.md) | P2 | P09 | Baumeister-P09 | OFFEN | — | — |
| 24 | [E12-002](../2026-09-vollreview/tickets/E12/KD-REV-E12-002.md) | P2 | P07 | Baumeister-P07 | OFFEN | — | — |
| 25 | [E10-003](../2026-09-vollreview/tickets/E10/KD-REV-E10-003.md) | P2 | P06 | Baumeister-P06 | OFFEN | — | — |
| 26 | [E01-001](../2026-09-vollreview/tickets/E01/KD-REV-E01-001.md) | P2 | P10 | Baumeister-P10 | OFFEN | — | — |
| 27 | [E04-003](../2026-09-vollreview/tickets/E04/KD-REV-E04-003.md) | P2 | P10 | Baumeister-P10 | OFFEN | — | — |
| 28 | [E11-004](../2026-09-vollreview/tickets/E11/KD-REV-E11-004.md) | P2 | P09 | Baumeister-P09 | OFFEN | — | — |
| 29 | [E11-002](../2026-09-vollreview/tickets/E11/KD-REV-E11-002.md) | P2 | P10 | Baumeister-P10 | OFFEN | — | — |
| 30 | [E09-002](../2026-09-vollreview/tickets/E09/KD-REV-E09-002.md) | P2 | P11 | Baumeister-P11 | OFFEN | — | — |
| 31 | [E09-003](../2026-09-vollreview/tickets/E09/KD-REV-E09-003.md) | P2 | P11 | Baumeister-P11 | OFFEN | — | — |
| 32 | [E01-002](../2026-09-vollreview/tickets/E01/KD-REV-E01-002.md) | P2 | P09 | Baumeister-P09 | OFFEN | — | — |
| 33 | [E04-002](../2026-09-vollreview/tickets/E04/KD-REV-E04-002.md) | P2 | P04 | Baumeister-P04 | OFFEN | — | — |
| 34 | [E08-001](../2026-09-vollreview/tickets/E08/KD-REV-E08-001.md) | P2 | P05 | Baumeister-P05 | OFFEN | — | — |
| 35 | [E05-002](../2026-09-vollreview/tickets/E05/KD-REV-E05-002.md) | P2 | P05 | Baumeister-P05 | OFFEN | — | — |
| 36 | [E14-001](../2026-09-vollreview/tickets/E14/KD-REV-E14-001.md) | P2 | P05 | Baumeister-P05 | OFFEN | — | — |
| 37 | [E07-002](../2026-09-vollreview/tickets/E07/KD-REV-E07-002.md) | P2 | P08 | Baumeister-P08 | OFFEN | — | — |
| 38 | [E12-001](../2026-09-vollreview/tickets/E12/KD-REV-E12-001.md) | P2 | P05 | Baumeister-P05 | OFFEN | — | — |
| 39 | [E10-001](../2026-09-vollreview/tickets/E10/KD-REV-E10-001.md) | P2 | P06 | Baumeister-P06 | OFFEN | — | — |
| 40 | [E13-003](../2026-09-vollreview/tickets/E13/KD-REV-E13-003.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 41 | [E09-004](../2026-09-vollreview/tickets/E09/KD-REV-E09-004.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 42 | [E13-004](../2026-09-vollreview/tickets/E13/KD-REV-E13-004.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 43 | [E02-003](../2026-09-vollreview/tickets/E02/KD-REV-E02-003.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 44 | [E08-005](../2026-09-vollreview/tickets/E08/KD-REV-E08-005.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 45 | [E13-001](../2026-09-vollreview/tickets/E13/KD-REV-E13-001.md) | P2 | P12 | Baumeister-P12 | OFFEN | — | — |
| 46 | [E13-002](../2026-09-vollreview/tickets/E13/KD-REV-E13-002.md) | P2 | P12 | Baumeister-P12 | OFFEN | — | — |
| 47 | [E10-002](../2026-09-vollreview/tickets/E10/KD-REV-E10-002.md) | P2 | P06 | Baumeister-P06 | OFFEN | — | — |
| 48 | [E11-005](../2026-09-vollreview/tickets/E11/KD-REV-E11-005.md) | P3 | P09 | Baumeister-P09 | OFFEN | — | — |
| 49 | [E03-003](../2026-09-vollreview/tickets/E03/KD-REV-E03-003.md) | P3 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |

## Integration und Abschluss

Integration sequenziell je Welle in Paketnummernfolge; jede Lieferung wird auf Basis, Scope, tatsaechliche Dateien und fokussierte Nachweise geprueft. Abschlusspruefer erst nach allen Fixes auf exaktem Commit; pro Issue ERLEDIGT/OFFEN/NICHT BELEGT, nur betroffene Nachpruefungen nach Restkorrekturen. Anschliessend Master: relevante Integration, vollstaendige Mock-Suite, Build, Abschlussdiff und 49/49-Zuordnung auf finalem Kandidaten.

P01 RESTAUFTRAG: treiberinterne IndexedDB-Koordination als begrenzter lokaler Commit-Mutex autorisiert; keine zusaetzliche Credentialablage, alle Credential-Commits koordinieren, Ausfallgrenzen und Mehrtab-Fall belegen. Keine Scope-Kollision.

Finaler Kandidat: —. Lokaler Abschlusslauf: OFFEN. Push / CI / Deployment / praktische Geraeteabnahme: NICHT BEAUFTRAGT bzw. NICHT BELEGT.

P02 DELIVERED statisch geprueft: exakt drei autorisierte Produktdateien, zwei echte Produktintegrationstests und Paketbeleg; Diff whitespace-sauber. Interne optionale Pull-Erweiterung nur im gebundenen Adoptionspfad. Integration wartet gemaess Queue auf P01.

DISPATCH P12 vorgezogen: P02 ist DELIVERED und sein Slot frei. P12 besitzt keine Output-Abhaengigkeit und keine Schreibkollision zu den verbleibenden P01/P03; identische Basis 4a5cc52, maximal drei aktive Baumeister. Integrationsfolge W1: P01 → P02 → P03 → P12. Dadurch rückt P11 in den freien W3-Slot zu P07/P08; P09 und P10 bleiben gekoppelte Folgepakete.

INTEGRATED W1: P01 e45e2ba → P02 2b9b92a → P03 84cde78, konfliktfrei und ohne Produktnaht. Je Lieferung Scope, realer Produktbezug der Tests und fokussierte Nachweise geprueft. 10/49 Tickets GEBAUT; finaler Abschlussstatus weiterhin offen.

W2-Basis ist 84cde78b18bc2ba060f348613ba4304668901ffc. P04/P05 starten auf den zwei freien Plaetzen; P06 startet nach frei werdendem drittem Platz ebenfalls exakt dort. Der disjunkte P12-Rest aus W1 blockiert keine W2-Datei und bleibt auf seiner urspruenglichen Basis. Maximal drei aktive Baumeister; kein Paket wartet auf fachlich unabhaengige Ergebnisse.
