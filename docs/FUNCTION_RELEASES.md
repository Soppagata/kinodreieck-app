# Releaseprotokoll der Edge Function `ai-task`

Der öffentliche Pages-Build und die Supabase Edge Function sind getrennte
Artefakte. Dieses Protokoll verhindert, dass eine Plattform-Versionsnummer ohne
reproduzierbaren Quellstand als Nachweis genügt.

## Verbindlicher Ablauf

1. Alle Function-Quellen committen und die kostenfreien Tests ausführen:

   ```bash
   npm test
   npm run test:function
   npm run check:function-release
   ```

2. Den vollständigen Commit als nicht geheime Laufzeitversion setzen und genau
   diesen Stand **vor der Migration** deployen:

   ```bash
   KD_FUNCTION_COMMIT="$(git rev-parse HEAD)"
   npx supabase secrets set KD_FUNCTION_BUILD_VERSION="$KD_FUNCTION_COMMIT"
   unset KD_FUNCTION_COMMIT
   npx supabase functions deploy ai-task
   ```

   Noch keinen bezahlten Test starten. Ohne den neuen DB-Wert verweigert diese
   Function jeden zahlenden Request absichtlich fail-closed.

3. Jetzt die beiden noch ausstehenden Migrationen **in dieser Reihenfolge**
   anwenden: zuerst `20260801194500_stapelimport_medien.sql`, danach
   `20260808120000_ai_anbieter_request_kostenzaun.sql`. Die erste liefert den
   Modell-, Token- und Task-Cap-Vertrag für P23; die zweite liefert den
   universellen Request-Zaun und den Sonnet-Preisboden. Danach prüfen, dass
   `anbieter_request_max_usd_cent` numerisch, positiv und höchstens 500 ist.
   Function-first ist die sichere Reihenfolge: Migration-first ließe die alte,
   weniger konservative Reservierung vorübergehend gegen den neuen SQL-Deckel
   laufen.

4. Zuerst den kostenfreien Health-/Budgetcheck, danach die budgetgeschützte
   Rauchprobe ausführen. `health.buildVersion` muss den
   erwarteten Commit und `health.betrieb.anbieterRequestMaxUsdCent` exakt 500
   melden. Ein direkter Aufruf der bezahlten Testskripte bleibt verboten.

5. Datum, Git-Commit, von `check:function-release` gemeldeten Source-SHA-256
   und die Supabase-Function-Version in der Tabelle ergänzen.

## Releases

| Datum | Git-Commit | Source-SHA-256 | Supabase-Version | Nachweis |
|---|---|---|---|---|
| 30.07.2026 | `c91c2b0` | historisch nicht erfasst | bestehende Produktion | 276/276 kostenfreie Function-Checks; Etappe-9-Abnahme |
| nächster Deploy | nach Commit einzutragen | `npm run check:function-release` | nach Deploy einzutragen | `health.buildVersion` plus budgetgeschützter Smoke |

Der aktuelle Architektur-Cleanup ist bewusst noch nicht deployt. Bis zum
nächsten Function-Deploy kann der Produktions-Healthbericht daher
`buildVersion: "unversioned"` liefern; das ist sichtbar und kein stiller
Versionsrückfall.
