# Unabhängige Deltakontrolle der 49 Fixentscheidungen

**Kandidat:** `9d88b7dc1e27a8580f5b223400ac8b7535ed003a` · Vorprüfung `a69a32be51d8258fc4604d925f03ff35d74b4da6` · Originalstand `14804ce389d69114feed27b92fb11ac78423cc0e`.

**Urteil: alle 49 lokalen Fixes weiterhin ERLEDIGT / BEHALTEN.** Die drei bestätigten Mischbetriebsreste sind lokal behoben. Filmwissen bleibt bewusst eingeschränkt: Alte TMDB-only-PWAs werden bis zum Clientupdate gesperrt. Kein weiterer bestätigter Produktrestfehler in diesem Delta; keine Auslieferungsfreigabe.

Vier betroffene Tickets wurden gezielt nachgeprüft; 45 Urteile wurden anhand unveränderter Ticketbytes und Quellen fortgeschrieben. Die vollständigen 239 Einzelkriterien einschließlich aktueller Fundstellen, Nutzen, Verhaltensänderungen und Kosten stehen in [DELTA_REVIEW.json](DELTA_REVIEW.json). [Quellenfortschreibung](source-carryforward.json) enthält je Ticket die SHA256- und Zeilenbelege. Die ursprüngliche unabhängige Entscheidung ist unter [prior-audit/REVIEW.json](prior-audit/REVIEW.json) erhalten.

## Drei Rolloutentscheidungen

|Rest|Lokales Urteil|Erhaltener Vertrag und Grenze|
|---|---|---|
|R-P05 Radar|BEHALTEN, geschlossen|Interne v2-Plattformidentität; echter v1-Werkstarthash im SQL-/HTTP-Feed. Event-/Versions-UUIDs erhalten 2 Plattformen. Alte Partial-UI bekommt ehrliches storage_error mit tatsächlichen writes/Feed. 0950 vor 1000; neue Function vor Client.|
|R-P06 Filmwissen|BEHALTEN, geschlossen mit Altclientgrenze|Numeric-read terminal gesperrt, Numeric-Synthese nicht_zuordenbar. Typisierung nur mit explizitem film.typ. **Keine vollständige Rückwärtskompatibilität. Function→SQL→neuer Client.** Andere SQL-Fehler bleiben sichtbar.|
|R-P08 Entdecken|BEHALTEN, geschlossen|GET-Projektion erhält 50 Basiseinträge für Altleser; exaktes Accept erhält zusätzlich ÖFI. Producer/Persistenz unverändert. Vollständige neue Function und erforderliche 1300 vor neuem Feed; kein zusätzlicher SQL-Patch.|

## Gezielte Einzelnachprüfung

### KD-REV-E07-002 — Format 8/9 verlieren ÖFI-Kinochartbelege vor der Anzeige

**ERLEDIGT / BEHALTEN.** Neue Leser behalten sicher identifizierte ÖFI-Belege; alte Leser behalten alle 50 Streaming-Basiseinträge trotz gespeichertem annotations-Feld.

Exaktes Accept-Opt-in erhält annotations; alte, fehlende oder unbekannte Accept-Werte erhalten nur bei Browser-GET eine nicht mutierende Basisprojektion. Vollständiger Producer-/Speicher-/Readbackvertrag bleibt erhalten. Kleine versionsbezogene HTTP-Projektion plus Accept/Vary. Alte Clients sehen weiterhin keine neue ÖFI-Karte; sie verlieren keinen Basispool. Headernormalisierung zu anderen Werten fällt sicher auf den Basispool zurück. Kein neuer SQL-Patch.

- K1: Unveränderte Producer/SQL/Kartenkette aus Erstprüfung fortgeschrieben; 34 aktuelle Produktfälle und eigene tatsächliche Alt/Neu-Handler-Serviceprobe liefern neue ÖFI-Karte mit unveränderten Metadaten und 50 Basiseinträgen.
- K2: Formate 8/9 × echte Alt/Neu-Producer × fresh/stale: 8 Pfade, je beide echten Browserdienste. Alter Validator verwirft als Negativkontrolle unprojizierte neue Annotationen; über neuen GET-Handler bleiben beide Leser gültig.
- K3: 34 aktuelle Produktfälle prüfen Resolverfehlbeleg, Typkonflikt, Remake, Mehrdeutigkeit, fehlendes Jahr und fehlende/veraltete Vorstellungen. Eigene HTTP-Probe prüft erneut relevante Karten-/Programmguards.
- K4: Neuer Feed bleibt bytegleich während der Leseprojektion; jeweils 50 Basiseinträge, ehrlicher Fallback, keine Provider-/Wikidata-/Schreibaufrufe beim Lesen; Dienstwahl und Füller durch 34 Produktfälle erneut bestätigt.

