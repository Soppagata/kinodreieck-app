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

2. Vor einem neuen Privatpilot-Deploy KI und Provider global ausgeschaltet
   rücklesen. Danach die additiven, vom neuen Quellstand benötigten
   DB-Verträge einzeln anwenden und bei weiterhin ausgeschalteten Flags
   verifizieren. Für den aktuellen Kandidaten gehört dazu nach der bereits
   live vorhandenen Budgetgrundlage insbesondere:

   ```text
   20260809180000_event_radar_local_basis.sql
   20260809220000_private_pilot_ops.sql
   ```

   Erst wenn `kd_private_provider_allowed` vorhanden ist und sowohl alle
   `kd_private_settings`- als auch alle `kd_radar_settings`-Schalter exakt
   `false` sind, darf die davon abhängige Function deployt werden. So gibt es
   kein Fenster, in dem neuer Code wegen einer fehlenden Registry-RPC
   unkontrolliert oder irreführend betrieben wird.

3. Genau diesen Stand deployen. Den vollständigen Commit erst nach
   erfolgreichem Deploy als nicht geheime Laufzeitversion setzen:

   ```bash
   KD_FUNCTION_COMMIT="$(git rev-parse HEAD)"
   npx supabase functions deploy ai-task --project-ref bscjgwcntapobyxsiyce \
     && npx supabase secrets set \
     KD_FUNCTION_BUILD_VERSION="$KD_FUNCTION_COMMIT" \
     --project-ref bscjgwcntapobyxsiyce
   unset KD_FUNCTION_COMMIT
   ```

   Supabase stellt geänderte Function-Secrets ohne erneutes Deployment sofort
   bereit. Das Secret darf deshalb nicht vor dem Code-Deploy geändert werden:
   Sonst könnte die alte Function vorübergehend den neuen Commit melden. Wenn
   Deploy oder Secret-Set scheitern, bleibt KI aus und kein Health-Ergebnis gilt
   als Releasebeleg. Noch keinen bezahlten Test starten. Ohne den neuen DB-Wert
   verweigert diese Function jeden zahlenden Request absichtlich fail-closed.

4. Für ältere Releases waren zusätzlich die folgenden Budgetmigrationen in
   dieser Reihenfolge nötig: zuerst
   `20260801194500_stapelimport_medien.sql`, danach
   `20260808120000_ai_anbieter_request_kostenzaun.sql`. Die erste liefert den
   Modell-, Token- und Task-Cap-Vertrag für P23; die zweite liefert den
   universellen Request-Zaun und den Sonnet-Preisboden. Danach prüfen, dass
   `anbieter_request_max_usd_cent` numerisch, positiv und höchstens 500 ist.
   Für Function-Version 26 wurden beide am 08.08.2026 in genau dieser
   Reihenfolge angewandt und remote verifiziert. Sie sind heute eine
   Vorbedingung und kein Grund mehr für Function-first. Beim Privatpilot gilt
   wegen der neuen direkten Registry-RPC-Abhängigkeit verbindlich die
   Reihenfolge aus Schritt 2.

5. Zuerst den kostenfreien Health-/Budgetcheck ausführen. Eine
   Provider-Wiederfreigabe ist erst mit grünem Registry-, Rollen-, Flag- und
   Budgetstand zulässig. Eine budgetgeschützte Rauchprobe folgt nur bei
   separat sicher bekanntem Kostenstand und nach den Repository-Grenzen.
   Rauchprobe ausführen. `health.buildVersion` muss den
   erwarteten Commit und `health.betrieb.anbieterRequestMaxUsdCent` exakt 500
   melden. Ein direkter Aufruf der bezahlten Testskripte bleibt verboten.

6. Datum, Git-Commit, von `check:function-release` gemeldeten Source-SHA-256
   und die Supabase-Function-Version in der Tabelle ergänzen.

## Releases

| Datum | Git-Commit | Source-SHA-256 | Supabase-Version | Nachweis |
|---|---|---|---|---|
| 30.07.2026 | `c91c2b0` | historisch nicht erfasst | bestehende Produktion | 276/276 kostenfreie Function-Checks; Etappe-9-Abnahme |
| 08.08.2026 | `53aff4981dcb1a999a4ac92c6226a9fde1d482d6` | `16c6172e22f982324e4687ec4ef668d68d922b463e4b83babd58bd5fb567ec7b` | 26 | Health meldet exakten Build und 500-US-Cent-Request-Cap; 285/285 kostenfreie Function-Checks; 23/23 budgetgeschützte Rauchproben |
| 09.08.2026 | `65a92df7ba294dd6242fb2b3d10b4d878f8a476d` | `175d4b113b5bf8a388f377879bfc4b8c224c9a16b816779a186f9a339005bd54` | 32 | Live-Health meldet den post-Rollen-v1-Build; heruntergeladene Live-Quellen sind bytegleich zu den fünf versionierten Function-Quellen dieses Commits; Rollen-/RLS-Abnahme 73/73 und 14/14 |
| 10.08.2026 | `a0c8efc4734b95b19f57ec1b0c67e48b11374ffa` | `70de90320b389b712691fad70b27963495c4700aada056ad768bad31a7d21dea` | nicht deployt | Privatpilot-Branch-Kandidat mit sechs versionierten Function-Quellen; 291/291 kostenfreie Function-Checks; Shared-Backend-/Function-Write mangels restore-geprüfter frischer Sicherung `SAFE_SKIPPED` |

Der Architektur-Cleanup ist seit 08.08.2026 als Version 26 deployt. Der
Produktions-Healthbericht meldet den vollständigen Commit statt
`buildVersion: "unversioned"`.

## Verbindlicher Recovery-Stand ab Rollen-v1

`53aff498` / Function 26 liegt vor Rollen-v1 und ist ab 09.08.2026 kein
zulässiges Rollbackziel mehr. Der kleinste bekannte sichere Live-Stand ist
Function 32 aus `65a92df` mit dem oben festgehaltenen Source-Hash. Recovery
bedeutet einen Forward-Redeploy genau dieses verifizierten Quellstands oder
eines neueren vollständig geprüften Stands; niemals einen Downgrade auf 26.

Im Privatpilot-Abschluss wurde die Zuordnung read-only erneut belegt. Ein
praktischer Redeploy blieb `SAFE_SKIPPED`, weil vor Shared-Backend-/Function-
Writes kein frisches logisches Backup mit Restore-Lesetest erzeugt werden
konnte. Der bestehende Live-Stand 32 blieb deshalb unverändert.

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
