# Etappe 5: Geschützter KI-Unterbau

**Stand: 26. Juli 2026 — umgesetzt und gegen die echte Umgebung belegt.**
Beide Migrationen sind in der Produktionsdatenbank gelaufen, die Function ist
ausgeliefert, die Testsuite ist grün (941 Checks, davon 91 neu) und die
Rauchprobe meldet **11 von 11** gegen die deployte Function — einschließlich
eines echten Modellaufrufs.

`npm run test:rls` gegen die echte Datenbank: **33/33**, davon neun neu für
`kd_ai_log` und `kd_ai_limits`. Das war zugleich der erste scharfe Lauf dieses
Tests überhaupt — er stand seit Etappe 3 aus, weil dafür zwei Testkonten nötig
sind. Damit ist auch die Kontotrennung der älteren Tabellen erstmals gegen die
Produktionsdatenbank belegt statt nur gegen einen Nachbau.

Gemessener Kettenbeweis (`echo-struct`, 26.07.): Modellalias `klein`,
247 Eingabe- und 18 Ausgabe-Tokens, **0,0337 US-Cent**, 2597 ms — korrekt
protokolliert und im Monatsverbrauch sichtbar. Die Größenordnung ist der
belastbarste Anhaltspunkt für die Budgetplanung: bei diesem Zuschnitt kostet
ein kleiner Auftrag rund ein Dreißigstel Cent.

Diese Etappe enthält **bewusst keine fachliche KI-Funktion**. Sie baut das
Fundament, auf dem die intelligente Suche (Etappe 6) und später Vorbewertung
und Geschmacksprofil stehen: einen Endpunkt, der eine Sitzung prüft, Grenzen
durchsetzt, Kosten protokolliert und ehrlich meldet, was schiefgeht.

## Was diese Etappe leistet

Die App kann jetzt einen KI-Auftrag stellen, ohne dass ein Anbieterschlüssel,
eine Kostenentscheidung oder eine Identitätsbehauptung im Browser liegt. Die
entscheidende Eigenschaft ist nicht, dass es funktioniert, sondern dass es
**nicht mehr unbemerkt teuer werden kann**: Jeder Vorgang hinterlässt eine
Zeile, bevor Geld fließt, und jede Grenze wird in der Datenbank durchgesetzt,
nicht im Anwendungscode.

```text
Browser                          Supabase                     Anthropic
  services/ai.js                   Edge Function `ai-task`
       │  Auftrag ohne Konto-ID         │
       └── lib/aiDriver.js ─────────────┤ 1. Token prüfen (getClaims)
              Bearer <Sitzung>          │    role == authenticated?
                                        │ 2. Größe prüfen
                                        │ 3. Konfiguration lesen ── kd_ai_limits
                                        │ 4. Not-Aus + Limits prüfen
                                        │    UND Zeile anlegen ──── kd_ai_log
                                        │    (atomar, mit Reservierung)
                                        │ 5. Modell rufen ───────────────► /v1/messages
                                        │ 6. Antwort strukturell prüfen
                                        │ 7. Zeile abschließen ──── kd_ai_log
```

## Entscheidungen

### Der Anbieter wird nie direkt aus dem Browser gerufen

Selbstverständlich, aber die Folge ist es nicht: Weil alles über einen eigenen
Endpunkt läuft, gibt es genau eine Stelle, an der Limits, Protokoll und
Not-Aus greifen können. Die App kennt nur einen internen Aufgabennamen — ein
Anbieterwechsel wäre eine Änderung an einer Datei, kein Umbau des Produkts.

### Die Account-ID geht nicht über die Leitung

Der Client kennt seine Konto-ID und übergibt sie dem Transport, **sendet sie
aber nicht**. Der Server leitet die Identität ausschließlich aus dem geprüften
Sitzungstoken ab. Was nicht gesendet wird, kann nicht gefälscht werden — das
Roadmap-Kriterium „ein Account kann sein Limit nicht durch frei gewählte IDs
umgehen" ist damit nicht durchgesetzt, sondern gegenstandslos.