Fundstellen: `supabase/functions/entdecken-daily-task/responseContract.js:92`, `supabase/functions/entdecken-daily-task/index.ts:598`, `src/services/entdeckenDailyFeed.js:279`.

### KD-REV-E08-001 — Browser verwirft einen belegten Speicher-Teilerfolg als `unavailable`

**ERLEDIGT / BEHALTEN.** Der neue Client versteht belegten Speicherteilerfolg weiterhin; auch der echte alte Client verwirft die Antwort nicht als unavailable und zeigt den gespeicherten Geschwisterfund.

Neuer x-client-info-Wert erhält confirmed/partial mit persistence. Altclient erhält bewusst storage_error mit tatsächlichen writes und gespeichertem Feed; nicht darstellbare Teilspeicherwarnung wird nicht als Erfolg umgedeutet. Eine HTTP-Kompatibilitätsprojektion. Alte UI kann Teilerfolg nicht so genau erklären wie die neue; bestehender Fund bleibt über normalen Feed-Sync sichtbar. Scheduler, Receipt und Providerzahl unverändert.

- K1: Aktueller Originalteilerfolgstest und echte Alt/Neu→PG17→Handler/Service-Kette: neuer Client confirmed, writes: 1, partial, ein gespeicherter Fund.
- K2: Neuer Controller akzeptiert partial; alter Controller erhält ehrliches storage_error statt unavailable. Gemountete echte Alt/Neu-JSdom-Komponenten zeigen den gespeicherten Fund in vollständigem und teilfehlgeschlagenem Lauf.
- K3: Originalteilerfolgstest erneut grün inklusive structured/providerpartial und elf Manipulationsfällen; Capability ändert keine Auth-/Receiptprüfung.
- K4: Receipt bleibt unverändert, echte writes statt künstlicher 0; 15 synthetische Adapteraufrufe im lokalen PG-Gestell, 0 Netz-/Provideraufrufe. Kein Produktretry ergänzt.
- K5: Echter SQL-Pilotfeed liest erfolgreichen Geschwisterfund erneut. Beide gemounteten Clientgenerationen zeigen ihn; keine ungeprüften Modellkandidaten als gespeicherte UI-Daten.

Fundstellen: `supabase/functions/radar-websearch-task/contract.js:554`, `supabase/functions/radar-websearch-task/index.ts:729`, `src/services/radarWebsearch.js:225`.

### KD-REV-E08-002 — Verschiedene Plattformfunde überschreiben sich beim selben Werkstart

**ERLEDIGT / BEHALTEN.** Zwei Plattformstarts bleiben intern getrennt und sind zugleich in echten Alt/Neu-Lesern sichtbar; vorhandene UUIDs und Lebenszyklus bleiben erhalten.

Interne Identität bleibt v2 mit Plattform. Nur SQL-/HTTP-Leseantwort trägt den originalen v1-Werkstarthash; Event-/Versions-UUIDs unterscheiden die zwei Plattformfunde. Additive 0950 läuft vor 1000. V1-Hash muss in JS/SQL übereinstimmen; aktueller Gegenvergleich mit echter 14804ce-Funktion belegt es. Begrenzter pg_get_functiondef-Patch stoppt bei Definitiondrift; separate öffentliche Projektion vermeidet Rückbau interner v2-Identität.

- K1: Vier echte Alt/Neu-Writer/Reader-Pfade mit PG17 erhalten 2 Event-UUIDs, 2 Versions-UUIDs, 2 Plattformen/Quellen und 2 tatsächliche UI-Karten.
- K2: Umgekehrte Kandidatenreihenfolge behält fachliche Identität; echte SQL-Endstände und Feed verglichen.
- K3: Identischer Replay liefert no_change,writes: 0 und unveränderte UUIDs/Versionen. 0950-Replay ändert Definition/Rows nicht erneut.
- K4: Echter V1-Bestand vor 0950; nach 0950/1000/1010 bleiben Event-/Versions-UUIDs und Metadaten. Beide Leser akzeptieren nach jedem Schritt. JS/SQL-Wirehash stimmt gegen echte 14804ce-Hashfunktion überein.
- K5: Echte Alt/Neu-Queue+RPC+Reload für Pause/Resume/Entfernen; strukturierter Review/Import/Receipt und Operationreplay erhalten. Anonfeed und authenticated direkter Hashhelper bleiben verboten; keine Providerwirkung.

