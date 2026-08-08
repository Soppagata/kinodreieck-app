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

3. Releasegebundene Migrationen **in dieser Reihenfolge** anwenden: zuerst
   `20260801194500_stapelimport_medien.sql`, danach
   `20260808120000_ai_anbieter_request_kostenzaun.sql`. Die erste liefert den
   Modell-, Token- und Task-Cap-Vertrag für P23; die zweite liefert den
   universellen Request-Zaun und den Sonnet-Preisboden. Danach prüfen, dass
   `anbieter_request_max_usd_cent` numerisch, positiv und höchstens 500 ist.
   Function-first ist die sichere Reihenfolge: Migration-first ließe die alte,
   weniger konservative Reservierung vorübergehend gegen den neuen SQL-Deckel
   laufen. Für Function-Version 26 wurden beide Migrationen am 08.08.2026 in
   genau dieser Reihenfolge angewandt und remote verifiziert.

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
| 08.08.2026 | `53aff4981dcb1a999a4ac92c6226a9fde1d482d6` | `16c6172e22f982324e4687ec4ef668d68d922b463e4b83babd58bd5fb567ec7b` | 26 | Health meldet exakten Build und 500-US-Cent-Request-Cap; 285/285 kostenfreie Function-Checks; 23/23 budgetgeschützte Rauchproben |

Der Architektur-Cleanup ist seit 08.08.2026 als Version 26 deployt. Der
Produktions-Healthbericht meldet den vollständigen Commit statt
`buildVersion: "unversioned"`.

## Nachgelagerter Tageslimit- und Eval-Nachweis

Die additive Migration `20260808225500_etappe9_beta_tageslimit_30.sql` änderte
keine Function-Quelle; Version 26 und ihr Source-Hash blieben daher
unverändert. Remote sind Tageslimit 30, Monatsdeckel 1000 US-Cent,
Anbieterrequest-Cap 500 US-Cent, Task-Caps `filmwissen-synthese=6` und
`media-batch-extract=4` US-Cent, Sonnet-Preisboden 300/1500,
Not-Aus-Bereitschaft und Parallelität 2 belegt.

Der finale Audit startete keinen weiteren Smoke. Nach einem kostenfreien
Budgetstand von 9,4544 US-Cent lief genau ein serieller 20-Fall-Eval ohne
Retry. Alle 20 Anbieterantworten kamen erfolgreich zurück; der serverseitig
gemessene Monatsstand lag danach bei 38,4209 US-Cent, die Laufdifferenz bei
28,9665 US-Cent. Die anschließende kostenfreie Offline-Auswertung war mit
20/20 bewertbaren Fällen ohne objektiven Befund grün.
