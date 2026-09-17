# KD-REV-E14-001 · Strukturierter Radar-Werkkontext verliert gespeichertes Bezugsjahr

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — der optionale neutrale Faktenpfad fällt für strukturiert abonnierte Film-Werke deterministisch aus, obwohl die vollständige Identität bereits gespeichert ist. Die Radar-Hauptsuche bleibt benutzbar; falsche Termine, Datenverlust und Live-Auswirkungen sind nicht belegt.
- Finding: E14-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E14

## Fehler und Auswirkung

Für ein regulär angelegtes, aktiv abonniertes strukturiertes Film-Werk verwirft der SQL-Werkkontext das in `kd_radar_targets.external_ids.releaseYear` gespeicherte Bezugsjahr. Dadurch kann der nachgelagerte FlixPatrol-Faktenleser einen ansonsten passenden neutralen Cachefakt nicht sicher zuordnen. Er belässt den optionalen Kontext leer; die Radar-Hauptsuche bleibt benutzbar. In der isolierten Validierung endeten die drei gemockten Suchfälle kontrolliert mit `no_change` und ohne Ereigniswrites.

Der Befund betrifft nur den optionalen Faktenkontext bei strukturierten Werkzielen mit bereits belegtem Jahr und passendem Cachefakt. Personen-, Titelgruppen- und Freitextkontexte sowie die Suchberechtigung sind nicht als betroffen belegt. Für Serien besteht zusätzlich der getrennte Mappingbefund E05-F002; dieses Ticket bestätigt den Jahrverlust eigenständig am Filmfall.

## Auslöser, Soll und Ist

Auslöser ist ein aktives AT-Abonnement eines normalen Filmwerks mit `personal_ai` und `radar_pilot`, dessen starke ID und `external_ids.releaseYear` gespeichert sind. Die Validierung hat dafür `tmdb:movie:550` / *Fight Club* / 1999 über die regulären Gruppen- und Abonnement-RPCs angelegt und einen passenden, aufgelösten Cachetitel simuliert.

Soll: Der autorisierte Werkkontext übernimmt ein vorhandenes, valides gespeichertes Jahr. Nur dann darf der unveränderte konservative Matcher den Fakt bei übereinstimmender starker ID, Werkart und Jahr als `flixpatrolFakten` beifügen. Fehlende oder widersprüchliche Identität bleibt ausgeschlossen.

Ist: `kd_radar_websearch_context` gibt für dieses Ziel keinen Schlüssel `releaseYear` aus. Der Requestvalidator akzeptiert die Auslassung; `loadFactsContext` baut so eine Identität mit `jahr: undefined`. Der Matcher liefert `identity-evidence-missing`, und der Suchadapter erhält keine Fakten. Wird ausschließlich das zuvor gespeicherte Jahr 1999 in denselben Request ergänzt, wird der Fakt über die starke ID gefunden; ein falsches Jahr 2001 bleibt korrekt abgewiesen.

## Ursache und Fundstellen

Die letzte vollständige Definition des strukturierten Werkzweigs projektiert `targetId`, Titel, Typ, Region und Scopes, aber nicht `external_ids.releaseYear`. Der September-Patch ändert dort nur die Berechtigung; kein nachgelagerter Aufrufer ergänzt das Jahr. Der gemeinsame Typ-/Jahr-Guard ist nicht die Ursache und soll erhalten bleiben.