### Die Plattformprüfung ist eine Vorhut, kein Beweis

Supabase prüft Sitzungstoken bereits vor der Function (`verify_jwt`). Die
Rauchprobe hat empirisch belegt, dass das **nicht genügt**: Der öffentliche
Projektschlüssel passiert diese Prüfung und erreicht den Function-Code.
Gestoppt wird er erst von der eigenen Prüfung, die `role === "authenticated"`
und eine echte Konto-UUID verlangt.

Das ist kein theoretischer Punkt. Der Publishable Key steht in jedem
ausgelieferten Browser-Bundle. Ohne die zweite Prüfung wäre der Endpunkt für
jeden offen gewesen, der die Seite besucht.

Nebenwirkung, ebenfalls belegt: PostgREST und die Plattform melden Fehler in
eigenen Formen (`{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`), nicht in unserer.
Der Client behandelt eine fremde Fehlerform deshalb nach Status, unsere nach
`code`.

### Grenzen werden in der Datenbank durchgesetzt, nicht im Code

`kd_ai_auftrag_starten()` prüft Not-Aus, Monatsbudget, Tageslimit und
Parallelität **und** legt die Protokollzeile an — in einer Transaktion, unter
einer Vorhängeschloss-Sperre. Im Anwendungscode wäre zwischen „zählen" und
„schreiben" ein Fenster, in dem zwei gleichzeitige Aufrufe beide „noch frei"
sehen. Zwölf echt parallele Aufrufe bei `parallel_max = 2` ließen im Test
genau zwei durch.

### Die Protokollzeile entsteht vor dem Geld, nicht danach

Sie wird beim Start angelegt (`status = 'laufend'`) und trägt sofort eine
**Kostenschätzung**. Zwei Gründe, beide aus dem Review:

Erstens prüfte das Budget vorher nur abgeschlossene Läufe. Alles gerade
Unterwegs war unsichtbar; zehn Konten mit je zwei parallelen Aufträgen
überschritten einen Deckel im Test um das Zwölffache. Die Reservierung macht
in-flight-Kosten sichtbar und wird beim Abschluss durch den Istwert ersetzt.

Zweitens: Stürzt der Lauf ab, bleibt die Reservierung gebucht. Ein Fehlschlag
kostet echtes Geld — eine Verweigerung des Modells kommt mit abgerechneten
Tokens, eine Zeitgrenze ebenfalls. Eine Zeile, die erst am Ende entsteht,
verschweigt genau die teuren Fälle.

### Ein unbekannter Modellpreis wird geschätzt, nicht auf null gesetzt

Der Anbieter antwortet mit der aufgelösten, datierten Modell-ID
(`claude-haiku-4-5-20251001`); konfiguriert war zunächst der Alias aus der
Doku (`claude-haiku-4-5`). Ein exakter Nachschlag ging deshalb ins Leere und
die erste Fassung buchte stillschweigend 0 — das Monatsbudget wäre **nie**
hochgezählt und der Deckel nie wirksam geworden; bemerkt hätte man es auf der
Anbieterrechnung.

Zwei Konsequenzen: Die Preissuche geht jetzt exakt, sonst über das Präfix,
sonst auf den teuersten bekannten Satz — plus ein Vermerk `kosten-geschaetzt`
in der Fehlerklasse. Lieber zu viel buchen als blind. Und die Konfiguration
führt seit Migration 2 die **am Anbieter belegten** IDs: `GET /v1/models`
listet `claude-sonnet-5` genau so, den Haiku aber nur datiert — der Alias
steht dort gar nicht. Vor jedem Modellwechsel gilt deshalb: erst
`task: "anbieter-modelle"` fragen, dann konfigurieren.

### Fehlende Konfiguration weist ab, statt durchzulassen

