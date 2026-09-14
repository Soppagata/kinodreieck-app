# Settings: KI-Funktionen und Datenschutz

Nutzerauftrag vom 14.09.2026: KI-Schalter an die tatsächlichen sichtbaren
Funktionen anpassen, Sicherheitskopie und Kontoexport verständlich unterscheiden
und die eingebundenen Dienste mit ihren Datenwegen wieder transparent zeigen.
Resend ist bereits am Feedbackfeld erläutert; dieser Hinweis bleibt erhalten.

Ausgangscode: `816911b679f53332d484256ba2b2ea3bc7c6c33c`, mit Remote-main
abgeglichen. Zunächst lokale Lieferung. Max hat anschließend die Veröffentlichung
nach vollständiger Überarbeitung und belegter Schalterwirkung freigegeben.
Lieferweg: Staging mit CI/Readback, anschließend main/Produktion mit CI/Readback.
Keine Live-Anbieterprobe oder Backend-Datenmutation beauftragt.
Gemeinsame Paketbasis: der Commit, der dieses Register erstmals anlegt.

| ID | Nutzbares Ergebnis | Status | Paket / Kandidat |
|---|---|---|---|
| K1 | KI-Schalter benennen und erklären die tatsächlich steuerbaren Funktionen; Profilhinweise stimmen mit der Wirkung überein. | AUSGELIEFERT | KI / `4f9978f`, `291bfd8` |
| K2 | Der Schalter für mehrere Titel verweist auf den sichtbaren Mediathek-Einstieg; die wirkungslose Entdecken-Checkbox ist entfernt. | AUSGELIEFERT | KI / `291bfd8`, `0b9a2ba` |
| D1 | Settings und Login nennen dieselben eingebundenen Dienste, ihren Zweck und die übertragenen Daten. | AUSGELIEFERT | DATENSCHUTZ / `8dadf8e`, `f01378a`, `d5a3c83`, `a16c7e8` |
| D2 | Der Datenschutztext erklärt die verfügbare Gerätesicherung und den weiterhin gesperrten vollständigen Kontoexport verständlich. | AUSGELIEFERT | DATENSCHUTZ / `8dadf8e`, `f01378a`, `d5a3c83` |

## Parallelwelle

Meister / Integrationsworktree: `/private/tmp/kd-settings-ai-datenschutz-20260914`

Gemeinsamer Zielbranch: `codex/settings-ai-datenschutz-20260914`

| Paket | Branch / Worktree | Ausschließliche Write-Ownership | Status |
|---|---|---|---|
| KI | `codex/ki-schalter-20260914` / `/private/tmp/kd-ki-schalter-20260914` | `src/lib/kiSchalter.js`, `src/tabs/DatenTab.jsx`, `src/components/ProfilAnsicht.jsx`, `src/lib/hilfeInhalte.js`; dazu `kischalter_test.mjs`, `geschmackui_test.mjs`, `settings_polish_contract_test.mjs`, `settings_diagnostics_test.mjs`, `private_release_settings_surface_test.mjs` nur bei nötiger Erwartungsanpassung | INTEGRIERT |
| DATENSCHUTZ | `codex/datenschutz-dienste-20260914` / `/private/tmp/kd-datenschutz-dienste-20260914` | `src/lib/privatePilotOps.js`, `src/components/PrivatePilotOps.jsx`, `src/components/EinstiegsGate.jsx`, neue `src/components/DatenschutzDienste.jsx`; dazu `private_ops_contract_test.mjs`, `data_safety_wording_test.mjs`, `private_release_legal_test.mjs`, `account_export_release_ui_test.mjs`, `private_release_login_test.mjs` nur bei nötiger Erwartungsanpassung; als belegter Test-Delta zusätzlich `private_release_localmode_test.mjs` | INTEGRIERT |

Dateien, öffentliche Verträge, State/Schema, Konfiguration, globale Styles,
Dependencies/Lockfile, Tests/Fixtures und Artefakte sind auf Kollision geprüft.
KI × DATENSCHUTZ: PARALLEL_OK, keine gemeinsame Write-Fläche und keine
Output-Abhängigkeit. Vorhandene Funktionsfreigaben, Kontoexport-Sperren,
Speicher-/Sync-Verträge, Backend und Anbietergrenzen bleiben read-only.

