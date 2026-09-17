# KD-REV-E06-001 · Progressive Streaming-Seiten verlieren die Quellkatalog-Ablauffrist bei Revalidierung

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — bei unterstützten endlichen Quellfristen kann eine bereits abgelaufene Verfügbarkeit im aktiven progressiven Streaming weiter als aktuell erscheinen. Kein belegter Datenverlust, Rechtefehler oder Anbieteraufruf.
- Finding: E06-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E06

## Fehler und Auswirkung

Die progressive Streaming-Ansicht verliert den im Quellkatalog gespeicherten Ablaufzeitpunkt `meta.gueltig_bis`. Nach einer erfolgreichen Seitenantwort kann sie daher dieselbe, zwischenzeitlich abgelaufene Projektion erneut als `ready` veröffentlichen. Die vorhandene sichtbare Ablaufwarnung ist nicht an die Seitenantwort gebunden, sondern an den separat geladenen Known-Katalog. In einer bestehenden Sitzung wird dieser nach einem früher erfolgreichen Laden nicht erneut geladen.

Bestätigt ist der Fall für eine `all`-Seite eines aktiven Kontos; Controller und fehlender Quellablauf-Guard werden von den progressiven Ansichten gemeinsam benutzt. Nicht behauptet wird, dass ein aktueller produktiver Katalog tatsächlich eine endliche Frist besitzt, dass jeder Start betroffen ist oder dass sich ein Titel beim Anbieter bereits geändert hat.

## Auslöser, Soll und Ist

1. Ein aktives Konto hat eine progressive Seite aus einer Projektion mit endlichem `meta.gueltig_bis` erfolgreich geladen; Known wurde in derselben Sitzung ebenfalls erfolgreich geladen.
2. Die Quellfrist läuft ab, ohne dass ein neuer Quellstand veröffentlicht wird.
3. Die App wird nach mindestens der Sitzungsfrist wieder sichtbar und revalidiert die Seite, während `streamingGeladen` und `roh.bekannt` weiter gesetzt sind.

Soll: Nach Ablauf der ausdrücklich als Anzeige-/Cachefrist dokumentierten Quelle ist die Verfügbarkeit als veraltet erkennbar oder die Seite klar als nicht verfügbar zu behandeln. Eine erfolgreiche Wiederholung derselben abgelaufenen Projektion darf ihre Quellfrische nicht erneuern. Das Signal darf nicht von einem separaten Known-Neuladen abhängen.

Ist: `kd_streaming_page` antwortet nach Ablauf mit derselben Version und `status: ready`; `nextExpiryAt` bleibt im reproduzierten Fall `null`, weil es allein aus Neu-Fristen gebildet wird. Der Controller verwirft die transportierten Metadaten, setzt bei der erneuten Antwort `lastValidatedAt` auf die aktuelle Zeit und veröffentlicht `ready`. Der Cache wertet ebenfalls nur seine Maximaldauer und `nextExpiryAt` aus. Die Tabwarnung bleibt aus, weil `katalogInfo.abgelaufen` nach dem früheren Known-Laden unverändert ist.

## Ursache und Fundstellen

Die Serverfunktion lädt die Projektionsmetadaten, prüft jedoch nur eine positive `source_revision`; `gueltig_bis` wird nicht als Read-Guard ausgewertet. Die Rückgabe enthält `meta`, aber `nextExpiryAt` entsteht ausschließlich aus `new_since`.