Ein `select … into` ohne Treffer liefert NULL, und ein NULL-Vergleich ist nie
wahr. Eine gelöschte oder umbenannte Konfigurationszeile hätte Budget,
Tageslimit und Parallelgrenze auf einen Schlag abgeschaltet — ohne Fehler,
ohne Meldung. Fehlt eine der drei Grenzen, wird jetzt abgewiesen.

### Ehrliche Zustände statt eines Sammelfehlers

Wie in Etappe 4 bekommt jeder unterscheidbare Zustand einen eigenen Code und
einen eigenen Satz. Besonders wichtig: **ein Engpass beim Anbieter ist nicht
das verbrauchte Kontingent des Nutzers.** Beides kommt als HTTP 429; würde man
es durchreichen, hielte der Nutzer sein Tageskontingent für aufgebraucht,
obwohl es unberührt ist.

| Lage | HTTP | `code` | Was der Nutzer liest |
|---|---|---|---|
| keine/abgelaufene Sitzung | 401 | `unauthenticated` | „Für diese Funktion ist eine Anmeldung nötig." |
| Sitzung ohne KI-Berechtigung | 403 | `forbidden` | „Für diese Funktion fehlt die Berechtigung." |
| eigenes Tages-/Monats-/Parallellimit | 429 | `limit` | „Das Nutzungslimit ist erreicht." |
| Anbieter überlastet (429/529) | 503 | `server` | „Der Server ist vorübergehend nicht verfügbar." |
| Not-Aus gesetzt | 503 | `ai-disabled` | „Die KI-Funktionen sind vorübergehend abgeschaltet." |
| Modell hat abgelehnt | 422 | `ai-refused` | „Die KI hat die Bearbeitung dieser Anfrage abgelehnt." |
| Antwort verletzt das Schema | 502 | `invalid-response` | „Der Server hat eine ungültige Antwort geliefert." |
| Aufgabe noch nicht gebaut | 501 | `not-implemented` | „Diese Funktion ist noch nicht verfügbar." |
| Vorgang läuft bereits | 409 | `ai-duplicate` | „Dieser Vorgang läuft bereits." |

### Berechtigung und Betriebszustand sind zwei verschiedene Dinge

`capabilities.personalAi` ist die **statische Berechtigung** eines Kontos und
seit dieser Etappe für jedes angemeldete Konto wahr. Der **Not-Aus** ist ein
Betriebszustand und lebt serverseitig in `kd_ai_limits`. Die Alternative — die
Berechtigung aus der Datenbank speisen — hätte zwei Wahrheiten über denselben
Zustand erzeugt; genau der Fehler „zwei Definitionen von Betriebsart" aus
Etappe 4.

## Auftragsformat

```jsonc
// Anfrage
{
  "task": "health" | "anbieter-modelle" | "echo-struct"
        | "intelligent-search" | "masterlist-enrichment",
  "schemaVersion": 2,
  "promptVersion": "v1",
  "profilVersion": null,     // trägt später das Geschmacksprofil
  "vorgangId": "<uuid>",     // Korrelation Protokoll <-> Aufruf
  "payload": { }             // Whitelist je Aufgabe
}

// Erfolg
{ "ok": true, "task", "vorgangId", "modellAlias", "data": { },
  "verbrauch": { "inputTokens", "outputTokens", "kostenUsdCent", "dauerMs", "stopReason" } }

// Fehler
{ "ok": false, "code": "limit", "grund": "tageslimit-erreicht", "vorgangId" }
```

Kosten werden ausdrücklich als **US-Cent** geführt. Der Anbieter rechnet in
USD, das Guthaben ist in Euro geladen — ein namenloses „cent" wäre eine stille
Fehlerquelle.

## Aufgaben in diesem Stand

