# Lokale Behebung der 49 bestaetigten Reviewtickets

Einziges zentrales Register. Originaltickets bleiben unveraendert unter `../2026-09-vollreview/tickets`. E13-F005 bleibt separat UNGEKLAERT und ist nicht Teil der 49.

## Basis und Grenzen

- Primaercheckout unveraendert: main `98b5eca18d15f0a4ec8bed52b1d952c7cc8ec383`; vorhandene Aenderungen bleiben dort.
- Frisch mit `git ls-remote` bestaetigt: origin/main und origin/staging = `14804ce389d69114feed27b92fb11ac78423cc0e`. Derselbe Commit liegt auf `codex/automatic-ai-status-fix-20260916`.
- Integrationsworktree: `/private/tmp/kd-review49-integration-20260917`; Zielbranch `codex/review49-integration-20260917`.
- Vor Produktbau sauberer Nicht-main-Basiscommit: `4a5cc52` (Register-/Ticket-Snapshot; Produktcode identisch mit frisch bestaetigtem 14804ce).
- Master Astra/xhigh; Baumeister Astra/high; Abschlusspruefer laut konkretem Abschlussauftrag Astra/xhigh. Maximal drei Baumeister; kein Nebenchat in Parallelwellen.
- Lokal: Implementierung, Mock-/Browser-/isolierte SQL-Tests, Commits, Integration. Kein Push, Deployment, Live-Anbieteraufruf oder bestehender Serverdatenwrite.
- Modus: PARALLEL_WAVE, W1–W3 mit freiem Nachrueckplatz P09, danach gekoppeltes SOLO-Paket P10b. Produktdateien waehrend Paketbau nur Baumeister.

## Nutzerergebnisse

| ID | Ergebnis | Status | Pakete | Finaler Kandidat / Evidenz |
|---|---|---|---|---|
| M1 | Sichere Sitzung und kontogetrennte, stabile Daten | GEBAUT | P01 P02 | e45e2ba + 2b9b92a; P01/P02 |
| M2 | Persoenliche Eintraege und Profilangaben bleiben korrekt erhalten | GEBAUT | P04 | 2b850aa; P04 |
| M3 | Katalog, Streaming, Entdecken und Radar zeigen identitaetstreue, frische Inhalte | GEBAUT | P05 P07 P08 | 9b3da55 + cb63219 + 338948d; P05/P07/P08 |
| M4 | Filmwissen und KI behandeln Werkart und Fehler verlaesslich | GEBAUT | P06 | 7def1b0; P06 |
| M5 | Pins, Terminplanung, Suche und Navigation erreichen das richtige Ziel | OFFEN | P09 P10a P10b P11 | — |
| M6 | Pruefwerkzeuge und lokale Betriebsvertraege liefern belastbare Nachweise | GEBAUT | P03 P12 | 84cde78 + dfabad9; P03/P12 |

## Pakete und Parallelmatrix

Gemeinsame Vertraege bleiben innerhalb einer Welle eingefroren. Ein Paket besitzt auch seine eigenen Tests/Fixtures und `evidence/Pxx.md`. Dependencies/Lockfile und package.json bleiben eingefroren; Master darf spaeter gelieferte Testbefehle als kleine Integrationsnaht registrieren. Neue SQL-Migrationen je Paket eindeutiger Zeitstempel. Keine fremden Commits einziehen.

