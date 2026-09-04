# Privatrelease: lokale Evidenzzuordnung 2026-09-04

Diese Datei ist kein zweites Fortschrittsregister. Sie ordnet dem vollständigen
Issue-Register genau einen lokalen Beleg zu und hält die sieben kanonischen
Nutzermeilensteine als einzige Fortschrittszeilen. Der Kandidat ist lokal
zusammengebaut; ein gemeinsamer Abschlusslauf, Push, CI, Deployment und eine
praktische Abnahme in der installierten iPhone-PWA folgen getrennt.

## Zentrale Nutzermeilensteine

| Meilenstein | Lokaler Kandidatenstand | Noch offene Grenze |
| --- | --- | --- |
| M-01 | Sicherheits-, Login- und Recoverykorrekturen integriert; account-ready Boot im netzgesperrten Browsergate. | Gemeinsamer Abschlusslauf und reale Recovery-/Geräteabnahme. |
| M-02 | Chronik, Obsession-Suche, globales Ranking und Auswahl-Sprungschutz integriert und im Browserpfad verbunden. | Gemeinsamer Abschlusslauf und praktische PWA-Abnahme. |
| M-03 | Jahrzehntvertrag in beiden Streamingansichten und katalogfreier Start des Hauptbereichs integriert. | Gemeinsamer Abschlusslauf sowie reale Kalt-/Warmmessung nach Deployment. |
| M-04 | Radar-Zielbezug und lokale Katalogbilanz/Aktualitätsdiagnose integriert. | Live-Datenstand und aktiviertes Aktualisierungsintervall nicht belegt. |
| M-05 | Belegte Serienereignisse werden read-only in die Woche projiziert; datenlose Deltas bleiben im Pinboard. | Gemeinsamer Abschlusslauf und reale Katalogfrische. |
| M-06 | Datums-, Hilfe-, Single-File-, Semantik-, Navigation- und Touchverträge integriert. | Gemeinsamer Abschlusslauf und physische iPhone-PWA-Abnahme. |
| M-07 | Run-Audit, Schutzverträge, lokale Releasekompatibilität und Abschlussgate liegen vor. | Push, CI, Deployment und Live-Readbacks nicht erfolgt. |

## Vollständiges Issue-Evidenzledger

Jede Zeile bezeichnet Implementierung beziehungsweise Vertrag, den fokussierten
Beleg und die verbleibende Außenwirkungsgrenze. „Integriert“ bedeutet hier nur
im lokalen Kandidaten vorhanden, nicht ausgeliefert.

