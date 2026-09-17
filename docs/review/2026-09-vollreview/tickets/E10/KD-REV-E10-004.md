# KD-REV-E10-004 · Filmwissen verliert den TMDB-Medientyp und ordnet Filmbelege Serien zu

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – Bei kollidierender numerischer TMDB-ID kann regulär erreichbare, aber falsche Werkevidenz als Serien-Filmwissen und als dessen `WARUM` erscheinen. Keine kontenübergreifende Offenlegung ist nachgewiesen.
- Finding: E10-F004
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E10

## Fehler und Auswirkung

Filmwissen bildet eine TMDB-Kennung nur aus Namespace und Nummer. Eine Serie und ein Film mit derselben numerischen TMDB-ID erhalten damit dieselbe Cache-, In-flight- und Rechercheidentität. Ein vorhandener, freigegebener Filmbericht kann vom Client als `belegt` für die Serie gelesen werden; die Recherche beendet sich dann vor einem KI-Aufruf. Die Filmwissen-Oberfläche stellt diesen Zustand als belegtes `WARUM` dar.

Beim persönlichen Forecast wird der Cache-Werktyp vor der Formatprüfung nicht in den Kandidaten übernommen. Ein passender Filmcache kann daher für eine Serienanfrage Filmwissen-Provenienz erzeugen, wenn die übrigen Formatfelder gültig sind. Der Film-only-Quellenadapter löst die untypisierte Serien-TMDB-Kennung über P4947 auf einen Film auf und transportiert dessen Typ in einen neuen Syntheseauftrag.

## Auslöser, Soll und Ist

Ein aktives Konto liest oder recherchiert Filmwissen für einen regulären Serieneintrag mit TMDB-ID. Unter derselben Nummer besteht ein geprüfter, freigegebener Filmbericht; eine höher priorisierte Kennung fehlt oder liefert `cache_miss`. Für den Forecast ist eine Serie ohne vorrangige IMDb-Kennung erforderlich, weil der Forecast nur die erste Recherchekennung verwendet. Manipulierte oder beschädigte Seriendaten sind nicht nötig.

Soll: Film und Serie behalten bei TMDB getrennte Identitäten. Der Client, der Cache und der Forecast übernehmen keinen Filmbericht als belegtes Wissen für eine Serie. Ein ausschließlich filmorientierter Quellenadapter erhält keine Serien-TMDB-Kennung ohne Typvertrag.

Ist: `filmwissenKennungen` erzeugt für Film und Serie dasselbe Paar `tmdb:<nummer>`. `read()` dekodiert den Filmbericht und gibt ihn unabhängig von `film.typ`, Titel oder Jahr zurück; `recherchiere()` übernimmt ihn direkt. Der Quellenadapter löst die Kennung als Film auf. Im Forecast reicht `cache.status === "belegt"` mit formgültigen Teilfeldern für die Filmwissen-Herkunft.

## Ursache und Fundstellen

Der Identitätsvertrag beschränkt sich durchgängig auf `namespace` und `kennung`; `film.typ` wird im Helper verworfen. Der SQL-Primärschlüssel und die Read-RPC übertragen keinen angefragten Werktyp. Der Decoder prüft nur, ob die Antwort ein erlaubter Werktyp ist, nicht dessen Übereinstimmung mit dem Anfragewerk. Die Forecast-Übernahme entfernt `cache.werk`, bevor sie den Kandidaten validiert.

- Ungetypte Kennungserzeugung und Rechercheauswahl: [eingefrorene Quelle `src/lib/filmwissen.js:23-46`](/private/tmp/kd-vollreview-20260916/source/src/lib/filmwissen.js:23) – Repository: `src/lib/filmwissen.js`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- Der Decoder erlaubt Film, Filmreihe oder Serie, vergleicht sie aber nicht mit der Anfrage: [eingefrorene Quelle `src/lib/filmwissen.js:49-68`](/private/tmp/kd-vollreview-20260916/source/src/lib/filmwissen.js:49) – derselbe Repositorypfad und Commit.
- Ungesicherte Deduplizierung, Read-Rückgabe und Recherche-Kurzschluss: [eingefrorene Quelle `src/services/filmwissen.js:32-60`](/private/tmp/kd-vollreview-20260916/source/src/services/filmwissen.js:32) sowie [`src/services/filmwissen.js:62-89`](/private/tmp/kd-vollreview-20260916/source/src/services/filmwissen.js:62) – Repository: `src/services/filmwissen.js`, derselbe Commit.
- Cache-Identität und letzter Read-RPC-Endstand: [eingefrorene Quelle `20260729220000_etappe8_filmwissen_cache.sql:102-128`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260729220000_etappe8_filmwissen_cache.sql:102) sowie [`20260809121000_rollen_v1_access_enforcement.sql:275-321`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260809121000_rollen_v1_access_enforcement.sql:275) – Repository: `supabase/migrations/...`, derselbe Commit.
- Film-only-P4947-Suche, Filmtypprüfung und die spätere Übergabe des aufgelösten Filmtyps: [eingefrorene Quelle `quellen.ts:395-478`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/filmwissen-task/quellen.ts:395) und [`ai-task/index.ts:4772-4789`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:4772) – Repository: `supabase/functions/filmwissen-task/quellen.ts` beziehungsweise `supabase/functions/ai-task/index.ts`, derselbe Commit.
- Forecast übernimmt nur die untypisierte Kennung und bildet den Kandidaten ohne Cache-Werk: [eingefrorene Quelle `src/lib/prognoseAuftrag.js:100-115`](/private/tmp/kd-vollreview-20260916/source/src/lib/prognoseAuftrag.js:100) und [`ai-task/index.ts:4496-4564`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:4496) – Repository: `src/lib/prognoseAuftrag.js` beziehungsweise `supabase/functions/ai-task/index.ts`, derselbe Commit.

