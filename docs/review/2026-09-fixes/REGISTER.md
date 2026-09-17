# Lokale Behebung der 49 bestaetigten Reviewtickets

Einziges zentrales Register. Originaltickets bleiben unveraendert unter `../2026-09-vollreview/tickets`. E13-F005 bleibt separat UNGEKLAERT und ist nicht Teil der 49.

**Lokal abgeschlossen: 49/49 DONE.** Der unabhaengige Abschlusspruefer bestaetigt **49 ERLEDIGT, 0 OFFEN, 0 NICHT BELEGT** mit 239 einzelnen Kriterienabgleichen. Vollstaendige Mock-Suite, Function-Mocks, Browserabnahme, Build und Abschlussdiff sind bestanden.

Abgenommener Kandidat: `114b268c2ffe577f35b8ca52863b0d2980495f0e` auf `codex/review49-integration-20260917`. Danach werden ausschliesslich diese Abschlussdokumente und ihre Belegdateien committed; Produkt-, Test- und Konfigurationsbytes bleiben identisch. DONE bezeichnet hier die lokale Abnahme.

Nachweise: [unabhaengiger Bericht](evidence/verification/FINAL_REVIEW.md), [49 Issues / 239 Kriterien mit Fundstellen](evidence/verification/FINAL_REVIEW.json), [Master-Abschlusslauf mit Logarchiven und Hashen](evidence/FINAL_GATE.json).

## Basis und Grenzen

- Primaercheckout unveraendert: main `98b5eca18d15f0a4ec8bed52b1d952c7cc8ec383`; vorhandene Aenderungen bleiben dort.
- Frisch mit `git ls-remote` bestaetigt: origin/main und origin/staging = `14804ce389d69114feed27b92fb11ac78423cc0e`. Derselbe Commit liegt auf `codex/automatic-ai-status-fix-20260916`.
- Integrationsworktree: `/private/tmp/kd-review49-integration-20260917`; Zielbranch `codex/review49-integration-20260917`.
- Vor Produktbau sauberer Nicht-main-Basiscommit: `4a5cc52` (Register-/Ticket-Snapshot; Produktcode identisch mit frisch bestaetigtem 14804ce).
- Master Astra/xhigh; Baumeister Astra/high; Abschlusspruefer laut konkretem Abschlussauftrag Astra/xhigh. Maximal drei Baumeister; kein Nebenchat in Parallelwellen.
- Lokal: Implementierung, Mock-/Browser-/isolierte SQL-Tests, Commits, Integration. Kein Push, Deployment, Live-Anbieteraufruf oder bestehender Serverdatenwrite.
- Modus: PARALLEL_WAVE mit disjunkten Nachrueckern P09/P10a; P10b begann unabhaengig vom noch auslaufenden P10a und endete SOLO. Produktdateien waehrend Paketbau nur Baumeister; kein optionaler Bauchat.

## Nutzerergebnisse

| ID | Ergebnis | Status | Pakete | Finaler Kandidat / Evidenz |
|---|---|---|---|---|
| M1 | Sichere Sitzung und kontogetrennte, stabile Daten | DONE | P01 P02 | e45e2ba + 2b9b92a; P01/P02 |
| M2 | Persoenliche Eintraege und Profilangaben bleiben korrekt erhalten | DONE | P04 | 2b850aa; P04 |
| M3 | Katalog, Streaming, Entdecken und Radar zeigen identitaetstreue, frische Inhalte | DONE | P05 P07 P08 | 9b3da55 + cb63219 + 338948d; P05/P07/P08 |
| M4 | Filmwissen und KI behandeln Werkart und Fehler verlaesslich | DONE | P06 | 7def1b0 + f957fbe; P06 und 114b268-Abnahme |
| M5 | Pins, Terminplanung, Suche und Navigation erreichen das richtige Ziel | DONE | P09 P10a P10b P11 | 89e8918 + 2217e5a + 79dfe15 + 8be8375; Paketbelege |
| M6 | Pruefwerkzeuge und lokale Betriebsvertraege liefern belastbare Nachweise | DONE | P03 P12 | 84cde78 + dfabad9; P03/P12 |

## Pakete und Parallelmatrix