| ID | Lokale Evidenz | Ehrlicher Stand |
| --- | --- | --- |
| R-01 | `src/controllers/localDataSafetyController.js`, `src/lib/backup.js`, `cleanup_b1_test.mjs` | Vollständigkeitsbeleg sperrt die Löschfreigabe fail-closed; reale Geräte-Recovery offen. |
| R-02 | `src/config/runtime.js`, `src/App.jsx`, `cleanup_b2_test.mjs` | Radaroberfläche und Runtimefähigkeit nutzen dieselbe Capability; Production-Readback offen. |
| R-03 | `supabase/functions/entdecken-daily-task/contract.js`, `responseContract.js`, `cleanup_b2_test.mjs` | Function- und Datenvertrag lokal vereinheitlicht; keine Migration oder Function deployt. |
| R-04 | `supabase/functions/automatic-ai-check/core.js`, Entry-Point, Workflow, Mocktests und read-only Telemetrie | Drain lokal produktionsfähig verdrahtet: höchstens drei Jobs strikt seriell, aggregierter Backlog/Lag und ein retryfreier Workflow-Aufruf; Push, Deploy, Schedulerlauf und Livewirkung NICHT BELEGT. |
| R-05 | `src/lib/authDriver.js`, `src/services/sessionCoordinator.js`, `cleanup_b1_test.mjs` | Sitzungsvertrag wird vor Persistenz geprüft; kein echter Login in diesem Paket. |
| R-06 | `src/components/GlobalSearchBar.jsx`, `src/index.css`, `cleanup_c1_test.mjs` | Globale Suchaktionen besitzen mobile Hitboxen; physische Touchabnahme offen. |
| R-07 | `src/tabs/BlogTab.jsx`, `private_release_blog_surface_test.mjs`, `tests/cleanup-d2.spec.mjs` | Separater Expand-Button mit Fokus-/ARIA-Beziehung; Chromium/WebKit fokussiert. |
| R-08 | `src/index.css`, `tests/mobile-layout.spec.mjs`, `cleanup_c1_test.mjs` | Kompakte Iconaktionen erhalten 44-px-Hitboxen; iPhone-PWA offen. |
| R-09 | `.github/workflows/entdecken-six-day.yml`, `cleanup_b3_test.mjs` | Fachlicher Terminalfehler endet rot; kein Run gestartet oder wiederholt. |
| R-10 | `playwright.private-v1.config.mjs`, `tests/private-v1/fixtures.mjs`, `tests/private-v1/private-v1.spec.mjs` | Kleiner account-ready Chromium-/WebKit-Harness ist vollständig netzgesperrt und retryfrei. |
| R-11 | `src/tabs/EntdeckenTab.jsx`, `entdecken_phase3_test.mjs`, `tests/cleanup-d2.spec.mjs` | Unteransichten sind ehrliche Navigation ohne falsche Tabrollen. |
| R-12 | `src/components/AppNavigation.jsx`, `cleanup_d2_test.mjs`, `tests/cleanup-d2.spec.mjs` | Desktop setzt genau eine aktuelle Seite per `aria-current`. |
| R-13 | `src/services/sessionCoordinator.js`, `cleanup_b1_test.mjs` | Recoveryfehler werden als stabiler Boundary-Text präsentiert; reale Fehlerfälle offen. |
| R-14 | `src/components/InstallationCard.jsx`, `src/lib/hilfeInhalte.js`, `cleanup_b2_test.mjs`, `cleanup_d2_test.mjs` | Sichtbares Downloadversprechen entfernt, solange Production umleitet; lokaler Builder bleibt. |
| R-15 | `src/lib/releaseCompatibility.js`, `tools/release-compatibility.mjs`, `cleanup_b2_test.mjs` | Read-only Paritätsmanifest/Gate lokal; kein Live-Readback in diesem Paket. |
| R-16 | `tools/private-ops-check.mjs`, `tools/private_ops_monitor_test.mjs`, `cleanup_b3_test.mjs` | Umgebungsgebundene Sollmatrix kennt den Radar-Pilotzustand. |
| R-17 | `src/services/ai.js`, `cleanup_b2_test.mjs` | Unimplementierte Clientaktion aus aktiver Fläche entfernt. |
| U-01 | `src/lib/streamingSort.js`, `src/tabs/StreamingTab.jsx`, `tests/cleanup-c2.spec.mjs` | Beide Regler zeigen Jahrzehnte und erzwingen Jahr aufsteigend bei unveränderter Bandbreite. |
| U-02 | `src/lib/personalEntryChronology.js`, `src/tabs/StartTab.jsx`, `cleanup_c1_test.mjs` | Belegte persönliche Erstellzeiten erscheinen wirklich zuletzt. |
| U-03 | `src/lib/titleSearch.js`, `src/lib/globalSearchProjection.js`, `cleanup_foundation_test.mjs`, `cleanup_c1_test.mjs` | Bereich ist weicher Tie-Breaker; konservative deterministische Tippfehlertoleranz. |
| U-04 | `src/lib/catalogTitleSearch.js`, `src/lib/finder.js`, `tests/private-v1/private-v1.spec.mjs` | Obsession wird lokal/global gefunden; Absenden, Ranking und Sprungschutz sind getrennt belegt. |
| U-05 | `src/tabs/StreamingTab.jsx`, `src/App.jsx`, `cleanup_c2_test.mjs` | Nur sichtbares Streaminglabel heißt „Alles“; interner Schlüssel und Hauptbereich bleiben erhalten. |
| U-06 | `src/lib/entdeckenFreshness.js`, Function, Migration und Workflow der 24h-Kadenz | 24h-Migration/Function/Workflow lokal authored, NICHT angewandt/deployt, Liveintervall NICHT BELEGT. |
| U-07 | `src/lib/radarNews.js`, `src/tabs/EntdeckenTab.jsx`, `radar_news_test.mjs` | Neuigkeit projiziert vorhandene Zielbeziehung als sichtbare Provenienz, ohne Raten. |
| U-08 | `src/lib/presentationDate.js`, konsumierende UI-Flächen, `cleanup_d2_test.mjs` | Sichtbare Daten deutsch/europäisch; ISO bleibt intern. |
| U-09 | `src/tabs/MediathekTab.jsx`, `src/index.css`, `tests/mobile-layout.spec.mjs` | Sticky Suche, Filter-/Sortierpersistenz, „Fertig“ und Auswahl-IDs integriert. |
| U-10 | `src/components/SelectionControl.jsx`, `src/components/MustWatchListe.jsx`, `cleanup_c1_test.mjs` | Must-Watch nutzt den gemeinsamen zugänglichen Checkboxvertrag. |
| U-11 | `docs/CLEANUP_RUN_AUDIT_2026-09-04.md` | Alle Workflows read-only inventarisiert; kein Run gestartet oder wiederholt. |
| U-12 | `src/App.jsx`, `docs/CLEANUP_C2_ENTDECKEN_PERFORMANCE_2026-09-04.md`, `tests/cleanup-c2.spec.mjs` | Hauptbereich lädt Vollkatalog erst bei Bedarf; lokale Kalt-/Warmwerte dokumentiert. |
| U-13 | `src/lib/hilfeInhalte.js`, mobile Navigation, `hilfe_dom_test.mjs`, `tests/cleanup-d2.spec.mjs` | Hilfe mobil auffindbar; kein falsches Downloadversprechen. |
| U-14 | `src/lib/catalogAudit.js`, `docs/ENTDECKEN_KATALOG_AUDIT_2026-09-04.md`, `cleanup_c3_test.mjs` | Rückgang je Snapshot/Pipelinephase bilanziert, nicht als Marktabgang behauptet. |
| D-01 | `src/lib/personalEntryChronology.js`, `cleanup_c1_test.mjs` | Unveränderliche Erstellzeit plus ehrlicher Legacy-Fallback. |
| D-02 | `src/lib/globalSearchProjection.js`, `src/lib/finder.js`, `cleanup_c1_test.mjs` | Bereichsübergreifende Treffer bleiben stärker als Bereichspräferenz. |
| D-03 | `src/lib/titleSearch.js`, `src/lib/catalogTitleSearch.js`, `cleanup_foundation_test.mjs` | Deterministische Titel-/Alternativtitel-/Editdistanzkaskade ohne LLM. |
| D-04 | `src/tabs/MediathekTab.jsx`, `src/App.jsx`, `tests/private-v1/private-v1.spec.mjs` | Auswahl über lokale Änderungen stabil; globale Navigation verlangt explizite Bestätigung. |
| D-05 | `src/tabs/StreamingTab.jsx`, `src/App.jsx`, `cleanup_c2_test.mjs` | Haupt- und Unterbereich bleiben fachlich/technisch getrennt. |
| D-06 | `src/lib/catalogAudit.js`, `src/lib/entdeckenFreshness.js`, `docs/ENTDECKEN_KATALOG_AUDIT_2026-09-04.md` | Feedalter, Lauf, Aufnahme- und Filtergates vor Datenquellenumbau analysiert. |
| D-07 | `src/lib/presentationDate.js`, `cleanup_d2_test.mjs`, `tests/cleanup-d2.spec.mjs` | Präsentationsdatum zentral; Inputs, APIs, Persistenz, Dateinamen und ICS unverändert. |
| D-08 | `src/lib/seriesWatchEvents.js`, `beobachtet_2_test.mjs` | Private katalogbasierte Projektion bleibt frei von Radar-, Profil-, Netzwerk- und Schreibwirkung. |
| D-09 | gemeinsamer `.kd-touch-checkbox`-/`SelectionControl`-Vertrag, `cleanup_d2_test.mjs`, `tests/cleanup-d2.spec.mjs` | Checkboxinventar und repräsentative 393-px-Hitboxen belegt. |
| D-10 | `.github/workflows/entdecken-six-day.yml`, `docs/CLEANUP_RUN_AUDIT_2026-09-04.md`, `cleanup_b3_test.mjs` | Schutzabbruch und Fachfehler klassifiziert; Benachrichtigung nicht pauschal stumm. |
| Beobachtet 2.0 | `src/lib/seriesWatchEvents.js`, `src/lib/wochenplan.js`, `beobachtet_2_test.mjs`, privater Browserpfad | Nur vollständig belegte frische Termine landen in „Deine Woche“; datenlose Deltas ausschließlich im Pinboard. |

