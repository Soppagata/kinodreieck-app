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
| K1 | KI-Schalter benennen und erklären die tatsächlich steuerbaren Funktionen; Profilhinweise stimmen mit der Wirkung überein. | OFFEN | KI |
| D1 | Settings und Login nennen dieselben eingebundenen Dienste, ihren Zweck und die übertragenen Daten. | OFFEN | DATENSCHUTZ |
| D2 | Der Datenschutztext erklärt die verfügbare Gerätesicherung und den weiterhin gesperrten vollständigen Kontoexport verständlich. | OFFEN | DATENSCHUTZ |

## Parallelwelle

Meister / Integrationsworktree: `/private/tmp/kd-settings-ai-datenschutz-20260914`

Gemeinsamer Zielbranch: `codex/settings-ai-datenschutz-20260914`

| Paket | Branch / Worktree | Ausschließliche Write-Ownership | Status |
|---|---|---|---|
| KI | `codex/ki-schalter-20260914` / `/private/tmp/kd-ki-schalter-20260914` | `src/lib/kiSchalter.js`, `src/tabs/DatenTab.jsx`, `src/components/ProfilAnsicht.jsx`, `src/lib/hilfeInhalte.js`; dazu `kischalter_test.mjs`, `geschmackui_test.mjs`, `settings_polish_contract_test.mjs`, `settings_diagnostics_test.mjs`, `private_release_settings_surface_test.mjs` nur bei nötiger Erwartungsanpassung | PLANNED |
| DATENSCHUTZ | `codex/datenschutz-dienste-20260914` / `/private/tmp/kd-datenschutz-dienste-20260914` | `src/lib/privatePilotOps.js`, `src/components/PrivatePilotOps.jsx`, `src/components/EinstiegsGate.jsx`, neue `src/components/DatenschutzDienste.jsx`; dazu `private_ops_contract_test.mjs`, `data_safety_wording_test.mjs`, `private_release_legal_test.mjs`, `account_export_release_ui_test.mjs`, `private_release_login_test.mjs` nur bei nötiger Erwartungsanpassung | PLANNED |

Dateien, öffentliche Verträge, State/Schema, Konfiguration, globale Styles,
Dependencies/Lockfile, Tests/Fixtures und Artefakte sind auf Kollision geprüft.
KI × DATENSCHUTZ: PARALLEL_OK, keine gemeinsame Write-Fläche und keine
Output-Abhängigkeit. Vorhandene Funktionsfreigaben, Kontoexport-Sperren,
Speicher-/Sync-Verträge, Backend und Anbietergrenzen bleiben read-only.

Integration: zuerst KI, dann DATENSCHUTZ. Pakettests bleiben fokussiert;
der Meister führt nach Integration einmal die vollständige Mocksuite und
den Build aus und prüft Diff sowie den gemeinsamen mobilen Nutzerweg.

## Lieferung

Noch kein Paket integriert. Kein Remote- oder Produktivstand behauptet.