- SQL-Vertrag: [eingefrorene Quelle, Zeile 239](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260822200000_radar_title_group_discovery_v6.sql:239) — `jsonb_build_object` für Werkziele lässt `releaseYear` weg. Fixbezug: `supabase/migrations/20260822200000_radar_title_group_discovery_v6.sql` am Prüfcommit.
- Bereits vorhandene autoritative Quelle: [eingefrorene Quelle, Zeilen 338–353](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260821130000_radar_title_group.sql:338) — Gruppenmitglieder werden mit `external_ids.releaseYear` gespeichert und auf Drift geprüft. Fixbezug: `supabase/migrations/20260821130000_radar_title_group.sql` am Prüfcommit.
- Kontextverbraucher: [eingefrorene Quelle, Zeilen 493–505](/private/tmp/kd-vollreview-20260916/source/supabase/functions/radar-websearch-task/index.ts:493) — `loadFactsContext` übergibt `request.releaseYear` als `jahr`. Fixbezug: `supabase/functions/radar-websearch-task/index.ts` am Prüfcommit.
- Vertrag: [eingefrorene Quelle, Zeilen 333–372](/private/tmp/kd-vollreview-20260916/source/supabase/functions/radar-websearch-task/contract.js:333) — `releaseYear` ist zulässig, aber optional und wird nur bei Vorhandensein weitergegeben. Fixbezug: `supabase/functions/radar-websearch-task/contract.js` am Prüfcommit.
- Sicherer Matcher: [eingefrorene Quelle, Zeilen 107–120](/private/tmp/kd-vollreview-20260916/source/supabase/functions/_shared/externalTitleIdentity.js:107) — fehlender Typ oder fehlendes Jahr wird absichtlich als `identity-evidence-missing` abgewiesen. Fixbezug: `supabase/functions/_shared/externalTitleIdentity.js` am Prüfcommit.
- Faktenleser: [eingefrorene Quelle, Zeilen 256–304](/private/tmp/kd-vollreview-20260916/source/supabase/functions/_shared/flixpatrolFactsContext.js:256) — Lookup und Projektion erfolgen erst nach dem Aufbau dieser Identität. Fixbezug: `supabase/functions/_shared/flixpatrolFactsContext.js` am Prüfcommit.

## Belege und Gegenproben

Statische Beweiskette:

- [Validatorergebnis](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E14-F001.json) bestätigt Status, Ursache und engen Umfang; das ursprüngliche [Master-Proposal](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E14-F001.json) ist nur Herkunft, nicht die maßgebliche Präzisierung.
- [Source-Provenance](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E14-F001/validator/source-verification.json) gleicht alle 32 bei der Probe verwendeten Schema-, Migrations- und Produktdateien bytegenau mit `14804ce389d69114feed27b92fb11ac78423cc0e` ab.
- Der Migrationsgegencheck im Validator belegt: Die Definition vom 22.08. ist weiterhin maßgeblich; `20260914210000_radar_member_search_access.sql` ändert nur das Berechtigungsprädikat. Der Retry-Pfad bezieht den Request ebenfalls aus dem RPC.

Ausgeführte isolierte Reproduktion:

- `node /private/tmp/kd-vollreview-20260916/tests/E14-F001/validator/reproduce.mjs` endete mit Exit 0. Sie nutzte PostgreSQL 17 mit 25 einschlägigen Originalmigrationen, reale Produkt-RPCs für Gruppenmitglied und Abonnement, den effektiven SQL-Kontext sowie Originalrunner, Validator, Faktenreader und Matcher. Auth, Fakten-RPC und Suchadapter waren lokal gemockt; es gab keinen Providerzugriff.
- [Ergebnisdetails](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E14-F001/validator/result.json): (1) Original-SQL-Kontext ohne Jahr → `identity-evidence-missing`, keine Fakten, `no_change`, 0 Writes; (2) nur gespeichertes Jahr 1999 ergänzt → `strong-id`, Fakten vorhanden, weiterhin `no_change`, 0 Writes; (3) falsches Jahr 2001 → `reference-year-conflict`, keine Fakten, `no_change`, 0 Writes.
- [Effektiver SQL-Readback](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E14-F001/validator/effective-context.sql) hält die nach Anwendung der 25 Migrationen gelesene Funktionsdefinition fest.

Gegenproben und Abgrenzung:

