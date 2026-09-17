# Lokale Behebung der 49 bestaetigten Reviewtickets

Einziges zentrales Register. Originaltickets bleiben unveraendert unter `../2026-09-vollreview/tickets`. E13-F005 bleibt separat UNGEKLAERT und ist nicht Teil der 49.

**Lokal abgeschlossen: 49/49 DONE.** Der unabhaengige Abschlusspruefer bestaetigt **49 ERLEDIGT, 0 OFFEN, 0 NICHT BELEGT** mit 239 einzelnen Kriterienabgleichen. Vollstaendige Mock-Suite, Function-Mocks, Browserabnahme, Build und Abschlussdiff sind bestanden.

Aktueller lokal und unabhaengig abgenommener Kandidat: **`9d88b7dc1e27a8580f5b223400ac8b7535ed003a`** auf `codex/review49-integration-20260917`. Er enthaelt alle 49 Fixes, die drei gezielten Altclient-Ergaenzungen und ihre festen Testbefehle. Nachfolgende Commits finalisieren nur Dokumente und Belege; Produkt-, Test- und Konfigurationsbytes bleiben unveraendert. DONE bezeichnet lokale Abnahme, nicht Deployment.

Aktuelle Nachweise: [unabhaengiger Deltabericht](evidence/benefit-delta/DELTA_REVIEW.md), [49 Issues / 239 Kriterien am finalen Stand](evidence/benefit-delta/DELTA_REVIEW.json), [Master-Abschlusslauf mit Original-Logarchiven und Hashen](evidence/ROLLOUT_FINAL_GATE.json). Die vollstaendige zweite Nutzenpruefung bleibt unter [Originalbericht](evidence/benefit-audit/REVIEW.md) erhalten: alle 49 BEHALTEN, keine unbegruendete globale Zusammenlegung. Vier direkt betroffene Issues wurden nach den gezielten Korrekturen erneut geprueft; 45 Urteile wurden mit Quellenvergleich fortgeschrieben.

**Alle drei zusaetzlich gefundenen Mischbetriebsreste sind lokal geschlossen.** Filmwissen hat dabei eine bewusste Grenze: Alte TMDB-only-PWAs erhalten bis zum Update keinen Filmwissenbericht, weil ihr Request Film und Serie nicht unterscheidet. Diese Einschraenkung wird nicht als vollstaendige Rueckwaertskompatibilitaet oder ausschliesslicher Vorteil ausgegeben. Staging/Produktion sind weiterhin ungepusht; die ausdrueckliche gemeinsame Backendfreigabe und praktische iPhone/PWA-Abnahme stehen aus.