Fundstellen: `supabase/functions/radar-websearch-task/contract.js:541`, `supabase/migrations/20260917095000_review_radar_client_compat.sql:6`, `supabase/migrations/20260917095000_review_radar_client_compat.sql:31`.

### KD-REV-E10-004 — Filmwissen verliert den TMDB-Medientyp und ordnet Filmbelege Serien zu

**ERLEDIGT / BEHALTEN.** Film/Serie mit gleicher TMDB-Nummer bleiben sicher getrennt; mehrdeutige alte PWA-Anfragen können weder falschen Filmbericht lesen noch ungewollt Recherche starten.

Alte Numeric-read-RPCs enden nach Auth/Accountguard als gesperrt; Numeric-Synthese endet als nicht_zuordenbar vor Vorbereitung/Quellen/Kosten. Nur Forecast mit explizitem film.typ wird typisiert. Enger alter-SQL-Fehler wird als fehlender Cache behandelt. Bewusster Funktionsverlust für alte TMDB-only-Filmwissen-PWA bis Clientupdate, auch für Filme. Keine vollständige Rückwärtskompatibilität. Kleiner Guard in atomarer noch nicht angewandter 1100; Function→SQL→neuer Client nötig. Andere SQL-Fehler bleiben sichtbar.

- K1: Identitäts-/In-flight-Code bleibt bytegleich zur Erstprüfung. 32 aktuelle SQL-/echte Altclientfälle trennen movie:348/tv:348; alter Baselinevertrag reproduziert zunächst identische Film-/Serienrequests und falschen Filmbericht.
- K2: Echter alter Service mit neuer SQL endet für Film/Serie und nach IMDb-cache_miss als gesperrt, 0 Recherchen. Neuer Service liest passenden typisierten Bericht; alte Numeric-Synthese stoppt vor Nebenwirkung.
- K3: 47 Functionfälle gegen echte alte/neue Handler belegen neue typed-TV-Grenze und terminale Numeric-Synthese; unveränderte Quellenadapter behalten Film-only-Vertrag.
- K4: Forecast adaptiert Numeric nur bei explizit film/serie. Falscher Cachetyp erzeugt keine Filmwissenprovenienz. Nur 22023/kennung_ungueltig bei TMDB wird Cachemiss; andere 22023, 42501, XX000 und IMDb bleiben 500.
- K5: Gültige IMDb- und neue typed-Film-TMDB-Reads bleiben grün. Die alte TMDB-only-PWA verliert absichtlich Filmwissen bis Update, weil ihr Film-/Serienrequest identisch ist; kein stilles Raten.
- K6: 32 Rollout-SQLfälle plus 19 bestehende SQL-Grenzen: Filmkennungen migriert, Serienaltzuordnung quarantänisiert, Numeric-read terminal, normalizer/write streng, Auth/RLS unverändert, 3 Werke/3 Versionen/0 Jobs durch Reads unverändert.

Fundstellen: `supabase/functions/ai-task/index.ts:790`, `supabase/functions/ai-task/index.ts:2254`, `supabase/functions/ai-task/index.ts:4544`, `supabase/functions/ai-task/index.ts:4628`, `supabase/migrations/20260917110000_review_filmwissen_identity.sql:257`.

## Aktuelle Prüfbelege und Grenzen

- Radar: echter 14804ce/9d88-Code → lokales PG17.10 → Handler/Service → gemountete JSdom-UI; 2 Plattformen, UUID-Erhalt, Reihenfolge, Replay, Partial, Lebenszyklus und strukturierter Receipt. [Log](review49_rollout_p05_pg17_test.log), [ursprüngliche Partialgrenzen](review49_p05_partial_test.log).
- Filmwissen: 47 echte Alt/Neu-Functionfälle, 32 PG-/Altclientfälle sowie 19 bestehende SQL-Grenzen. [Function](review49_rollout_p06_function_test.log), [RolloutSQL](review49_rollout_p06_sql_test.log), [SQLregression](review49_p06_sql_test.log).
- Entdecken: eigene 8-Pfadmatrix (beide Formate × beide Producer × fresh/stale, jeweils beide echten Services) mit Auth-/Read-/Fallbackgrenzen und unverändertem Feed; zusätzlich 34 Produktfälle. [Matrix](probe-p08-read-matrix.json), [Log](probe-p08-read-matrix.log), [Produktfälle](review49_p08_entdecken_test.log).
- Der erste eigene P08-Double enthielt kein maxAttempts:1; Format 8/9 wurde korrekt als invalid_response verworfen. Fixture korrigiert, Assertions unverändert, [erster Fehler](probe-p08-read-matrix.initial-fixture-failure.log) erhalten. Das ist kein Produktrestfehler.
- Kein neuer Browserlauf, kein Port 5173, keine volle Suite, kein Build und kein Remote/Provider durch diesen Prüfer. P08-SQL ist unverändert und durch eigene Vorprüfung belegt; den neuen Owner-PG-/Browsertest habe ich gelesen, nicht selbst ausgeführt. Master führt den vollständigen Abschluss separat durch.

