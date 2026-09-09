# FlixPatrol im natürlichen Entdecken-Tageslauf

## Produktumfang

Format 8 liefert genau 50 eindeutige Titel für Österreich:

- 15 Kinofilme aus dem Österreichischen Filminstitut
- 10 Netflix-Titel, je 5 Filme und Serien
- 10 Prime-Video-Titel, je 5 Filme und Serien
- 10 Disney+-Titel, je 5 Filme und Serien
- 5 Filme aus Apple TV

Apple TV ist die FlixPatrol-Company `cmp_VvmYc7OphiUds0Hgjbz5MESn`. Apple TV
Store (`cmp_phDSns8OP1rtHnX6QwlEKhiq`) gehört nicht zum Feed. Der bisherige
Format-6-Feed mit 25 Titeln sowie der eingebettete Format-7-Ersatz mit 50
Titeln bleiben lesbar.

## Tagesablauf und Grenzen

Der Lauf wird täglich um 02:00 UTC angestoßen. Für FlixPatrol wird der
abgeschlossene UTC-Vortag gewählt. `chartDate` und `popularity.measuredOn`
bezeichnen diesen Quellenstand; `refreshedOn` und `fetchedAt` bezeichnen den
Abruf. Ein Abrufdatum macht einen älteren Quellenstand nicht neuer.

Der reguläre Lauf hat feste Obergrenzen:

| Aufrufart | Maximum pro Lauf |
| --- | ---: |
| Öffentliche ÖFI-/Netflix-GETs | 2 |
| FlixPatrol-Top-10-Charts | 5 |
| FlixPatrol-Titel | 25 |
| Summe Quellenrequests | 32 |
| KI-Providerrequests | 0 |

Zusammen mit dem täglichen Usage-Ticker sind damit selbst ohne Cachetreffer
höchstens `31 × 30 + 31 = 961` FlixPatrol-Requests in einem 31-Tage-Monat
möglich. Es gibt keine Suche, Pagination, Retryschleife oder zusätzliche
Quota-Abfrage im Entdecken-Lauf.

Die fünf Charts sind Prime Filme, Prime Serien, Disney Filme, Disney Serien
und Apple-TV-Filme. Ein frischer Cacheeintrag für das gewählte Datum verhindert
den jeweiligen Chartrequest. Aus jedem Chart werden fünf noch nicht verwendete
IDs gewählt. Sind damit nicht genau 25 eindeutige FlixPatrol-IDs belegbar,
bricht der Lauf ab und behält den letzten guten Feed.

## Titelcache und Identität

Der Adapter verwendet ausschließlich den gemeinsamen E2-Client. Jeder echte
Request wird vor dem Netzaufruf über `kd_flixpatrol_usage_begin` geclaimt und
danach über `kd_flixpatrol_usage_finish` abgeschlossen. Erfolgreiche Charts und
Titel sowie negative Titelresultate werden sofort über die E2-RPCs gespeichert.

Nach der Chartauswahl liest der Adapter alle höchstens 25 IDs gebündelt über
`kd_flixpatrol_titles_read`. Nur dieser Readback bestimmt den Medientyp und die
Cachefrische. Frische positive und negative Einträge werden wiederverwendet;
nur fehlende oder abgelaufene Titel lösen einen gezielten `/v2/titles/{id}`-
Request aus. Nach den Einzel-Checkpoints folgt ein zweiter gebündelter Readback.

Die FlixPatrol-ID ist die stabile Quellenidentität und wird als
`externalIds.flixpatrol` weitergereicht. Rang, Titeltext und Abrufdatum erzeugen
keine neue Identität. Medientypkonflikte, widersprüchliche IDs, unvollständige
Fakten und Dubletten stoppen den Lauf. Es werden keine Ersatz-Titel erfunden.

## Persistenz und Fehlerverhalten

Die additive Migration `20260909210000_entdecken_flixpatrol_feed.sql` erweitert
den Payloadvertrag auf Format 8. Sie legt keine drei kollidierenden
FlixPatrol-Domains im bestehenden domain-eindeutigen Quellenregister an. Die
zwei öffentlichen Quellen bleiben dort gebunden; die drei Anbietercompanies
und Österreich werden über die getrennte E2-Vokabulartabelle geprüft.

`kd_entdecken_daily_save` ersetzt den gespeicherten Payload nur nach dem
vollständigen 50/5-Vertrag, gültiger Quellenkonfiguration und aktivem Fence.
Bei Chart-, Titel-, Cache-, Identitäts- oder Readbackfehlern bleibt der letzte
gute Payload erhalten. Der Readback meldet für Format 8 genau 50 Items, fünf
Quellen, `owner_private` und im Functionvertrag weiterhin
`providerRequests: 0`; öffentliche und FlixPatrol-Requests werden separat
ausgewiesen.

## Lokale Prüfung

Die Tests verwenden ausschließlich synthetische Daten und Mocks:

```sh
node entdecken_flixpatrol_mix_test.mjs
node entdecken_flixpatrol_frontend_test.mjs
node entdecken_flixpatrol_function_test.mjs
node entdecken_flixpatrol_pg17_test.mjs
/Users/max/.lmstudio/.internal/utils/deno check --no-lock supabase/functions/entdecken-daily-task/index.ts
```

Der PostgreSQL-Test akzeptiert PostgreSQL 16 oder 17 und startet den Server nur
auf `127.0.0.1`; `unix_socket_directories` bleibt leer. Er führt keine
Migration oder Schreiboperation gegen Supabase aus.
