# Progressive Streaming-Seiten: Backend

Die additive Migration `20260913200000_streaming_pages_backend.sql` stellt das
authentifizierte RPC `kd_streaming_page(p_request jsonb)` bereit. Die erste
Anfrage kann 20 Titel liefern. Die additive Latenzkorrektur
`20260914100000_streaming_pages_latency.sql` erlaubt für das serielle
Hintergrundladen bis zu 1.000 Titel pro Antwort; bestehende Anfragen bis 200
bleiben gültig. `counts` wird immer
aus der vollständigen ausgewählten Dienstunion berechnet; `total` bezieht sich
auf die konkrete Ansicht und ihre aktiven Filter.

## Projektion und Invalidierung

`kd_streaming_page_base` ist eine neutrale, indizierte Projektion der beiden
vorhandenen Watchmode-Lanes. Ein Statement-Trigger erneuert sie atomar, sobald
`streaming_bekannt` oder `streaming_entdecken` mit demselben `katalog_stand`
veröffentlicht wurde. Zwischenstände mit widersprüchlichen Versionen ersetzen
den letzten konsistenten Stand nicht. Die Initialisierung liest vorhandene
Katalogdaten einmal und verändert weder deren Payload noch deren Metadaten.

`kd_streaming_page_motn` enthält nur die zugeordneten MotN-Überlagerungen.
Änderungen an `kd_motn_offers` erneuern ausschließlich das betroffene Werk.
MotN-Entfernungen und vollständige AT-Abo-Snapshots haben Vorrang vor veralteten
Watchmode-Angeboten. Ein späterer Watchmode-Nachzug entfernt den betreffenden
Diff-Beleg, übernimmt aber das ursprüngliche MotN-Zugangsdatum. Mehrdeutige
Titel sowie widersprüchliche IMDb-/TMDb-IDs werden nicht verbunden. Die
Library-Zuordnung verwendet dieselben vollständigen Jahr-/Typbelege,
ID-Präfixe und Titelregeln wie `ordneExternenTitelZu`; Streaming-Aliase bleiben
auf Gesehen-/Neu-Status begrenzt. Pro Request werden die reduzierte Library und
die Status-/Fristanker einmal materialisiert. Kandidaten entstehen aus
deduplizierten Gleichheitsjoins der expandierten ID- und Titelkeys; es gibt
keinen Katalog×Library-Vollvergleich.

Die Latenzkorrektur hält vollständige Titel-Payloads aus den materialisierten
Matching-, Status-, Count- und Sortierpfaden heraus. Erst nach Auswahl der
Seitenschlüssel lädt das RPC die Payloads für die höchstens 20 sichtbaren oder
bis zu 1.000 im Hintergrund übertragenen Titel. Die Neu-Fristfunktion läuft nur
für Titel mit Diff-, MotN- oder persönlichen Fristankern; leere Evidenz endet
ohne JSON-Schleifen. Die vollständigen Zähler, Neu-Fristen, Filter, Sortierung
und Cursorbindung bleiben Teil jeder Antwort.

Jede Quellenänderung erhöht `source_revision`. Cursor binden Revision, Konto,
Dienstauswahl, Ansicht, Filter und die übergebenen Identitäts-/Fristparameter.
Der nächste Ablauf nach exakt 1.209.600 Sekunden ist Teil der ausgegebenen
Version. Numerische Epoch-Millis und ISO-Zeitstrings werden als Fristanker
akzeptiert. `verbrauchtBis` verhindert bereits verarbeitete Wiederzugänge;
MotN behält den frühesten Zugangsanker. Eine Quellen- oder Zeitänderung liefert
für einen alten, ansonsten gültigen Cursor
`status: "version_changed"`.

Die vier vorhandenen Sortierungen `titel`, `jahr`, `art` und `anbieter` sowie
`auf`/`ab` laufen vollständig auf dem Server. Fehlende Werte stehen am Ende;
Titel sind der stabile Tiebreak. Die Titelreihenfolge ist akzent- und
großschreibungsunabhängig und ordnet Zahlen natürlich (`Film 2` vor `Film 10`).

## Konto- und Datengrenze

Das RPC prüft zuerst eine authentifizierte Sitzung und `kd_account_active()`.
Die drei Projektionstabellen besitzen RLS und keine Browserrechte; Browser
erhalten ausschließlich `execute` auf das RPC. Jeder Seitenaufruf prüft die
aktive Kontofreigabe erneut. `library` akzeptiert nur die vereinbarten
Identitätsfelder. Unerwartete Felder wie Bewertung oder Notiz werden abgelehnt;
ausgegeben werden höchstens `library_id` und `neu_seit`. Historische persönliche
Felder aus der alten Known-Lane, einschließlich des persönlichen Besitzfelds
`quelle`, werden beim Aufbau der neutralen Projektion entfernt.
`kd_streaming_catalog` und alle Originaltabellen bleiben unverändert.

## Lokale Prüfung und Kosten

`node streaming_pages_pg_test.mjs` startet einen disposable PostgreSQL-17-
Cluster und prüft standardmäßig portable synthetische Fixtures. Die neutralen
Dateien unter `/private/tmp/kd-streaming-performance-20260913` werden nur mit
`KD_STREAMING_PAGES_USE_LAB_FIXTURE=1` gelesen. Der ursprüngliche Lauf umfasste 15
Checks. Auf 25.023 vereinigten realen Titeln dauerte der einmalige lokale
Projektionsaufbau rund 11,3 Sekunden. Mit 226 durch den App-Kontext reduzierten
Library-Identitäten dauerte die erste 20er-Seite für Netflix, Disney+ und Prime
Video 0,34 Sekunden, die folgende 200er-Seite ebenfalls 0,34 Sekunden. Ihr
vollständiger Zähler von 8.806
stimmte mit der bestehenden JavaScript-Projektion überein. Die Messung ist
lokal und rechnerabhängig; Seitenaufrufe bauen den Katalog nicht erneut auf.

Die Latenzkorrektur wurde zusätzlich mit `work_mem=2184kB`, 25.023 vereinigten
Titeln, einer 8.806-Titel-Dienstauswahl und 226 reduzierten Library-Identitäten
gemessen. Erste 20, nächste 20 und direkter Sprung zu Z dauerten lokal
0,085/0,084/0,080 Sekunden. Die EXPLAIN-Blockzahlen sanken gegenüber derselben
unveränderten Basis von 7.532/7.326 auf 2.055/411 gelesene/geschriebene
Temp-Blöcke. Ein separates Hintergrundpaket mit 1.000 Titeln benötigte
0,100 Sekunden und umfasste 305.239 Bytes. Eine dichte Personenprobe mit 226
Gesehen-IDs und 660 Fristankern blieb bei 0,094 Sekunden. Der aktuelle Lauf
bestand mit 18 Checks. Diese Werte sind lokale Vergleichswerte;
das Ziel von unter 0,5 Sekunden für erste Seite und Direktsprung muss auf dem
echten Server separat bestätigt werden.

Die Migration ist nur lokal erstellt und geprüft. Sie wurde auf kein Supabase-
Projekt angewandt. Die Integrationsnaht ist der App-Service, der die bereits
vorhandenen lokalen Identitäts- und Fristanker in der begrenzten Requestform an
dieses RPC übergibt.
