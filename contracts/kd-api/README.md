# Kinodreieck API v1 – eingefrorene Foundation

Stand: 26.09.2026. Vertragskennung: `kd-api-v1`.

Dieses Verzeichnis ist die gemeinsame, nach F0 unveränderliche Grundlage für
Backend (B1), Assistentenadapter (B2) und Lieferung (B3). Es beschreibt einen
logischen `/v1`-Vertrag. Die spätere Basis-URL ist konfigurierbar. Opaque
KD-Keys sind weder Supabase-JWTs noch `service_role`-Schlüssel.

## Verbindliche Dateien

- `openapi.yaml`: HTTP-Routen, Fehler, Revision, Idempotenz, Cursor und Jobs.
- `tool-schemas.json`: angebotene Werkzeuge und vollständige Eingabeschemata.
- `operation-map.json`: aktive App-Aktionen und ihre v1-Zuordnung. `app_local`
  markiert bewusst lokale Clientwirkungen; es ist keine verschwiegene Route.
- `persistence-rpc.md`: konkrete Datenbankobjekte, RPC-Signaturen, Sperren und
  Herkunftsweitergabe für B1.
- `deployment.md`: Function-Slug, geschlossenes Enable-Gate, Versionsreadback
  und service-only Key-Lebenszyklus als eingefrorene B1↔B3-Naht.
- `apple-platform.md`: derselbe Fachvertrag für einen späteren Apple-Client.

## Gemeinsame Laufzeitnaht

`src/lib/kdApiAdapters.js` ist ein reines ES-Modul ohne DOM-, Clipboard-,
Dateisystem- oder Netzwerkzugriff. Es stellt schmale Medien-/Blogmutationen,
einen injizierbaren Aktionsadapter und den Auswahl-Export bereit. Der JSON-
Export verwendet `kinodreieck-paket` v1 und dessen vorhandene Feldprojektion.
IDs bleiben Auswahl-/Autorisierungsmetadaten und werden nicht in die
transportierten Medieneinträge hineingeschrieben.

## Eingefrorene Paketflächen und Befehle

B1 schreibt ausschließlich `supabase/functions/**`, neue API-Migrationen,
`supabase/config.toml`, `tests/kd-api/backend/**`, `tests/kd-api/db/**` und
`tests/kd-api/integration/**`. B1 importiert die Verträge read-only und liefert:

```text
npm run test:kd-api:backend
npm run test:kd-api:db
npm run test:kd-api:integration
```

B2 schreibt ausschließlich `integrations/kd-assistant/**` mit eigener
Package-/Lock-Datei, Tests, Fixtures und Anleitung. B2 liest
`contracts/kd-api/tool-schemas.json` und `openapi.yaml` unverändert und liefert:

```text
npm run test:kd-api:assistant
```

B3 schreibt ausschließlich `.github/workflows/deploy.yml`, einen gezielten
API-Workflow, `tools/function-release-info.mjs`,
`tools/release-compatibility.mjs`, neue `tools/kd-api-*`,
`tests/kd-api/release/**` und die Lieferanleitung. B3 liefert:

```text
npm run test:kd-api:release
```

Diese vier Rootbefehle sind in F0 absichtlich als fail-closed Dispatcher
definiert: Fehlt das jeweilige Paketverzeichnis, endet der Befehl mit einer
verständlichen Meldung. Ein Paket ergänzt nur Dateien in seiner Fläche; die
Rootskripte und dieses Verzeichnis bleiben read-only.

Der einmalige E6-Gesamtlauf wird von einem bereits beteiligten Baumeister mit
`npm run test:kd-api:final` auf dem integrierten Kandidaten ausgeführt. Der
Befehl bündelt die vier Paketbefehle, die vollständige bestehende Mocksuite,
Function-Mocks und abschließend `npm run build:online` für den vorhandenen
Online-/PWA-Build. Er ist vor E6 nicht auszuführen. Normale CI und alle
genannten Befehle bleiben providerfrei.

F0 selbst wird einmal mit `npm run test:kd-api:contract` geprüft. Der Befehl
umfasst Vertragskonsistenz, Medien-/Blogadapter, Text-/JSON-Auswahl sowie die
bestehenden Auswahl- und Account-Sync-Prüfungen. Deno importiert den Adapter
zusätzlich real über `npm run test:kd-api:runtime`.
