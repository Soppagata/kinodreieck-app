# Eingefrorene Persistenz- und RPC-Schnittstelle

Diese Namen und Parameter sind die B1-Anschlussfläche. Die Migration darf
Constraints, Indizes und interne Hilfsfunktionen ergänzen, aber weder die
öffentlichen Signaturen noch ihre Rechtebedeutung ändern.

## Objekte

### `private.kd_api_access_v1`

Ein Datensatz pro widerrufbarem Zugang: `access_id uuid`, `account_id uuid`,
`key_digest text unique`, `role_snapshot text`, `assistant_profile text`,
`permissions text[]`, `key_epoch bigint`, `created_at timestamptz`,
`expires_at timestamptz null`, `revoked_at timestamptz null`,
`last_used_at timestamptz null`. `assistant_profile` ist genau
`personal_owner` oder `member`. Die aktuelle Kontoaktivität und Rolle werden
bei jedem Request aus den bestehenden Kontotabellen neu geprüft; Snapshots
erteilen allein kein Recht. Rohkeys werden nie gespeichert oder zurückgegeben.

### `private.kd_api_context_v1`

Kurzlebiger serverinterner Kontext: `context_id uuid`, `access_id uuid`,
`account_id uuid`, `effective_role text`, `assistant_profile text`,
`permissions text[]`, `ai_authorized boolean`, `account_epoch bigint`,
`expires_at timestamptz`. Höchstens fünf Minuten Lebensdauer. Er wird nur nach
Keyprüfung erzeugt und ist kein Supabase-Login. Direkter Zugriff ist für
`anon` und `authenticated` entzogen.

### `private.kd_api_operation_v1`

Idempotenzbuch: `operation_id uuid`, `account_id uuid`, `access_id uuid`,
`request_hash text`, `operation text`, `status text`, `result jsonb`,
`error_code text null`, `root_operation_id uuid`, `created_at timestamptz`,
`updated_at timestamptz`. Unique `(account_id, operation_id)`. Status ist
`accepted|running|succeeded|failed|conflict|unknown`. Gleiche ID und gleicher
Hash gibt das gespeicherte Ergebnis zurück; anderer Hash ist terminal
`IDEMPOTENCY_MISMATCH`.

### `private.kd_api_request_v1`

Datensparsamer Requestbeleg ohne Authheader oder private Inhalte:
`request_id uuid`, `account_id uuid`, `access_id uuid`, `operation text`,
`allowed boolean`, `status_code integer`, `duration_ms integer`,
`operation_id uuid null`, `created_at timestamptz`, `retention_until timestamptz`.
Provider-, Websearch- und Kostenfelder gehören in die bestehenden KI-Belege
und werden in Ansichten ausdrücklich getrennt ausgewiesen.

### `public.kd_api_job_v1`

API-Jobprojektion: `job_id uuid`, `account_id uuid`, `root_operation_id uuid`,
`request_id uuid`, `access_id uuid`, `origin_profile text`,
`origin_permissions text[]`, `origin_ai_authorized boolean`, `kind text`,
`status text`, `result jsonb null`, `error jsonb null`, `created_at`,
`updated_at`, `finished_at`. Status ist
`accepted|queued|running|succeeded|failed|cancelled|unknown`.

## Authentifizierung und öffentlicher Service-Wrapper

```sql
private.kd_api_resolve_key_v1(
  p_key_digest text,
  p_request_id uuid,
  p_now timestamptz
) returns jsonb

public.kd_api_resolve_key_v1(
  p_key_digest text,
  p_request_id uuid,
  p_now timestamptz
) returns jsonb
```

Beide Funktionen sind nur für `service_role` ausführbar. Der öffentliche
Wrapper ist die einzige über PostgREST erreichbare Auflösung und delegiert
ohne erweiterte Rechte an die private Funktion. Das Schema `private` wird
nicht als REST-Schema exponiert. Der Edge-Einstieg hasht den empfangenen Rohkey
vor dem öffentlichen RPC, verwirft Rohkey und Header danach und erhält
entweder einen kurzlebigen `context_id` plus effektive Rechte oder einen
generischen Authfehler. Konto-ID, Rolle, Profil und Permissions aus
Requestbody oder Headern werden ignoriert.

