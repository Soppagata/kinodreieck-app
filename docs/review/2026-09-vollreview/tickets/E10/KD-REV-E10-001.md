# KD-REV-E10-001 · JSON-null verwirft den AI-Handler statt einer kontrollierten Fehlerantwort

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – Ein fehlerhafter Direktaufruf verliert den serverseitigen Fehlervertrag. Kein belegter Auth-Bypass, Kosten-/Datenverlust, UI-Regression oder Dienstabsturz.
- Finding: E10-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E10

## Fehler und Auswirkung

Die Function `ai-task` kann bei einer syntaktisch gültigen JSON-Wurzel `null` ihr Handler-Promise mit einem `TypeError` verwerfen. Der anwendungsseitige Vertrag einer kontrollierten JSON-Fehlerantwort geht für diesen einzelnen Eingabefall verloren. Betroffen sind nur Requests, die die Plattform-JWT-Vorprüfung erreichen und `null` als gesamte JSON-Wurzel senden; der aktuelle Frontendtransport erzeugt dagegen ein Objekt.

Die lokale Reproduktion belegt weder die HTTP-Fehlerhülle des Hosting-Runtimes noch einen Prozess-/Dienstabsturz. Eine mögliche externe Hülle würde aber nicht den hier erwarteten Anwendungsfehlervertrag herstellen.

## Auslöser, Soll und Ist

1. Einen `POST /functions/v1/ai-task` mit `Content-Type: application/json` und Body `null` (auch mit umgebendem Whitespace) senden. Für einen realen Request muss die Plattform-JWT-Prüfung passiert sein.
2. Der Fehler tritt unabhängig davon ein, ob `KD_AI_TASK_ENABLED` ein- oder ausgeschaltet ist.

Soll: Nicht objektförmige JSON-Wurzeln werden vor Propertyzugriff, Authentifizierung, Datenbank und Anbieter als bestehendes Fehlerformat mit `ok:false`, `code: invalid-response` und HTTP 400 abgewiesen.

Ist: `JSON.parse` akzeptiert `null`; der erste Zugriff auf `koerper.task` wirft `TypeError: Cannot read properties of null (reading 'task')`. Das Handler-Promise liefert keine anwendungsseitige Response.

## Ursache und Fundstellen

Der TypeScript-Cast `Record<string, unknown>` validiert die Laufzeitform des Parse-Ergebnisses nicht. Der Parse-Catch deckt nur syntaktisch ungültiges JSON ab. Der erste Propertyzugriff liegt danach, aber vor Aktivierungsschalter und allen weiteren Gates; `Deno.serve` registriert den Handler direkt ohne zusätzliche anwendungsseitige Fehlerhülle.

- Eingabeübernahme ohne Wurzelformprüfung: [eingefrorene Quelle `index.ts:4030-4038`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:4030) – Repository: `supabase/functions/ai-task/index.ts`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- Auslösender Zugriff vor dem Aktivierungsgate: [eingefrorene Quelle `index.ts:4041-4047`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:4041) – derselbe Repositorypfad und Commit.
- Direkter Servereinstieg: [eingefrorene Quelle `index.ts:5661-5663`](/private/tmp/kd-vollreview-20260916/source/supabase/functions/ai-task/index.ts:5661) – derselbe Repositorypfad und Commit.

## Belege und Gegenproben

- Statisch: Der Validator hat die unveränderte Handlerquelle mit SHA-256 `f100e7d5d4ab856ee71a93fa71719440e6852e8c7f5a7770b9953eeec08aec23` geprüft; siehe [Validatorergebnis](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E10-F001.json) und die Fundstellen oben.
- Ausgeführt, lokal und isoliert: `DENO_DIR=/private/tmp/kd-vollreview-20260916/tests/E10-F001/validator/deno-cache /Users/max/Documents/GitHub/kinodreieck-app/node_modules/.bin/deno run --no-config --no-lock --no-check --cached-only --allow-env=KD_KEIN_SERVER,KD_AI_TASK_ENABLED --import-map=/private/tmp/kd-vollreview-20260916/tests/E10-F001/validator/import-map.json /private/tmp/kd-vollreview-20260916/tests/E10-F001/validator/repro.ts`. Der unveränderte Handler lief mit fail-fast `createClient`-Stub und ohne Netzwerkberechtigung. Vier Null-Wurzel-Fälle in beiden Schalterstellungen reproduzierten den TypeError; 20 Kontrollfälle verhielten sich wie erwartet, `fetchCalls=0`. Die vollständigen Beobachtungen stehen in [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E10-F001/validator/result.json).
- Gegenproben: syntaktisch ungültiges JSON wird bereits als 400/`invalid-response`/`kein-json` abgefangen; `OPTIONS` ergab 204, `GET` 405. Bei normalen POST-Kontrollen greift bei aktivem Schalter ohne Token 401, bei deaktiviertem 503. `verify_jwt=true` begrenzt den Zugang, prüft aber nicht die JSON-Wurzelform. Der aktuelle Client baut immer ein Objekt; sein Pfad ist deshalb kein Nachweis gegen den serverseitig erreichbaren Direktaufruf.

Das erfolgreiche Ende der Reproduktion belegt den Fehler, nicht eine bestandene Produktabnahme.

## Korrekturziel und Abnahme

Unmittelbar nach `JSON.parse` eine schmale Laufzeitprüfung auf eine zulässige Objektwurzel einfügen und nicht objektförmige Wurzeln über `fehlerAntwort` mit Status 400 ablehnen. Vorhandene Auth-, Aktivierungs-, Budget- und Providerpfade bleiben unverändert; keine allgemeine Handler- oder Datenbankreorganisation.

- `null` und Whitespace-`null` liefern mit aktivem wie deaktiviertem KI-Schalter kontrolliert 400/`invalid-response`; das Promise wird nicht verworfen.
- Die Ablehnung geschieht vor `createClient`, Auth, DB und Provider und benötigt keinen Netzwerkaufruf.
- Malformed JSON, `OPTIONS`, Nicht-POST und normale Objektrequests behalten ihr bisheriges Verhalten.
- Arrays und primitive JSON-Wurzeln werden bewusst in den Formvertrag aufgenommen und getestet; zulässige `null`-Felder innerhalb eines gültigen Requestobjekts werden nicht pauschal abgelehnt.

## Abhängigkeiten und offene Punkte

- Produktfehler: die fehlende Laufzeit-Wurzelformprüfung und die daraus folgende Promise-Rejection sind lokal reproduziert.
- Testwerkzeuggrenze: Deno importierte den vollständigen Handler, ersetzte nur das Supabase-SDK durch einen fail-fast Stub. Es war kein echter HTTP-Serverlauf.
- Betriebsbeleglücke: keine Live-Anfrage, kein deployter Stand, keine echte Plattform-JWT-Prüfung und kein HTTP-Fehlerbody/Logging des Hosting-Runtimes wurden gemessen. Aussage zur Häufigkeit besteht nicht.
- Kein globaler Duplikatabgleich und keine vollständige Master-Leseabdeckung werden mit diesem Ticket beansprucht.

## Herkunft und Master-Abnahme

Validatorergebnis: [E10-F001.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E10-F001.json). Ursprungsproposal: [E10-F001.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E10-F001.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E10/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E10/KD-REV-E10-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