| Aufgabe | Ruft ein Modell? | Zweck |
|---|---|---|
| `health` | nein | Diagnose: Sitzung, Schlüsselherkunft, Betriebswerte, eigener Verbrauch. Legt keine Protokollzeile an und zählt auf kein Limit |
| `anbieter-modelle` | nein (nur Modellliste) | Belegt die gültigen Modell-IDs am echten Anbieter, statt sie der Doku zu glauben. Unterliegt dem Not-Aus |
| `echo-struct` | ja, minimal | Kettenbeweis: ein Wort hin, striktes JSON zurück. Der einzige zahlende Pfad dieser Etappe |
| `intelligent-search` | — | registriert, meldet `not-implemented` (Etappe 6) |
| `masterlist-enrichment` | — | registriert, meldet `not-implemented` |

## Runbooks

Alle Betriebsgriffe sind SQL — **kein Deploy nötig**, wie beim Quellenwiderruf
in Etappe 4.

### Not-Aus (KI sofort abschalten)

```sql
update public.kd_ai_limits set wert = 'false'::jsonb, geaendert_at = now()
 where schluessel = 'ai_aktiv';
```

Wirkt beim nächsten Aufruf. Die App meldet „KI-Funktionen sind vorübergehend
abgeschaltet" und funktioniert im Übrigen unverändert weiter. Zurück mit
`'true'::jsonb`.

### Limits ändern

```sql
update public.kd_ai_limits set wert = '2000'::jsonb, geaendert_at = now()
 where schluessel = 'monatsbudget_usd_cent';     -- 20 USD
update public.kd_ai_limits set wert = '50'::jsonb, geaendert_at = now()
 where schluessel = 'tageslimit_auftraege';
```

Schlüssel: `ai_aktiv` · `monatsbudget_usd_cent` · `tageslimit_auftraege` ·
`parallel_max` · `timeout_ms` · `request_max_bytes` · `antwort_max_bytes` ·
`modell_alias` · `task_modell` · `task_max_tokens` ·
`preise_usd_cent_pro_mtok`.

**Eine Zeile zu löschen ist kein Weg, eine Grenze abzuschalten** — fehlt eine
der drei Grenzen, weist der Endpunkt ab.

### Modell wechseln

```sql
update public.kd_ai_limits
   set wert = '{"klein": "claude-haiku-4-5", "gross": "claude-sonnet-5"}'::jsonb
 where schluessel = 'modell_alias';
```

**Immer zusammen mit dem Preis prüfen.** Ein Modell ohne Preiseintrag wird zum
teuersten bekannten Satz geschätzt und die Zeile mit `kosten-geschaetzt:<id>`
markiert — nicht falsch, aber ungenau. Vor jedem Wechsel die gültigen IDs
belegen: `task: "anbieter-modelle"` über die Rauchprobe.

### ⚠️ Preisänderung Sonnet zum 31.08.2026

Sonnet 5 läuft bis dahin zum Einführungspreis (200/1000 US-Cent je MTok),
danach gelten **300/1500**. Wird die Preiszeile nicht angepasst, rechnet der
Budgetzähler ab dem 1. September um ein Drittel zu niedrig:

```sql
update public.kd_ai_limits
   set wert = '{"claude-haiku-4-5": {"in": 100, "out": 500},
                "claude-sonnet-5": {"in": 300, "out": 1500}}'::jsonb,
       geaendert_at = now()
 where schluessel = 'preise_usd_cent_pro_mtok';
```

### Verbrauch ansehen

```sql
select task, status, modell, input_tokens, output_tokens,
       kosten_usd_cent, dauer_ms, fehlerklasse, gestartet_at
  from public.kd_ai_log order by gestartet_at desc limit 50;

select round(sum(kosten_usd_cent)::numeric, 2) as us_cent_diesen_monat
  from public.kd_ai_log
 where gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                       at time zone 'Europe/Vienna';
```

### Hängende Vorgänge schließen