Gemeinsame Vertraege bleiben innerhalb einer Welle eingefroren. Ein Paket besitzt auch seine eigenen Tests/Fixtures und `evidence/Pxx.md`. Dependencies/Lockfile blieben eingefroren; package.json wurde ausschliesslich vom Master um die gelieferten Testbefehle ergaenzt. Neue SQL-Migrationen je Paket eindeutiger Zeitstempel. Es wurden ausschliesslich die jeweils zugewiesenen Liefercommits integriert.

| Paket | Welle / Modus | Ergebnis | Abhaengigkeit | Owner / Worktree | Write-Ownership (freigegeben) | Status | Basis / Commit |
|---|---|---|---|---|---|---|---|
| P01 | W1 / PARALLEL_WAVE | Sitzungen | keine | Baumeister-P01 / `/private/tmp/kd-review49-p01` | src/lib/authDriver.js inkl. lokalem atomarem Commit-Mutex ohne Web Locks; authdriver_test.mjs; neue review49_p01_* Tests | DONE | 4a5cc52 / e45e2ba |
| P02 | W1 / PARALLEL_WAVE | Kontodaten | keine | Baumeister-P02 / `/private/tmp/kd-review49-p02` | src/lib/accountDriver.js; src/services/uebernahme.js; src/services/storage.js; Konto-/Adoptiontests; neue review49_p02_* Tests | DONE | 4a5cc52 / 2b9b92a |
| P03 | W1 / PARALLEL_WAVE | Pruefwerkzeuge | keine | Baumeister-P03 / `/private/tmp/kd-review49-p03` | blogprofilanalyse_test.mjs; local_data_safety_test.mjs; tests/private-v1/private-v1.spec.mjs; tools/rls_test_personal.mjs; tools/radar_freitext_live_contract.mjs; tools/function-release-info.mjs; zugehoerige Werkzeugtests; neue review49_p03_* Tests | DONE | 4a5cc52 / 84cde78 |
| P04 | W2 / PARALLEL_WAVE | Persoenliche Eingaben | W1/P02,P03 | p04_personal / `/private/tmp/kd-review49-p04` | src/App.jsx; components/{DreiFragen,GeschmackBereich,GeschmackOnboarding,ProfilAnsicht,MustWatchListe,StapelImport,EintragForm,FilmCard,EditPanel}; controllers/{useArticleController,useMustwatchController}; lib/{match,artikel,libraryProjection,stapelimport,profil,extraktion,personalEntryChronology,prognose}; BlogTab; entsprechende Tests + review49_p04_* | DONE | 84cde78 / 2b850aa |
| P05 | W2 / PARALLEL_WAVE | Radar und Faktenkontext | W1; E05-002 vor E14-001 intern | p05_radar / `/private/tmp/kd-review49-p05` | lib/{localEventRadar,radarPilotContracts,personRadarCatalog}; services/{radarPilot,radarWebsearch}; useEntdeckenRadarController; Radar*.jsx; EntdeckenTab; design-secondary.css; radar-websearch-task/*; _shared/flixpatrolFactsContext.js; Migrationen 20260917100000/101000; Radar-/Faktencontexttests + review49_p05_* | DONE | 84cde78 / 9b3da55 |
| P06 | W2 / PARALLEL_WAVE | Filmwissen und KI-Fehler | W1/P03 | p06_filmwissen / `/private/tmp/kd-review49-p06` | ai-task/index.ts; filmwissen-task/*; lib/{filmwissen,filmwissenTransport,prognoseAuftrag}; services/{filmwissen,vorbewertung}; useIntelligenceController; components/{FilmwissenBereich,PrognoseBereich}; Migration 20260917110000; filmwissen*/ai_task/prognose_auftrag/vorbewertung Tests + review49_p06_* | DONE | 84cde78 / 7def1b0; Rest aeca490 / f957fbe |
| P07 | W3 / PARALLEL_WAVE | Streaming und Katalog | P04/App | p07_streaming / `/private/tmp/kd-review49-p07` | App.jsx; Streamingcontroller/-libs; StreamingTab/KinoTab; TitelKartenAktionen; eigene Migrationen und Tests | DONE | a2c6b60 / cb63219 |
| P08 | W3 / PARALLEL_WAVE | Entdecken-Belege | W1; disjunkt zu W2 | p08_entdecken / `/private/tmp/kd-review49-p08` | entdeckenUi/Projection; webDiscoveryFeed; entdecken-daily-task Producervertrag; Migration 20260917130000 und Entdecken-Tests | DONE | a2c6b60 / 338948d |
| P09 | W3b / PARALLEL_WAVE | Wochenplan und Termine | App-Klickvertrag eingefroren; kein Output von P07 | p09_planning / `/private/tmp/kd-review49-p09` | Wochenplan.jsx; StartTab.jsx; enge Wochenplan-Editorregeln in index.css/design-primary.css; eigene Termin-/Browsertests | DONE | a2c6b60 / 89e8918 |
| P10a | W3c / PARALLEL_WAVE | Sichtbares Mediathek-Sprungziel | App-Propvertrag read-only | p10a_focus / `/private/tmp/kd-review49-p10a` | MediathekTab.jsx; eigene Fokus-/Navigationstests | DONE | a2c6b60 / 2217e5a |
| P10b | W4 / PARALLEL_WAVE → SOLO | Pins und Kinonavigation | P07/App und P09/StartTab | p10b_navigation / `/private/tmp/kd-review49-p10b` | App.jsx; KinoTab/StartTab; entdeckenPins und eng begrenzte Pinhelper; eigene Navigations-/Browsertests | DONE | 45ada41 / 79dfe15 |
| P11 | W3 / PARALLEL_WAVE | Finder-Zeitfilter | W1; programm read-only | p11_finder / `/private/tmp/kd-review49-p11` | src/lib/finder.js; Finder-Tests; keine App-/programm-Aenderung | DONE | a2c6b60 / 8be8375 |
| P12 | W1b / PARALLEL_WAVE | Betriebsvertraege | keine; disjunkt zu P01/P03 | Baumeister-P12 / `/private/tmp/kd-review49-p12` | .github/workflows/automatic-ai-check.yml; neue Retentionmigration; private-ops-check; zugehoerige Tests | DONE | 4a5cc52 / dfabad9 |

