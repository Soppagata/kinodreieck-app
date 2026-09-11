# FlixPatrol-Batch und optionaler Netflix-Tagesfeed

Stand: 11. September 2026. Diese Änderung bereitet die Aktivierung vor; sie aktiviert weder Providerrequests noch Scheduler oder einen neuen Feed. Ohne neue Konfiguration bleibt der bestehende Einzel-ID-Weg mit Format 8 und der öffentlichen Netflix-Wochenquelle aktiv.

## Harte Aktivierungsfolge

1. Den kompatiblen Function-/App-Code und beide additiven Migrationen `20260911120000_title_facts_lookup.sql` und `20260911123000_entdecken_flixpatrol_batch_format9.sql` mit allen drei neuen Flags ausgeschaltet ausliefern. Die Foundationmigration führt die zentralen Lookup-/Vocabulary-Verträge und gezählten Requestkinds ein. Zu diesem Stand müssen beide ausgelieferten Consumer Format 8 und 9 lesen können; der aktive Feed bleibt Format 8.
2. Erst aus dem ausgelieferten Diagnosecode den aktuellen gemeinsamen Monatszähler und einen frischen offiziellen Quota-Stand lesen. Alle FlixPatrol-Verbraucher zählen gegen 1000 Requests im UTC-Monat. Ein unbekannter, unvollständiger oder veralteter Reststand beendet die Aktivierung.
3. Bei ausreichendem belegtem Monatsbudget genau einmal die service-only Diagnose `manual-title-batch-contract-v1` ausführen. Sie lädt zwei feste bekannte Film-IDs über genau einen `titles?id[in]`-Request, verwirft die Inhalte und schreibt weder Cache noch Feed. Fehler, Teilmenge, Typkonflikt oder unklarer Verbrauch erlauben keinen Retry und keinen Batchmodus.
4. Erst nach positivem Titelbatchbeleg und nachgewiesen kompatiblen ausgelieferten Consumern die Flags bewusst setzen: `FLIXPATROL_TITLE_BATCH_MODE=verified-id-in-v1`, `ENTDECKEN_FEED_CONSUMERS=format-9-ready-v1` und `ENTDECKEN_FLIXPATROL_NETFLIX_MODE=daily-format-9-v1`. Teilweise oder anders gesetzte Werte schalten nicht still um.
5. Den ersten natürlichen Lauf beobachten. Format 9 umfasst sieben Tagescharts und höchstens vier Titelbatches; Genres und Keywords dürfen je Lauf jeweils höchstens einen zusätzlichen Request mit höchstens zehn IDs verursachen. Bei einem möglicherweise bezahlten Fehler gibt es keinen Einzel-ID-Fallback und keinen Fullloop-Retry.

Die feste Diagnose belegt nur den exakten Zwei-ID-Vertrag für `titles?id[in]`. Die analogen `genres?id[in]`- und `keywords?id[in]`-Antworten sind noch nicht praktisch belegt; die Titelprobe liefert dafür keinen Ersatzbeleg. Der erste jeweilige Request bleibt deshalb eine klar abgegrenzte, gezählte Außenannahme innerhalb des ausdrücklich aktivierten Batchmodus. Er schreibt einzelne Ergebnisse nur nach vollständig validierter Antwort und beendet den Lauf bei Fehler ohne Retry oder Feedwrite.

Format 9 heißt `public:daily-flixpatrol-market-mix-at-v1`. Es hält den 50er-Pool bei 15 ÖFI-, 10 Netflix-, 10 Prime-, 10 Disney+- und 5 Apple-TV-Titeln. `availability` trägt die Chart-Dienstzuordnung, jeder Format-9-Eintrag trägt aber `availabilityConfirmed: false`. Nur ein passender Watchmode-AT-Angebotsbeleg darf diese Aussage später bestätigen.

Positive Titelfakten bleiben 30 Tage, negative Einzel-ID-Ergebnisse einen Tag gültig. Der Batchvertrag erfindet keine titelbezogenen Negativtreffer aus einer fehlgeschlagenen Gesamtantwort. Bereits gespeicherte Einzelcheckpoints bleiben beim nächsten Lauf wiederverwendbar. Ein unvollständiger neuer Lauf ersetzt den letzten guten Feed nicht.
