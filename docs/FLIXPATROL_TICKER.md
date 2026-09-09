# FlixPatrol-Nutzungsticker

Der Ticker erfasst FlixPatrol-Requests serverseitig und hält den letzten gültigen offiziellen Quota-Snapshot getrennt davon. Der Shared Client ist in diesem Paket absichtlich auf den Quota-Endpunkt begrenzt. Film-, Ranking- und weitere Produktadapter bleiben eine offene Naht für die spätere Quellenintegration; eine Oberfläche gibt es nicht.

## Verträge

- `supabase/functions/_shared/flixpatrolClient.js` erlaubt nur `GET https://api.flixpatrol.com/v2/quota`. Der Transport nutzt den Wert aus `FLIXPATROL_API_KEY` als HTTP-Basic-Username mit leerem Passwort, folgt keinen Redirects, wiederholt Requests nicht und bricht nach spätestens 15 Sekunden ab.
- Vor jedem gestarteten Fetch claimt `kd_flixpatrol_usage_begin` eine UUID atomar. Ein erneuter oder gleichzeitiger Claim derselben UUID zählt nicht erneut.
- `kd_flixpatrol_usage_finish` finalisiert eine geclaimte UUID genau einmal. HTTP-, Transport- und Formatfehler zählen als fehlgeschlagener Abschluss. Scheitert die Finalisierung nach dem Provideraufruf, bleibt der bereits persistierte Versuch als `claimed` sichtbar.
- Nur ein valider offizieller Vertrag `{type:'apiquota',data:{used,available,limit,limitExtra,resetAt}}` ersetzt den letzten Snapshot. Null oder falsche Typen ändern ihn nicht. Zusätzliche Providerfelder werden toleriert und nicht persistiert.
- Ein später gestarteter erfolgreicher Request besitzt Vorrang vor einem älteren Request, der erst danach abschließt. Dafür speichert der Snapshot sowohl Requeststart als auch Beobachtungszeit; ein älterer Abschluss kann den neueren Stand nicht zurückdrehen.
- `sinceSetup` benennt die lebenslangen eigenen Zähler ausdrücklich als Werte seit Einrichtung. `currentUtcMonth` zählt aus den Operations-Zeitstempeln die im laufenden UTC-Monat begonnenen Requests. `quota.used` ist die zuletzt beobachtete Providerzahl und kann andere Clients enthalten. Eigene Zähler und Providerwert werden nie addiert. `planLimit = 1000` ist ein Anzeige- und Planwert, kein Gate.

Die Function akzeptiert `SUPABASE_SECRET_KEYS` und den Legacy-Fallback `SUPABASE_SERVICE_ROLE_KEY`. Moderne `sb_secret_`-Keys sind keine JWTs, deshalb ist `verify_jwt = false`; der Handler verlangt trotzdem denselben bekannten Admin-Key exakt in `apikey` und `Authorization: Bearer …`, lehnt Browser-Origin und Requestbody ab und gibt keine Secrets oder Provider-Payloads aus. `GET` liest nur den gespeicherten Stand. `POST` mit `x-kd-flixpatrol-usage: scheduled-daily-v1` führt genau einen Quota-GET aus.

Die API-Grundlage ist in der offiziellen [FlixPatrol API v2](https://flixpatrol.com/api2/) und der [Quota-Dokumentation](https://flixpatrol.com/api2/page-quota/) beschrieben.

## Migration und Readback

Die Migration `20260909153000_flixpatrol_usage_ticker.sql` ist additiv und vollständig von `BEGIN`/`COMMIT` umschlossen. Nach gezielter Anwendung und Function-Deploy kann der folgende ausschließlich lesende SQL-Block Tabellen, Zähler, letzten Status und die getrennte Snapshot-Metadaten prüfen:

```sql
begin read only;

select
  to_regclass('public.kd_flixpatrol_usage_state') as state_table,
  to_regclass('public.kd_flixpatrol_usage_operations') as operations_table;

select
  plan_limit,
  attempted_requests,
  completed_requests,
  successful_requests,
  failed_requests,
  last_status,
  last_attempt_at,
  last_success_at,
  quota_used,
  quota_available,
  quota_limit,
  quota_limit_extra,
  quota_reset_at,
  quota_request_started_at,
  quota_observed_at
from public.kd_flixpatrol_usage_state
where singleton;

select status, count(*)
from public.kd_flixpatrol_usage_operations
group by status
order by status;

commit;
```

Die Operationstabelle enthält nur UUID, Requestart, Status, HTTP-Status und Zeitpunkte. Sie speichert weder Key noch URL-Parameter, Antwortpayload oder fachliche Daten.

## Hintergrundlauf

Der vorgesehene Workflow `FlixPatrol – Nutzung täglich erfassen` soll einmal täglich im GitHub-Environment `staging` laufen. Ein natürlicher Lauf sendet genau einen bodylosen POST an die Function; dieser fordert genau einen `/v2/quota`-Request an. Der Lauf besitzt entsprechend der Owner-Entscheidung kein zusätzliches Quota-Gate. Transport- oder Vertragsfehler bleiben rot und lösen keinen Workflow-Retry aus.

Die automatische Freigabeprüfung hat das Anlegen des aktiven Workflows abgelehnt und eine ausdrückliche Freigabe für die tägliche Credential-/Quota-Wirkung verlangt. Es gibt deshalb noch keine aktive `.github/workflows/flixpatrol-usage.yml`. Der folgende Entwurf ist reine Dokumentation für die konkrete Freigabe: täglich 05:11 UTC, höchstens 31 natürliche Quota-Requests je Kalendermonat, bestehende Staging-URL und bestehender Server-Schlüssel. Der FlixPatrol-Key bleibt in Supabase.

```yaml
name: FlixPatrol – Nutzung täglich erfassen
on:
  schedule:
    - cron: "11 5 * * *"
permissions:
  contents: read
concurrency:
  group: kinodreieck-flixpatrol-usage
  cancel-in-progress: false
jobs:
  quota:
    runs-on: ubuntu-latest
    environment: staging
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: Quota einmal abgleichen und Zähler lesen
        env:
          SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          set -euo pipefail
          test -n "$SUPABASE_URL" && test -n "$SUPABASE_SERVICE_ROLE_KEY"
          response_file="$(mktemp)"
          trap 'rm -f "$response_file"' EXIT
          http_status="$(curl --silent --show-error --request POST \
            --connect-timeout 10 --max-time 60 \
            --output "$response_file" --write-out '%{http_code}' \
            "${SUPABASE_URL%/}/functions/v1/flixpatrol-usage" \
            --header "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
            --header "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
            --header 'x-kd-flixpatrol-usage: scheduled-daily-v1')"
          if [ "$http_status" != "200" ]; then
            echo "::error::FlixPatrol-Ticker: HTTP ${http_status}; kein Retry."
            exit 1
          fi
          node tools/flixpatrol-usage.mjs "$response_file" >> "$GITHUB_STEP_SUMMARY"
```