Ein Prozessabbruch nach dem Anbieteraufruf lässt eine Zeile auf `laufend`
stehen. Die reservierten Kosten bleiben gebucht (richtig so), der Zustand wäre
aber gelogen:

```sql
select public.kd_ai_verwaiste_schliessen();   -- gibt die Zahl zurück
```

Betrifft nur Zeilen, die älter als die doppelte Zeitgrenze sind.

### Protokoll aufräumen (90 Tage)

```sql
select public.kd_ai_log_abraeumen();      -- Standard 90 Tage, gibt die Zahl zurück
select public.kd_ai_log_abraeumen(30);    -- kürzer
```

Bewusst kein Cron — dieselbe Begründung wie beim Katalog-Abräumen in Etappe 4:
automatisches Löschen auf Verdacht ist in einem System ohne Backup-Automatik
die falsche Wahl.

### Anbieterschlüssel wechseln

```bash
cd ~/Documents/GitHub/kinodreieck-app
read -rs "?Anthropic-Key: " K
if ! ./node_modules/.bin/supabase secrets set ANTHROPIC_API_KEY="$K" --project-ref bscjgwcntapobyxsiyce; then
  unset K
  echo "STOP: provider-key write failed."
  exit 75
fi
unset K
```

Bewusst über eine Eingabeaufforderung: So landet der Schlüssel weder in der
Shell-Historie noch in einer Datei noch in einem Chat. Danach in der
Anthropic-Console den alten Schlüssel löschen.

### Function neu ausliefern

```bash
cd ~/Documents/GitHub/kinodreieck-app
if ! npm run check:function-release; then
  echo "STOP: function-release contract check failed before deploy."
  exit 75
fi
KD_FUNCTION_COMMIT="$(git rev-parse HEAD)"
if ! echo "$KD_FUNCTION_COMMIT" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "STOP: invalid KD_FUNCTION_COMMIT; function release blocked."
  exit 75
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "STOP: working tree dirty; function release blocked."
  exit 75
fi
if ! ./node_modules/.bin/supabase functions deploy ai-task --project-ref bscjgwcntapobyxsiyce; then
  echo "STOP: functions deploy failed; build marker unchanged."
  exit 75
fi
if ! ./node_modules/.bin/supabase secrets set KD_FUNCTION_BUILD_VERSION="$KD_FUNCTION_COMMIT" --project-ref bscjgwcntapobyxsiyce; then
  echo "STOP: marker write failed; function is new, build marker unchanged."
  exit 75
fi
if ! npm run check:function-release; then
  echo "STOP: function-release check failed after deploy and marker."
  exit 75
fi
unset KD_FUNCTION_COMMIT
```

Die Reihenfolge ist strikt fail-closed: Commit/Release-Preflight zuerst, dann Deploy mit
project-ref, dann Marker-Write. Jeder Fehler auf der Marker-Write-Stufe ist STOP; der
Function-Stand bleibt neu, Marker bleibt auf dem vorherigen Wert.
Ein Fehler des abschliessenden Vertragschecks ist ebenfalls `STOP` und wird
nicht durch das nachfolgende `unset` als Erfolg verdeckt. Fuer E17B ist dieses
historische Shellbeispiel kein Executor; dort fuehrt ausschliesslich
`tools/e17b-remote-window.mjs` den gebundenen `function-release`-Modus aus.

Die Function bleibt **ein einziger Endpunkt** (`ai-task`). Der Einstieg
`index.ts` importiert pure Request- und Filmwissen-Verträge; die Supabase-CLI
bündelt diese Nachbarmodule mit. `check:function-release` verweigert einen
nicht committierten Function-Stand und meldet Git-Commit sowie gemeinsamen
Quellhash. `health.buildVersion` macht nach dem Deploy denselben Commit
sichtbar. Die Warnung „Docker is not running" ist beim Function-Deploy
folgenlos — ohne Docker nimmt die CLI den API-Weg.