## Belege und Gegenproben

- Ausgeführt, lokal mit synthetischen Fixtures: `node /private/tmp/kd-vollreview-20260916/tests/E10-F004/validator/reproduce.mjs` importierte die unveränderten Produktmodule direkt aus der eingefrorenen Quelle. Auth, Transport, Quellenantworten und KI-Fassade waren lokale Doubles; es gab keine Netzwerkaufrufe. Der Lauf endete mit Exit 0 und reproduzierte sechs Fehl-/Erreichbarkeitspfade: gleiche Film-/Serienkennung, Serienread mit Filmbericht/`belegt`, IMDb-Miss mit TMDB-Fallback, Recherche-Kurzschluss ohne KI-Aufruf, Serienforecast mit mehrdeutiger Kennung sowie P4947-Auflösung zum Film. Ergebnis: [result.txt](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E10-F004/validator/result.txt).
- Statisch: Der sichtbare Controller reicht Serviceergebnisse ohne Werkvergleich weiter; die Komponente stellt `belegt` als `WARUM` dar: [eingefrorene Quelle `useIntelligenceController.js:309-361`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useIntelligenceController.js:309) und [`FilmwissenBereich.jsx:54-84`](/private/tmp/kd-vollreview-20260916/source/src/components/FilmwissenBereich.jsx:54). Der Validator hat außerdem den Migrationsendstand geprüft; kein SQL-Lauf wurde ausgeführt.
- Gegenprobe: Ein gültiger IMDb-Treffer liefert im ausgeführten Kontrollfall den Serienbericht und liest TMDB nicht. Das begrenzt den Trigger, widerlegt ihn aber nicht: Bei IMDb-`cache_miss` fällt `read()` auf TMDB zurück. Der Forecast hat keinen solchen Fallback; dort braucht der Trigger deshalb eine ausgewählte TMDB-Kennung.
- Weitere Begrenzungen: Accountstatus, Werk-/Kennungsstatus, Quellenfreigaben, LOC-Belege und Synthesegates können einzelne Aufrufe vorzeitig stoppen. Der bestätigte Cache-Read-Fehler benötigt jedoch keine neue Synthese. Wikidata prüft beim kollidierenden Ziel korrekt P4947 und Filmklasse – sie kennt den ursprünglichen Serientyp nur nicht.

Das erfolgreiche Ende der lokalen Reproduktion belegt den Fehler; es ist keine PASS-Aussage zur Produktabnahme.

## Korrekturziel und Abnahme

Den Filmwissen-Identitätsvertrag begrenzt über Helper, Service/Deduplizierung, Read-/Synthese-RPC, Quellenadapter und Forecast korrigieren. TMDB-Typ muss erhalten bleiben, oder nicht unterstützte Serien-TMDB-Anfragen müssen vor Filmcache und Filmadapter kontrolliert enden. Cache-Werktyp wird im Client und Forecast gegen das Anfragewerk verglichen. Bei getrennten Schlüsselidentitäten werden bestehende untypisierte Kennungen ausdrücklich migriert oder validiert, nicht stillschweigend Serien zugeordnet. Keine allgemeine Streaming-Architekturänderung.

- Film und Serie mit gleicher TMDB-Nummer teilen weder Filmwissen-Identität noch In-flight-Deduplizierung.
- Serien-Read und -Recherche akzeptieren keinen Filmbericht als belegt, auch nicht nach IMDb-`cache_miss`.
- Der Film-only-Adapter weist eine Serien-TMDB-Anfrage vor Quellenzugriff ab, oder ein expliziter Serienadapter verwendet einen korrekten typisierten Vertrag.
- Der Forecast prüft die Cache-Werkidentität; ein Filmbericht erzeugt für eine Serie keine Filmwissen-Provenienz.
- Gültige IMDb-Treffer und reguläre Film-TMDB-Treffer bleiben funktionsfähig.
- Migration und Read-RPC unterscheiden Film und Serie mit gleicher numerischer TMDB-ID sicher; Altkennungen sind eindeutig behandelt.

## Abhängigkeiten und offene Punkte

- Produktfehler: Die typverlustbehaftete Identität sowie Annahme eines Filmcaches für Serie sind im unveränderten Client/Adapter lokal reproduziert und im Cache-/Forecastpfad statisch belegt.
- Testwerkzeuggrenze: kein SQL-Server, Browser oder vollständiger Edge-Handler. Service, Payload-Builder, FlixPatrol-Guard und Quellenadapter wurden mit lokalen Doubles ausgeführt; UI-Weitergabe, SQL-Endzustand und serverseitige Forecast-Übernahme sind statische Beweise.
- Betriebsbeleglücke: keine Live-Datenbank, keine echte Providerquelle und keine reale kollidierende TMDB-Paarung abgefragt. Die Häufigkeit und konkrete betroffene Werke im Datenbestand sind unbekannt; die Fixtures sind ausdrücklich synthetisch.
- Kein globaler Duplicate-Abgleich außerhalb dieses Findings; im Validator liegt kein `duplicate_of` vor.

## Herkunft und Master-Abnahme

Validatorergebnis: [E10-F004.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E10-F004.json). Ursprungsproposal: [E10-F004.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E10-F004.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E10/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E10/KD-REV-E10-004.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