| Paket | Welle / Modus | Ergebnis | Abhaengigkeit | Owner / Worktree | Write-Ownership | Status | Basis / Commit |
|---|---|---|---|---|---|---|---|
| P01 | W1 / PARALLEL_WAVE | Sitzungen | keine | Baumeister-P01 / `/private/tmp/kd-review49-p01` | src/lib/authDriver.js inkl. lokalem atomarem Commit-Mutex ohne Web Locks; authdriver_test.mjs; neue review49_p01_* Tests | INTEGRATED | 4a5cc52 / e45e2ba |
| P02 | W1 / PARALLEL_WAVE | Kontodaten | keine | Baumeister-P02 / `/private/tmp/kd-review49-p02` | src/lib/accountDriver.js; src/services/uebernahme.js; src/services/storage.js; Konto-/Adoptiontests; neue review49_p02_* Tests | INTEGRATED | 4a5cc52 / 2b9b92a |
| P03 | W1 / PARALLEL_WAVE | Pruefwerkzeuge | keine | Baumeister-P03 / `/private/tmp/kd-review49-p03` | blogprofilanalyse_test.mjs; local_data_safety_test.mjs; tests/private-v1/private-v1.spec.mjs; tools/rls_test_personal.mjs; tools/radar_freitext_live_contract.mjs; tools/function-release-info.mjs; zugehoerige Werkzeugtests; neue review49_p03_* Tests | INTEGRATED | 4a5cc52 / 84cde78 |
| P04 | W2 / PARALLEL_WAVE | Persoenliche Eingaben | W1/P02,P03 | p04_personal / `/private/tmp/kd-review49-p04` | src/App.jsx; components/{DreiFragen,GeschmackBereich,GeschmackOnboarding,ProfilAnsicht,MustWatchListe,StapelImport,EintragForm,FilmCard,EditPanel}; controllers/{useArticleController,useMustwatchController}; lib/{match,artikel,libraryProjection,stapelimport,profil,extraktion,personalEntryChronology,prognose}; BlogTab; entsprechende Tests + review49_p04_* | INTEGRATED | 84cde78 / 2b850aa |
| P05 | W2 / PARALLEL_WAVE | Radar und Faktenkontext | W1; E05-002 vor E14-001 intern | p05_radar / `/private/tmp/kd-review49-p05` | lib/{localEventRadar,radarPilotContracts,personRadarCatalog}; services/{radarPilot,radarWebsearch}; useEntdeckenRadarController; Radar*.jsx; EntdeckenTab; design-secondary.css; radar-websearch-task/*; _shared/flixpatrolFactsContext.js; Migrationen 20260917100000/101000; Radar-/Faktencontexttests + review49_p05_* | INTEGRATED | 84cde78 / 9b3da55 |
| P06 | W2 / PARALLEL_WAVE | Filmwissen und KI-Fehler | W1/P03 | p06_filmwissen / `/private/tmp/kd-review49-p06` | ai-task/index.ts; filmwissen-task/*; lib/{filmwissen,filmwissenTransport,prognoseAuftrag}; services/{filmwissen,vorbewertung}; useIntelligenceController; components/{FilmwissenBereich,PrognoseBereich}; Migration 20260917110000; filmwissen*/ai_task/prognose_auftrag/vorbewertung Tests + review49_p06_* | INTEGRATED | 84cde78 / 7def1b0 |
| P07 | W3 / PARALLEL_WAVE | Streaming und Katalog | P04/App | p07_streaming / `/private/tmp/kd-review49-p07` | App.jsx; Streamingcontroller/-libs; StreamingTab/KinoTab; TitelKartenAktionen; eigene Migrationen und Tests | INTEGRATED | a2c6b60 / cb63219 |
| P08 | W3 / PARALLEL_WAVE | Entdecken-Belege | W1; disjunkt zu W2 | p08_entdecken / `/private/tmp/kd-review49-p08` | entdeckenUi/Projection; webDiscoveryFeed; entdecken-daily-task Producervertrag; Migration 20260917130000 und Entdecken-Tests | INTEGRATED | a2c6b60 / 338948d |
| P09 | W3b / PARALLEL_WAVE | Wochenplan und Termine | App-Klickvertrag eingefroren; kein Output von P07 | p09_planning / `/private/tmp/kd-review49-p09` | Wochenplan.jsx; StartTab.jsx; enge Wochenplan-Editorregeln in index.css/design-primary.css; eigene Termin-/Browsertests | INTEGRATED | a2c6b60 / 89e8918 |
| P10a | W3c / PARALLEL_WAVE | Sichtbares Mediathek-Sprungziel | App-Propvertrag read-only | p10a_focus / `/private/tmp/kd-review49-p10a` | MediathekTab.jsx; eigene Fokus-/Navigationstests | INTEGRATED | a2c6b60 / 2217e5a |
| P10b | W4 / SOLO | Pins und Kinonavigation | P07/App und P09/StartTab | p10b_navigation / `/private/tmp/kd-review49-p10b` | App.jsx; KinoTab/StartTab; entdeckenPins und eng begrenzte Pinhelper; eigene Navigations-/Browsertests | RUNNING | 45ada41 / — |
| P11 | W3 / PARALLEL_WAVE | Finder-Zeitfilter | W1; programm read-only | p11_finder / `/private/tmp/kd-review49-p11` | src/lib/finder.js; Finder-Tests; keine App-/programm-Aenderung | INTEGRATED | a2c6b60 / 8be8375 |
| P12 | W1b / PARALLEL_WAVE | Betriebsvertraege | keine; disjunkt zu P01/P03 | Baumeister-P12 / `/private/tmp/kd-review49-p12` | .github/workflows/automatic-ai-check.yml; neue Retentionmigration; private-ops-check; zugehoerige Tests | INTEGRATED | 4a5cc52 / dfabad9 |