**Niemals `supabase config push` oder `supabase db push`.** Die `config.toml`
ist absichtlich unvollständig; beides würde Live-Settings oder die
Migrationshistorie überschreiben.

### Nach Deploy: Smoke-Belege (separat, owner-gated)

```bash
cd ~/Documents/GitHub/kinodreieck-app && \
KD_SB_URL=https://bscjgwcntapobyxsiyce.supabase.co \
KD_SB_ANON=<publishable-key> \
KD_TESTA_PASS=<testkonto> \
npm run test:ai:live -- --owner-approved-server-budget
```

Proben gegen die echte Function. P9, P12 und P14 kosten echtes Geld. Der
Budgetwächter liest davor und danach den serverseitig gebuchten Istverbrauch
des Testkontos. `AUTONOMIE_STOPP` beziehungsweise Exit-Code 75 verbietet
weitere autonome Live-Tests, bis Max sie ausdrücklich wieder freigibt.
Exit-Code ungleich 0 bei jeder Abweichung.

## Anbieterbedingungen (Kurzfassung)

Aus den Anthropic Commercial Terms, Stand 26.07.2026 — kurz gehalten, weil das
Original lang ist und die vier Fragen zählen, die dieses Projekt betreffen:

- **Eingaben und Ausgaben gehören dem Kunden.** „Customer (a) retains all
  rights to its Inputs" und „Customer … owns its Outputs" (Abschnitt B).
- **Kein Training auf Kundendaten.** „Anthropic may not train models on
  Customer Content from Services" (Abschnitt B). Das ist der Standard der
  kommerziellen API, keine Einstellung, die man treffen müsste.
- **Vertraulichkeit.** „Customer Content is Customer's Confidential
  Information" (Abschnitt E.1); Weitergabe nur an zur Geheimhaltung
  verpflichtete Vertreter.
- **Aufbewahrungsdauer beim Anbieter:** in den Commercial Terms **nicht
  geregelt**; das Dokument verweist dafür auf die Data Processing Addendum.
  Vor **Etappe 10** (Datenschutzerklärung) nachzuziehen — die Formalien sind
  beim Roadmap-Umbau vom 26.07.2026 ans Ende gewandert; Etappe 7 ist seither
  das Geschmacksprofil.

Für die Datenschutzerklärung relevant: Es geht ein Aufgabentext an einen
US-Anbieter. In diesem Stand enthält er keine persönlichen Daten — `health`
und `anbieter-modelle` senden gar nichts, `echo-struct` ein frei gewähltes
Wort. Sobald Etappe 6 echte Suchanfragen überträgt, ändert sich das und gehört
in die Erklärung.

## Abnahmekriterien der Roadmap

Alle sechs sind gegen die echte Umgebung belegt, nicht gegen einen Nachbau.

| Kriterium | Stand |
|---|---|
| Anonyme Aufrufe werden abgewiesen | erfüllt und **gegen die echte Function belegt** (Rauchprobe P2–P4), inklusive des öffentlichen Projektschlüssels, der die Plattformprüfung passiert |
| Der Claude-Key ist weder im Repository noch im Browser-Bundle | erfüllt — nur als Supabase-Secret; `pages_test.mjs` scannt das ausgelieferte Bundle auf `sk-ant-…` |
| Ein Account kann sein Limit nicht durch frei gewählte IDs umgehen | erfüllt — die Konto-ID wird nicht gesendet; Grenzen atomar in der Datenbank, unter Sperre geprüft |
| Ungültige Modellantworten erreichen keine persönliche Datenbank | erfüllt — strukturelle und fachliche Prüfung vor jeder Rückgabe; `echo-struct` schreibt ohnehin in keine persönliche Tabelle |
| Kosten und Fehler sind pro Funktion nachvollziehbar | erfüllt — eine Zeile je Vorgang, auch für Fehlschläge; Kosten nie still 0. Gemessen: 0,0337 US-Cent für den Kettenbeweis, im Monatsverbrauch sichtbar. Dass ein Konto seinen Verbrauch nicht umschreiben kann, belegt `test:rls` T13a–T13i gegen die echte Datenbank |
| Bei KI-Ausfall bleiben deterministische App-Funktionen nutzbar | erfüllt — der KI-Pfad ist ein eigener Block im Konto-Bereich; kein anderer Teil der App importiert ihn |