Kollisionspruefung: Dateien/Generatoren, Exports, Schema/State, Config/Styles, Dependencies/Lockfile, Tests/Fixtures, Output-Abhaengigkeiten und Worktrees beruecksichtigt. W1: P01×P02×P03 disjunkt. W2: App/Persoenliches=P04, Radar/Faktencontext=P05, KI/Filmwissen=P06; gemeinsame read-only Identitaetsvertraege eingefroren. W3: App/Streaming/Kino=P07, Entdeckenprojektion=P08, Finderlogik=P11. W3b: P09 ersetzt den abgeschlossenen P11-Slot mit Wochenplan/StartTab/Editor-CSS ohne App-Aenderung; P10b folgte nach integriertem P07/P09-Stand. App-Schreiber laufen ausschliesslich in Folgewellen.

E14-Abhaengigkeiten: E02-001 vor E02-002 innerhalb P01; E05-002 vor vollstaendiger E14-001-Serienabnahme innerhalb P05; E13-003 vor kuenftiger Function-Auslieferung; E13-004 vor Browserpflichtgate. Werkzeugkorrekturen P03 vor ihrer Verwendung als Abnahmenachweis.

## Vollstaendige Ticketzuordnung

| Rang | Ticket | Prioritaet | Paket | Verantwortlicher | Status | Fixcommit | Pruefnachweis |
|---:|---|---|---|---|---|---|---|
| 1 | [E02-001](../2026-09-vollreview/tickets/E02/KD-REV-E02-001.md) | P1 | P01 | Baumeister-P01 | DONE | e45e2ba | [P01](evidence/P01.md); lokal fokussiert belegt |
| 2 | [E03-002](../2026-09-vollreview/tickets/E03/KD-REV-E03-002.md) | P1 | P02 | Baumeister-P02 | DONE | 2b9b92a | [P02](evidence/P02.md): 154 Checks; 22 neue Sollszenarien |
| 3 | [E03-001](../2026-09-vollreview/tickets/E03/KD-REV-E03-001.md) | P2 | P02 | Baumeister-P02 | DONE | 2b9b92a | [P02](evidence/P02.md): 154 Checks; 22 neue Sollszenarien |
| 4 | [E09-001](../2026-09-vollreview/tickets/E09/KD-REV-E09-001.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 5 | [E08-002](../2026-09-vollreview/tickets/E08/KD-REV-E08-002.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 6 | [E05-003](../2026-09-vollreview/tickets/E05/KD-REV-E05-003.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 7 | [E10-004](../2026-09-vollreview/tickets/E10/KD-REV-E10-004.md) | P2 | P06 | Baumeister-P06 | DONE | 7def1b0 + f957fbe | [P06](evidence/P06.md); 36 echte Formular-/Prognosefaelle und 9 Parserfaelle; unabhaengig ERLEDIGT auf 114b268 |
| 8 | [E04-004](../2026-09-vollreview/tickets/E04/KD-REV-E04-004.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 9 | [E04-005](../2026-09-vollreview/tickets/E04/KD-REV-E04-005.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 10 | [E04-006](../2026-09-vollreview/tickets/E04/KD-REV-E04-006.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 11 | [E04-001](../2026-09-vollreview/tickets/E04/KD-REV-E04-001.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 12 | [E08-004](../2026-09-vollreview/tickets/E08/KD-REV-E08-004.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 13 | [E02-002](../2026-09-vollreview/tickets/E02/KD-REV-E02-002.md) | P2 | P01 | Baumeister-P01 | DONE | e45e2ba | [P01](evidence/P01.md); lokal fokussiert belegt |
| 14 | [E08-003](../2026-09-vollreview/tickets/E08/KD-REV-E08-003.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 15 | [E06-002](../2026-09-vollreview/tickets/E06/KD-REV-E06-002.md) | P2 | P07 | Baumeister-P07 | DONE | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 16 | [E11-003](../2026-09-vollreview/tickets/E11/KD-REV-E11-003.md) | P2 | P07 | Baumeister-P07 | DONE | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 17 | [E05-001](../2026-09-vollreview/tickets/E05/KD-REV-E05-001.md) | P2 | P07 | Baumeister-P07 | DONE | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 18 | [E06-001](../2026-09-vollreview/tickets/E06/KD-REV-E06-001.md) | P2 | P07 | Baumeister-P07 | DONE | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 19 | [E14-002](../2026-09-vollreview/tickets/E14/KD-REV-E14-002.md) | P2 | P07 | Baumeister-P07 | DONE | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 20 | [E06-003](../2026-09-vollreview/tickets/E06/KD-REV-E06-003.md) | P2 | P07 | Baumeister-P07 | DONE | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 21 | [E07-001](../2026-09-vollreview/tickets/E07/KD-REV-E07-001.md) | P2 | P08 | Baumeister-P08 | DONE | 338948d | [P08](evidence/P08.md): fokussierte Produkt-/Integrationsnachweise |
| 22 | [E11-001](../2026-09-vollreview/tickets/E11/KD-REV-E11-001.md) | P2 | P09 | Baumeister-P09 | DONE | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 23 | [E12-003](../2026-09-vollreview/tickets/E12/KD-REV-E12-003.md) | P2 | P09 | Baumeister-P09 | DONE | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 24 | [E12-002](../2026-09-vollreview/tickets/E12/KD-REV-E12-002.md) | P2 | P07 | Baumeister-P07 | DONE | cb63219 | [P07](evidence/P07.md): fokussierte Produkt-/Integrationsnachweise |
| 25 | [E10-003](../2026-09-vollreview/tickets/E10/KD-REV-E10-003.md) | P2 | P06 | Baumeister-P06 | DONE | 7def1b0 | [P06](evidence/P06.md): 39 Modul-/Transporttests, 19 PG17- und 41 Handlerfaelle |
| 26 | [E01-001](../2026-09-vollreview/tickets/E01/KD-REV-E01-001.md) | P2 | P10b | Baumeister-P10b | DONE | 79dfe15 | [P10b](evidence/P10b.md): 48 reale Browserpfade plus Nachbarn |
| 27 | [E04-003](../2026-09-vollreview/tickets/E04/KD-REV-E04-003.md) | P2 | P10a | p10a_focus | DONE | 2217e5a | [P10a](evidence/P10a.md): 16 echte Komponentenpfade plus Nachbarn |
| 28 | [E11-004](../2026-09-vollreview/tickets/E11/KD-REV-E11-004.md) | P2 | P09 | Baumeister-P09 | DONE | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 29 | [E11-002](../2026-09-vollreview/tickets/E11/KD-REV-E11-002.md) | P2 | P10b | Baumeister-P10b | DONE | 79dfe15 | [P10b](evidence/P10b.md): 48 reale Browserpfade plus Nachbarn |
| 30 | [E09-002](../2026-09-vollreview/tickets/E09/KD-REV-E09-002.md) | P2 | P11 | Baumeister-P11 | DONE | 8be8375 | [P11](evidence/P11.md): fokussierte Produkt-/Integrationsnachweise |
| 31 | [E09-003](../2026-09-vollreview/tickets/E09/KD-REV-E09-003.md) | P2 | P11 | Baumeister-P11 | DONE | 8be8375 | [P11](evidence/P11.md): fokussierte Produkt-/Integrationsnachweise |
| 32 | [E01-002](../2026-09-vollreview/tickets/E01/KD-REV-E01-002.md) | P2 | P09 | Baumeister-P09 | DONE | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 33 | [E04-002](../2026-09-vollreview/tickets/E04/KD-REV-E04-002.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 34 | [E08-001](../2026-09-vollreview/tickets/E08/KD-REV-E08-001.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 35 | [E05-002](../2026-09-vollreview/tickets/E05/KD-REV-E05-002.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 36 | [E14-001](../2026-09-vollreview/tickets/E14/KD-REV-E14-001.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 37 | [E07-002](../2026-09-vollreview/tickets/E07/KD-REV-E07-002.md) | P2 | P08 | Baumeister-P08 | DONE | 338948d | [P08](evidence/P08.md): fokussierte Produkt-/Integrationsnachweise |
| 38 | [E12-001](../2026-09-vollreview/tickets/E12/KD-REV-E12-001.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 39 | [E10-001](../2026-09-vollreview/tickets/E10/KD-REV-E10-001.md) | P2 | P06 | Baumeister-P06 | DONE | 7def1b0 | [P06](evidence/P06.md): 39 Modul-/Transporttests, 19 PG17- und 41 Handlerfaelle |
| 40 | [E13-003](../2026-09-vollreview/tickets/E13/KD-REV-E13-003.md) | P2 | P03 | Baumeister-P03 | DONE | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 41 | [E09-004](../2026-09-vollreview/tickets/E09/KD-REV-E09-004.md) | P2 | P03 | Baumeister-P03 | DONE | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 42 | [E13-004](../2026-09-vollreview/tickets/E13/KD-REV-E13-004.md) | P2 | P03 | Baumeister-P03 | DONE | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 43 | [E02-003](../2026-09-vollreview/tickets/E02/KD-REV-E02-003.md) | P2 | P03 | Baumeister-P03 | DONE | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 44 | [E08-005](../2026-09-vollreview/tickets/E08/KD-REV-E08-005.md) | P2 | P03 | Baumeister-P03 | DONE | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |
| 45 | [E13-001](../2026-09-vollreview/tickets/E13/KD-REV-E13-001.md) | P2 | P12 | Baumeister-P12 | DONE | dfabad9 | [P12](evidence/P12.md): Core/Workflow, 67 Monitorchecks, 13 PG17-Gruppen |
| 46 | [E13-002](../2026-09-vollreview/tickets/E13/KD-REV-E13-002.md) | P2 | P12 | Baumeister-P12 | DONE | dfabad9 | [P12](evidence/P12.md): Core/Workflow, 67 Monitorchecks, 13 PG17-Gruppen |
| 47 | [E10-002](../2026-09-vollreview/tickets/E10/KD-REV-E10-002.md) | P2 | P06 | Baumeister-P06 | DONE | 7def1b0 | [P06](evidence/P06.md): 39 Modul-/Transporttests, 19 PG17- und 41 Handlerfaelle |
| 48 | [E11-005](../2026-09-vollreview/tickets/E11/KD-REV-E11-005.md) | P3 | P09 | Baumeister-P09 | DONE | 89e8918 | [P09](evidence/P09.md): fokussierte Produkt-/Integrationsnachweise |
| 49 | [E03-003](../2026-09-vollreview/tickets/E03/KD-REV-E03-003.md) | P3 | P03 | Baumeister-P03 | DONE | 84cde78 | [P03](evidence/P03.md); lokal fokussiert belegt |

## Lokaler Abschluss und Geltung

| Pruefung | Ergebnis | Bindung |
|---|---|---|
| Unabhaengige Einzelabnahme | 49 ERLEDIGT; 239 Kriterien; 0 offene Belegluecken | exakt 114b268, Astra/xhigh |
| `npm test` einschliesslich `pretest` und `test:review49` | Exit 0; vollstaendiger ungeteilter Lauf, 130,918 s | exakt 114b268 |
| `npm run test:function -- --cached-only` | 349 bestanden, 0 fehlgeschlagen | ac8fca5; saemtliche Function-/Testinputs seither bytegleich |
| `npm run test:review49:browser` | Exit 0; Mehrtab, Radar, Streaming/Kino, Planung und Start; Chromium/WebKit | ac8fca5; saemtliche Browser-/Produktinputs seither bytegleich |
| `npm run build` | Exit 0 | exakt 114b268 |
| `npm run check:function-release` | Exit 0; vollstaendiger transitiver Abschluss mit 11 ai-task-Dateien | exakt 114b268 |
| Abschlussdiff / Ticketzuordnung | whitespace-sauber; 49 eindeutige Tickets; alle Fixcommits integriert | Basis 4a5cc52 → 114b268 |
| Bestandswahrung | 49 Originalticket-Hashes und alle fuenf vorgefundenen Nutzerdatei-Hashes unveraendert; Primaer-HEAD unveraendert | [Preflight](evidence/preflight.json) und FINAL_GATE.json |

Der unabhaengige Bericht wurde vor dem anschliessenden Masterabschluss uebergeben. Seine damals noch offenen Master-Schritte Gesamtsuite/Build sind durch die obigen Originalausfuehrungen und [FINAL_GATE.json](evidence/FINAL_GATE.json) geschlossen. Originale Pruefstdout-Bytes sind unveraendert gespeichert; komprimierte Logs und deren Originalhashes sind in FINAL_GATE.json ausgewiesen. Die Folgecommits nach der ersten Produktabnahme ac8fca5 veraenderten nur vier bestehende Tests und Dokumente; deshalb behalten die bereits gruenen Function-/Browsernachweise ihre Gueltigkeit. Kein alter Bug-Harness-PASS dient als Fixnachweis.

Die Master-Abnahme fand vier konkrete veraltete Testannahmen. Die verantwortlichen Baumeister korrigierten sie mit zusaetzlichen Soll- und Gegenpruefungen: P07 `ui_library_followup_test.mjs` (214a737) und `async_persistence_ui_test.mjs` (5f30449), P04 `controllers_test.mjs` (4d361ae) und `extraktion_test.mjs` (3aa384e). Der Abschlusspruefer pruefte nur diese Belegdeltas nach. Keine Produktlockerung erfolgte daraus; der abschliessende komplette npm-test-Lauf bestand.

Ein echter Restfehler aus der unabhaengigen Pruefung wurde ebenfalls geschlossen: P06s typisierte Filmwissen-Kennung hatte numerische persoenliche TMDB-IDs im Formular verworfen und zwei Werkzeugparser blockiert. Das eng begrenzte Delta f957fbe trennt die beiden Vertraege; die eigene Prueferreproduktion sowie echte Formular-/Prognose- und Parserpruefungen belegen die Korrektur. E10-004 ist auf dem finalen Kandidaten ERLEDIGT.

Integration erfolgte sequenziell mit Scope-/Diff-/Belegkontrolle jeder Lieferung. Gemeinsame App-Dateien hatten nacheinander P04, P07 und P10b als Schreibowner. Restauftraege erhielten ausdruecklich begrenzte, kollisionsfreie Ownership. Ausfuehrungsdetails und tatsaechliche Dateien stehen in den Paketbelegen; eingefrorene Prueferzwischenstaende sind reine Provenienzevidenz, keine weiteren Register.

Ticketprovenienz: Die alten SHA256-Metadaten in E14/FINAL_REVIEW.json weichen von den beim Einstieg vorgefundenen Ticketdateien ab. Die 49 IDs sind deckungsgleich; saemtliche tatsaechlich uebernommenen Originalbytes sind seit Preflight/Basis 4a5cc52 unveraendert. [Pruefer-Provenienz](evidence/verification/ticket-provenance.json) dokumentiert diese Grenze.

## Liefergrenzen

Gebaut, lokal getestet, unabhaengig abgenommen und lokal committed. Push, CI, Deployment, bestehende Serverdatenwrites, bezahlte Anbieteraufrufe und praktische iPhone/PWA-Abnahme wurden nicht durchgefuehrt. Die SQL-Nachweise verwenden frische lokale PG17-Testcluster mit synthetischen Daten; sie ersetzen keine Abnahme auf einem bestehenden Server. **E13-F005 bleibt separat UNGEKLAERT und zaehlt nicht zu den 49.**

## Konkret vorbereitete spaetere Auslieferung

Noch nicht beauftragt oder ausgefuehrt. Der nach lokaler Abnahme festgelegte Produktcommit bleibt der gemeinsame Lieferkandidat. Alte Runbooks mit anderen Migrationsnamen/Functionstaenden sind kein Nachweis fuer diese Lieferung.

1. Frische Ziel-Refs, Migrationsledger, Function-Quellstaende, Web-/Service-Worker-Version und laufende Scheduler read-only erheben. Nur die tatsaechlich fehlenden Migrationen anwenden. Vor der autorisierten Bestandsumschreibung die betroffenen Radar-/Filmwissen-Identitaeten sichern und die Ruecklese-/Wiederherstellungsprobe festlegen.
2. Das Versionsfenster fuer Radar- und Filmwissen-Schluessel sowie Feedannotation koordinieren. Alte Radarwriter werden serverseitig normalisiert; alte Reader koennen v2-Schluessel nicht lesen. Alte numerische Filmwissen-TMDB-Anfragen werden bewusst abgewiesen. Strenge alte Entdecken-Clients verstehen angereicherte Format-8/9-Feeds nicht. Neue Writer duerfen erst nach passender DB und aktualisierten Readern ausgegeben werden; fuer Filmwissen ist ein abgestimmtes Wartungsfenster erforderlich. Laufende Scheduler/Requests vor dem Schema-/Writerwechsel kontrolliert auslaufen lassen.
3. Die sechs neuen Migrationen in dieser Reihenfolge einsetzen und ihren jeweiligen Vertrag ruecklesen:
   - `20260917100000_review_radar_text_identity.sql`: Plattformschluessel v2, UUIDs/Versionen/Quellen erhalten, Kollision stoppt atomar.
   - `20260917101000_review_radar_context_year.sql`: belegtes Jahr im Kontext, Authgrenzen unveraendert.
   - `20260917110000_review_filmwissen_identity.sql`: Film-TMDB `movie:`, Serie `tv:`, Filmreihe `collection:`; ungesicherte Nicht-Film-Altkennungen bleiben gesperrt.
   - `20260917120000_review_streaming_freshness_anchors.sql`: Quellfrist und qualifizierte Neu-Anker im bestehenden Seitenvertrag.
   - `20260917123000_review_mail_rate_bucket_retention.sql`: begrenzte Ratenbucket-Aufbewahrung unter bestehendem Purgegate, Operationsledger erhalten.
   - `20260917130000_review_entdecken_ofi_identity.sql`: nur belegte OEFI-Annotationen in Format 8/9, unveraenderte Save-/Claim-/Fencegrenzen.
4. Genau die betroffenen Functions aus demselben Commit deployen: `ai-task` (11 lokale Quelldateien), `entdecken-daily-task` (19), `radar-websearch-task` (10). Die Zuordnung wurde mit dem reparierten transitiven Importabschluss ermittelt. Danach Authmodus und vollstaendige heruntergeladene Quellen bytegenau vergleichen; ein ACTIVE-Status allein genuegt nicht. Den bestehenden Buildmarker fuer ai-task erst nach erfolgreichem Code-Deploy aktualisieren.
5. Den gleichen Webcommit zuerst auf Staging liefern; Buildmetadaten, feste Domain, atomare Deployment-URL und Service Worker ruecklesen. Aktuelle Login-/Kontoload-, Pin-/Navigation-, Radar-/Filmwissen- und Streaming-Vertraege providerfrei pruefen. Erst danach waere Produktion mit denselben Readbacks an der Reihe. Die korrigierten Workflowbytes fuer automatic-ai-check gehoeren ebenfalls zur Lieferung; natuerlicher Schedulerlauf ist ein eigener Betriebsnachweis.
6. Praktische iPhone/PWA-Abnahme getrennt: Sitzungswechsel/Reload, kontogetrennte Daten, frischer Start mit Pins, Must-Watch-/Kinospruenge, Wochentag-Touchflaechen und Streaming-Refresh/Neu-Fristen. Browsermock, Deployment und physisches Geraet bleiben getrennte Aussagen.

Kostenpflichtige Anbieterproben sind fuer diese lokale Reparatur nicht erforderlich und nicht freigegeben. Der Ablauf oben fuehrt keinen dieser Schritte aus.
