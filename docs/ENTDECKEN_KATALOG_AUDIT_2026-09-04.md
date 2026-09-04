# Entdecken- und Streaming-Katalogaudit vom 04.09.2026

Dieses datierte Supportartefakt gehört zu C3 und deckt D-06, U-06, U-07 und
U-14 ab. Es beschreibt ausschließlich die in Etappe A gelesenen Stände und
lokale, providerfreie Projektionen. Es startete keinen Scheduler, keinen
GitHub-Run, keinen Providerrequest und wandte keine Migration an.

## D-06 / U-06: Mandalorian & Grogu zuerst über Freshness prüfen

| Gate | Beleg am 04.09.2026 | Schluss |
|---|---|---|
| aktueller Vollkatalog | Titel mit stabiler Identität und Disney+-Verfügbarkeit vorhanden | Katalogaufnahme und AT-Verfügbarkeit belegt |
| Vergleichssnapshot 22.07.2026 | Titel nicht enthalten | späterer Katalogzugang plausibel; kein historisches Datum erfunden |
| aktueller Entdecken-Feed | Format 6, Titel nicht enthalten, `validUntil` 03.09.2026 | am Audittag abgelaufen |
| Feedquellen | `chart:joyn-at` und `chart:oefi-weekend-at` | dieser Feed erfasst keinen allgemeinen Disney+-Katalog; Ausschluss ist erklärbar |
| Profil | keine Profilmetadaten für den Titel belegt | selbst nach Feedaufnahme wäre die persönliche Passung gesondert zu prüfen |
| persönliche Ausschlüsse | weder gesehen noch in der Mediathek | diese Gates erklären das Fehlen nicht |
| letzter Versuch / letzter Erfolg | im Audit nicht als belastbarer Zeitpunkt vorhanden | ausdrücklich unbekannt; kein Zeitpunkt wird erfunden |

Das im lokalen Trace verwendete `refreshedOn` 28.08.2026 folgt deterministisch
aus dem gelesenen `validUntil` 03.09.2026 und dem unveränderten
Format-6-Vertrag `validUntil = refreshedOn + 6 Tage`. Es ist als abgeleiteter
Vertragswert zu verstehen, nicht als zusätzlich gelesener Runbeleg.

Ergebnis: Der Titel fehlt nicht belegt am österreichischen Markt. Sein Fehlen
in „Für mich“ ist durch einen abgelaufenen Feed, die enge Joyn-/ÖFI-Abdeckung
und fehlende Profilmetadaten erklärbar. Prompt, Ranking und Quellen werden
deshalb nicht auf Verdacht umgebaut.

Der providerfreie Entdecken-Workflow tickt bereits täglich um 02:00 UTC. Für
den lokalen Kandidaten ist die vollständige Format-6-Claim-RPC nun additiv auf
24 Stunden authored: weiterhin genau ein Versuch, dieselbe 180-Sekunden-Lease,
derselbe kurzlebige Owner-Staging-Override und keine Retryschleife. Der
Workflow- und Function-Header lautet passend `scheduled-24h-v1`; der Vertrag
bleibt providerfrei bei 50 Items aus Joyn und ÖFI. Radar bleibt separat bei
144 Stunden und behält `scheduled-144h-v1`.

Diese lokale Migrationserstellung ist autorisiert. Die Datei ist
**autorisiert lokal erstellt, aber nicht angewandt**. Weder Supabase noch ein
Scheduler, eine Function oder ein Live-Feed wurden dadurch verändert; ein
aktiver 24h-Livevertrag ist ausdrücklich nicht belegt.

## U-07: Radar-Neuigkeiten nennen nur exakt gebundene Ziele

Die Oberfläche verwendet für jede Neuigkeit `radarSubscriptionForEvent`.
Direkte starke `targetId`, ein explizites `sourceTargetKey` oder eine exakte
Mitgliedschaft in einer Titelgruppe können genau eine aktive Subscription
binden. Der sichtbare Zusatz lautet dann `Ziel: <Name>`. Ohne eindeutige
Bindung lautet er ehrlich `Ziel: nicht eindeutig zugeordnet`; Titelähnlichkeit
oder Freitext wird nicht als Herkunft geraten. Gruppierte Staffelfolgen werden
zusätzlich nach ihrer vorhandenen Provenienz getrennt und übernehmen eine
Ziel-ID nur einstimmig.

## U-14: 12k -> 10k ohne Marktverlustbehauptung

Scope: gespeicherte österreichische Streaming-Snapshots, Discover und Known.
Der Snapshotvergleich ist für die beiden Dateien vollständig; der Nachweis
der vorgelagerten Pipeline ist limitiert.

| Snapshot | Discover | Known | Gesamt |
|---|---:|---:|---:|
| 22.07.2026 | 12.540 | 100 | 12.640 |
| 04.09.2026 | 11.049 | 103 | 11.152 |

Die Identitätsbilanz bezieht sich ausschließlich auf Discover:

- geblieben: 10.695
- entfernt: 1.845
- hinzugekommen: 354
- nur umidentifiziert: 7
- starke ID-Duplikate: 0
- Dienste: in beiden Snapshots dieselben 6

Die Bilanz ist rechnerisch geschlossen: `10.695 + 1.845 = 12.540` und
`10.695 + 354 = 11.049`. „Entfernt“ bedeutet nur „im zweiten Snapshot nicht
mehr unter derselben Identität enthalten“ und beweist keinen Marktabgang.

| Pipelinephase | Status | Beleg |
|---|---|---|
| Rohquellen | unbekannt | Rohzeilen je Quelle wurden nicht mitgeführt |
| AT-Verfügbarkeit | unbekannt | Vorher-/Nachher-Zähler vor dem Marktfilter fehlt |
| Filter | limitiert | gleiche 6 Dienste; Zeilen vor/nach Filter unbekannt |
| Deduplizierung | limitiert | 0 starke ID-Duplikate im Vergleich; Stufenzähler unbekannt |
| Sortierung | unbekannt | kein eigener Mengenzähler |
| Begrenzung | unbekannt | mögliche Trunkierung vor Speicherung nicht protokolliert |
| Auslieferung | belegt | gespeicherte Snapshotzahlen oben |
| Nutzersicht | unbekannt | hängt von Dienstefilter und persönlichem Mediathek-Abzug ab |

Die Settings-Oberfläche zeigt diese datierte Bilanz samt Umfang
„Snapshotvergleich voll / Pipelinebeleg limitiert“ und dem Mandalorian-Trace
unter „Streaming-Katalogstand“ an.

## Liefergrenzen dieses Pakets

- lokal gebaut: D-06, U-06, U-07, U-14
- U-06-Migration: autorisiert lokal authored, nicht angewandt
- Migration angewandt: nein
- Function deployt: nein
- Scheduler/Run gestartet: nein
- Providerrequest: nein
- Push, CI, Deployment, iPhone-PWA-Abnahme: nicht belegt