- Server-Guard und Meta-Lesen: [eingefrorene Quelle: `supabase/migrations/20260914100000_streaming_pages_latency.sql:150`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260914100000_streaming_pages_latency.sql:150), repository-relativ `supabase/migrations/20260914100000_streaming_pages_latency.sql:150` am Prüfcommit.
- Neu-Frist und Seitenrückgabe mit lediglich weitergereichtem `meta`: [eingefrorene Quelle: `…streaming_pages_latency.sql:336`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260914100000_streaming_pages_latency.sql:336) und [`:344`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260914100000_streaming_pages_latency.sql:344), repository-relativ gleiche Pfade/Zeilen am Prüfcommit.
- Der Normalisierer bewahrt `meta`, aber die öffentliche Controller-Ansicht enthält nur `nextExpiryAt`: [eingefrorene Quelle: `src/lib/streamingPage.js:210`](/private/tmp/kd-vollreview-20260916/source/src/lib/streamingPage.js:210) und [`src/controllers/useStreamingPageController.js:105`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingPageController.js:105), repository-relativ gleiche Pfade/Zeilen am Prüfcommit.
- `applyPage` übernimmt nur die Neu-Frist und setzt nach jedem nicht gecachten Erfolg `lastValidatedAt`: [eingefrorene Quelle: `src/controllers/useStreamingPageController.js:168`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingPageController.js:168) und [`:183`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingPageController.js:183). Die Cachefrist verwendet ebenfalls nur `nextExpiryAt`: [eingefrorene Quelle: `src/lib/streamingPage.js:214`](/private/tmp/kd-vollreview-20260916/source/src/lib/streamingPage.js:214), repository-relativ gleiche Pfade/Zeilen am Prüfcommit.
- Die App lädt Known nur bei noch nicht gesetztem Ladeflag beziehungsweise fehlendem `roh.bekannt`; `StreamingTab` erhält dessen Info separat und warnt nur bei `katalogInfo.abgelaufen`: [eingefrorene Quelle: `src/App.jsx:1495`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1495), [`:2058`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:2058) und [eingefrorene Quelle: `src/tabs/StreamingTab.jsx:697`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StreamingTab.jsx:697), repository-relativ gleiche Pfade/Zeilen am Prüfcommit.

Die Quelle selbst beschreibt `gueltig_bis` als Ende der Anzeige-/Cachefrist: [eingefrorene Quelle: `supabase/migrations/20260725220000_etappe4_quellenregister_zugriff.sql:194`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260725220000_etappe4_quellenregister_zugriff.sql:194), repository-relativ gleicher Pfad/Zeile am Prüfcommit. Als fachliche Gegenreferenz wertet das separate Must-Watch-RPC denselben Metawert bereits explizit gegen die aktuelle Zeit aus: [eingefrorene Quelle: `supabase/migrations/20260914120000_mustwatch_streaming_candidates.sql:98`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260914120000_mustwatch_streaming_candidates.sql:98), repository-relativ gleicher Pfad/Zeilen 98–101 am Prüfcommit.

## Belege und Gegenproben

Ausgeführte lokale Reproduktionen:

- `node /private/tmp/kd-vollreview-20260916/tests/E06-F001/validator/reproduce.mjs` führte einen isolierten PostgreSQL-17-Cluster mit den unveränderten relevanten Migrationen und synthetischen Daten aus. Ergebnis: Exit 0; vor und nach realem Fristablauf `ready`, gleiche Version `sp1-1-estable`, ein Titel und `nextExpiryAt: null`; das separate Must-Watch-RPC lieferte für denselben Stand `unavailable`. Rohantworten: `/private/tmp/kd-vollreview-20260916/tests/E06-F001/validator/rpc-results.json`.
- Der ausgeführte Controller-/Cache-Fall unter Verwendung des eingefrorenen Normalisierers und Controller-Funktionskörpers ist in `/private/tmp/kd-vollreview-20260916/tests/E06-F001/validator/controller-results.json` festgehalten: zwei `loadPage`-Aufrufe vor/nach Ablauf, danach weiterhin `ready`, keine `meta` im Snapshot, kein Ablauf-Timer; eine Revalidierung nach der Sitzungsfrist hält den Cache für frisch.

Statischer Datenflussbeleg:

- Controller-Aktivierung und verzögertes Known-Laden: [eingefrorene Quelle: `src/App.jsx:920`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:920), [`:937`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:937) und [`:1663`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1663), repository-relativ gleiche Pfade/Zeilen am Prüfcommit.

