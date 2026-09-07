# UI-Abdeckung und Paketownership

Basis: `7232fec6bdd523ccccbe117d27f41abaf7e52045`. Das statische Inventar erfasst JSX-Definitionen, nicht die Zahl der zur Laufzeit gerenderten Instanzen. Jeder Map-Button wird einmal gezählt. Handler und Link-/Formverträge sind vor dem Umbau als AST-Signaturen lokal gesichert. Der Vergleich nach Integration macht entfernte oder veränderte Aktionen sichtbar; er ersetzt keine Bedienprüfung.

Gesamt: **469 Controldefinitionen**, **576 JSX-Ereignisbindungen**. Die stillgelegten Legacy-Treiber sind im Inventar sichtbar, aber kein neu zu aktivierender Produktweg. Dynamisch erzeugte Downloadanker in Kalender-/Backup-Helfern bleiben unverändert.

**Abschluss:** Der AST-Vergleich auf Produktstand `9e9465b` findet **keine entfernten oder veränderten Bestandsverträge** bei Ereignisbindungen, href/Targets, Formularwerten/-validierung und den erfassten ARIA-Beziehungen. Hinzu kommen genau zwei Controls/Ereignisbindungen in `Wochenplan.jsx` für die lokale Tages-/Gesamtansicht: insgesamt 471 bzw. 578. Statische Bestandsvollständigkeit ist keine Behauptung, jede bedingte Dialogvariante manuell durchgeklickt zu haben. Browserumfang und bekannte Grenzen: [Integration](design-deliveries/integration.md).

| Datei | Elemente | Write-Owner |
| --- | --- | --- |
| `src/App.jsx` | 3 button | P3 – Shell/Suche |
| `src/components/AppErrorBoundary.jsx` | 2 button | P3 – Shell/Suche |
| `src/components/AppNavigation.jsx` | 3 button | P3 – Shell/Suche |
| `src/components/AppUpdateHinweis.jsx` | 2 button | P3 – Shell/Suche |
| `src/components/BlogProfilAnalyse.jsx` | 7 select, 7 input, 7 button | P2 – übrige Ansichten |
| `src/components/CageAlphabet.jsx` | 3 button | P3 – Shell/Suche |
| `src/components/Crawl.jsx` | 1 div | P3 – Shell/Suche |
| `src/components/DeepSpaceHorrorOverlay.jsx` | 5 button | P3 – Shell/Suche |
| `src/components/DreiFragen.jsx` | 8 button, 1 textarea | P2 – übrige Ansichten |
| `src/components/DreieckRegler.jsx` | 1 input | P1 – Hauptansichten |
| `src/components/EditPanel.jsx` | 1 input, 1 select, 2 textarea, 2 button | P1 – Hauptansichten |
| `src/components/EinstiegsGate.jsx` | 1 form, 2 input, 6 button, 1 a | P3 – Shell/Suche |
| `src/components/EintragForm.jsx` | 4 button, 11 input, 4 select, 1 summary, 2 textarea | P1 – Hauptansichten |
| `src/components/Erklaerstuecke.jsx` | 1 button, 1 summary | P3 – Shell/Suche |
| `src/components/FeldHinweis.jsx` | 1 button | P3 – Shell/Suche |
| `src/components/FilmBatchLoeschDialog.jsx` | 2 button | P3 – Shell/Suche |
| `src/components/FilmCard.jsx` | 2 textarea, 5 button, 1 a | P1 – Hauptansichten |
| `src/components/FilmwissenBereich.jsx` | 1 summary, 2 a, 2 button | P2 – übrige Ansichten |
| `src/components/GeschmackBereich.jsx` | 1 button | P2 – übrige Ansichten |
| `src/components/GeschmackOnboarding.jsx` | 8 button | P2 – übrige Ansichten |
| `src/components/GlobalErrorQueue.jsx` | 1 button | P3 – Shell/Suche |
| `src/components/GlobalSearchBar.jsx` | 1 form, 6 button, 1 input | P3 – Shell/Suche |
| `src/components/InstallationCard.jsx` | 1 button | P3 – Shell/Suche |
| `src/components/KatalogZugang.jsx` | 2 input, 3 button | P3 – Shell/Suche |
| `src/components/KinoLinks.jsx` | 1 a | P1 – Hauptansichten |
| `src/components/KontoBereich.jsx` | 1 form, 3 input, 10 button | P3 – Shell/Suche |
| `src/components/KontoUebernahme.jsx` | 8 button, 1 input | P3 – Shell/Suche |
| `src/components/LocalDataSafety.jsx` | 2 button | P3 – Shell/Suche |
| `src/components/MedienForm.jsx` | 3 button, 2 input, 2 select, 1 textarea | P1 – Hauptansichten |
| `src/components/MustWatchListe.jsx` | 4 input, 1 select, 9 button, 4 textarea, 2 a | P1 – Hauptansichten |
| `src/components/NecronomiconRand.jsx` | 1 button | P3 – Shell/Suche |
| `src/components/PrivateMailRequests.jsx` | 1 form, 1 textarea, 3 button, 1 input | P2 – übrige Ansichten |
| `src/components/PrivatePilotOps.jsx` | 4 summary, 1 a, 1 input, 4 button | P2 – übrige Ansichten |
| `src/components/ProfilAnsicht.jsx` | 1 select, 13 button, 1 summary | P2 – übrige Ansichten |
| `src/components/PrognoseBereich.jsx` | 6 button | P2 – übrige Ansichten |
| `src/components/QuellenWahl.jsx` | 1 input | P1 – Hauptansichten |
| `src/components/RadarSubscriptionPreview.jsx` | 4 button | P2 – übrige Ansichten |
| `src/components/SelectionControl.jsx` | 1 input | P1 – Hauptansichten |
| `src/components/StapelImport.jsx` | 3 textarea, 4 select, 9 button, 1 summary, 3 input | P2 – übrige Ansichten |
| `src/components/StreamingEinstellungen.jsx` | 1 input, 2 button | P2 – übrige Ansichten |
| `src/components/TeilenBlock.jsx` | 4 input, 10 button, 2 textarea, 1 summary | P2 – übrige Ansichten |
| `src/components/Teppich.jsx` | 2 button | P3 – Shell/Suche |
| `src/components/Wochenplan.jsx` | 1 form, 10 input, 3 select, 16 button, 1 textarea, 1 summary | P1 – Hauptansichten |
| `src/components/ZurueckObenKnopf.jsx` | 1 button | P3 – Shell/Suche |
| `src/components/ui.jsx` | 3 button, 1 summary | Foundation |
| `src/legacy/GitSyncEinstellungen.jsx` | 3 input, 7 button | Bestand: stillgelegt, read-only |
| `src/legacy/SupabaseSyncEinstellungen.jsx` | 4 input, 12 button | Bestand: stillgelegt, read-only |
| `src/main.jsx` | 1 form, 2 input, 1 button | Foundation |
| `src/tabs/BlogTab.jsx` | 6 input, 1 textarea, 4 select, 17 button, 2 a | P2 – übrige Ansichten |
| `src/tabs/DatenTab.jsx` | 1 select, 2 input, 7 button, 1 summary, 1 textarea | P2 – übrige Ansichten |
| `src/tabs/EntdeckenTab.jsx` | 14 button, 2 input, 3 a, 1 form, 1 summary | P2 – übrige Ansichten |
| `src/tabs/FinderTab.jsx` | 9 button, 1 input | P2 – übrige Ansichten |
| `src/tabs/KinoTab.jsx` | 13 button, 2 select, 3 input, 2 summary | P1 – Hauptansichten |
| `src/tabs/MediathekTab.jsx` | 10 button, 1 textarea, 1 input, 1 select, 2 summary | P1 – Hauptansichten |
| `src/tabs/StartTab.jsx` | 6 button | P1 – Hauptansichten |
| `src/tabs/StreamingTab.jsx` | 1 a, 3 select, 3 input, 11 button | P1 – Hauptansichten |

