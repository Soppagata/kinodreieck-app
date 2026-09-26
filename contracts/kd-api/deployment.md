# Eingefrorener Betriebs- und Key-Lebenszyklusvertrag

Diese Datei ist die gemeinsame B1↔B3-Naht. B1 implementiert Function und
RPCs; B3 implementiert ausschließlich CLI-/Keychain-, Deploy-, Versions- und
Readback-Hüllen. Keine Seite benötigt erzeugte Dateien der anderen, um ihr
Paket gegen diesen Vertrag zu bauen.

## Function und URL

- Supabase-Function-Slug: exakt `kd-api`.
- Öffentlicher Function-Einstieg:
  `${SUPABASE_URL}/functions/v1/kd-api`.
- Logische API-Basis:
  `${SUPABASE_URL}/functions/v1/kd-api/v1`.
- Clients erhalten die vollständige logische API-Basis ausschließlich über
  `KD_API_BASE_URL`. Der Referenzadapter besitzt keinen fest eingebauten
  Projekt-Hostnamen.
- `openapi.yaml` beschreibt Pfade relativ zum abschließenden `/v1`.

Nur für `[functions.kd-api]` steht in `supabase/config.toml`
`verify_jwt = false`, weil opaque KD-Keys keine Supabase-JWTs sind. Es gibt
keine globale Abschaltung und keine Änderung der JWT-Prüfung anderer
Functions. `verify_jwt=false` ist keine Autorisierung: Jeder `/v1/*`-Request
muss anschließend den Bearer-Key über `public.kd_api_resolve_key_v1` prüfen
und einen kurzlebigen serverseitigen Kontext erhalten.

## Geschlossener Anfangszustand

`KD_API_ENABLED` fehlt standardmäßig oder ist `false`. In diesem Zustand sind
alle `/v1/*`-Routen geschlossen und antworten vor Keyauflösung und Fachlogik
mit `503` und Fehlercode `API_DISABLED`. Es entsteht weder Request-/Jobwrite
noch Providerwirkung. Erst der ausdrücklich konfigurierte Wert `true` öffnet
den normalen Authpfad. Ein unbekannter Wert bleibt geschlossen.

Das Enable-Gate wird bei jedem Request frisch aus der Function-Umgebung
gelesen. Abschalten bedeutet `KD_API_ENABLED=false` setzen und genau die
Function `kd-api` erneut ausrollen; Schlüssel bleiben widerrufbar und werden
nicht ausgegeben. Migration, Key-Ausgabe und Enable sind getrennte Wirkungen.

## Versions- und Readback-Anschluss

`GET ${SUPABASE_URL}/functions/v1/kd-api/_meta/version` ist auch bei
geschlossenem Gate erreichbar und gibt ausschließlich diese Felder zurück:

```json
{
  "functionSlug": "kd-api",
  "contractVersion": "kd-api-v1",
  "sourceCommit": "<40 lowercase hex>",
  "releaseId": "<opaque non-secret>",
  "enabled": false
}
```

Der Endpunkt benötigt keinen KD-Key, enthält keine Projekt-ID, Kontodaten,
Secrets, Deploymenttoken oder Betriebszähler und führt keine Datenmutation
aus. `sourceCommit` und `releaseId` kommen aus `KD_API_SOURCE_COMMIT` und
`KD_API_RELEASE_ID`; fehlende oder ungültige Werte lassen Deployment-/Readback
fehlschlagen. `enabled` ist das tatsächlich gelesene Gate, keine Buildannahme.

B3 besitzt folgende Dateinamen und CLI-Verträge:

```text
node tools/kd-api-release-info.mjs --source-commit <sha> --release-id <id>
node tools/kd-api-readback.mjs --base-url <function-entry> --expected-source-commit <sha> --expected-release-id <id> --expect-enabled <true|false>
node tools/kd-api-keychain.mjs issue|rotate|revoke ...
```

`kd-api-release-info.mjs` erzeugt lokal einen nicht geheimen Manifestnachweis
mit Function-Slug, Contractversion, Quellcommit, Release-ID und Hash der
Functionquellen. `kd-api-readback.mjs` vergleicht jedes Feld bytegenau und
endet bei Umleitung, Zusatzfeldern, falschem Gate oder Versiondrift ungleich
null. Es gibt keinen automatischen Enable-Schritt.

## Service-only Key-Lebenszyklus

Rohkeys werden von `tools/kd-api-keychain.mjs` lokal kryptographisch zufällig
erzeugt, unmittelbar in den adressierten System-Keychain-Eintrag geschrieben
und niemals als Argument, stdout/stderr, Manifest-, GitHub- oder Repositorywert
ausgegeben. An RPCs gehen nur Digest und Fingerprint. Der Digest entsteht aus
dem hochentropischen Rohkey; der kurze Fingerprint dient ausschließlich der
geschützten Zuordnung und erlaubt keine Authentifizierung.

Die konkreten RPC-Signaturen stehen in `persistence-rpc.md`. `issue`, `rotate`
und `revoke` sowie der öffentliche Resolve-Wrapper sind nur für `service_role`
ausführbar. `anon`, `authenticated` und KD-Key-Kontexte besitzen kein Execute.
Das private Schema wird nicht als REST-Schema freigeschaltet. B3 ruft die
öffentlichen Wrapper über den bestehenden geschützten Adminweg auf und liest
danach den nicht geheimen Metadatensatz zurück.

Jeder Lifecycle-Aufruf besitzt eine eigene UUID `operationId`. Wiederholung
mit identischer ID und identischem Hash ist idempotent; abweichender Inhalt
endet `IDEMPOTENCY_MISMATCH`. Issue prüft Zielkonto, aktuelle Rolle und das
exakte Profil. Ein Memberprofil kann keine `ai.*`- oder `diagnostics.*`-
Permission erhalten. Rotate erhöht `keyEpoch`, macht den vorherigen Digest
atomar ungültig und liefert keinen Ersatzkey. Revoke erhöht ebenfalls die
Epoch und sperrt bestehende Kontexte beim nächsten Request.

Erst in E6 werden Zielkonten, sichere Übergabe, Shared-Migration, Keyausgabe,
Enable und Readback konkret gebunden. Dieser Vertrag führt keine dieser
Wirkungen aus.
