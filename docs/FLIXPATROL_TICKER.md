# FlixPatrol-Nutzungsticker

Der Ticker erfasst FlixPatrol-Requests serverseitig und hält den letzten gültigen offiziellen Quota-Snapshot getrennt davon. Er enthält keinen Film-, Ranking- oder KI-Adapter und stellt keine Oberfläche bereit.

## Verträge

- `supabase/functions/_shared/flixpatrolClient.js` erlaubt nur `GET https://api.flixpatrol.com/v2/quota`. Der Transport nutzt den Wert aus `FLIXPATROL_API_KEY` als HTTP-Basic-Username mit leerem Passwort, folgt keinen Redirects, wiederholt Requests nicht und bricht nach spätestens 15 Sekunden ab.
- Vor jedem gestarteten Fetch claimt `kd_flixpatrol_usage_begin` eine UUID atomar. Ein erneuter oder gleichzeitiger Claim derselben UUID zählt nicht erneut.
- `kd_flixpatrol_usage_finish` finalisiert eine geclaimte UUID genau einmal. HTTP-, Transport- und Formatfehler zählen als fehlgeschlagener Abschluss. Scheitert die Finalisierung nach dem Provideraufruf, bleibt der bereits persistierte Versuch als `claimed` sichtbar.
- Nur ein valider offizieller Vertrag `{type:'apiquota',data:{used,available,limit,limitExtra,resetAt}}` ersetzt den letzten Snapshot. Null, zusätzliche Felder oder falsche Typen ändern ihn nicht.
- `attemptedRequests` ist die Zahl der von diesem Transport begonnenen Requests. `quota.used` ist die zuletzt beobachtete Providerzahl und kann andere Clients enthalten. Beide Werte werden nie addiert. `planLimit = 1000` ist ein Anzeige- und Planwert, kein Gate.

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

Der vorgesehene Workflow `FlixPatrol – Nutzung täglich erfassen` läuft einmal täglich im GitHub-Environment `staging`. Ein natürlicher Lauf sendet genau einen bodylosen POST an die Function; dieser fordert genau einen `/v2/quota`-Request an. Der Lauf besitzt entsprechend der Owner-Entscheidung kein zusätzliches Quota-Gate. Transport- oder Vertragsfehler bleiben rot und lösen keinen Workflow-Retry aus. Der Build dieses Pakets hat keine Function deployed, keine Migration angewendet und keinen Providerrequest ausgelöst.