## Bewusste Grenzen

- **Keine fachliche KI-Funktion.** Das ist der Zweck dieser Etappe, kein
  Mangel. Etappe 6 baut die intelligente Suche auf genau diesem Unterbau.
- **`echo-struct` hat kein Betreiber-Gate.** Jedes angemeldete Konto kann bis
  zum Tageslimit echte Aufrufe auslösen. Bei zehn handverlesenen Konten und 25
  Aufrufen am Tag sind das Cent-Beträge; **vor einer Selbstregistrierung
  braucht es dort eine Beschränkung.**
- **Der Doppelklick-Schutz schützt nicht vor Doppelklicks.** Der eindeutige
  Index greift auf `(account_id, vorgang_id)`, und die App erzeugt je Aufruf
  eine frische Vorgangs-ID. Er verhindert die wortgleiche Wiederholung
  desselben Auftrags (Retry-Sturm), nicht zwei schnelle Klicks. Wer einen
  Wiederholen-Knopf baut, muss die Vorgangs-ID wiederverwenden.
- **Eine Drosselung durch die Supabase-Plattform** (HTTP 429 ohne unsere
  Antworthülle) erscheint als „Nutzungslimit erreicht". Inhaltlich vertretbar —
  es *ist* ein Ratenlimit —, aber nicht unser Kontingent.
- **Das Monatsbudget kann um eine Reservierung überschritten werden.** Die
  Schätzung beim Start rechnet mit `max_tokens`; der letzte durchgelassene
  Auftrag darf den Deckel um bis zu diesen Betrag reißen. Bewusst so: die
  Alternative wäre, den letzten Auftrag zu früh abzulehnen.
- **Kein Passwort-Reset ohne Max**, unverändert aus Etappe 3.
- **Staging und Produktion teilen sich denselben KI-Endpunkt.** Beide
  Umgebungen zeigen auf dasselbe Supabase-Projekt; eine eigene Staging-Function
  gibt es nicht. Ein Test auf `staging.kinodreieck.at` verbraucht deshalb
  dasselbe Budget und schreibt in dasselbe Protokoll wie die Produktion. Für
  die geschlossene Beta bewusst akzeptiert — vor einer öffentlichen Öffnung neu
  zu bewerten.

## Geänderte und neue Dateien

**Neu:** `supabase/functions/ai-task/index.ts` · `supabase/config.toml` ·
`supabase/migrations/20260726160000_etappe5_ki_unterbau.sql` ·
`supabase/migrations/20260726180000_etappe5_ki_unterbau_haertung.sql` ·
`src/lib/aiDriver.js` · `tools/ai_smoke.mjs` · `ai_test.mjs` · dieses Dokument

**Geändert:** `src/services/ai.js` (Transport, Fehlerübersetzung, Vorgangs-ID) ·
`src/services/errors.js` (vier neue Codes) · `src/services/auth.js` und
`src/lib/authDriver.js` (`personalAi`) · `src/components/KontoBereich.jsx`
(Verbindungstest) · `architekturgrenzen_test.mjs` (`aiDriver` in der
UI-Verbotsliste) · `authservice_test.mjs` · `package.json` ·
`.gitignore` (`supabase/.temp/`)

**Bewusst nicht angefasst:** `kd_store`, `kd_personal`, `kd_catalog` und deren
Policies · `src/lib/supabaseDriver.js`, `gitDriver.js`, `src/legacy/` ·
`src/lib/supabasePublic.js` · die Katalog-Naht aus Etappe 4 · die Mac-Pipeline.
