# KD-REV-E06-003 · Progressiver Streamingpfad persistiert keine Neu-Fristanker und datiert verbrauchte Zugänge nach Diff-Pruning neu

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — der bestehende 14-Tage-Neu-Vertrag kann im regulären progressiven Watchmode-Pfad gebrochen werden: falsche Neu-Karten, Neu-Zähler und `neu_seit`-Labels, ohne belegten Datenverlust. Das Auftreten setzt den geprüften Diff-Pruning-Eingangszustand voraus; keine Live-Häufigkeit ist belegt.
- Finding: E06-F003
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E06

## Fehler und Auswirkung

Der erfolgreiche progressive Seitenpfad konsumiert bereits vorhandene Neu-Fristanker, erzeugt oder schreibt sie aber nicht. Wenn der Katalog später die älteren Watchmode-Diffs eines innerhalb desselben Fensters bereits verbrauchten Wiederzugangs nicht mehr enthält, rekonstruiert SQL aus dem Restdiff einen jüngeren Fensterbeginn. Dadurch erscheint der Titel erneut als neu, obwohl sein ursprüngliches 14-Tage-Fenster schon abgelaufen ist.

Bestätigt ist die Auswirkung für Streaming/Neu-Karten, Neu-Zähler und `neu_seit` eines reinen Watchmode-Titels bei einer bestimmten Account-/Dienstauswahl ohne fortgeschriebenes Fristenbuch. Alles-Inventar und tatsächliche Verfügbarkeit sind nicht Gegenstand dieses Befunds. MotN besitzt eigene serverseitige Zugangsbelege und wurde nicht pauschal einbezogen.

## Auslöser, Soll und Ist

1. Ein aktives angemeldetes Konto nutzt eine geladene Netflix-Auswahl und hat für den Titel weder Fristenbuch- noch v2-Übergangsanker.
2. Der Watchmode-Verlauf enthält Zugang an Tag 1, Abgang an Tag 2 und Wiederzugang an Tag 4. Der Nutzer sieht den Titel an Tag 4 allein über einen erfolgreichen progressiven Seiten-RPC — ohne globale Suche, manuelles Katalog-Refresh, Cage-Vollabruf oder Missing-RPC-Fallback.
3. Ein späterer gültiger Katalog an Tag 16 enthält nach Diff-Pruning nur den Zugang an Tag 4; der Nutzer kehrt zu Streaming zurück oder lädt die Seite erneut.

Soll: Der belegte Fensterbeginn Tag 1 und der darin verbrauchte Wiederzugang Tag 4 bleiben erhalten. Ab Tag 15 ist das Fenster abgelaufen; an Tag 16 enthält Streaming/Neu den Titel nicht und der Neu-Zähler zählt ihn nicht.

Ist: Die erfolgreiche Seite an Tag 4 belässt `newEntries` leer und schreibt kein Fristenbuch. Nach Pruning setzt SQL Tag 4 als Fensterbeginn ein. Der vollständige lokale Seiten-RPC liefert an Tag 16 `total=1` mit `neu_seit=Tag 4` statt `total=0`; rechnerisch bleibt dieses falsche Fenster bis Tag 18 exklusiv aktiv. Mit einem zuvor durch Vollkatalogübernahme erzeugten Anker liefert derselbe RPC `total=0`.

## Ursache und Fundstellen

`useStreamingNeuController` reicht nur vorhandene Fristenbucheinträge in die Seitenanfrage. Seine einzige Aktualisierung hängt an `aktiverBeleg`, der nur durch die Vollkatalogübernahme gesetzt wird. Der Seitencontroller verarbeitet dagegen Antworten einschließlich `nextExpiryAt` lediglich flüchtig und besitzt keinen Rückkanal in die Fristpersistenz. SQL verarbeitet vorhandene Start-/Verbrauchsanker korrekt, kann bei `newEntries=[]` und verlorenen älteren Diffs jedoch nur den Restzugang rekonstruieren. Beim Katalogwechsel ersetzt die Projektion ihre Basiszeilen und erhält historische Diffs nicht separat.