Historische Abnahmen: urspruenglich 114b268 (Dokumentation bis 8ae8c6e), anschliessend ab8b563 mit ausschliesslich drei portablen SQL-Teststartern; a69a32b war der produktgleiche Stand der zweiten vollstaendigen Nutzenpruefung. Diese eingefrorenen Belege bleiben als Provenienz erhalten und werden durch die aktuelle Abnahme ergaenzt.

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
| M3 | Katalog, Streaming, Entdecken und Radar zeigen identitaetstreue, frische Inhalte | DONE | P05 P07 P08 | 9b3da55 + cb63219 + 338948d + b88c403 + 990e779; P05/P07/P08 und R-P05/R-P08 |
| M4 | Filmwissen und KI behandeln Werkart und Fehler verlaesslich | DONE | P06 | 7def1b0 + f957fbe + 8f010e7; P06/R-P06 und finale Abnahme |
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
| 5 | [E08-002](../2026-09-vollreview/tickets/E08/KD-REV-E08-002.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 + b88c403 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen; [R-P05](evidence/R-P05.md): Mischbetrieb unabhaengig lokal abgenommen |
| 6 | [E05-003](../2026-09-vollreview/tickets/E05/KD-REV-E05-003.md) | P2 | P04 | Baumeister-P04 | DONE | 2b850aa | [P04](evidence/P04.md): 112 neue Sollpruefungen plus Nachbarn |
| 7 | [E10-004](../2026-09-vollreview/tickets/E10/KD-REV-E10-004.md) | P2 | P06 | Baumeister-P06 | DONE | 7def1b0 + f957fbe + 8f010e7 | [P06](evidence/P06.md); 36 echte Formular-/Prognosefaelle und 9 Parserfaelle; unabhaengig ERLEDIGT auf 114b268; [R-P06](evidence/R-P06.md): Mischbetrieb unabhaengig lokal abgenommen |
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
| 34 | [E08-001](../2026-09-vollreview/tickets/E08/KD-REV-E08-001.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 + b88c403 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen; [R-P05](evidence/R-P05.md): Mischbetrieb unabhaengig lokal abgenommen |
| 35 | [E05-002](../2026-09-vollreview/tickets/E05/KD-REV-E05-002.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 36 | [E14-001](../2026-09-vollreview/tickets/E14/KD-REV-E14-001.md) | P2 | P05 | Baumeister-P05 | DONE | 9b3da55 | [P05](evidence/P05.md): SQL-/Teilpersistenz-/Personen-/Browserpruefungen |
| 37 | [E07-002](../2026-09-vollreview/tickets/E07/KD-REV-E07-002.md) | P2 | P08 | Baumeister-P08 | DONE | 338948d + 990e779 | [P08](evidence/P08.md): fokussierte Produkt-/Integrationsnachweise; [R-P08](evidence/R-P08.md): Mischbetrieb unabhaengig lokal abgenommen |
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

Gebaut, lokal getestet, unabhaengig abgenommen und lokal committed. Push, CI, Deployment, bestehende Serverdatenwrites, bezahlte Anbieteraufrufe und praktische iPhone/PWA-Abnahme wurden bis zur lokalen Abnahme nicht durchgefuehrt. Die SQL-Nachweise verwenden frische lokale PG17-Testcluster mit synthetischen Daten; sie ersetzen keine Abnahme auf einem bestehenden Server. **E13-F005 bleibt separat UNGEKLAERT und zaehlt nicht zu den 49.**

## Staging-Auftrag vom 17.09.2026

Max beauftragt jetzt die Staging-Lieferung zur eigenen iPhone/PWA-Abnahme. Der Produktionspush folgt ausdruecklich erst nach seiner Freigabe. Der Master fuehrt die Lieferung; es gibt keinen weiteren Pruef- oder Lieferchat. Status: **VORBEREITET; Entscheidung ueber die gemeinsame Backendwirkung offen.**

[Frischer Read-only-Preflight](evidence/STAGING_PREFLIGHT.json): main und staging sowie beide Webbuilds stehen weiter auf 14804ce. Der Push-Probelauf des lokalen Kandidaten 8ae8c6e nach staging ist force-frei moeglich; noch kein Push oder Deploy. Beide GitHub-Umgebungen verwenden jedoch dasselbe Supabase-Projekt `bscjgwcntapobyxsiyce` und dieselben Functionnamen. Die zugaengliche Projektliste enthaelt nur dieses Projekt. Alle sechs neuen Migrationen fehlen; die bestehenden Schnittstellen passen zu den erwarteten Vorgaengern. Die Serverzaehlung findet 26 Radar-v1-Funde und keine bestehenden TMDB-Filmwissen-Zuordnungen. Der alte Kennungsnormalisierer akzeptiert numerische TMDB-IDs und weist die neuen typisierten IDs ab.

Deshalb kann eine volle Staging-Lieferung mit unveraendertem Produktionsbackend noch nicht behauptet werden. Vor gemeinsamer Umstellung sind Ziel/Umfang und das Versionsfenster zu klaeren: Die neue Radar-Migration schreibt auch die von alten Prod-Clients gelesenen Fundschluessel um; der neue Filmwissenvertrag lehnt deren numerische TMDB-Anfragen ab. Max ist die Wahl zwischen getrenntem Staging-Backend und einer ausdruecklich vorgezogenen gemeinsamen Umstellung mit Wartungsfenster vorgelegt. Keine Serverdatenmutation, kein neuer Anbieterrequest und keine neue Infrastruktur wurden ausgefuehrt.

Unabhaengige CI-Vorbereitung abgeschlossen: Die bestehenden Owner korrigierten parallel ausschliesslich die PostgreSQL-Pfadwahl ihrer Testdatei und den eigenen Paketbeleg, alle von 8ae8c6e in neuen Worktrees. Sequenziell integriert: P05 `bdc16fa`, P06 `562720b`, P07 `ab8b563`. Keine gemeinsamen Schreibflaechen oder Produktaenderungen; SQL, Fixtures und fachliche Assertions unveraendert. Ein tatsaechlicher Ubuntu-CI-Lauf bleibt bis zum Push offen.

Der unabhaengige Abschlusspruefer bestaetigt auf exakt ab8b563 weiterhin **49 ERLEDIGT / 239 Kriterien, 0 OFFEN, 0 NICHT BELEGT**: [Deltabericht](evidence/verification/staging-portability-delta/DELTA_REVIEW.md). Der Master-Abschlusslauf auf demselben Commit bestand: komplette `npm test`-Suite (128,172 s), Build und Function-Quellpruefung jeweils Exit 0. Die frueheren 349 Function-Mocks und Browsernachweise gelten wegen bytegleicher Inputs weiter. [Staging-Kandidatenabnahme](evidence/STAGING_LOCAL_GATE.json) bindet Original-Logs, Hashes, Diff-/Bestandspruefung und Prueferbericht. Alle 49 Originaltickets und ihre Fixzuordnung bleiben erhalten. Bis a69a32b folgten nur Abschlussdokumente. Die spaeter autorisierte Nutzenpruefung und ihre drei lokalen Kompatibilitaetskorrekturen sind unten separat gebunden; kein Push/Deploy und keine gemeinsame Datenmigration ohne geklaerte Zielgrenze.

## Konkret vorbereitete spaetere Auslieferung

Staging-Weblieferung ist inzwischen beauftragt; die oben benannte gemeinsame Backendgrenze bleibt offen. Noch kein Schritt ausgefuehrt. Der nach lokaler Abnahme festgelegte Produktstand bleibt der gemeinsame Lieferkandidat. Alte Runbooks mit anderen Migrationsnamen/Functionstaenden sind kein Nachweis fuer diese Lieferung.

1. Frische Ziel-Refs, Migrationsledger, Function-Quellstaende, Web-/Service-Worker-Version und laufende Scheduler read-only erheben. Nur die tatsaechlich fehlenden Migrationen anwenden. Vor der autorisierten Bestandsumschreibung die betroffenen Radar-/Filmwissen-Identitaeten sichern und die Ruecklese-/Wiederherstellungsprobe festlegen.
2. Die neue `ai-task`-Function zuerst liefern: alte numerische Synthesen enden kontrolliert, alte Prognosen koennen bei expliziter Werkart adaptiert werden, der belegte alte SQL-TMDB-Vertragsfehler laesst die persoenliche Prognose ohne optionales Filmwissen weiterlaufen. Neue typisierte Browser duerfen noch nicht ausgeliefert werden. Altclients ohne Werkart behalten die benannte Filmwissen-Einschraenkung bis zu ihrem Update. Laufende Requests/Scheduler und Abschluss ihrer Transaktionen beim Wechsel kontrollieren.
3. Die jetzt sieben neuen Migrationen in normaler Dateireihenfolge einsetzen und ihren jeweiligen Vertrag ruecklesen. Frisch bestaetigen, dass insbesondere 1100 noch nie remote angewandt wurde; andernfalls STOPP und neue additive Planung, kein stilles Ueberschreiben der Historie.
   - `20260917095000_review_radar_client_compat.sql`: kompatiblen V1-Werkstarthash im Feed vor der V2-Umschreibung installieren; keine Bestandszeilenmutation.
   - `20260917100000_review_radar_text_identity.sql`: interne Plattformschluessel v2, UUIDs/Versionen/Quellen erhalten, Kollision stoppt atomar; Feed bleibt V1-kompatibel.
   - `20260917101000_review_radar_context_year.sql`: belegtes Jahr im Kontext, Authgrenzen unveraendert.
   - `20260917110000_review_filmwissen_identity.sql`: Film-TMDB `movie:`, Serie `tv:`, Filmreihe `collection:`; ungesicherte Nicht-Film-Altkennungen bleiben gesperrt. Der terminale Numeric-Readguard wird in derselben Transaktion wirksam.
   - `20260917120000_review_streaming_freshness_anchors.sql`: Quellfrist und qualifizierte Neu-Anker im bestehenden Seitenvertrag.
   - `20260917123000_review_mail_rate_bucket_retention.sql`: begrenzte Ratenbucket-Aufbewahrung unter bestehendem Purgegate, Operationsledger erhalten.
   - `20260917130000_review_entdecken_ofi_identity.sql`: nur belegte OeFI-Annotationen in Format 8/9, unveraenderte Save-/Claim-/Fencegrenzen.
4. Anschliessend `radar-websearch-task` und `entdecken-daily-task` aus demselben Commit liefern. Radar bekommt die kompatible HTTP-Projektion und die begrenzte Partial-Capability. Bei Entdecken werden Producer und Leseprojektion gemeinsam als eine Function geliefert: alte Leser erhalten die bisherigen 50 Eintraege, neue die sichere Zusatzannotation. Insgesamt drei betroffene Functions (`ai-task`: 11 lokale Quelldateien, Entdecken: 19, Radar: 10); die Quellmengen sind beim finalen Releasecheck erneut zu bestaetigen. Nach jedem Deploy Authmodus und vollstaendige heruntergeladene Quellen bytegenau vergleichen; ACTIVE allein genuegt nicht. ai-task-Buildmarker erst nach erfolgreichem Code-Deploy aktualisieren. Nach ersten neuen Daten keine blinde Rueckkehr zum alten strikten Entdecken-Reader oder V1-Persistenzstand; kompatible Leser erhalten, Rollback nur gegen konkret gesicherte Daten/UUIDs pruefen.
5. Den gleichen Webcommit zuerst auf Staging liefern; Buildmetadaten, feste Domain, atomare Deployment-URL und Service Worker ruecklesen. Aktuelle Login-/Kontoload-, Pin-/Navigation-, Radar-/Filmwissen- und Streaming-Vertraege providerfrei pruefen. Erst danach waere Produktion mit denselben Readbacks an der Reihe. Die korrigierten Workflowbytes fuer automatic-ai-check gehoeren ebenfalls zur Lieferung; natuerlicher Schedulerlauf ist ein eigener Betriebsnachweis.
6. Praktische iPhone/PWA-Abnahme getrennt: Sitzungswechsel/Reload, kontogetrennte Daten, frischer Start mit Pins, Must-Watch-/Kinospruenge, Wochentag-Touchflaechen und Streaming-Refresh/Neu-Fristen. Browsermock, Deployment und physisches Geraet bleiben getrennte Aussagen.

Kostenpflichtige Anbieterproben sind fuer diese lokale Reparatur nicht erforderlich und nicht freigegeben. Der Ablauf oben fuehrt keinen dieser Schritte aus.

## Ausdrueckliche zweite Nutzen- und Regressionspruefung

Neuer Nutzerauftrag am 17.09.2026: Ausnahmsweise alle 49 Fixes nochmals unabhaengig nachpruefen, ihren tatsaechlichen Nutzen bewerten und gemeinsame Ursachen beziehungsweise kleinere gemeinsame Korrekturen suchen. Die erwaehnte Produktionsfreigabe ist an ein Versprechen ausschliesslicher Vorteile gebunden. Eine solche Garantie ist nicht belegbar; sie wird nicht behauptet oder als bedingungslose Freigabe fuer die gemeinsame Serverumstellung behandelt. Bis zum Ergebnis bleiben Push und Serverwirkung zurueckgestellt.

Eingefrorener Pruefkandidat: `a69a32be51d8258fc4604d925f03ff35d74b4da6`; Produkt-/Testbytes identisch mit lokal abgenommenem ab8b563. Ein frischer unabhaengiger Astra/xhigh-Pruefer (`fix_benefit_audit`) besitzt ausschliesslich seinen neuen Bericht und prueft jedes Originalticket gegen Vorherstand 14804ce, integrierten Code, Kriterien, Nachbarverhalten, neuen Aufwand und Rollout-Kompatibilitaet. Keine Produktwrites, keine weiteren Pruefer durch ihn und keine ausgelagerte Gesamtsuite. Der Master untersucht parallel die gemeinsamen Daten-/Zustandsknoten read-only und haelt Entscheidungen in diesem Register zusammen. E13-F005 bleibt ausserhalb der 49.

Pro Ticket sind lokaler Erledigungsstatus sowie BEHALTEN/KORRIGIEREN/VEREINFACHEN/ZURUECKNEHMEN mit begruendetem Nutzen und Grenzen gefordert. Gemeinsame Ursachen fuehren nur bei konkretem Vorteil zu einer Konsolidierung; gleich aussehende Schutzpruefungen mit verschiedenen Datenvertraegen sind kein ausreichender Grund. Bestaetigte Restfehler gehen gezielt an den bisherigen Owner; nur betroffene Issues und unmittelbare Abhaengigkeiten werden danach erneut kontrolliert.

Abgeschlossen auf dem eingefrorenen Kandidaten: [Originalbericht](evidence/benefit-audit/REVIEW.md), [JSON](evidence/benefit-audit/REVIEW.json), [Artefaktmanifest](evidence/benefit-audit/ARTIFACT_SHA256.json). Jede der 49 IDs aus der fuehrenden Ticketzuordnung hat erneut ERLEDIGT und BEHALTEN, konkrete Fundstellen, begruendeten Nutzen, Verhaltensaenderung, Komplexitaet/Risiko sowie die erneut direkt aus Originaltickets gewonnenen Abnahmekriterien. Der Master hat 49 Originalticket-Hashes, alle 239 Kriterientexte, 60 gepruefte Quelldatei-Hashes, aktuelle Codezeilen und die Protokoll-Hashes gegen den Integrationsworktree gegengeprueft. 43 frische Pruefprotokolle einschliesslich gezielter Chromium-/WebKit-, lokaler PostgreSQL- und netzgesperrter Handlerpruefungen sind archiviert. Vier erste PG-Starts scheiterten nur an der Sandbox vor fachlicher Ausfuehrung; identische spaetere Laeufe bestanden, beide Belegarten bleiben erhalten.

Es gab keinen neuen Produkt- oder Testpatch. Der dokumentierte vollstaendige Masterlauf auf ab8b563 (Mock-Suite, Build und Function-Release-Check) sowie die bestaetigten Function-/Browserbelege bleiben durch nachgewiesene Bytegleichheit gueltig. Der Pruefer uebernahm weder Gesamtsuite noch Auslieferung. Bericht und Einzelprotokolle sind eingefrorene Evidenz; dieses Register bleibt die einzige fuehrende Statusquelle.

### Gemeinsame Ursachen und vorhandene Korrekturpunkte

Master-Strukturabgleich auf a69a32b: Die folgende Zuordnung ordnet jedes der 49 Tickets genau einer primaeren Ursachenfamilie zu. Sie ersetzt weder die Einzelabnahme noch die unterschiedlichen Abnahmekriterien. Gleiche Familie bedeutet insbesondere nicht automatisch denselben implementierbaren Datenvertrag.

| Primaere Ursachenfamilie | Anzahl | Tickets |
|---|---:|---|
| Unvollstaendige Werkidentitaet oder verlorener Kontext | 13 | E04-001, E04-006, E05-002, E05-003, E06-002, E07-001, E07-002, E08-002, E08-003, E08-004, E10-004, E11-003, E14-001 |
| Veralteter Zustand oder unklare Zustandshoheit | 8 | E02-001, E02-002, E03-001, E03-002, E05-001, E06-001, E06-003, E14-002 |
| Eingaben, Entwuerfe und bestaetigte Teilergebnisse erhalten | 7 | E04-002, E04-004, E04-005, E08-001, E09-001, E11-001, E11-005 |
| Navigation und kalendarische Zuordnung | 7 | E01-001, E01-002, E04-003, E09-002, E09-003, E11-002, E11-004 |
| Transportgrenzen und vollstaendiger Abschluss asynchroner Arbeit | 3 | E10-001, E10-002, E10-003 |
| Bedienelemente erreichbar halten | 3 | E12-001, E12-002, E12-003 |
| Pruefwerkzeuge und Betriebsvertraege | 8 | E02-003, E03-003, E08-005, E09-004, E13-001, E13-002, E13-003, E13-004 |

| Konkreter Knoten am Pruefstand | Mehrfachwirkung / Entscheidung |
|---|---|
| `src/lib/staffeln.js:49` (`ordneStreamingPageTitelZu`), Verbraucher `:59`, `:106` und `src/tabs/StreamingTab.jsx:54` | E06-002/E11-003 verwenden bereits denselben strikten Abgleich gegen die aktuelle Mediathek fuer Verknuepfung, Status, Navigation und erneutes Anlegen. Behalten: Die alte konkurrierende Kennungsheuristik ist entfernt. Eine weitere globale Identitaetsabstraktion ersetzt hier keinen verbleibenden Sonderweg. |
| `src/lib/finder.js:328-337`, Verbraucher `:377`, `:529` | E09-002/E09-003 sind bereits gemeinsam korrigiert: vollstaendiger lokaler Kalendertag, kalendarisches Morgen und ein Terminfilter fuer allgemeinen Finder sowie Kinosuche. Behalten. Wochenplan-ISO-Zeitpunkte haben einen anderen Vertrag; ihre pauschale Umstellung auf Kinotext-Datumsparser waere keine sichere Vereinfachung. |
| `src/lib/libraryProjection.js:19`, Verbraucher `:274` | E04-001 korrigiert die gemeinsame Must-Watch-Projektion und verwendet sie auch beim Masterersatz. Jahr und Werkart bleiben erhalten; die zweite, verlustbehaftete Projektion entfaellt. Behalten. |
| `src/lib/bewertungsvergleich.js:2`, Verbraucher `src/components/FilmCard.jsx:295`, `src/components/EintragForm.jsx:237` | E04-002 leitet Status und Herkunft aus dem endgueltigen Bewertungsinhalt ab. Derselbe kleine Vergleich ersetzt verschiedene Entscheidungen in Karteneditor und Formular. Behalten. |
| `src/lib/authDriver.js:100-106`, `:118`, `:219`, `:344-477` | E02-001/E02-002 teilen Sitzungsidentitaet, Versionsvergleich und den atomaren Commitpfad. Deduplizierung des Refreshrequests und Absicherung seines spaeteren Commits schuetzen verschiedene Zeitpunkte. Beide bleiben erforderlich. Ein fehlender sicherer Browser-Commitweg sperrt die Operation; das ist ein bewusster Verfuegbarkeitsabzug zugunsten der Sitzungstrennung. |
| `src/lib/accountDriver.js:247-286`, `src/services/uebernahme.js:304` | E03-001/E03-002 nutzen denselben Pullpfad, brauchen aber zwei Regeln: alte Revisionen ignorieren und bei ausdruecklicher Kontouebernahme fehlende Toepfe leeren. Ein allgemeines Leeren bei jedem fehlenden Pullwert wuerde den normalen Synchronisationsvertrag verschlechtern. |
| `supabase/functions/_shared/externalTitleIdentity.js:32-61`, `:101`, `:144`; `src/lib/filmwissen.js:23-37`; `src/lib/profil.js:708-747` | Externe Katalogidentitaet ist bereits browser-/serverseitig geteilt. Numerische persoenliche TMDB-IDs, typisierte Filmwissen-Transportkennungen und bestaetigte eigene Profil-Master-IDs sind verschiedene Vertraege. Der bereits behobene f957fbe-Restfehler belegt konkret, warum sie nicht blind auf einen Normalisierer umgestellt werden duerfen. Gemeinsame Werkartnormalisierung an passenden Grenzen behalten. |
| `src/lib/katalog.js:472-549`, `src/controllers/useStreamingPageController.js:151-193`, `src/controllers/useStreamingNeuController.js`, `src/App.jsx:920-930` | E05-001/E06-001/E06-003/E14-002 betreffen Publikationsgeneration, Quellenablauf, persoenliche Neu-Anker und manuellen Refresh. Gleiche Ursache veralteter Anzeigen, aber unterschiedliche Besitzer und Lebensdauern. Nicht zu einer einzigen Uhr/Revision zusammenfassen. Bei widerspruechlichen Kataloggenerationen kann die Anzeige voruebergehend weniger Angebote enthalten; sie vermeidet dafuer falsche Verfuegbarkeit. |
| `src/lib/stapelimport.js:267-302`; `src/controllers/useEntdeckenRadarController.js`; `src/lib/profil.js:716` | Bestaetigte Teilpersistenz, Radar-Draftkorrekturen und bereits bestaetigte Profilfilme teilen das Prinzip, erfolgreiche oder persoenliche Arbeit zu erhalten. Die Transaktions-/Auswahlregeln unterscheiden sich. Die produktiven Stapelschreibwege sind bereits an einem Ergebnisadapter zusammengefuehrt; ein globaler Mergehelfer wuerde Mehrdeutigkeiten verstecken. |
| `supabase/functions/filmwissen-task/quellen.ts:122-244`; `src/services/radarWebsearch.js:214-255` | Die Frist muss den Antwortbody einschliessen. Filmwissen teilt den begrenzten Leser bereits zwischen Quellen und bewahrt Rohbytes fuer Hash/Provenienz; Radar dekodiert seinen eigenen Ergebnisvertrag. Kein neuer allgemeiner HTTP-Client nur wegen aehnlicher try/finally-Struktur. Die Laufzeit- und Provenienzanforderungen bleiben sichtbar. |
| `tools/function-release-info.mjs:16-61` | E13-003 beseitigt eine strukturelle Fehlerquelle: Der Quellnachweis folgt jetzt dem wirklichen transitiven Importgraphen statt einer manuellen Dateiliste. Ein einzelner Fix deckt damit auch kuenftige lokale Imports ab. Behalten. |

Abschlussentscheidung: Mehrere erwuenschte Zusammenfassungen sind bereits Bestandteil der Fixes. Der unabhaengige Pruefer bestaetigt neun gemeinsame Ursachen-/Knotenanalysen; ein zusaetzlicher Produktumbau allein zum Einsparen von Schutzpruefungen ist nicht begruendet. Insbesondere wird die erwaehnte kleinere Filmwissen-Alternative (Serien-TMDB frueh sperren, alten numerischen Filmvertrag erhalten) nicht als bereits besserer Fix ausgegeben: Sie wuerde typisierte Serien-Cacheadressen aufgeben und braeuchte eigene sichere Altkennungs-, SQL-/RPC- und Mischbetriebsnachweise. Die vorhandene Typtrennung ist lokal belegt; ihr noch offener Auslieferungsvertrag wird gesondert behandelt.

Unabhaengiger Rolloutbefund zu E07-002: Ein lokal erzeugter neuer Feed mit 50 Eintraegen und einer OeFI-Annotation besteht den neuen Validator in Format 8 und 9, wird vom produktiven Leser auf 14804ce aber jeweils vollstaendig mit `feed-shape-invalid` verworfen. Ohne Annotation akzeptiert derselbe alte Leser denselben Feed. Damit ist auch fuer den gemeinsamen Entdecken-Producer eine kompatible Einfuehrung oder isolierte Stagingumgebung erforderlich; die additive Form des Feldes allein macht den Vertrag wegen `exactKeys` nicht abwaertskompatibel. [Originalreproduktion](evidence/benefit-audit/repro-oefi-compat.mjs) und [Ergebnis](evidence/benefit-audit/repro-oefi-compat.json) sind unveraendert uebernommen. Keine Producer-/Feedmutation wurde ausgefuehrt.

Ergaenzender [read-only Readback am 17.09.2026](evidence/BACKEND_BRANCH_READBACK.json): `supabase branches list --project-ref bscjgwcntapobyxsiyce --output json` (regulaere CLI-Anmeldung) liefert Exit 0 und eine leere Branchliste; der JSON-Array-Vertrag ist ausdruecklich geprueft. Zusammen mit der bereits erhobenen Projektliste ist damit auch kein zugaenglicher separater Supabase-Branch fuer Staging nachgewiesen. Es wurde kein Branch angelegt und kein bestehendes Projekt veraendert.

Die konkret bestaetigten Auslieferungsgrenzen bleiben von den 49 lokalen Ticketstatus getrennt. Aktueller Stand nach der gezielten Restwelle:

| Gemeinsamer Vertrag | Betroffene Fixes / Owner | Risiko fuer bisherige Prod-/PWA-Leser | Status / notwendiger Schritt |
|---|---|---|---|
| Radar-Fundschluessel v1 → v2 | E08-002 und E08-001 / P05 | Interne Plattformidentitaeten werden umgestellt, UUIDs bleiben erhalten. Die neue SQL-/HTTP-Projektion liefert den echten V1-Werkstarthash; alte Partial-UI erhaelt ehrlich storage_error mit realen writes und lesbarem Feed. | LOKAL GESCHLOSSEN durch b88c403 und unabh. Delta; gemeinsame Serverumstellung/Sicherung/Readback noch nicht freigegeben oder ausgefuehrt. |
| Filmwissen: numerische → typisierte TMDB-Transportkennung | E10-004 / P06 | Der Altrequest ist fuer Film/Serie gleich. Er endet kuenftig terminal; nur Forecast mit expliziter Werkart wird adaptiert. Alte TMDB-only-PWAs verlieren bis zum Update Filmwissen, IMDb und sichere neue Wege bleiben erhalten. | LOKAL GESCHLOSSEN MIT ALTCLIENT-GRENZE durch 8f010e7 und unabh. Delta. Neue Function → atomare 1100 → neuer Client; gemeinsame Umstellung noch nicht freigegeben. |
| Entdecken: OeFI-Annotationen in Feedformat 8/9 | E07-002 / P08 | Neue GET-Projektion erhaelt fuer alte Leser den gesamten 50er-Basispool; neue Leser erhalten per exaktem Accept die sichere OeFI-Annotation. Speicherung unveraendert. | LOKAL GESCHLOSSEN durch 990e779 und unabh. Delta sowie Master-PG-/Chromium-/WebKit-Lauf. SQL1300 und vollstaendige neue Function vor neuem Producerfeed; gemeinsame Auslieferung noch nicht freigegeben. |

Dies sind keine drei weiteren Originaltickets und keine Umzaehlung der 49. Die aktuellen Reparaturen koennen lokal korrekt sein und zugleich ein kontrolliertes Versionsfenster benoetigen. Ein gleichzeitiger Push nach main und staging garantiert nicht, dass jede bereits installierte PWA sofort den neuen Leser benutzt. Das Versprechen ausschliesslicher Vorteile wird daher nicht abgegeben.

### Gezielte Restwelle fuer die Auslieferungsvertraege

Die bestaetigten drei Mischbetriebsreste gehen vor einer neuen Lieferentscheidung an die zustaendigen Fachpakete zurueck. Modus **PARALLEL_WAVE**, saubere gemeinsame Basis **9b8167bec8e2b13504d1190dfc6cb3769dbf3272** (vollstaendige zweite Pruefevidenz; Produktbytes weiterhin a69a32b/ab8b563). Alle drei unabhaengigen Pakete wurden parallel mit Astra/high gestartet. Master bleibt bei Produktdateien read-only, besitzt Register und spaetere Testbefehlsintegration. Kein weiterer Kontrollchat; derselbe unabhaengige Pruefer kontrolliert anschliessend nur betroffene Issues und unmittelbare Abhaengigkeiten.

| Restpaket | Owner / Worktree | Exklusive Schreibflaeche | Status |
|---|---|---|---|
| R-P05 / Radar | p05_rollout / `/private/tmp/kd-review49-rollout-p05-20260917` | Radar-Clientvertrags-/Servicedateien, radar-websearch-task, neue vorgezogene Migration `20260917095000_review_radar_client_compat.sql`, eigene `review49_rollout_p05_*` Tests/Fixtures und `evidence/R-P05.md` | DONE; unabhaengig lokal abgenommen |
| R-P06 / Filmwissen | p06_rollout / `/private/tmp/kd-review49-rollout-p06-20260917` | Filmwissen-Helper/Transport/Service/Prognoseauftrag, ai-task/filmwissen-task, gegebenenfalls ausschliesslich Filmwissen-eigener Helper, ausdruecklich freigegebener kleiner Numeric-Guard in der noch unremote `20260917110000_review_filmwissen_identity.sql`, eigene `review49_rollout_p06_*` Tests/Fixtures und `evidence/R-P06.md` | DONE; unabhaengig lokal abgenommen |
| R-P08 / Entdecken | p08_rollout / `/private/tmp/kd-review49-rollout-p08-20260917` | webDiscoveryFeed/entdeckenDailyFeed/entdeckenUi, entdecken-daily-task, keine neue Migration erforderlich, eigene `review49_rollout_p08_*` Tests/Fixtures und `evidence/R-P08.md` | DONE; unabhaengig lokal abgenommen |

Produktive/historische Migrationen, App, Auth, allgemeine Identitaetshelper, npm/Lockfile und fremde Tests bleiben fuer die Baumeister eingefroren. Ihre Schnittstellen werden nur innerhalb des jeweils eigenen Fachvertrags angepasst. Weitere Ownership braucht eine konkrete Masterzuweisung; kein stiller Architekturumbau. Die Pakete sollen echte alte/neue Leser, Writer und Persistenz pruefen, nicht nur neue Validatoren gruen halten. Ist ein Rest ohne unvertretbare Vertragsaenderung nicht klein loesbar, wird dies mit konkretem Gegenbeispiel und engster Option gemeldet. Keine Remote-, Anbieter- oder Bestandsdatenwirkung ist Bestandteil dieser lokalen Restwelle.

Konkrete Masterentscheidungen waehrend des Baus: Der Radar-Kompatibilitaetsvertrag muss vor der Identitaetsumschreibung aktiv sein; da er auf V1 funktioniert, wird er als neue additive 0950-Migration vor den ebenfalls noch unremote 1000-Fix gestellt. Fuer Filmwissen ist ein alter Request mit bloss numerischer TMDB-ID fuer Film und Serie bytegleich. Sicherer alter Vollnutzen ist daraus nicht rekonstruierbar. Legacy-Reads erhalten den vorhandenen terminalen Zustand `gesperrt`, direkte alte Synthesen enden providerfrei `nicht_zuordenbar`; Forecasts koennen nur bei vorhandener Werkart sicher adaptiert werden. Alte PWA-Versionen behalten damit eine ausdruecklich dokumentierte TMDB-only-Filmwissen-Einschraenkung bis zum Update. Der kleine Readerguard wird nach Auth/Kontopruefung atomar in die nie angewandte 1100-Migration aufgenommen; eine umfangreichere nachfolgende 1410-Wrappermigration entfaellt. Vor kuenftiger Lieferung ist diese Unremote-Voraussetzung erneut zu pruefen. Entdecken benoetigt nach aktuellem Bauplan nur eine begrenzte HTTP-Leseprojektion und keine weitere Migration. Alle drei Varianten sind sequenziell integriert: R-P08 adbd9b3 → 990e779, R-P05 c096c43 → b88c403 und R-P06 6d438c9 → 8f010e7. Scope, Produktdiff und fokussierte Belege wurden vor der Integration kontrolliert. Tatsaechliche Dateien, Tests und Grenzen stehen in den drei unveraenderten Paketbelegen. Der P06-Owner durfte zusaetzlich genau die bisherige Numeric-Read-Erwartung in review49_p06_sql_test.mjs auf den neuen terminalen Sollstatus umstellen; Normierer, Schreibvalidierung und ACL-Gegenproben bleiben strikt. Die zweite unabhaengige Deltakontrolle und der erneuerte Masterabschluss sind auf 9d88b7d gruen abgeschlossen (siehe unten).

Master-Testintegration: Die neuen Radar-/Filmwissen-SQL- und Function-Mocktests laufen dauerhaft in `test:review49` und damit `npm test`. Der Filmwissen-Handlerlauf bestand zusaetzlich mit voellig leerem Deno-Cache ohne Netzrecht; er braucht keinen lokalen Altcache. Der kombinierte Entdecken-SQL-/Chromium-/WebKit-Mischbetrieb laeuft in `test:review49:browser`, damit die normale CI-Mocksuite nicht unangekuendigt installierte Browser voraussetzt. Die CI-Browser-Matrix bleibt unveraendert; dieser zusaetzliche reale Kompatibilitaetslauf ist als lokale Integrationsabnahme dokumentiert.

### Erneuerter Abschluss nach den drei Kompatibilitaetskorrekturen

Exakt **9d88b7dc1e27a8580f5b223400ac8b7535ed003a**, Astra/xhigh-Deltapruefer, keine weitere Produktkorrektur nach dem Abschlusslauf. [Abschlussbeleg](evidence/ROLLOUT_FINAL_GATE.json) bindet alle originalen Ausgaben an diesen Commit.

| Nachweis | Ergebnis |
|---|---|
| Unabhaengiger Deltaabschluss | 49/49 ERLEDIGT und BEHALTEN; 239 Kriterien; 4 gezielte Deltas, 45 anhand der Quellen fortgeschriebene Urteile; 0 offene lokale Belegluecken |
| Vollstaendiges `npm test` inklusive pretest und neuer Regressionen | Exit 0, 136,166 s |
| `npm run test:function -- --cached-only` | 349 bestanden, 0 fehlgeschlagen |
| `npm run test:review49:browser` | Exit 0, 118,797 s; Chromium und WebKit, neue Entdecken-Alt/Neu-CORS-/PG-Matrix eingeschlossen |
| Build und Function-Quellabschluss | Beide Exit 0; ai-task 11, Radar 10, Entdecken 19 transitive lokale Quelldateien mit finalen Hashen |
| Originale Prueferartefakte | 48 Dateien vor und nach Kopie hashgeprueft; 122 Quellhashbelege, alle aktuellen Fundstellen und 239 Original-Kriterientexte gegengeprueft |
| Abschlussdiff und Register | Whitespace-sauber; 49 eindeutige IDs, alle Fixcommits Vorfahren des Kandidaten; 49 Originaltickets und fuenf Nutzerdateien unveraendert |

[Frischer Read-only-Stand](evidence/rollout-remote-read-only.json): Refs/Webbuilds beider Umgebungen unveraendert 14804ce; Ledger 87 Migrationen, neueste 20260916193000, keine der sieben geplanten neuen Migrationen ausgefuehrt. [Konkrete Lieferfolge und Migrationshashes](evidence/rollout-delivery-scope.json) sowie [Function-Quelldateien/-hashes](evidence/rollout-function-closure.json) sind vorbereitet. Ein erster oeffentlicher urllib-GET erhielt 403; der begrenzte Curl-Readback mit Browser-User-Agent bestaetigte beide Buildmetadaten und Service Worker. Keine Servermutation oder Anbieterwirkung entstand.

Die lokale Behebung und erneute Nutzenpruefung sind damit abgeschlossen. Push, tatsaechliche CI, Deployment/Serverreadback und praktische iPhone/PWA-Abnahme bleiben eigenstaendige offene Liefer-/Abnahmeschritte. Eine Nullrisiko- oder Nur-Vorteile-Garantie wird nicht behauptet. Staging-Web ist beauftragt; die sieben Migrationen und drei Functions betreffen jedoch das gemeinsame Produktionsbackend. Dafuer braucht es eine ausdrueckliche Freigabe dieser benannten Wirkung. Die spaetere Produktions-Weblieferung bleibt hinter der iPhone/PWA-Entscheidung.

### Vorbereitung der praktischen iPhone-/PWA-Abnahme

**Vorbereitet, nicht ausgefuehrt.** Erst nach bestaetigtem Staging-Deployment und Readback des Kandidaten testen. Aktuell ist die oeffentliche Stagingseite weiterhin der alte Stand. Weil Staging und Produktion derzeit Konten/Backend teilen, ist ein separates Testkonto erforderlich; die Umgebung ist noch keine isolierte Datenkopie. Vor der Geraeteabnahme Buildkennung und erfolgreich uebernommenes PWA-Update festhalten. Die folgenden Handpruefungen ergaenzen gezielte lokale Race-/Fehler-/SQL-Tests und ersetzen diese nicht.

| Wo / Ablauf | Darauf achten | Tickets / Grenze |
|---|---|---|
| Anmeldung, Abmeldung, PWA ganz schliessen und erneut oeffnen; gegebenenfalls zwischen zwei Testkonten wechseln | Richtige Sitzung bleibt erhalten; fremde bzw. vorherige Gastlisten erscheinen nach Kontoladen nicht im Konto. | E02-001/002, E03-001/002. Ein normaler Klicklauf provoziert die exakt verspaetete Refresh-/Pullantwort nicht verlaesslich; dafuer bestehen deterministische Regressionstests. |
| Einen Titel pinnen, PWA neu starten und direkt Start oeffnen | Pin ist sichtbar, bevor Entdecken/Kino/Streaming separat geladen wurden; Antippen fuehrt zum passenden Werk. | E01-001, E11-002/003/004. Nur eindeutig zugeordnete Titel fuer die Positivprobe verwenden. |
| Mediathek oder Must-Watch bearbeiten: Jahr langsam ziffernweise eingeben, loeschen und neu eingeben; speichern, neu oeffnen | Zwischeneingaben springen nicht zurueck; gespeichertes Jahr und Werkart bleiben erhalten. | E04-001/004/006. Bestehende persoenliche Eintraege fuer diesen Versuch nicht opfern; eigene Testeintraege verwenden. |
| Mit aktiven Mediathekfiltern einen anderen Titel ueber die globale Suche oeffnen; auch eine persoenliche Kinoempfehlung und einen Kinoreminder oeffnen | Der angeforderte Eintrag wird sichtbar, aufgeklappt und erreicht; kein Sprung ins Leere oder zum namensgleichen falschen Werk. | E04-003, E11-002/003/004. |
| Start → Deine Woche → Eintrag: Wochentage einzeln antippen; Wiederholung mit Anzahl auswaehlen und sichtbare 12 unveraendert speichern; erneut oeffnen | Nur der beruehrte Tag wechselt; 12 bleibt als Ende gespeichert; Leerzeichen als Titel werden verstaendlich abgewiesen. | E11-001/005, E12-003; Terminlisten bleiben chronologisch (E01-002). |
| Streaming laden, anderen Tab oeffnen, global aktualisieren, zu Streaming zurueckkehren | Frischer Katalogstand wird verwendet. Normales Neu-Laden macht alte Titel nicht erneut neu; unsichere/veraltete Verfuegbarkeit wird nicht als frische Gewissheit gezeigt. | E05-001, E06-001/003, E14-002. Ablauf-/Generationsgrenzen werden zusaetzlich mit kontrollierter Uhr und synthetischen Katalogen geprueft. |
| Kino- und Streamingkarten oeffnen/schliessen; bei Bedarf VoiceOver oder externe Tastatur verwenden | Eigene benannte Detailaktion ist erreichbar; Oeffnen veraendert keinen Gesehen-/Merkstatus. | E12-002. Ein Touchtest allein belegt keinen vollstaendigen Tastatur-/Screenreaderweg. |
| Radar-Aufnahmevorschau aus der Suche oeffnen und ohne Uebernahme schliessen; Hoch-/Querformat, lange Inhalte und Tastatur ausprobieren | Hinweis und vollstaendige Schliessen-Flaeche bleiben erreichbar; der Hintergrund springt nicht; Wochenplan-Tagesfelder ueberlappen nicht. | E12-001/003. Die reine Vorschau benoetigt keinen neuen Anbietercheck. |

Stapel-Teilwritefehler, absichtlich widerspruechliche Werkkennungen, Antwortbody-Timeouts, SQL-/RLS-Vertraege und Pruefwerkzeuge sind vor allem durch kontrollierte lokale Tests abgedeckt. Ihre Auswirkungen waeren im Frontend dennoch wesentlich: verlorene Eingaben, falsche Verknuepfungen, fremde Daten oder dauerhaft haengende Aktionen. Reale kostenpflichtige KI-/Radar-Pruefungen sind kein Bestandteil dieses vorbereiteten Klicklaufs.