Integration: zuerst KI, dann DATENSCHUTZ. Pakettests bleiben fokussiert;
der Meister führt nach Integration einmal die vollständige Mocksuite und
den Build aus und prüft Diff sowie den gemeinsamen mobilen Nutzerweg.

## Lieferung

Erster lokaler Abschluss: beide Pakete integriert; letzter Produktcommit
`a16c7e8`, gebündelter Abschluss `2d029a5`. Zu diesem Zeitpunkt kein Push,
CI-Lauf, Deploy, Anbieteraufruf oder physischer iPhone-Nachweis.

- Alle Befehle der regulären Mocksuite einschließlich `pretest` durchlaufen.
  Der erste Start stoppte an der Sandbox-Sperre für lokale PostgreSQL-Prozesse.
  Fortsetzung mit lokalen Prozessrechten und `KD_STREAMING_FINAL_USE_LAB_FIXTURE=1`.
- Zwei veraltete Textprüfungen angepasst: Der Localmode-Test prüft das sichtbare
  Anmeldepanel statt des versteckten Rechtstexts (`cd73f89`); die Hilfe-Prüfung
  prüft die gemeinsame Dienste-Komponente statt einer entfernten Überschrift.
  Danach jeweils ab dem fehlgeschlagenen Befehl fortgesetzt, grüne Abschnitte
  nicht erneut gestartet. Alle verbliebenen Tests bestanden.
- Singlefile- und Vite-Build bestanden; abschließender Pages-Build-Test 72/72.
  Protokolle: `/private/tmp/kd-settings-final-mocks-20260914.log`,
  `/private/tmp/kd-settings-final-mocks-20260914-main.log`,
  `/private/tmp/kd-settings-final-tail-20260914.log`,
  `/private/tmp/kd-settings-final-complete-20260914.log`.
- Echter lokaler Browserweg Settings und Login: Chromium und WebKit bei 320 und
  393 Pixeln, 4/4 bestanden; 14 Dienste an beiden Stellen, vier Produktions-KI-
  Schalter, Resend vor Feedback, Kontoexport weiterhin gesperrt, kein horizontaler
  Überlauf und keine JavaScript-Fehler. Alle externen Requests abgefangen.
- Danach gezielte WebKit-Nachprüfung der Linkfarbe in beiden Themes und im Login:
  1/1 bestanden. Theme-Token wird beim Rendern gelesen. Protokolle und Screenshots
  unter `/private/tmp/kd-settings-mobile-20260914/`.
- `git diff --check` sauber. Kleine Integrationsnähte des Meisters beschränken sich
  auf das dynamische Lesen der Linkfarbe und die veraltete Hilfe-Testüberschrift.

## Zusätzlich geprüfte Entdecken-Checkbox

`entdeckenTaeglich` steuert eine ältere lokale Tagesauswahl: sechs Vorschläge
aus einem Pool der 20 besten Passungen, innerhalb eines Tages stabil. Im aktuellen
gemischten Entdecken-Feed wird diese Option für persönliche Empfehlungen nicht
angewendet; die tägliche Auswahl populärer Titel arbeitet unabhängig davon.
Der Schalter startet keinen Katalogabruf oder KI-Auftrag. Im freigegebenen
Nachtrag wird sein sichtbarer Einstieg entfernt; der gespeicherte Schlüssel
und die ältere Selektionslogik bleiben kompatibel erhalten.

## Freigegebener Nachtrag und Veröffentlichung

KI-Baumeister erhält K1/K2 als zusammenhängenden Delta-Auftrag von `2d029a5`:
Benennung am echten Einstieg „Mehrere Titel erfassen“ ausrichten, Abschaltwirkung
der vier sichtbaren Funktionen mit Mocks belegen, die wirkungslose Entdecken-
Checkbox entfernen. Bei belegter Lücke darf er die betroffenen UI-Handler
minimal korrigieren; Backend, State/Schema und Providergrenzen bleiben unverändert.

Remote-Preflight: main und staging sowie beide Domain-Buildmetadaten stehen
weiter auf `816911b`. Die letzten Deploy-Läufe für diesen Stand sind grün.
Der Primärcheckout bleibt unberührt.

