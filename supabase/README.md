# Zentraler PWA-Katalog einrichten

1. `katalog_schema.sql` einmal im Supabase SQL Editor ausführen.
2. Auf Max' Mac in `KinoFilm/Programmdateien/System/.env` ergänzen:

   ```env
   SUPABASE_URL=https://<projekt>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<nur-auf-diesem-mac>
   ```

3. Im System-Ordner einmal `node liefere_an_supabase.mjs` starten. Danach liegen
   `manifest`, `programm` und `streaming` in `public.kd_catalog`. Ein
   Datenbanktrigger pflegt daraus zusätzlich `streaming_bekannt` und
   `streaming_entdecken`; neue Clients laden den großen Entdecken-Teil erst
   beim Öffnen des Streaming-Tabs.
4. Im GitHub-Repo muss die Actions-Variable `SUPABASE_URL` gesetzt sein. Die PWA
   baut daraus die Projekt-URL; Tester tragen nur den Publishable-/Anon-Schlüssel
   im Popup ein.

Der Service-Role-Key darf nie in die PWA, GitHub Pages oder an Tester gelangen.
Die bisherige Datei-/Git-Lieferung `liefere_an_pwa.mjs` bleibt nur als historischer
Fallback im Datenordner und wird von den automatischen Jobs nicht mehr aufgerufen.

---

## Migrationen (seit Etappe 3)

Schemaänderungen liegen als versionierte Dateien in `supabase/migrations/`;
die angewandten Remote-Staende sind bis einschliesslich `20260816010000`
bestaetigt. Fuer E17B ist
`20260817120000_blog_profile_extract_config.sql` aktuell
Source-only/`REMOTE_PAYLOAD_PENDING`.
Das kontrollierte Laufverfahren und Protokoll stehen in
`supabase/migrations/LIESMICH.md`. Die erste Migration
legt `kd_personal` an — den persönlichen Speicher je Konto, geschützt allein über
die Anmeldung (`auth.uid()`), ohne jeden anon-Zugriff.

`kd_catalog` (diese Datei) und `kd_store` (der alte schlüsselbasierte Sync)
blieben in Etappe 3 zunächst unberührt. Seit dem Architektur-Cleanup vom
31. Juli 2026 liegen geteilte Blogs in `kd_shared_articles`: direkte Zeilen
sind accountprivat, die Öffentlichkeit liest nur
`kd_list_shared_articles()`. `kd_store scope=shared` ist leer und für neue
Schreibzugriffe gesperrt. Der neue Demo-Start liest ein einziges validiertes
Format-1-Dokument `demo_seed` aus `kd_catalog`; dieselbe Form liegt dem lokalen
Downloadpaket bei. Die vier alten `kd_store scope=demo`-Zeilen bleiben nur für
bereits ausgelieferte Clients lesbar und werden nach dem bestätigten Release
des neuen Clients separat archiviert.

Isolationstest nach jeder RLS-berührenden Migration: `npm run test:rls`
(Konfiguration nur über Umgebungsvariablen, siehe Kopf von
`tools/rls_test_personal.mjs`).

`current_schema.sql` ist zusätzlich der bereinigte, daten- und geheimnisfreie
Ist-Stand des Produktionsschemas vom 2. August 2026. Er enthält auch das zuvor
nicht versionierte Basisschema von `kd_store`, samt Constraints, Funktionen,
Triggern, RLS-Policies und Grants. Historische Migrationen bleiben unverändert
die Änderungshistorie; der Snapshot ist die vollständige Prüf- und
Wiederherstellungsreferenz für neue Umgebungen. Seine Struktur hält
`schema_snapshot_test.mjs`.

**Hinweis zur Aktualität:** Die App wird seit Etappe 2 über Cloudflare Pages
auf `kinodreieck.at` ausgeliefert, nicht mehr über GitHub Pages. Ältere
Formulierungen oben beziehen sich auf den früheren Stand.

---

## Edge Functions (seit Etappe 5)

Der geschützte KI-Endpunkt besitzt weiterhin genau einen Einstieg unter
`supabase/functions/ai-task/index.ts`. Pure Request- und Filmwissen-Verträge
liegen in kleinen Nachbarmodulen und werden von der CLI gemeinsam gebündelt.
Ausgeliefert wird er von Hand und nur aus einem committed Stand:

```bash
if ! npm run check:function-release; then
  echo "STOP: function-release contract check failed before deploy."
  exit 75
fi
KD_FUNCTION_COMMIT="$(git rev-parse HEAD)"
if ! echo "$KD_FUNCTION_COMMIT" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "STOP: invalid KD_FUNCTION_COMMIT; function release blocked."
  exit 75
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "STOP: working tree dirty; function release blocked."
  exit 75
fi
if ! ./node_modules/.bin/supabase functions deploy ai-task --project-ref bscjgwcntapobyxsiyce; then
  echo "STOP: functions deploy failed; build marker unchanged."
  exit 75
fi
if ! ./node_modules/.bin/supabase secrets set KD_FUNCTION_BUILD_VERSION="$KD_FUNCTION_COMMIT" --project-ref bscjgwcntapobyxsiyce; then
  echo "STOP: marker write failed; function is new, build marker unchanged."
  exit 75
fi
if ! npm run check:function-release; then
  echo "STOP: function-release check failed after deploy and marker."
  exit 75
fi
unset KD_FUNCTION_COMMIT
```

`check:function-release` ist Teil der vor-deploy Vertragsprüfung, danach folgt
`functions deploy` mit `--project-ref`, anschließend der Marker-Set. Marker-Write-
Fehler sind STOP; die Function bleibt neu, Marker bleibt alt.

Die Supabase-CLI ist als devDependency im Projekt (`./node_modules/.bin/supabase`), das
Projekt ist per `supabase link` verknüpft. Der Anthropic-Schlüssel liegt
ausschließlich als Supabase-Secret (`ANTHROPIC_API_KEY`) — nie im Repo, nie im
Browser-Bundle.

`config.toml` ist bewusst **minimal** und bildet nicht den Gesamtzustand des
Projekts ab. **Niemals `supabase config push` ausführen.** Datenbankmigrationen
werden nur nach einem sauberen `migration list --linked` und gemäß
`migrations/LIESMICH.md` angewandt; keine fremden oder unerwarteten Migrationen
mitziehen.

Function-Deployment-Readiness (lokal dokumentiert): `KD_FUNCTION_COMMIT`, der
40-Hex-Vertrag, Dirty-State und `check:function-release` werden vor
`./node_modules/.bin/supabase functions deploy ai-task --project-ref bscjgwcntapobyxsiyce`
gebunden. Erst nach bestaetigtem Deploy wird der Buildmarker gesetzt. Bei
Deployfehler bleibt er unveraendert; bei Marker-Writefehler ist die Function
bereits neu, der Marker bleibt alt und der Lauf endet mit `STOP`.
`npm run test:ai:live` bleibt ein eigenständiger, budgetgeschützter und owner-
gated Auftrag und wird in diesem Dokument nicht gestartet.
Runbooks für Not-Aus, Limits, Modellwechsel, Protokollpflege und Testdeckel stehen
in `docs/ETAPPE_5_KI_UNTERBAU.md` und `docs/KI_TESTBUDGET.md`.
Die Zuordnung von Git-Stand, Quellhash und Plattformversion steht in
`docs/FUNCTION_RELEASES.md`; der geschützte Healthbericht meldet
`contractVersion` und `buildVersion`.