## Verbleibende Auslieferungsgrenzen

Master meldet frisch beide Remote-Refs/Webbuilds 14804ce sowie Ledger 87, max 20260916193000, ohne Migration>=0950; diese Information ist ausdrücklich kein eigener Remotecheck. 0950 ist additiv; 1100 ist noch nie angewandt und enthält den Numericguard atomar. Falls der Ledger vor Lieferung abweicht, muss der Migrationsplan neu abgeglichen werden.

Die neue Filmwissen-Function allein repariert keinen direkten Altclientread gegen alte SQL. Erst das SQL-Update schließt diesen Datenlesefehler; danach darf der neue Client folgen. Alte TMDB-only-Filmwissenwege bleiben gesperrt, auch bei Filmen. IMDb und explizit typisierte neue Wege bleiben funktionsfähig. Physische PWA-/iPhoneabnahme und Remote-Readbacks stehen separat aus.

## Gemeinsame Knoten und kleinere Alternativen

Die drei Korrekturen liegen bereits an tatsächlichen gemeinsamen Lesegrenzen: Radar SQL-Feed+HTTP, Entdecken GET-Projektion, Filmwissen RPC/Function. Eine gemeinsame generische Versions-/Identitätsschicht würde unterschiedliche Semantik koppeln (UUID/Plattform, optionales Annotationformat, unauflösbare Numericidentität) und keinen weiteren lokalen Sonderfall sicher beseitigen. Vorige Ursachen-/Knotenbewertung bleibt ansonsten unverändert. Radar benötigt gleiche V1-Hash-Semantik in SQL/JS; echter Altquellen-Gegenvergleich vorhanden. Entdecken benötigt ein exaktes Accept-Token; unbekannte Werte fallen auf sicheren Basispool. Filmwissen benötigt einen terminalen Altreadguard und ausdrücklich typisierten Forecastadapter; Weglassen würde belegte Fehlzuordnung oder 400/500 erneut einführen.

Unmittelbare Nachbarn: E05-002/E08-004/E08-005/E14-001 behalten Radar-Pilotfeed, Queue, Receipt-/UI-Verträge; E07-001 behält Typ-/Sourceguards; E10-001/E10-002/E10-003 behalten Eingang, Diagnostik und Quellenadapter. Ihre Fixblöcke sind unverändert. E10-001/E10-002 liegen in der insgesamt geänderten ai-task-Datei; ihre unveränderten Quellenumgebungen sind separat nachgewiesen.

## Alle 49 endgültigen lokalen Status

|Ticket|Status|Urteil|Aktuelle Grundlage|
|---|---|---|---|
|KD-REV-E01-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E01-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E02-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E02-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E02-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E03-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E03-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E03-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E04-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E04-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E04-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E04-004|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E04-005|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E04-006|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E05-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E05-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E05-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E06-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E06-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E06-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E07-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E07-002|ERLEDIGT|BEHALTEN|Gezieltes Delta|
|KD-REV-E08-001|ERLEDIGT|BEHALTEN|Gezieltes Delta|
|KD-REV-E08-002|ERLEDIGT|BEHALTEN|Gezieltes Delta|
|KD-REV-E08-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E08-004|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E08-005|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E09-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E09-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E09-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E09-004|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E10-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E10-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E10-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E10-004|ERLEDIGT|BEHALTEN|Gezieltes Delta|
|KD-REV-E11-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E11-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E11-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E11-004|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E11-005|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E12-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E12-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E12-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E13-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E13-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E13-003|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E13-004|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E14-001|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|
|KD-REV-E14-002|ERLEDIGT|BEHALTEN|Quellengeprüfte Fortschreibung|

E13-F005 ist weiterhin separat ungeklärt und nicht Teil dieser 49. Alle 239 Kriterien sind im JSON eindeutig zugeordnet. Arbeitsbaum am genannten Kandidaten sauber; Produktbytes unverändert.