- Ein unbekanntes Jahr darf weiterhin ohne Faktenkontext suchen; bestätigt ist ausschließlich die Auslassung eines bereits gespeicherten, gültigen Jahres.
- Die starke ID umgeht den Jahr-/Typguard nicht. Der positive Kontrollfall fügt nur den vorhandenen Wert hinzu; der falsche Jahreswert wird weiterhin verworfen.
- Der Filmfall verwendet den korrekten RPC-Typ und trennt den Befund von E05-F002. Die Hauptsuche war in allen drei Fällen nicht blockiert und schrieb keine Ereignisse.

## Test- und Betriebsbeleggrenzen

- **Produktfehler:** Der bestätigte Fehler ist der unvollständige SQL/JS-Kontextvertrag, nicht der konservative Matcher.
- **Testbeleglücke, kein Testwerkzeugfehler:** Der vorhandene Test `flixpatrol_ai_radar_test.mjs` setzt das Jahr von Hand und stubbt Fakten direkt; er deckt die SQL-Kontext- und Matching-Grenze nicht ab. Ein Fehler des Testwerkzeugs ist nicht belegt.
- **Betriebsbeleglücke:** Keine Live-Umgebung, reale Konten, Produktionscachebestände, Deployments oder reale Anbieteraufrufe wurden geprüft. Häufigkeit, Kostenwirkung und tatsächliche Nutzerbetroffenheit bleiben offen.
- Die Reproduktion ist fokussiert, keine globale Testsuite oder gesamte Datenbankhistorie. `loadFactsContext` wurde aus `index.ts` extrahiert und nur von zwei TypeScript-Typannotationen befreit; kein vollständiger HTTP-/Deno-Edge-Function-Start wurde ausgeführt.

## Korrekturziel und Abnahme

Korrekturziel: Das bereits gespeicherte, valide Bezugsjahr aus `kd_radar_targets.external_ids.releaseYear` im autorisierten strukturierten SQL-Kontext erhalten. Fehlende oder ungültige Werte bleiben ohne Faktenmatch. Den gemeinsamen Matcher nicht lockern, kein Jahr aus dem erst zuzuordnenden Cachefakt ableiten und keine Providerabfrage oder Cache-Schreibwirkung hinzufügen.

Abnahmekriterien:

1. Ein regulär über Produkt-RPCs angelegtes und separat abonniertes Filmwerk gibt sein gespeichertes, valides Jahr im effektiven `kd_radar_websearch_context` aus.
2. Bei gleicher starker ID, Werkart und Jahr enthält der Request an einen Mock-Suchadapter `flixpatrolFakten`; der Test nutzt den effektiv aus SQL gelesenen Kontext statt eines handgebauten Jahresrequests.
3. Fehlendes, ungültiges oder widersprüchliches Jahr liefert weiterhin keinen Fakt, während die normale Suche benutzbar bleibt.
4. Es entstehen weder zusätzliche Provideranfragen noch Cache-Schreibungen; Berechtigungs-, Personen-, Titelgruppen- und Freitextverträge bleiben unverändert.
5. Nach dem separaten Serien-Mappingfix E05-F002 wird ein Serienfall an derselben SQL-Kontext/Reader-Grenze geprüft.

## Abhängigkeiten und offene Punkte

- Verwandter, nicht duplizierter Befund: E05-F002 (`serie`/`series` am Serien-RPC). Dieser Filmfall scheitert unabhängig davon am fehlenden Jahr.
- Die Master-Abnahme ist offen; dieses Ticket beansprucht keine Fix-, Test-, CI-, Deploy- oder physische Abnahme.
- Keine Aussage zu bereits ausgelieferten Migrationsständen oder tatsächlichen Cachefakten außerhalb der isolierten Validierung.

## Herkunft und Master-Abnahme

- Validatorergebnis: `/private/tmp/kd-vollreview-20260916/validations/E14-F001.json` (`confirmed`)
- Master-Proposal: `/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E14-F001.json`
- Autor: Terra/xhigh
- Zuständiger Master: Astra/high
- Master-Abnahme: offen — bis zum gesonderten Finding-zu-Ticket-Abgleich.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E14/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E14/KD-REV-E14-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
