# FlixPatrol-Nutzungsticker

Der Ticker erfasst FlixPatrol-Requests serverseitig und hält den letzten gültigen offiziellen Quota-Snapshot getrennt davon. Die tägliche Ticker-Function ruft ausschließlich Quota ab. Der gemeinsame Client im Masterzweig unterstützt zusätzlich Charts und Titel; deren Cache- und Integrationsvertrag steht in [FLIXPATROL_DATENVERTRAG.md](FLIXPATROL_DATENVERTRAG.md). Eine Oberfläche gibt es nicht.

## Verträge

- `fetchQuota()` in `supabase/functions/_shared/flixpatrolClient.js` verwendet ausschließlich `GET https://api.flixpatrol.com/v2/quota`. Auch die additiven Chart-/Titelmethoden nutzen denselben gezählten Transport. Er verwendet `FLIXPATROL_API_KEY` als HTTP-Basic-Username mit leerem Passwort, folgt keinen Redirects, wiederholt Requests nicht und bricht nach spätestens 15 Sekunden ab.
- Vor jedem gestarteten Fetch claimt `kd_flixpatrol_usage_begin` eine UUID atomar. Ein erneuter oder gleichzeitiger Claim derselben UUID zählt nicht erneut.
- `kd_flixpatrol_usage_finish` finalisiert eine geclaimte UUID genau einmal. HTTP-, Transport- und Formatfehler zählen als fehlgeschlagener Abschluss. Scheitert die Finalisierung nach dem Provideraufruf, bleibt der bereits persistierte Versuch als `claimed` sichtbar.
- Nur ein valider offizieller Vertrag `{type:'apiquota',data:{used,available,limit,limitExtra,resetAt}}` ersetzt den letzten Snapshot. Null oder falsche Typen ändern ihn nicht. Zusätzliche Providerfelder werden toleriert und nicht persistiert.
- Ein später gestarteter erfolgreicher Request besitzt Vorrang vor einem älteren Request, der erst danach abschließt. Dafür speichert der Snapshot sowohl Requeststart als auch Beobachtungszeit; ein älterer Abschluss kann den neueren Stand nicht zurückdrehen.
- `sinceSetup` benennt die lebenslangen eigenen Zähler ausdrücklich als Werte seit Einrichtung. `currentUtcMonth` zählt aus den Operations-Zeitstempeln die im laufenden UTC-Monat begonnenen Requests. `quota.used` ist die zuletzt beobachtete Providerzahl und kann andere Clients enthalten. Eigene Zähler und Providerwert werden nie addiert. `planLimit = 1000` ist ein Anzeige- und Planwert, kein Gate.

Die Function akzeptiert `SUPABASE_SECRET_KEYS` und den Legacy-Fallback `SUPABASE_SERVICE_ROLE_KEY`. Moderne `sb_secret_`-Keys sind keine JWTs, deshalb ist `verify_jwt = false`; der Handler verlangt trotzdem denselben bekannten Admin-Key exakt in `apikey` und `Authorization: Bearer …`, lehnt Browser-Origin und Requestbody ab und gibt keine Secrets oder Provider-Payloads aus. `GET` liest nur den gespeicherten Stand. `POST` mit `x-kd-flixpatrol-usage: scheduled-daily-v1` führt genau einen Quota-GET aus.

Die API-Grundlage ist in der offiziellen [FlixPatrol API v2](https://flixpatrol.com/api2/) und der [Quota-Dokumentation](https://flixpatrol.com/api2/page-quota/) beschrieben.

## Lieferstand am 9. September 2026

- Migration `20260909153000` ist gezielt atomar im bestehenden gemeinsamen Projekt `bscjgwcntapobyxsiyce` angewandt; insgesamt 71 Migrationsversionen, keine weitere lokale Migration offen. Zwei neue Tabellen mit erzwungener RLS; Browserrollen besitzen weder Tabellen- noch RPC-Rechte. Der interne Statushelper ist auch für `service_role` gesperrt, die drei äußeren RPCs sind dort ausführbar.
- Function `flixpatrol-usage`, Version 2, ist `ACTIVE` und ihre drei eigenen Quelldateien sind bytegleich zum geprüften Commit `058eb08` zurückgelesen. Die sechs bestehenden Function-Versionen blieben unverändert.
- Erste echte Probe um 18:34 UTC: genau ein Quota-GET, HTTP 200, ein eigener persistierter Versuch und Erfolg, null Fehler. Der anschließende reine GET las denselben Stand ohne Provideraufruf zurück.
- Offizieller Snapshot: `used=0`, `available=1000`, `limit=1000`, `limitExtra=0`, `resetAt=2026-10-01T00:00:00`. Der rohe Resetwert enthält keine Zeitzone. Ein eigener Request und die offizielle Null sind zwei getrennte Messwerte; aus dieser einzelnen Antwort wird keine dauerhafte Kostenfreiheit aller Quota-GETs behauptet.
- Vollständiges `npm test` einschließlich Build: grün. 56 Tickerchecks einschließlich echter lokaler PostgreSQL-Tests: grün. Deno-Typcheck: grün. Bestehende KI-Function-Mocks: 334/334 grün, ohne Anbieteraufruf.
- Der vorgeschriebene bestehende Live-RLS-Gesamttest lief zusätzlich: 58 Checks bestanden, 15 Fehler bei inaktivem Testkonto B und anonymen 401-Antworten; Testdaten-Cleanup erfolgreich. Die neuen Tickerrechte wurden gesondert remote geprüft und stimmen. Testkonten wurden nicht aktiviert oder sonst geändert.
- Implementierung und Belege sind lokal committet; noch kein Push. Max hat die tägliche Automatik inzwischen ausdrücklich freigegeben. Der aktive Workflow ist im Masterzweig gebaut; Veröffentlichung und erster natürlicher Lauf stehen noch aus.

Vor der erfolgreichen Probe wurden zwei Zugriffsprobleme ohne FlixPatrol-Wirkung behoben: Der verfügbare moderne Supabase-Server-Key authentifiziert erfolgreich, während der geprüfte Legacy-Key abgewiesen wurde. Außerdem reicht der Edge-Proxy einen leeren POST als Stream weiter; der Handler prüft jetzt dessen tatsächliche Bytes. Inhaltsbytes und defekte Streams bleiben abgewiesen. Die vorangegangenen Providerzähler waren jeweils nachweislich null.

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

Der gebaute [Workflow](../.github/workflows/flixpatrol-usage.yml) läuft nach
Veröffentlichung auf dem Default-Branch täglich um 05:11 UTC im
GitHub-Environment `staging`. Ein natürlicher Lauf sendet genau einen bodylosen
POST an die Function; diese fordert genau einen `/v2/quota`-Request an.
Der Umfang ist höchstens 31 natürliche Quota-Requests je Kalendermonat.
Transport- und Vertragsfehler bleiben sichtbar und lösen keinen Retry aus.
Der FlixPatrol-Key bleibt in Supabase; GitHub verwendet die bestehende
Staging-URL und den serverseitigen Supabase-Schlüssel.

Die frühere automatische Freigabeablehnung ist durch Max' ausdrückliche
Zustimmung beantwortet. Es ist keine weitere Freigaberunde für diesen
beschriebenen täglichen Lauf offen. Der aktuelle Integrations-, Push- und
Ausführungsstand wird im [Masterregister](BETRIEBSREPARATUR_REGISTER_2026-09-09.md)
gepflegt.
