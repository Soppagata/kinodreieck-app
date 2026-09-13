# PWA-Ladezeiten: gemeinsames Etappenregister

Owner: Meister dieses Tasks. Auftrag: 13.09.2026, progressive erste Inhalte + Cache, je Ebene ein Baumeister, Meisterintegration, genau ein kontrollierter Gesamtprüfer.

Nutzerweg: Seite/Zähler/20 Titel → weitere Daten bei offenem Bereich → Zwischenstand bei Rückkehr → Hintergrundfrische bei fortlaufender 14-Tage-Frist.

## Meilensteine

| ID | Nutzbares Ergebnis | Zustand | Owner |
| --- | --- | --- | --- |
| P1 | Kleine erste Katalogantwort und korrekte vollständige Zähler | OFFEN | A |
| P2 | Schneller Wiederaufruf aus Sitzung/Gerät, kontrollierte Hintergrundfrische | OFFEN | B |
| P3 | Erste 20 Karten, portionsweises Nachladen, bedienbarer Bereichswechsel; Produktion ohne technische Quellen-/Standangaben | OFFEN | C |
| P4 | Fristen, Identität, Konto-/Seen-/Pin-/Merkliste bleiben korrekt | OFFEN | A/B/C je Scope |
| P5 | Integrierter Nutzerweg einmal kontrolliert geprüft | OFFEN | ein Abschlussbaumeister |

## Welle

Modus: PARALLEL_WAVE mit eingefrorenem Dokumentvertrag. Keine veränderliche Foundation. Alle Paketbranches starten vom selben Plancommit `75fdcd97ec7c7098d2eafcbbdd657e8fbe60de0d` auf einem Nicht-main-Branch.

Integration: `/private/tmp/kd-pwa-progressive-integrate-20260913`, `codex/pwa-progressive-20260913`.

| Paket | Ebene und exklusive Write-Fläche | Worktree / Branch | Status |
| --- | --- | --- | --- |
| A | Neue additive `supabase/migrations/*streaming_page*`; neue Backendhelfer `supabase/functions/_shared/streamingPage*`; `streaming_pages_*test.mjs`; `docs/STREAMING_PAGES_BACKEND.md`. Bestehende SQL-Dateien nur lesen. | `/private/tmp/kd-pwa-pages-backend-20260913`, `codex/pwa-pages-backend-20260913`; Agent `/root/pages_backend` | RUNNING |
| B | `src/App.jsx`; `src/services/catalog.js`, `src/services/streamingPages.js`; `src/lib/katalog.js`, `src/lib/staffeln.js`, neue `src/lib/streamingPage*`; `src/controllers/useStreamingNeuController.js`, neue `src/controllers/useStreamingPage*`; `streaming_page_cache*test.mjs`, `streaming_page_state*test.mjs`, `streaming_identity_index*test.mjs`; `docs/STREAMING_PAGE_STATE.md`. | `/private/tmp/kd-pwa-pages-state-20260913`, `codex/pwa-pages-state-20260913`; Agent `/root/pages_state` | RUNNING |
| C | `src/tabs/StreamingTab.jsx`, `src/tabs/EntdeckenTab.jsx`; neue `src/components/StreamingPage*`, `src/styles/streaming-progressive.css`; `tests/private-v1/fixtures.mjs`, `tests/private-v1/streaming-ansichten.spec.mjs`, neue `tests/private-v1/streaming-progressive*.spec.mjs`; `streaming_progressive_ui*test.mjs`; `docs/STREAMING_PAGE_UI.md`. Delta: `StreamingEinstellungen.jsx`, `KatalogAuditStatus.jsx`, `StapelImport.jsx`, `EinstiegsGate.jsx` in `src/components`; `src/lib/hilfeInhalte.js`; nur die Textfunktion `entdeckenDailyFeedNotice`/`noticeDate` in `src/services/entdeckenDailyFeed.js`; notwendige Assertion-Korrekturen in `streaming_pin_neu_test.mjs`. | `/private/tmp/kd-pwa-pages-ui-20260913`, `codex/pwa-pages-ui-20260913`; Agent `/root/pages_ui` | RUNNING |

Gemeinsamer read-only Vertrag: `docs/PWA_PROGRESSIVE_CONTRACT.md`. Bestehende Matcher-/14-Tage-Funktionen bleiben die fachliche Referenz. Keine Dependencies-/Lockfileänderung. `package.json`, Gesamtlaufskript und Abschlussbericht gehören später ausschließlich dem einen Abschlussbaumeister. Register nur Meister. Keine Paket-Kommunikation untereinander, keine Nebenagenten.

A×B, A×C, B×C: PARALLEL_OK. Getrennte Dateien/Schema/State/UI/Tests. Kein Paket importiert Commits anderer Pakete. Die neuen Schnittstellen werden jeweils gegen den eingefrorenen Vertrag gemockt. Bei nötiger Vertragsänderung nur BLOCKER:SCOPE_DRIFT an Meister.

Nutzerdelta vom 13.09.2026 an C: Auf Produktion keine technischen Datenlieferanten oder Katalog-/Prüfzeitstände. Den MotN-Hinweis aus dem Streamingbereich entfernen; notwendige Quellenangaben samt Attribution bleiben in Datenschutz und Rechtlichem. Fachliche Film-, Start- und Artikeltermine sowie ausgewählte Streamingdienste bleiben sichtbar. Interne Provenienz und Zeitfristen ändern sich nicht. Die zusätzlichen Darstellungsdateien bleiben disjunkt zu A/B. Auch `src/components/ProfilAnsicht.jsx` und `src/components/DreiFragen.jsx` gehören für ihre sichtbaren Fakten-Prüfzeitstände zu C.

BLOCKER an B: Die automatische Freigabeprüfung lehnt die neue App-Verdrahtung der reduzierten Mediathekidentitäten, Seen-/Must-Watch-/Bewertet-IDs und gerätegebundenen Neu-Fristanker an `kd_streaming_page` ohne ausdrückliche Freigabe dieses zusätzlichen Request-Payloads ab. Bestehende Konto-Synchronisation liegt bereits im selben Supabase-Projekt; Fristanker sind bisher gerätegebunden. B baut den sonstigen Scope weiter und liefert die ausstehende Verbindung reviewbar. Kein Retry und kein stiller Wechsel der Architektur; A-Vertrag bleibt unverändert. Nutzer wurde über die automatische Ablehnung informiert. Die konkrete Freigabeentscheidung folgt nach Abschluss des bereits zulässigen Pakets.

Integrationsreihenfolge: A → B → C. Meister prüft Paketbasis, statischen Diff, Scope, fokussierte Belege und kleine Nähte; keine wiederholten Pakettests. Größere Korrekturen gehen an den zuständigen Owner.

Diagnosebasis: `/private/tmp/kd-streaming-performance-20260913/ANALYSE.md`, neutraler Testkatalog und synthetische Referenzen im selben Verzeichnis. Labor: Chromium 393×852, CPU×4; warmes Alles↔Neu 3,27/3,58 s bei null Katalogreads. Echte Provider- oder persönliche Live-Testdaten sind nicht erforderlich.

Lieferumfang dieser Bauwelle: lokaler implementierter, integrierter, committed und einmal geprüfter Kandidat. Baumeister starten keinerlei Remote-, Migration-, Provider- oder Deploywirkung. Eine spätere Live-Lieferung wird anhand des konkreten Kandidaten und der bestehenden Autorisierung behandelt.
