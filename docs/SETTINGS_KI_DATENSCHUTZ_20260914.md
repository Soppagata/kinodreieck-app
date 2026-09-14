# Settings: KI-Funktionen und Datenschutz

Nutzerauftrag vom 14.09.2026: KI-Schalter an die tatsächlichen sichtbaren
Funktionen anpassen, Sicherheitskopie und Kontoexport verständlich unterscheiden
und die eingebundenen Dienste mit ihren Datenwegen wieder transparent zeigen.
Resend ist bereits am Feedbackfeld erläutert; dieser Hinweis bleibt erhalten.

Ausgangscode: `816911b679f53332d484256ba2b2ea3bc7c6c33c`, mit Remote-main
abgeglichen. Lokale Lieferung; kein Push, Deploy oder Live-Anbieteraufruf beauftragt.
Gemeinsame Paketbasis: der Commit, der dieses Register erstmals anlegt.

| ID | Nutzbares Ergebnis | Status | Paket / Kandidat |
|---|---|---|---|
| K1 | KI-Schalter benennen und erklären die tatsächlich steuerbaren Funktionen; Profilhinweise stimmen mit der Wirkung überein. | LOKAL GEPRÜFT | KI / `4f9978f` |
| D1 | Settings und Login nennen dieselben eingebundenen Dienste, ihren Zweck und die übertragenen Daten. | LOKAL GEPRÜFT | DATENSCHUTZ / `8dadf8e`, `f01378a`, `d5a3c83`, `a16c7e8` |
| D2 | Der Datenschutztext erklärt die verfügbare Gerätesicherung und den weiterhin gesperrten vollständigen Kontoexport verständlich. | LOKAL GEPRÜFT | DATENSCHUTZ / `8dadf8e`, `f01378a`, `d5a3c83` |

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

Beide Pakete integriert; letzter Produktcommit `a16c7e8`. Die integrierte
Abschlussprüfung ist vollständig lokal abgeschlossen. Kein Push, CI-Lauf,
Deploy, Anbieteraufruf oder physischer iPhone-Nachweis wurde durchgeführt.

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
Der Schalter startet keinen Katalogabruf oder KI-Auftrag. Er bleibt in diesem
Paket unverändert; Entfernung ist die Empfehlung aus dem Audit.