Kollisionspruefung: Dateien/Generatoren, Exports, Schema/State, Config/Styles, Dependencies/Lockfile, Tests/Fixtures, Output-Abhaengigkeiten und Worktrees beruecksichtigt. W1: P01×P02×P03 disjunkt. W2: App/Persoenliches=P04, Radar/Faktencontext=P05, KI/Filmwissen=P06; gemeinsame read-only Identitaetsvertraege eingefroren. W3: App/Streaming/Kino=P07, Entdeckenprojektion=P08, Finderlogik=P11. W3b: P09 ersetzt den abgeschlossenen P11-Slot mit Wochenplan/StartTab/Editor-CSS ohne App-Aenderung; P10 folgt nach integriertem P07/P09-Stand. App-Schreiber laufen ausschliesslich in Folgewellen.

E14-Abhaengigkeiten: E02-001 vor E02-002 innerhalb P01; E05-002 vor vollstaendiger E14-001-Serienabnahme innerhalb P05; E13-003 vor kuenftiger Function-Auslieferung; E13-004 vor Browserpflichtgate. Werkzeugkorrekturen P03 vor ihrer Verwendung als Abnahmenachweis.

## Vollstaendige Ticketzuordnung

| Rang | Ticket | Prioritaet | Paket | Verantwortlicher | Status | Fixcommit | Pruefnachweis |
|---:|---|---|---|---|---|---|---|
| 1 | [E02-001](../2026-09-vollreview/tickets/E02/KD-REV-E02-001.md) | P1 | P01 | Baumeister-P01 | GEBAUT | e45e2ba | [P01](evidence/P01.md); lokal fokussiert belegt |
| 2 | [E03-002](../2026-09-vollreview/tickets/E03/KD-REV-E03-002.md) | P1 | P02 | Baumeister-P02 | GEBAUT | 2b9b92a | [P02](evidence/P02.md): 154 Checks; 22 neue Sollszenarien |
| 3 | [E03-001](../2026-09-vollreview/tickets/E03/KD-REV-E03-001.md) | P2 | P02 | Baumeister-P02 | GEBAUT | 2b9b92a | [P02](evidence/P02.md): 154 Checks; 22 neue Sollszenarien |
| 4 | [E09-001](../2026-09-vollreview/tickets/E09/KD-REV-E09-001.md) | P2 | P04 | Baumeister-P04 | GEBAUT | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 5 | [E08-002](../2026-09-vollreview/tickets/E08/KD-REV-E08-002.md) | P2 | P05 | Baumeister-P05 | GEBAUT | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 6 | [E05-003](../2026-09-vollreview/tickets/E05/KD-REV-E05-003.md) | P2 | P04 | Baumeister-P04 | GEBAUT | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 7 | [E10-004](../2026-09-vollreview/tickets/E10/KD-REV-E10-004.md) | P2 | P06 | Baumeister-P06 | GEBAUT | 7def1b0 | [P06](evidence/P06.md): 39 Modul-/Transporttests, 19 PG17- und 41 Handlerfaelle |
| 8 | [E04-004](../2026-09-vollreview/tickets/E04/KD-REV-E04-004.md) | P2 | P04 | Baumeister-P04 | GEBAUT | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 9 | [E04-005](../2026-09-vollreview/tickets/E04/KD-REV-E04-005.md) | P2 | P04 | Baumeister-P04 | GEBAUT | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 10 | [E04-006](../2026-09-vollreview/tickets/E04/KD-REV-E04-006.md) | P2 | P04 | Baumeister-P04 | GEBAUT | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 11 | [E04-001](../2026-09-vollreview/tickets/E04/KD-REV-E04-001.md) | P2 | P04 | Baumeister-P04 | GEBAUT | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 12 | [E08-004](../2026-09-vollreview/tickets/E08/KD-REV-E08-004.md) | P2 | P05 | Baumeister-P05 | GEBAUT | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 13 | [E02-002](../2026-09-vollreview/tickets/E02/KD-REV-E02-002.md) | P2 | P01 | Baumeister-P01 | GEBAUT | e45e2ba | [P01](evidence/P01.md); lokal fokussiert belegt |
| 14 | [E08-003](../2026-09-vollreview/tickets/E08/KD-REV-E08-003.md) | P2 | P05 | Baumeister-P05 | GEBAUT | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 15 | [E06-002](../2026-09-vollreview/tickets/E06/KD-REV-E06-002.md) | P2 | P07 | Baumeister-P07 | GEBAUT | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 16 | [E11-003](../2026-09-vollreview/tickets/E11/KD-REV-E11-003.md) | P2 | P07 | Baumeister-P07 | GEBAUT | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 17 | [E05-001](../2026-09-vollreview/tickets/E05/KD-REV-E05-001.md) | P2 | P07 | Baumeister-P07 | GEBAUT | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 18 | [E06-001](../2026-09-vollreview/tickets/E06/KD-REV-E06-001.md) | P2 | P07 | Baumeister-P07 | GEBAUT | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 19 | [E14-002](../2026-09-vollreview/tickets/E14/KD-REV-E14-002.md) | P2 | P07 | Baumeister-P07 | GEBAUT | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 20 | [E06-003](../2026-09-vollreview/tickets/E06/KD-REV-E06-003.md) | P2 | P07 | Baumeister-P07 | GEBAUT | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 21 | [E07-001](../2026-09-vollreview/tickets/E07/KD-REV-E07-001.md) | P2 | P08 | Baumeister-P08 | GEBAUT | 338948d | [P08](evidence/P08.md): fokussierte Produkt-/Integrationsnachweise |
| 22 | [E11-001](../2026-09-vollreview/tickets/E11/KD-REV-E11-001.md) | P2 | P09 | Baumeister-P09 | GEBAUT | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 23 | [E12-003](../2026-09-vollreview/tickets/E12/KD-REV-E12-003.md) | P2 | P09 | Baumeister-P09 | GEBAUT | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 24 | [E12-002](../2026-09-vollreview/tickets/E12/KD-REV-E12-002.md) | P2 | P07 | Baumeister-P07 | GEBAUT | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 25 | [E10-003](../2026-09-vollreview/tickets/E10/KD-REV-E10-003.md) | P2 | P06 | Baumeister-P06 | GEBAUT | 7def1b0 | [P06](evidence/P06.md): 39 Modul-/Transporttests, 19 PG17- und 41 Handlerfaelle |
| 26 | [E01-001](../2026-09-vollreview/tickets/E01/KD-REV-E01-001.md) | P2 | P10b | Baumeister-P10b | OFFEN | — | — |
| 27 | [E04-003](../2026-09-vollreview/tickets/E04/KD-REV-E04-003.md) | P2 | P10a | p10a_focus | GEBAUT | 2217e5a | [P10a](evidence/P10a.md): 16 echte Komponentenpfade plus Nachbarn |
| 28 | [E11-004](../2026-09-vollreview/tickets/E11/KD-REV-E11-004.md) | P2 | P09 | Baumeister-P09 | GEBAUT | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 29 | [E11-002](../2026-09-vollreview/tickets/E11/KD-REV-E11-002.md) | P2 | P10b | Baumeister-P10b | OFFEN | — | — |
| 30 | [E09-002](../2026-09-vollreview/tickets/E09/KD-REV-E09-002.md) | P2 | P11 | Baumeister-P11 | GEBAUT | 8be8375 | [P11](evidence/P11.md): fokussierte Produkt-/Integrationsnachweise |
| 31 | [E09-003](../2026-09-vollreview/tickets/E09/KD-REV-E09-003.md) | P2 | P11 | Baumeister-P11 | GEBAUT | 8be8375 | [P11](evidence/P11.md): fokussierte Produkt-/Integrationsnachweise |
| 32 | [E01-002](../2026-09-vollreview/tickets/E01/KD-REV-E01-002.md) | P2 | P09 | Baumeister-P09 | GEBAUT | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 33 | [E04-002](../2026-09-vollreview/tickets/E04/KD-REV-E04-002.md) | P2 | P04 | Baumeister-P04 | GEBAUT | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 34 | [E08-001](../2026-09-vollreview/tickets/E08/KD-REV-E08-001.md) | P2 | P05 | Baumeister-P05 | GEBAUT | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 35 | [E05-002](../2026-09-vollreview/tickets/E05/KD-REV-E05-002.md) | P2 | P05 | Baumeister-P05 | GEBAUT | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 36 | [E14-001](../2026-09-vollreview/tickets/E14/KD-REV-E14-001.md) | P2 | P05 | Baumeister-P05 | GEBAUT | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 37 | [E07-002](../2026-09-vollreview/tickets/E07/KD-REV-E07-002.md) | P2 | P08 | Baumeister-P08 | GEBAUT | 338948d | [P08](evidence/P08.md): fokussierte Produkt-/Integrationsnachweise |
| 38 | [E12-001](../2026-09-vollreview/tickets/E12/KD-REV-E12-001.md) | P2 | P05 | Baumeister-P05 | GEBAUT | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 39 | [E10-001](../2026-09-vollreview/tickets/E10/KD-REV-E10-001.md) | P2 | P06 | Baumeister-P06 | GEBAUT | 7def1b0 | [P06](evidence/P06.md): 39 Modul-/Transporttests, 19 PG17- und 41 Handlerfaelle |
| 40 | [E13-003](../2026-09-vollreview/tickets/E13/KD-REV-E13-003.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 41 | [E09-004](../2026-09-vollreview/tickets/E09/KD-REV-E09-004.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 42 | [E13-004](../2026-09-vollreview/tickets/E13/KD-REV-E13-004.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 43 | [E02-003](../2026-09-vollreview/tickets/E02/KD-REV-E02-003.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 44 | [E08-005](../2026-09-vollreview/tickets/E08/KD-REV-E08-005.md) | P2 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 45 | [E13-001](../2026-09-vollreview/tickets/E13/KD-REV-E13-001.md) | P2 | P12 | Baumeister-P12 | GEBAUT | dfabad9 | [P12](evidence/P12.md): Core/Workflow, 67 Monitorchecks, 13 PG17-Gruppen |
| 46 | [E13-002](../2026-09-vollreview/tickets/E13/KD-REV-E13-002.md) | P2 | P12 | Baumeister-P12 | GEBAUT | dfabad9 | [P12](evidence/P12.md): Core/Workflow, 67 Monitorchecks, 13 PG17-Gruppen |
| 47 | [E10-002](../2026-09-vollreview/tickets/E10/KD-REV-E10-002.md) | P2 | P06 | Baumeister-P06 | GEBAUT | 7def1b0 | [P06](evidence/P06.md): 39 Modul-/Transporttests, 19 PG17- und 41 Handlerfaelle |
| 48 | [E11-005](../2026-09-vollreview/tickets/E11/KD-REV-E11-005.md) | P3 | P09 | Baumeister-P09 | GEBAUT | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 49 | [E03-003](../2026-09-vollreview/tickets/E03/KD-REV-E03-003.md) | P3 | P03 | Baumeister-P03 | GEBAUT | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |

## Integration und Abschluss

Integration sequenziell je Welle in Paketnummernfolge; jede Lieferung wird auf Basis, Scope, tatsaechliche Dateien und fokussierte Nachweise geprueft. Abschlusspruefer erst nach allen Fixes auf exaktem Commit; pro Issue ERLEDIGT/OFFEN/NICHT BELEGT, nur betroffene Nachpruefungen nach Restkorrekturen. Anschliessend Master: relevante Integration, vollstaendige Mock-Suite, Build, Abschlussdiff und 49/49-Zuordnung auf finalem Kandidaten.

P01 RESTAUFTRAG: treiberinterne IndexedDB-Koordination als begrenzter lokaler Commit-Mutex autorisiert; keine zusaetzliche Credentialablage, alle Credential-Commits koordinieren, Ausfallgrenzen und Mehrtab-Fall belegen. Keine Scope-Kollision.

Finaler Kandidat: —. Lokaler Abschlusslauf: OFFEN. Push / CI / Deployment / praktische Geraeteabnahme: NICHT BEAUFTRAGT bzw. NICHT BELEGT.

P02 DELIVERED statisch geprueft: exakt drei autorisierte Produktdateien, zwei echte Produktintegrationstests und Paketbeleg; Diff whitespace-sauber. Interne optionale Pull-Erweiterung nur im gebundenen Adoptionspfad. Integration wartet gemaess Queue auf P01.

DISPATCH P12 vorgezogen: P02 ist DELIVERED und sein Slot frei. P12 besitzt keine Output-Abhaengigkeit und keine Schreibkollision zu den verbleibenden P01/P03; identische Basis 4a5cc52, maximal drei aktive Baumeister. Integrationsfolge W1: P01 → P02 → P03 → P12. Dadurch rückt P11 in den freien W3-Slot zu P07/P08; P09 und P10 bleiben gekoppelte Folgepakete.

INTEGRATED W1: P01 e45e2ba → P02 2b9b92a → P03 84cde78, konfliktfrei und ohne Produktnaht. Je Lieferung Scope, realer Produktbezug der Tests und fokussierte Nachweise geprueft. 10/49 Tickets GEBAUT; finaler Abschlussstatus weiterhin offen.

W2-Basis ist 84cde78b18bc2ba060f348613ba4304668901ffc. P04/P05 starten auf den zwei freien Plaetzen; P06 startet nach frei werdendem drittem Platz ebenfalls exakt dort. Der disjunkte P12-Rest aus W1 blockiert keine W2-Datei und bleibt auf seiner urspruenglichen Basis. Maximal drei aktive Baumeister; kein Paket wartet auf fachlich unabhaengige Ergebnisse.

INTEGRATED P12 dfabad991b6a60cc0a828331edccd709daf1090d: Workflowdelta und additive Retention mit vorherigem effektivem Funktionskoerper verglichen; ausschliesslich Mail-Ratenbucket-Ergaenzung. Kleine Master-Naht: trailing whitespace in neuer PG-Testdatei entfernt. Keine semantische Aenderung, keine Testwiederholung daraus. 12/49 Tickets GEBAUT. P06 DISPATCH ebenfalls auf W2-Basis 84cde78; W2 nun mit drei Baumeistern.

INTEGRATED P04 2b850aae699b5a61b3c9c102df1688d873ee6cb8: 13 autorisierte Produktdateien plus Pakettest/-beleg, kleine App-Naht konfliktfrei. Vollstaendiger Produktdiff und Solltestanbindung geprueft. Zusaetzliche Leerzeile am EOF des neuen Vergleichshelpers als rein formale Master-Naht entfernt. 19/49 GEBAUT.

DISPATCH W3: P07 auf a2c6b60c4b4fbc59ccbaaa0745bd369eb4518583. P08/P11 erhalten dieselbe exakte Basis, sobald ein Slot frei wird; verbleibende W2-P05/P06 sind dazu disjunkt. Reihenfolge der Integration behaelt W2 vor W3. App-Ownership P04 beendet, jetzt ausschliesslich P07.

INTEGRATED P05 9b3da55 und P06 7def1b0: Vollstaendige Produktdiffs, Migrationen, Scope und Sollbelege geprueft; konfliktfrei sequenziell uebernommen. 30/49 Tickets GEBAUT. P05-Faktenhelper und P06-Handler verwenden weiterhin denselben numerischen FlixPatrol-Vertrag mit separatem Werktyp; Filmwissen ist intern typisiert. Finaler Gesamtnachweis folgt nach allen Paketen.

DISPATCH P08 und P11: Beide auf exakt a2c6b60, mit P07 maximal drei aktive Baumeister. P05/P06 hatten ihre Arbeit zuvor abgeschlossen. Keine Schreibkollision und keine Output-Abhaengigkeit; W2-Lieferungen sind nun vor W3 integriert.

P11 DELIVERED 9ff4fc14f94f4e0f27584767c0613e61d382010b: Eine Produktdatei, echter Finder-/Projektions-/DOM-Solltest und Paketbeleg; Scope und Diff geprueft. 15 neue Sollgruppen und 239 bestehende Finderchecks gruen. Integration folgt gemaess W3-Queue auf P07/P08.

DISPATCH P09 vorgezogen auf exakt a2c6b60 im frei gewordenen P11-Slot: Die gezielte Paarpruefung zeigt, dass E11-004 am Wochenplan-Klick mit vorhandener quelle.film_ref und unveraendertem App-Vertrag behoben werden kann. E01-002 kann den vorhandenen kinoPinTermin-Parser lesen. Damit entfallen App-/Parser-Schreibflaechen und die angenommene Output-Abhaengigkeit zu P07. Neue Ownership: Wochenplan/StartTab/enge Editor-CSS-Regeln exklusiv P09; P07 wurde ueber den eingefrorenen App-Klickvertrag informiert. P07/P08/P09 sind disjunkt, maximal drei aktiv. Integrationsfolge W3: P07 → P08 → P11 → P09; P10 danach SOLO.

P08 DELIVERED 34259b894408de0d0cb0644a70925b539ebb7a52: Vier autorisierte Produktmodule, additive SQL-Validatorerweiterung und eigene Tests/Fixture/Beleg; Produktdiff, Migration und Provenienzweg statisch geprueft. 34 neue Sollgruppen und 7 PG17-Gruppen plus acht Nachbartests gruen. Keine Lockerung des Kino-Identitaetsmatchers. Integration wartet gemaess Queue auf P07.

DISPATCH P10a im frei gewordenen P08-Slot auf exakt a2c6b60: E04-003 besitzt ausschliesslich MediathekTab-State/Sichtbarkeitslogik; der bestehende App-Sprungvertrag bleibt unveraendert. P10 wird deshalb ohne Ticketverlust aufgeteilt: E04-003 → P10a, E01-001/E11-002 → anschliessendes P10b. Aktive Schreiber P07/App+Streaming, P09/Start+Wochenplan und P10a/Mediathek sind disjunkt. Integrationsfolge P07 → P08 → P11 → P09 → P10a, dann P10b auf dem zusammengefuehrten Stand.

P09 DELIVERED 506e4ef892e59f659f37e413e777b35abcb02ece: Genau drei vereinbarte Produktdateien, davon eine einzelne CSS-Regel, plus echte Produkt-/Browser-Solltests. Diff und Belege geprueft. 15 Produktgruppen, 64 Editorlayouts mit disjunkten Touchzielen in beiden Engines und Formularpruefungen sowie fokussierte Nachbarn gruen. Keine Aenderung am eingefrorenen App-Vertrag; Integration nach P07/P08/P11.

INTEGRATED W3: P07 cb63219 → P08 338948d → P11 8be8375 → P09 89e8918, sequenziell konfliktfrei. P07-RPC mit vorherigem effektivem Funktionskoerper verglichen: nur Antwortfristen/Anker erweitert, Request-/ACL-/Cursorgrenzen erhalten. App-StartTab-Vertrag bleibt identisch. Nun 46/49 Tickets GEBAUT. P10a ist der letzte laufende disjunkte Baumeister; P10b kann ohne Output-Abhaengigkeit zu MediathekTab auf diesem integrierten Stand beginnen, keine optionalen Bauchats waehrend der Ueberlappung.

DISPATCH P10b: 45ada414a822e72f3c68e79699e07104f7edb518, eigener Worktree/Branch. Ende-zu-Ende-Paket mit Start-Pinauflösung und Kino-Fokusvertrag; P10a besitzt weiterhin ausschliesslich MediathekTab. Keine gemeinsamen Schreibflaechen, kein optionaler Bauchat. P10b benoetigt den bereits integrierten P07/P09-Stand, nicht P10a.

INTEGRATED P10a 2217e5a: Eine Produktdatei, gemounteter Solltest und Beleg; unveraenderter App-Vertrag, kein Konflikt mit P10b. Diff und 16 Fokus-/Sichtbarkeitsfaelle geprueft. 47/49 GEBAUT; nur P10b laeuft noch.