Gegenproben und Grenzen:

- Ein vollständiger Streamingstart mit bereits abgelaufenem Known-Katalog kann nach erfolgreichem Known-Laden warnen. Das widerlegt den Trigger nach bereits erfolgreichem Known-Laden nicht; es begrenzt ihn auf die laufende Sitzung sowie Fälle, in denen Known noch nicht abgeschlossen ist oder scheitert.
- `meta` wird vom Service nicht verborgen, und Controller/Cache besitzen Ablaufmechanismen. Sie beziehen sich jedoch ausschließlich auf Neu-Fristen (`nextExpiryAt`), nicht auf `meta.gueltig_bis`.
- `gueltig_bis: null` ist ein zulässiger, nicht abgelaufener Zustand. Es gab keine Remote-Lektüre des Watchmode-Publishers und keine Aussage über die aktuelle Produktion.
- Die Datenbank-Reproduktion nutzt einen isolierten Minimalunterbau; vollständige Migrationskette, produktive Auth/RLS, gerenderte App und physische iPhone/PWA-Abnahme wurden nicht ausgeführt. Das ist eine Betriebsbeleglücke, kein Gegenbeleg zum lokal nachgewiesenen Vertrag.

## Korrekturziel und Abnahme

Quellfrische aus dem bestehenden Seitenvertrag bis in Controller, Cache und sichtbaren Zustand erhalten und dort gegen die Zeit auswerten; alternativ einen klaren Serverzustand `stale`/`unavailable` einführen und clientseitig behandeln. Neu-Fristen und Quellablauf bleiben getrennte Konzepte. Eine unveränderte abgelaufene Projektion darf ihre eigene Frist nicht durch erfolgreichen Transport verlängern. Keine Änderung an Quellenwahl, Scheduler, Providerzugriffen oder persönlicher Neu-Historie ist Teil dieses Tickets.

Abnahmekriterien:

- Eine vor Ablauf geladene progressive Seite wird bei Ablauf oder Wiederaufnahme als veraltet/nicht verfügbar behandelt, auch wenn Known zuvor geladen wurde und nicht neu lädt.
- Eine erneute Antwort derselben bereits abgelaufenen Projektion entfernt den Hinweis nicht und verlängert ihre Quellfrist nicht.
- Cachewiederverwendung berücksichtigt eine endliche Quellfrist; `null` erzeugt keine erfundene Ablaufzeit.
- Ein beim Start bereits abgelaufener Quellstand ist unabhängig von Verzögerung oder Fehlschlag des Known-Ladens als nicht frisch erkennbar.
- Ein tatsächlich neuer gültiger Quellstand hebt den Hinweis auf; Neu-Fristen bleiben funktionsgleich und es entsteht keine Refresh-Schleife.
- Ein fokussierter lokaler RPC-, Controller-/Cache- und UI-Test deckt offenen Tab und Wiederaufnahme ab. Dazu sind keine Live-Anbieteranfragen erforderlich.

## Abhängigkeiten und offene Punkte

- Verwandte Systeme: progressiver Seitenvertrag und das getrennte Must-Watch-RPC; kein Duplikatbefund in diesem Ticket behauptet.
- Produktfehler: bestätigter Verlust des Ablaufsignals bei unterstützter endlicher Quelle.
- Testwerkzeug: Die PostgreSQL-Sandbox scheiterte zunächst an `initdb`/`shmget`; der anschließend genehmigte, weiterhin isolierte Lauf wurde vollständig ausgeführt. Das ist kein Produktfehler.
- Betriebsbeleglücken: keine aktuelle Remote-Katalogzeile, kein Produktionsreadback und keine physische iPhone/PWA-Abnahme geprüft.

## Herkunft und Master-Abnahme

Validatorergebnis: `/private/tmp/kd-vollreview-20260916/validations/E06-F001.json` (`confirmed`). Ursprüngliches eingefrorenes Proposal: `/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E06-F001.json`.

Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E06/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E06/KD-REV-E06-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