## Abschlussgate und Wirkungsgrenzen

Fokussierter D3-Paketnachweis:

- `npm run test:private-release-final:unit`: 5/5 Node-Tests bestanden;
- `npm run test:private-v1`: 8/8 Browserfälle bestanden, je vier bei 393 ×
  852 px in Chromium und WebKit, `retries: 0`;
- pro Browserfall wurden 6 bis 9 synthetische Backendrequests lokal erfüllt,
  kein unbekannter Fixturepfad und kein echter Non-localhost-Request passierte
  das Routengate.

`npm run test:private-release-final` ist für den Meister vorbereitet und darf
auf dem integrierten Kandidaten genau einmal laufen. Es aggregiert ohne Retry:
vollständige providerfreie Mocksuite, Functiontests, den account-ready
Chromium-/WebKit-Harness, Vite-Build, Single-File-Build sowie abschließenden
Diff-, Artefakt-, sichtbaren Downloadwahrheits- und Added-Delta-Leakcheck. Das
D3-Paket führt diesen Wrapper selbst ausdrücklich nicht aus.

Getrennte Zustände zum Zeitpunkt dieses Paketcommits:

- gebaut: Produktartefakte in D3 nicht als Abschlussbeweis gebaut;
- getestet: nur der neue Browserharness und die fokussierten Gate-Unit-Tests;
- committed: nach Paketabschluss mit dem unten berichteten D3-SHA;
- pushed: nein;
- CI-grün: nicht behauptet;
- deployed: nein;
- praktisch in der iPhone-PWA abgenommen: nein.
