# Road to Live: kompakte Topographie

Stand 31.08.2026; eigene read-only Kartierung der remote bestätigten Basis
`31f37f61e9da8f766489b99eab8565aa14ec1d81`. Kein Produktaudit und kein neuer
Deploy-/Praxisbeleg. Der dirty Primärcheckout `03ff280` bleibt unangetastet.
Aufträge und Zustände stehen nur im [Masterregister](../zukunft/NAECHSTER_MASTERCHAT_PRIVATRELEASE_ETAPPENPLAN.md#4-master-pflichtliste-und-einziges-fortschrittsregister).

## Module und Datenflüsse

| Bereich | Weg und wiederverwendbare Bausteine | Relevante Baunaht |
|---|---|---|
| Einstieg / Navigation | `src/main.jsx` → Session-/Speicherklärung → `EinstiegsGate` → `App.jsx`; `AppNavigation` und globale Suche verteilen zu den Tabs. Einstieg enthält noch Demo-Auswahl, Einführung und KI-Auswahl. | E1 verengt den Einstieg; kein Redesign. Die abgeschlossene globale VisualViewport-/Scrolllock-Suche bleibt erhalten. |
| Local-/Kontomodus | `authService`/`authDriver` → `sessionCoordinator` → gebundene Storage-Kontexte. Authentifiziert, fachlich berechtigt und Cache freigegeben sind getrennte Zustände. `uebernahme.js` hält Gast-Rückholpunkt und Kontoübernahme. | Login soll direkt ausschließlich den Kontostand öffnen; niemals Gastdaten mergen. Bei unsicherer Grenze bleibt der vorhandene Privacy-Lock wirksam. |
| Persönliche Daten / Sync | `personalDataRegistry` definiert persönliche Töpfe; `services/storage` schaltet lokalen Treiber bzw. `accountDriver`. localStorage ist Offline-Arbeitskopie; `kd_personal` speichert revisionsgebunden pro Konto. Epoch-/Owner-/Transitionmarker verhindern verspätete A→B-Writes. | E2 verwendet Registry, Revisionen, Konflikte und Kontotrennung weiter; kein neues Syncsystem. |
| Download / Löschung | `backupExportController`, `backup.js`, `restore.js`, `personalDataTransactionController` sowie `PrivatePilotOps`/`accountSelfService` sind vorhanden. Direkte serverseitige Kontolöschung existiert technisch, ist per Releaseflag abgeschaltet. | Sicherheitsdownload vor bewusster lokaler Gesamtlöschung; keine neue Restorezusage. Sichtbarer Löschweg wird authentifizierte Mailanfrage statt Self-Delete. |
| Bereitgestellte Inhalte | `catalogService` wählt derzeit live/demo; App-/Katalogcontroller laden Daten und gebündelte Snapshots. `sharedArticles`, Entdecken-Feed und Radar besitzen eigene Servicepfade. | E1 muss UI, Datenloader, öffentliche Build-Assets und Serverzugriff gemeinsam begrenzen. Bloßes Verbergen der Demoauswahl reicht nicht. Kontoproduktpfade bleiben erhalten. |
| KI / Kosten | Manuelle Aufgaben → `services/ai` → `ai-task`; Radar → `radar-websearch-task`. Bestehende Budget-/Provider-/Rechtegates reservieren vorab und schließen Vorgänge im `kd_ai_log` ab; `providerReceipt` bindet Kosten-/Usagebelege an die Operation. | Ein reservierter Kostenwert ist kein Erfolgsbeleg. Der Checker bleibt am normalen Funktionsweg und benötigt kein neues KI-System. |
| Automatische Auslöser | `.github/workflows/entdecken-six-day.yml` enthält tägliche Ticks. Radar claimt atomar fällige Konto/Ziel-Abos, `next_check_at` wird nach Abschluss um 144h verschoben. Entdecken-Regelbetrieb prüft Fälligkeit, nutzt Quellen/Wikidata und verlangt null KI-Providerrequests. Browserinitialsuche nach bestätigtem Radar-Speichern ist getrennt. | E3 prüft aktuelle Aktivierung read-only und bindet genau eingeschlossene automatische Provideroperationen. Kein Checker für den providerfreien Entdeckenweg oder manuelle Probes. Aktuelle GitHub-Läufe sind mangels CLI nicht erneut belegt. |
| Legal / Mail | Datenschutzübersicht, Diagnoseretention und Self-Servicegrenzen existieren. Kombinierter Legal-Zugang sowie der gewünschte Feedback-/Löschanfrage-/Betriebs-Mailtransport fehlen. | UX-, Text-, Mail- und Szenario-Vorbauten weiterverwenden; fehlende Betreiber-/Rechtsfreigaben nicht erfinden. Privater Empfänger bleibt serverseitig. |
| Tests / Auslieferung | Node/jsdom-Mocks, Deno-Functiontests, Playwright Chromium/WebKit; Vite-/Singlefile-/Onlinebuild, Service Worker. GitHub testet und liefert Staging/Production nach Cloudflare Pages. Production hat noch teilweise deaktivierte Funktionsflags. | Fokussierte Pakettests, ein gemeinsames FINAL_LOCAL. Bestehenden Leak-Scanner/OSS-Inventarisierer nutzen. Push, CI, Deploy und iPhone-Praxis getrennt belegen. |

## Gemeinsame Änderungsflächen

`App.jsx`, Einstieg, `DatenTab`, Session-/Storageverträge und globale Styles
bleiben je Welle bei einem Owner. E4 kann unabhängig ausschließlich
`KinoTab.jsx`, eigene Styles und eigene Tests bearbeiten; seine vorhandenen
Props bleiben unverändert. Mailtransport und KI-Nachprüfung sind fachlich
abhängig und folgen nacheinander. Der Meister integriert in einen eigenen
Worktree; main und der Primärcheckout sind keine Bauflächen.

Die Landkarte ist damit für die Paketzerlegung ausreichend. Detaillektüre
gehört zum jeweiligen Bauauftrag, nicht zu einer zweiten Kartierungsrunde.