Jeder folgende RPC beginnt mit
`private.kd_api_require_context_v1(p_context_id uuid, p_permission text)`.
Diese interne Funktion prüft Ablauf, Widerruf, Key-/Kontoepoch, aktuelle
Kontoaktivität und aktuelle Rolle. Für `ai.*` und `diagnostics.*` verlangt sie
zusätzlich Profil `personal_owner`; für `ai.*` außerdem aktuelle persönliche
KI-Freigabe. Sie liefert keine Secrets.

## Service-only Key-Lebenszyklus

```sql
public.kd_api_issue_access_v1(
  p_operation_id uuid,
  p_account_id uuid,
  p_assistant_profile text,
  p_permissions text[],
  p_key_digest text,
  p_key_fingerprint text,
  p_expires_at timestamptz default null,
  p_label text default null
) returns jsonb

public.kd_api_rotate_access_v1(
  p_operation_id uuid,
  p_access_id uuid,
  p_new_key_digest text,
  p_new_key_fingerprint text,
  p_expected_key_epoch bigint
) returns jsonb

public.kd_api_revoke_access_v1(
  p_operation_id uuid,
  p_access_id uuid,
  p_expected_key_epoch bigint,
  p_reason_code text
) returns jsonb
```

Diese drei öffentlichen Wrapper sind ausschließlich `service_role` gewährt.
Ihre Eingaben enthalten nie einen Rohkey. `issue` validiert Zielkonto,
aktuelle Rolle, Profil und Permissionmenge; `rotate` ersetzt Digest und
Fingerprint atomar und erhöht `key_epoch`; `revoke` setzt `revoked_at` und
erhöht ebenfalls die Epoch. Alle verwenden das Idempotenzbuch.

Erfolg liefert exakt `{operationId, accessId, accountId, assistantProfile,
permissions, keyFingerprint, keyEpoch, createdAt, expiresAt, revokedAt}`.
Fehler folgt dem gemeinsamen Fehlervertrag. Weder Erfolg noch Fehler enthalten
Rohkey, Digest, Authheader oder Service-Credential. Rotate gibt insbesondere
keinen neuen Key zurück; die B3-Keychain-Hülle besitzt den lokal erzeugten
Rohwert bereits vor dem RPC.

## Persönliche Töpfe und Konkurrenz

```sql
public.kd_api_read_personal_v1(
  p_context_id uuid,
  p_bucket text,
  p_entity_id text default null,
  p_query jsonb default '{}'::jsonb
) returns jsonb

public.kd_api_mutate_personal_v1(
  p_context_id uuid,
  p_bucket text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_request_hash text,
  p_action text,
  p_entity_id text,
  p_payload jsonb,
  p_origin jsonb
) returns jsonb
```

Erlaubte Buckets sind exakt die bestehenden `kd_personal`-Schlüssel für
`kd:master`, `kd:artikel`, `kd:mustwatch`, `kd:einstellungen`,
`kd:wochenplan`, `kd:radar`, `kd:kino-pins`, `kd:entdecken-pins` und die für
den bestätigten Paketimport benötigten vorhandenen Töpfe. Auswahl/Export ist
kein Bucket.

Mutation läuft in einer Transaktion: Kontext prüfen; Operation per
`(account_id, operation_id)` reservieren; betreffende `kd_personal`-Zeile
`FOR UPDATE` sperren; `revision = p_expected_revision` verlangen; JSON anhand
des Fachschemas lesen, genau eine Mutation anwenden und validieren; Wert mit
`revision + 1` schreiben; Operation und Resultat committen. Existiert der Topf
nicht, ist nur `p_expected_revision = 0` zulässig. Der existierende PWA-Pfad
bleibt bei seiner revisionsgebundenen Änderung; durch Zeilensperre plus
Revisionsvergleich können PWA und API keinen Stand unbemerkt überschreiben.
`REVISION_CONFLICT` schreibt weder Topf noch Fachresultat.

Der Rückgabevertrag ist
`{operationId, status, bucket, entityId, revision, entity}`. Read liefert
`{bucket, revision, item|items, nextCursor}`. Kein RPC akzeptiert
`account_id`, `role`, `assistant_profile` oder `ai_authorized` als
Clientparameter.

Der bestätigte Paketimport besitzt wegen seiner möglichen Medien- und
Bloganteile einen eigenen atomaren Mehrtopfvertrag:

```sql
public.kd_api_apply_package_v1(
  p_context_id uuid,
  p_expected_revisions jsonb,
  p_operation_id uuid,
  p_request_hash text,
  p_preview_hash text,
  p_sections text[],
  p_payload jsonb,
  p_origin jsonb
) returns jsonb
```