## Gemeinsame Grenzen

- Foundation besitzt `tokens.js`, `ui.jsx`, `BereichsHero.jsx`, `index.css`, `design-foundation.css`, Font-/Einzeldateibuild und initiale Style-Imports. Nach Lieferung eingefroren.
- P1 besitzt zusätzlich `src/styles/design-primary.css` und `src/styles/kino-filter.css`; P2 ausschließlich `src/styles/design-secondary.css`; P3 `src/styles/design-shell.css` sowie die bestehenden Egg-Styles bei rein visueller Notwendigkeit.
- P1-Tests: bestehende Must-Watch-Layoutregression, neue `tests/private-v1/design-primary.spec.mjs` und `design_primary_test.mjs`.
- P2-Tests: neue `tests/private-v1/design-secondary.spec.mjs` und `design_secondary_test.mjs`.
- P3-Tests: neue `tests/private-v1/design-search-shell.spec.mjs` und `design_shell_test.mjs`; `visualViewport.js` und `documentScrollLock.js` bleiben read-only.
- Jedes Paket liefert seinen geprüften Stand und seine genaue UI-/Feedbackabdeckung in `docs/design-deliveries/primary.md`, `secondary.md` bzw. `shell.md`. Das gemeinsame Ergebnisregister besitzt ausschließlich der Meister.
- Geteilte Fixtures, Config, Dependencies, Services, Controller und Datenverträge sind während der Parallelwelle eingefroren. Kein Paket zieht fremde Commits ein. Eigene Browserports: P1 4491, P2 4492, P3 4493.
- Kopflose Browser, lokale Fonts, synthetisches Konto und vollständiger Netzzaun; keine Anbieteraufrufe. Schlussprüfung und Integration gehören dem Meister.
