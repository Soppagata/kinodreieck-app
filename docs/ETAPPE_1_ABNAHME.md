# Etappe 1: Abnahme der Architekturgrenzen

Stand: 24. Juli 2026

## Ergebnis

Etappe 1 der `ROADMAP_TO_ONLINE.md` ist abgeschlossen. Der bestehende lokale
Clean-/Demo-Betrieb bleibt unverändert, während Online-Verantwortung jetzt über
vier kleine Schnittstellen läuft:

| Grenze | Modul | Vertrag in Etappe 1 |
|---|---|---|
| `auth` | `src/services/auth.js` | stabiler Gast-/Account-Snapshot, Subscription und Capability-Prüfung; keine Tokens in UI-Snapshots |
| `storage` | `src/services/storage.js` | lokale persönliche Daten plus gekapselte Legacy-Sync-Adapter |
| `catalog` | `src/services/catalog.js` | ausschließlich öffentliche Katalog-, Demo- und Shared-Blog-Reads |
| `ai` | `src/services/ai.js` | mockbarer, accountgeschützter Auftragstransport ohne Anbieter-Key im Browser |

`App.jsx`, Tabs und aktive Komponenten importieren keine Git-, Supabase-,
Katalog- oder Storage-Implementierung mehr direkt. Die UI erkennt den
Sessionmodus über den stabilen Wert `guest` oder `account`; Clean und Demo
bleiben davon unabhängige Inhaltsmodi.

## Öffentliche Runtime-Konfiguration

`src/config/runtime.js` bündelt ausschließlich Werte, die im Browser-Bundle
öffentlich sein dürfen:

- `VITE_APP_URL`,
- `VITE_SUPABASE_URL`,
- `VITE_SUPABASE_PUBLISHABLE_KEY`,
- `VITE_AI_ENDPOINT_NAME`,
- `VITE_BUILD_VERSION`,
- feste Runtime-Schemaversion `1`.

Die GitHub-Pages-Pipeline setzt diese Variablen aus Repository-Variablen.
Service-Role-, Provider-, persönliche Sync- oder Accountschlüssel sind nicht
Teil des Runtime-Vertrags.

Rollout-Voraussetzung: Vor dem ersten Workflow-Lauf müssen mindestens
`SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` als Repository-Variablen gesetzt
sein; für den vollständigen Runtime-Vertrag zusätzlich `APP_URL` und
`AI_ENDPOINT_NAME`. Der Keep-alive-Job bricht bei fehlender Supabase-
Konfiguration absichtlich mit einer klaren Meldung ab.

## Sicherheitskorrekturen

1. Der Katalogzugang wird nicht mehr in die persönliche Supabase-
   Sync-Konfiguration gespiegelt. Ein eingegebener öffentlicher Endpoint kann
   dadurch keinen alten persönlichen `x-kd-key` mehr erhalten.
2. Persönlicher Legacy-Sync akzeptiert nur noch echte
   `https://<projekt>.supabase.co`-Projekt-URLs.
3. Demo und geteilte Blogs verwenden ausschließlich die öffentliche
   Katalogkonfiguration und senden niemals `x-kd-key`.
4. Moderne `sb_publishable_…`-Keys werden nur als `apikey` gesendet. Nur alte
   JWT-Anon-Keys erhalten zusätzlich einen Bearer-Header.
5. Der Keep-alive-Workflow verwendet denselben Publishable-Key-Vertrag.
6. Nicht mehr eingebundene Browser-Secret-Oberflächen liegen ausdrücklich unter
   `src/legacy/` und gehören weder zum aktiven UI-Modulgraphen noch zum künftigen
   Accountmodell.

## Gemeinsamer Fehlervertrag

`src/services/errors.js` normalisiert Grenzfehler auf sechs stabile Codes:

- `offline`,
- `unauthenticated`,
- `forbidden`,
- `limit`,
- `server`,
- `invalid-response`.

Die UI erhält sichere deutsche Texte statt ungefilterter Servermeldungen.
Quelle, Operation, HTTP-Status, Retry-Eigenschaft und interne Ursache bleiben
als strukturierte Diagnose am Fehler erhalten.

Ein Gast ist kein Fehlerzustand. `unauthenticated` entsteht erst bei einer
ausdrücklich accountgeschützten Operation, zum Beispiel einem persönlichen
KI-Auftrag.

## Mock- und Erweiterungsnähte

- `createAuthService({ loadSession })`
- `createAiService({ auth, config, transport })`
- `catalogService`
- `storageService`

Damit können künftige Serverfunktionen getestet werden, ohne React-Komponenten
oder echte Provider aufzurufen. Ein echter Authprovider, Account-Storage und ein
produktiver KI-Endpunkt bleiben spätere Roadmap-Etappen.

## Verifikation

Die vollständige Testkette ist grün:

```text
npm test
```

Neu beziehungsweise erweitert:

- Architekturgrenzen: 28 Checks,
- Supabase-Treiber: 74/74 Checks,
- Katalog: 8 Checks,
- Strukturtest und Echtdatei-Test: bestanden,
- Personal-/Testermodus: 42/42,
- Pages-Build: 11/11,
- Konsolen-/React-Fehler: 0,
- Web-Build und Single-File-Build: erfolgreich.

Die neuen Regressionen prüfen insbesondere:

- keine direkten Legacy-Treiberimporte oder Netzwerkaufrufe in der UI,
- keine Credential-Spiegelung vom Katalog in persönlichen Sync,
- strikte Supabase-Projekt-URLs,
- keine persönlichen Header bei Public Reads,
- Publishable-/JWT-Headersemantik,
- vollständige Runtime-Konfiguration ohne Secret-Felder,
- stabile Fehlercodes,
- Gast-/Account-Unterscheidung,
- lokale Datennutzung im Gastmodus,
- mockbaren KI-Transport und kontrollierte Capability-Prüfung.

`git diff --check` ist ohne Befund. Die bekannte Vite-Warnung zum großen
JavaScript-Chunk bleibt ein Nicht-Blocker; ein pauschaler UI- oder
State-Management-Rewrite war ausdrücklich kein Ziel dieser Etappe.

## Freigabetor

- UI kennt keine persönlichen Schlüssel,
- `auth`, `storage`, `catalog` und `ai` besitzen getrennte Schnittstellen,
- lokaler Clean-/Demo-Betrieb bleibt grün,
- neue Serverfunktionen sind mockbar,
- öffentlicher Katalog und persönliche Daten sind technisch getrennt,
- keine Arbeiten aus Hosting-, Domain-, echtem Account- oder produktivem
  KI-Rollout wurden vorgezogen.