Nachtrag integriert: Produktcommit `291bfd8`, Testnaht `0b9a2ba`. Alle vier
Schalter sperren die beschriebenen neuen KI-Aktionen; zusätzliche Fachlogik war
nicht nötig. Bestehende Ergebnisse und automatische Radar-Prüfungen bleiben
wie beschrieben außerhalb dieser gerätelokalen Auswahl. Der sichtbare Import
heißt „Mehrere Titel mit KI erfassen“ und verweist auf den realen Mediathek-Einstieg.

Finaler lokaler Nachweis: vollständige `npm test`-Befehlsfolge einschließlich
`pretest`, Singlefile- und Vite-Build abgeschlossen. Eine veraltete positive
Checkbox-Assertion in `entdecken_phase3_test.mjs` wurde an die Entfernung
angepasst; anschließend ab diesem Modul fortgesetzt. Protokolle:
`/private/tmp/kd-settings-release-final-20260914.log` und
`/private/tmp/kd-settings-release-complete-20260914.log`.

Mobile Integration auf dem finalen Produktstand: Chromium 3/3, WebKit 3/3;
Settings und Login bei 320/393 Pixeln sowie Theme-Wechsel, 14 Dienste, neuer
Importname, entfernte Checkbox und tatsächlich gesperrter Import bei KI-Aus.
Im WebKit-Harness wurde der Import-Einstieg vor dem Klick aus dem Bereich der
festen unteren Suchleiste in die Mitte gescrollt. Alle externen Anfragen wurden
abgefangen. Nachweise unter `/private/tmp/kd-settings-mobile-20260914/`:
`release-final.log` (Chromium) und `release-webkit-final.log` (WebKit).

Freigabebedingungen lokal erfüllt; `git diff --check` ist sauber.

## Auslieferungsnachweis

Veröffentlichter Produktstand: `8c900fdb24d939b90d8b2c4b17805a7c4c42682e`.
Push und anschließende Remote-Abfrage bestätigen diesen Commit auf `main` und
`staging`. Dieser Nachweis ist ein nachfolgender Dokumentationscommit auf dem
Featurebranch; der ausgelieferte Produktstand bleibt `8c900fd`.

- Staging: [CI und Deployment 34875583852](https://github.com/Soppagata/kinodreieck-app/actions/runs/34875583852)
  vollständig erfolgreich; `https://staging.kinodreieck.at` liefert den exakten
  Commit mit Umgebung `staging`.
- Produktion: [CI und Deployment 34876860445](https://github.com/Soppagata/kinodreieck-app/actions/runs/34876860445)
  vollständig erfolgreich. Die reguläre GitHub-Produktionsfreigabe erfolgte
  nach allen grünen Testgates auf Basis der Owner-Freigabe; Schutzregeln wurden
  nicht geändert. `https://kinodreieck.at` liefert denselben Commit mit Umgebung
  `production`.
- Beide Domains: HTTPS-, Build-, Service-Worker-, JavaScript-Asset-, Login- und
  Header-Readback bestanden. Die zusätzliche lokale anonyme DB-Sichtprüfung
  wurde mangels öffentlicher Supabase-Umgebungsvariablen ausdrücklich übersprungen;
  die jeweiligen Deploymentjobs prüften mit ihrer konfigurierten Umgebung.
- Frischer öffentlicher Chromium-Readback bei 393 Pixeln auf beiden Domains:
  14 Dienste, korrigierte Sicherheitskopie-/Kontoexporttexte, neuer KI-Importname
  und entfernte Checkbox in den tatsächlichen JS-Modulen bestätigt; kein
  horizontaler Überlauf, keine JavaScript-Fehler und keine Drittanfragen.
  Nachweise: `/private/tmp/kd-settings-staging-readback-20260914.json` und
  `/private/tmp/kd-settings-production-readback-20260914.json`; Screenshots unter
  `/private/tmp/kd-settings-mobile-20260914/{staging,production}-published.png`.

K1, K2, D1 und D2 sind damit gebaut, lokal geprüft, committed, gepusht,
CI-grün und auf beiden Domains bestätigt. Kein physischer iPhone-/PWA-Nachweis
und keine Live-KI-Anbieterprobe beansprucht.