- Seitenanfrage erhält ausschließlich vorhandene Anker; Cachetreffer und Seitenwechsel erzeugen ausdrücklich keine Zeit: [eingefrorene Quelle: `src/controllers/useStreamingNeuController.js:53`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingNeuController.js:53), repository-relativ `src/controllers/useStreamingNeuController.js`, Zeilen 53–66 am Prüfcommit.
- Fristenbuchaktualisierung nur bei `aktiverBeleg`; persistiert wird nur ein dadurch geändertes Buch: [eingefrorene Quelle: `src/controllers/useStreamingNeuController.js:73`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingNeuController.js:73) und [`:102`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingNeuController.js:102), repository-relativ gleicher Pfad/Zeilen 73–109 am Prüfcommit.
- `aktiverBeleg` entsteht ausschließlich nach vollständigem, zusammenpassendem Katalog: [eingefrorene Quelle: `src/controllers/useStreamingNeuController.js:121`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingNeuController.js:121), repository-relativ gleicher Pfad/Zeilen 121–130 am Prüfcommit.
- App verdrahtet `streamingPagePersonal` einseitig in die Seitenanfrage: [eingefrorene Quelle: `src/App.jsx:313`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:313), [`:913`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:913) und [`:922`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:922), repository-relativ gleiche Pfade/Zeilen am Prüfcommit.
- Die Vollkatalogübernahme erfolgt nur bei `entdeckenUmfang === "voll"`; der gewöhnliche Boot ruft dagegen `ladeStreamingDateien()` ohne Vollflag auf: [eingefrorene Quelle: `src/App.jsx:1519`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1519), [`:1586`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1586) und [`:1663`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1663), repository-relativ gleiche Pfade/Zeilen am Prüfcommit. Vollpfade sind unter anderem globale Suche, Cage, manueller Refresh und der Missing-RPC-Fallback: [eingefrorene Quelle: `src/App.jsx:1362`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1362), [`:1608`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1608), [`:1745`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1745) und [`:1802`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1802), repository-relativ gleiche Pfade/Zeilen am Prüfcommit.
- Der Seitencontroller übernimmt Seiten- und Neu-Ablaufwerte nur in den flüchtigen Datensatz: [eingefrorene Quelle: `src/controllers/useStreamingPageController.js:168`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingPageController.js:168), repository-relativ gleicher Pfad/Zeilen 168–189 am Prüfcommit.
- Die SQL-Funktion übernimmt bereitgestellte Anker und verarbeitet die Zugänge korrekt, solange sie vorhanden sind: [eingefrorene Quelle: `supabase/migrations/20260914100000_streaming_pages_latency.sql:47`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260914100000_streaming_pages_latency.sql:47), repository-relativ gleicher Pfad/Zeilen 47–66 am Prüfcommit. Der Request übermittelt `fensterBeginn` und `verbrauchtBis` aus `newEntries`: [eingefrorene Quelle: `…streaming_pages_latency.sql:229`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260914100000_streaming_pages_latency.sql:229), repository-relativ gleicher Pfad/Zeilen 229–267 am Prüfcommit.
- Beim Katalogrefresh werden die bisherigen Basiszeilen gelöscht und neu aufgebaut: [eingefrorene Quelle: `supabase/migrations/20260913200000_streaming_pages_backend.sql:386`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260913200000_streaming_pages_backend.sql:386), repository-relativ gleicher Pfad/Zeilen 386–445 am Prüfcommit.

## Belege und Gegenproben

Ausgeführte lokale Reproduktion:

- `node --no-warnings --experimental-loader /private/tmp/kd-vollreview-20260916/tests/E06-F003/validator/loader.mjs /private/tmp/kd-vollreview-20260916/tests/E06-F003/validator/reproduce.mjs` führte den unveränderten Neu-React-Hook in JSDOM, den realen Seitencontroller sowie die unveränderte SQL-Funktion in einem isolierten PostgreSQL-17-Cluster aus. Ergebnis: Exit 0. Tag 4 lieferte den korrekten Beginn Tag 1, aber `newEntries=[]`, 0 Fristenbuch-Writes und 0 Legacyfallbacks. Nach Pruning an Tag 16 erhielt die Seite Beginn Tag 4 und `total=1`; der vollständige RPC lieferte mit ungekürztem Verlauf `total=0`, nach Katalogersatz aber `total=1`. `fetch` war im Harness gesperrt; es gab keine externen Requests.
- Positivkontrolle in `/private/tmp/kd-vollreview-20260916/tests/E06-F003/validator/result.json`: Der tatsächliche Neu-Hook übernahm den Vollkatalog an Tag 4, schrieb genau einen Anker mit `fensterBeginn=Tag 1` und `verbrauchtBis=Tag 4`, und übergab ihn nach Remount an den Tag-16-RPC. Ergebnis: `total=0`. Das belegt die vorhandene Ankerlogik und grenzt den Fehler auf ihre fehlende Erzeugung/Fortschreibung im progressiven Pfad ein.

Statische Vertrags- und Testgegenprobe:

- `streaming_pin_neu_test.mjs:251–296`, `tests/streaming-progressive-final/mobile-flow.spec.mjs:335–336` und `streaming_progressive_integration_test.mjs:96–103` wurden gelesen, aber in diesem Auftrag nicht ausgeführt. Sie beschreiben den Tag-1/Tag-4/Tag-16-Vertrag beziehungsweise den Seitenpfad ohne verpflichtenden Vollkatalogread, decken aber die leere progressive Fristenbuch-Lebensdauer nicht ab.