Der RPC sperrt alle betroffenen `kd_personal`-Zeilen in lexikografischer
Bucketreihenfolge, prüft vor dem ersten Write sämtliche erwarteten Revisionen
und wendet anschließend den zuvor gehashten Previewplan vollständig in
derselben Transaktion an. Fehlender Preview, abweichender Hash, unbekannter
Bereich oder eine einzige konkurrierende Revision schreibt keinen Topf.
Wiederholung folgt demselben Idempotenzbuch. Memberherkunft bleibt auch für
importierte Blogtexte und Radardaten `aiAuthorized=false`; Import startet
keinen KI-Folgejob.

## Blogveröffentlichung

```sql
public.kd_api_mutate_blog_v1(
  p_context_id uuid,
  p_expected_private_revision bigint,
  p_operation_id uuid,
  p_request_hash text,
  p_action text,
  p_private_article_id text,
  p_expected_public_revision bigint,
  p_payload jsonb,
  p_origin jsonb
) returns jsonb
```

`p_action` ist `publish|update|unpublish|delete`. Der Wrapper reserviert die
Operation vor dem bestehenden v3-Blogvertrag, bindet private und öffentliche
Revisionen und speichert das Resultat. `unknown` führt bei Wiederholung zuerst
zu Owner-Readback; es löst keine zweite Veröffentlichung aus.

## KI und Herkunft

```sql
public.kd_api_enqueue_ai_job_v1(
  p_context_id uuid,
  p_operation_id uuid,
  p_request_hash text,
  p_kind text,
  p_payload jsonb,
  p_origin jsonb
) returns jsonb

public.kd_api_read_job_v1(
  p_context_id uuid,
  p_job_id uuid
) returns jsonb
```

`p_origin` muss exakt `requestId`, `rootOperationId`, `surface` und
`clientVersion` enthalten. Der Server ergänzt unveränderlich `accountId`,
`accessId`, `assistantProfile`, `permissions`, `aiAuthorized` und
`accountEpoch` aus dem geprüften Kontext. Jeder Folgejob kopiert diese
Serverfelder und dieselbe `rootOperationId`. Ein Memberkontext hat immer
`aiAuthorized=false`; Import-, Blog-, Radar- und Medienmutationen dürfen damit
keinen KI-Job anlegen. Ein interner Enqueue ohne vollständig geprüfte Herkunft
endet `ORIGIN_REQUIRED`.

Statuslesen ist read-only. Nach unklarem Transportausgang wird derselbe
`operationId`- oder `jobId`-Stand gelesen. Es entsteht kein Providerrequest.

## Diagnose und Fähigkeiten

```sql
public.kd_api_capabilities_v1(p_context_id uuid) returns jsonb
public.kd_api_usage_v1(p_context_id uuid, p_from timestamptz, p_to timestamptz) returns jsonb
public.kd_api_requests_v1(p_context_id uuid, p_cursor text, p_limit integer) returns jsonb
public.kd_api_backend_status_v1(p_context_id uuid) returns jsonb
public.kd_api_backend_diagnostics_v1(p_context_id uuid, p_cursor text, p_limit integer) returns jsonb
public.kd_api_backend_usage_v1(p_context_id uuid, p_from timestamptz, p_to timestamptz) returns jsonb
```

Nur der persönliche Owner-Assistent erhält die fünf Diagnose-/Nutzungs-RPCs.
Member erhalten `FORBIDDEN` ohne Zähler, Kosten, Erfassungsbeginn oder
Diagnosedetails. Antworten nennen Zeitraum, `Europe/Vienna`, Erfassungsbeginn
und Abdeckung; nicht erfasste Werte sind `null` plus `coverage=unknown`, nie
erfundene Null. Capabilities filtert serverseitig und verrät gesperrte interne
Werkzeuge nicht.

## Rechte und Grants

Alle Tabellen sind standardmäßig für `anon` und `authenticated` gesperrt.
Nur die in diesem Dokument ausdrücklich benannten `public.kd_api_*_v1`-RPCs
sind für `service_role` ausführbar; sie werden ausschließlich von der neuen Edge
Function gerufen. Direkter REST-/RPC-Zugriff mit einem normalen Nutzer-JWT ist
entzogen. Bestehende App-RPCs behalten ihre bisherigen Rechte, dürfen jedoch
keine neue Assistant-Diagnoseansicht offenlegen.