Gegenproben und Grenzen:

- Ein vorhandenes gültiges Fristenbuch schützt den Verlauf tatsächlich; das wurde in der lokalen Positivkontrolle bestätigt. Der Befund betrifft frische Browser/Auswahlen ohne einen solchen Anker.
- Ohne Verlust der alten Diffs rekonstruiert SQL auch ohne Anker Tag 1 korrekt; der volle RPC liefert dann an Tag 16 `total=0`. Diff-Pruning ist daher ausdrückliche Eingangsbedingung.
- Globale Suche, manuelles Katalog-Refresh, Cage oder Missing-RPC können rechtzeitig einen Vollkatalog übernehmen und das Risiko mindern. Erfolgreiche Seitenabfragen verlangen keinen dieser Wege; die Reproduktion hatte 0 Fallbacks.
- `nextExpiryAt` und Cachefrische laden nach Ablauf erneut. Das behebt nicht den Fehler, wenn die neue SQL-Antwort den auf Tag 4 verschobenen Beginn berechnet.
- MotN hat eigene `added_at`-/`motn_zugaenge`-Belege. Die Reproduktion nutzt nur einen Watchmode-Titel; der Befund gilt nicht pauschal für MotN.

## Korrekturziel und Abnahme

Im progressiven Pfad belegte Fenster- und Verbrauchsanker dauerhaft, owner- und auswahlgebunden erhalten beziehungsweise fortschreiben, ohne Abrufzeit als Fensterbeginn zu setzen und ohne den großen Entdecken-Vollread wieder obligatorisch zu machen. Der Vertrag muss sowohl `fensterBeginn` als auch `verbrauchtBis` ausreichend übermitteln oder erhalten; das ungeprüfte Speichern von `neu_seit` allein genügt nicht. Eine begrenzte Übernahme qualifizierter Seitenmetadaten oder gleichwertige dauerhafte serverseitige Provenienz ist möglich. Bestehende Auswahl-, Konto-, Versions- und MotN-Grenzen bleiben erhalten.

Abnahmekriterien:

- Frischer Cache, erfolgreicher Seiten-RPC und Tag-1/Tag-2/Tag-4-Verlauf erhalten im progressiven Pfad den Beginn Tag 1 und den verbrauchten Wiederzugang Tag 4 — ohne Vollkatalog-Fallback.
- Nach einem gültigen Katalogwechsel auf den bloßen Tag-4-Restdiff liefert Tag 16 weder Neu-Karte noch Neu-Zähler (`total/new count=0`); dies bleibt nach Reload/Remount mit Gerätecache erhalten.
- Ein tatsächlicher weiterer Zugang nach Ablauf des ursprünglichen Fensters kann ein neues 14-Tage-Fenster beginnen; wiederholte Seitenabrufe und Cachetreffer verlängern keine Frist.
- Regression deckt Account-/Dienstauswahlbindung und veraltete Seitenantworten ab; fremde oder veraltete Anker werden nicht übernommen.
- Bestehende gültige Anker und MotN-Zugangszeiten bleiben wirksam; ein normal erfolgreicher Seitenbetrieb benötigt weiterhin keinen `streaming_entdecken`-Vollabruf.

## Abhängigkeiten und offene Punkte

- Verwandte Komponenten: `useStreamingNeuController`, Seitenvertrag, Katalogprojektion und die bestehende Fristenbuchlogik. Das Ticket verlangt keinen Umbau der allgemeinen Streaming-Verfügbarkeit.
- Produktfehler: fehlender progressiver Erzeugungs-/Fortschreibungspfad für bereits belegte Neu-Fristanker unter der bestätigten Pruning-Bedingung.
- Testwerkzeug: Der erste Lauf scheiterte in der Sandbox wegen `initdb`/`shmget` mit „Operation not permitted“. Der anschließende genehmigte Lauf führte denselben ausschließlich lokalen Socket-Cluster vollständig aus und räumte ihn im `finally` auf; der erste Versuch ist kein Test-PASS und kein Produktfehler.
- Betriebsbeleglücken: Der externe Watchmode-Producer und seine reale Pruning-Kadenz sind nicht im Quellstand enthalten und wurden nicht remote geprüft. Keine globale Suite, kein vollständiger Browserlauf, kein Production-Readback und keine iPhone/PWA-Abnahme wurden ausgeführt.
- Keine Prüfung des gesamten Review-Registers auf weitere gleichartige Finding-IDs; dieses Ticket dokumentiert ausschließlich E06-F003.

## Herkunft und Master-Abnahme

Validatorergebnis: `/private/tmp/kd-vollreview-20260916/validations/E06-F003.json` (`confirmed`). Ursprüngliches eingefrorenes Proposal: `/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E06-F003.json`.

Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E06/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E06/KD-REV-E06-003.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
