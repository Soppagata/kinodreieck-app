# Budgetwächter für echte KI-Tests

Stand: 08.08.2026

## Zweck

Normale Projekt-, Client- und Function-Tests verwenden ausschließlich Mocks
und lösen keinen Anbieteraufruf aus. Nur die ausdrücklich als live
gekennzeichneten Rauchproben und Evals können Geld kosten.

Autonome Agenten dürfen solche Läufe nur noch über den Budgetwächter starten:

```bash
npm run test:ai:live
npm run test:ai:eval
```

Vor und nach jedem vollständigen Live-Test liest der Wächter über die
kostenfreie `health`-Aufgabe den serverseitig gebuchten Monatsverbrauch des
Testkontos. Er zeigt sowohl den Gesamtstand als auch die Differenz des Laufs.

## Grenze und Genauigkeit

Die Kinodreieck-Datenbank und die Anthropic-Preistabelle rechnen in US-Cent.
Die autonome Standardgrenze liegt deshalb bei **500 US-Cent**. Sie ist eine
bewusst konservative technische Ersatzgrenze für Max' gewünschtes
5-Euro-Limit, aber keine Wechselkurs- oder Rechnungsgarantie.

Für den finalen Audit hat Max am 08.08.2026 ausdrücklich freigegeben, diese
lokale Ersatzgrenze zu ignorieren und reale Kosten zur späteren Wahl der
Standard-Tokenbudgets zu messen. Der eng begrenzte Schalter dafür lautet:

```bash
npm run test:ai:live -- --owner-approved-server-budget
npm run test:ai:eval -- --owner-approved-server-budget
```

Er entfernt weder die Messung noch den serverseitigen Monatsdeckel. Der Loader
setzt ausschließlich für diesen Kindprozess die Anweisung, den aus `health`
gelesenen Serverdeckel als wirksames Limit zu verwenden. Ambient-Werte und
`.env.live.local` können diese Freigabe weiterhin nicht einschleusen.

Die Freigabe hebt außerdem ausdrücklich **nicht** die beiden neuen
Sicherheitszäune auf:

- Jeder einzelne zahlende Providerrequest wird vor dem Netzwerkaufruf aus dem
  exakten Anbieterrequest konservativ reserviert und darf höchstens **500
  US-Cent** kosten. Der Betriebswert darf enger, aber nie höher sein.
- Ein kompletter `test:ai:live`- oder `test:ai:eval`-Lauf darf höchstens **1500
  serverseitig gemessene US-Cent** verbrauchen. Das ist die technische
  Näherung für Max' 15-Euro-Laufgrenze, keine Wechselkurszusage.

Vor jedem zahlenden Request liest der Runner erneut den serverseitigen Stand.
Sobald mehr als 1000 US-Cent des Laufs verbraucht sind, beginnt er keinen
weiteren Request: Die verbleibenden 500 US-Cent sind der Vorabpuffer für den
unverrückbaren Einzelrequest-Deckel. Nach jedem Request wird erneut gemessen.
Damit ist die Laufgrenze nicht bloß eine nachträgliche Warnung.

Für Text wird dabei nicht mehr mit dem Durchschnitt `UTF-8-Bytes / 3`
gerechnet: Jedes UTF-8-Byte zählt konservativ als mögliches Token, dazu kommen
4096 Tokens interne Anbieterreserve und das vollständige Ausgabebudget. Für
höchstens drei Bilder wird je Bild der volle offizielle Provider-Resize-Deckel
der bekannten Modellfamilie reserviert: 1568 Tokens bei Haiku 4.5, 4784 bei
Sonnet 5. Unbekannte Modelle, ungültiges Base64, mehr als drei Bilder oder
insgesamt mehr als 900.000 Base64-Zeichen stoppen vor dem Provider.

Auch die Datenbank-Preistabelle ist keine Vertrauensgrenze mehr: Haiku und
Sonnet besitzen im Function-Code einen nicht absenkbaren Owner-Preisboden.
Höhere DB-Preise bleiben möglich und werden verwendet; kleinere positive
Werte sowie unbekannte Modellfamilien fallen vor der Anbieter-RPC geschlossen
aus. Für Sonnet 5 gilt bereits ab diesem Release konservativ 300/1500 US-Cent
je Million Tokens, also der angekündigte Regelpreis ab 01.09.2026 statt des
bis 31.08.2026 befristeten Einführungspreises 200/1000. Die Release-Migration
hebt den DB-Eintrag auf mindestens denselben Wert an und bewahrt höhere Werte.
Der bisherige 5-US-Cent-Filmwissen-Cap würde dadurch selbst den realen
synthetischen Referenzauftrag blockieren. Die gleiche Migration hebt ihn daher
minimal auf 6 US-Cent an und bewahrt höhere Werte. Der Referenzauftrag passt
einschließlich 2048 Ausgabetokens unter diesen Deckel; größere Eingaben werden
weiter konservativ vor dem Provider abgewiesen.

Der Stand ist genauer als eine Schätzung „Anzahl der Anfragen × Sollkosten“:
Abgeschlossene Aufträge tragen die aus den tatsächlichen Provider-Tokens
berechneten Kosten. Laufende oder ohne Abschluss abgebrochene Aufträge zählen
vorsichtshalber mit ihrer reservierten Höchstschätzung. Maßgeblich ist der
höhere Wert aus serverseitiger Preistabelle und unterschreitungsfestem
Owner-Preisboden; Rabatte, Steuern, Wechselkurs und die spätere
Anbieterrechnung sind nicht darin enthalten.

Zusätzlich existiert weiterhin der atomare globale Monatsdeckel des Servers.
Er liegt im Ausgangsstand bei 1000 US-Cent und zählt Produktion und Staging
gemeinsam. Der lokale Wächter ersetzt dieses harte Datenbanktor nicht.

## Stoppsignale

- `AUTONOMIE_STOPP`, Exit-Code 75: Die 500-US-Cent-Grenze oder der globale
  Serverdeckel, die Einzelrequest-Grenze, die Laufgrenze oder die feste
  Requestanzahl ist erreicht.
- `BUDGET_UNBEKANNT`, Exit-Code 74: Anmeldung, Function oder Kostenstand sind
  nicht verlässlich erreichbar oder ein Request/Prozess läuft in ein Timeout.

In beiden Fällen gilt fail-closed:

1. keine weiteren echten KI-Tests,
2. Max im Chat den letzten bekannten Stand nennen,
3. auf ausdrückliche Freigabe warten,
4. Grenze niemals autonom erhöhen oder umgehen.

Ein reiner Kontrollaufruf kostet nichts. Auf dem lokalen Mac lädt er das
Passwort gezielt aus dem Login-Schlüsselbund:

```bash
npm run check:ai-budget
```

Die Etappe-7-Remoteprobe ist ebenfalls kostenfrei: Sie schickt absichtlich
keine Genre-Werteliste, sodass `profile-extract` vor Reservierung und Anbieter
mit `wertelisten-fehlen` abbrechen muss. Der Budgetwächter misst trotzdem
davor und danach:

```bash
npm run test:ai:contract
```

Ob beide begrenzten Testkonten im Schlüsselbund vorhanden sind, prüft ohne
Anmeldung und ohne Netzaufruf:

```bash
npm run check:keychain
```

## Benötigte Werte

| Name | Geheim? | Zweck |
| --- | --- | --- |
| `KD_SB_URL` | nein | öffentliche Supabase-Projekt-URL |
| `KD_SB_ANON` | nein | öffentlicher Publishable-/Anon-Key |
| `KD_TESTA_USER` | nein | begrenztes Testkonto, Standard `testa` |
| `KD_TESTA_PASS` | **ja** | Passwort des Testkontos |
| `KD_OWNER_USER` | nein | Ownerkonto nur für Entdecken-once und Radar+Entdecken-once |
| `KD_OWNER_PASS` | **ja** | Passwort des Ownerkontos im Schlüsselbund |
| `KD_MAIL_DOMAIN` | nein | Standard `login.kinodreieck.at` |
| `KD_AI_FUNKTION` | nein | Standard `ai-task` |
| `KD_ORIGIN` | nein | erlaubte App-Origin |
| `KD_AI_AUTONOM_LIMIT_USD_CENT` | nein | Standard 500; nur nach ausdrücklicher Freigabe ändern |

Der Anthropic-Key, ein Anthropic-Admin-Key und der Supabase-Service-Role-Key
werden nicht benötigt. Sie gehören weder in den Chat noch in lokale
Projektdateien. Zugangsdaten werden nur über die Prozessumgebung oder einen
lokalen Secret-Speicher bereitgestellt.

### Lokaler macOS-Schlüsselbund

Der feste Service heißt:

`at.kinodreieck.codex.live-tests.shared`

Darunter liegen die Accounts `KD_TESTA_PASS`, `KD_TESTB_PASS` und
`KD_OWNER_PASS`. Der
Loader `tools/keychain_runner.mjs` liest diese Werte über `/usr/bin/security`,
gibt sie nie aus und übergibt sie nur an fest verdrahtete Testprogramme. Freie
Befehle oder zusätzliche Argumente sind nicht möglich. Zufällig gesetzte
Anthropic-, Service-Role-, Datenbank- oder Cloudflare-Schlüssel werden nicht
an die Kindprozesse vererbt.

Der normale AI-Live-Lauf und Radar-only bleiben auf TestA. Nur die bereits
ownerpflichtigen Wege Entdecken-once und Radar+Entdecken-once lesen
`KD_OWNER_USER`/`KD_OWNER_PASS` und reichen sie im Kindprozess über die
bestehende Schnittstelle `KD_TESTA_USER`/`KD_TESTA_PASS` weiter. Fehlt einer
der beiden Ownerwerte, stoppt der Runner vor dem Teststart.

Die nicht geheime Zielkonfiguration liegt lokal in `.env.live.local`, das von
Git ignoriert wird. Erlaubt sind ausschließlich:

```dotenv
KD_SB_URL=https://projekt-ref.supabase.co
KD_SB_ANON=sb_publishable_...
KD_TESTA_USER=testa
KD_TESTB_USER=testb
KD_OWNER_USER=owner
KD_MAIL_DOMAIN=login.kinodreieck.at
KD_AI_FUNKTION=ai-task
KD_ORIGIN=https://staging.kinodreieck.at
KD_FILMWISSEN_TARGET_ID=<starke-reale-kennung>
# alternativ, nie gleichzeitig: bis zu acht institutionell vorgepruefte Ziele
KD_FILMWISSEN_TARGET_IDS=<kennung-1>,<kennung-2>,<kennung-3>
```

Passwörter einschließlich `KD_OWNER_PASS`, `KD_AI_AUTONOM_LIMIT_USD_CENT`,
`KD_AI_OWNER_APPROVED_SERVER_BUDGET` und `KD_EVAL_JA` werden in dieser Datei
ausdrücklich abgelehnt. Owner- und Eval-Freigabe entstehen ausschließlich für
den einen ausdrücklich gestarteten, budgetüberwachten Lauf.

Der Owner-Acht-Pfade-Smoke verlangt ein explizites Filmwissen-Ziel oder eine
begrenzte Zielliste. Vor dem Smoke wählt ein providerfreier, schreibfreier
Readback-Preflight den ersten `cache_miss`; IDs und Titel werden nicht geloggt.
Details und die Grenze zwischen Cache-Miss und tatsächlicher Evidence stehen
in `docs/FILMWISSEN_LIVE_PROOF.md`.

Für `npm run test:rls` kommt ein zweites begrenztes Testkonto mit
`KD_TESTB_USER` und dem geheimen `KD_TESTB_PASS` hinzu. Dieser Test macht
keinen Anbieteraufruf und kostet kein KI-Budget.

## Endlosschleifen- und Timeout-Schutz

Die beiden erlaubten Läufe sind vollständig endlich:

| Grenze | Rauchprobe | Eval |
| --- | ---: | ---: |
| maximale zahlende/potenziell zahlende Requests | 9 | 20 |
| Ausführung | strikt seriell | strikt seriell |
| Request-Zeitgrenze | 135 Sekunden | 135 Sekunden |
| Prozess-Zeitgrenze | 15 Minuten | 15 Minuten |
| automatische Retries | keine | keine |

Die Rauchprobe besitzt zusätzlich genau **einen tokenfreien Providerkontakt**
P8 (`GET /v1/models`). Er zählt nicht zu den neun zahlenden/potenziell
zahlenden Requests, läuft aber im selben Exklusiv-Lock, mit Request-Timeout und
durch das serverseitige Not-Aus-/Tages-/Parallelitätstor. Insgesamt sind damit
höchstens zehn Providerkontakte möglich. P22 prüft `profile-extract`
synthetisch einschließlich WIE/WAS/WARUM; P23 prüft den text-only
`media-batch-extract`-Pfad. Beide gehören zu den neun bewachten Requests.

Ein Timeout, ein nicht lesbarer Kostenstand oder HTTP 429 stoppt sofort. Der
Filmwissen-Cachecheck ist ein bewusst einmaliger Vertragstest, keine
Fehlerwiederholung. Der äußere Wächter liest auch nach einem abgebrochenen
Kindprozess noch genau einmal den Stand; er startet dabei keinen Providercall.
Ein atomarer Lock im lokalen Temp-Verzeichnis verhindert außerdem, dass
`test:ai:live` und `test:ai:eval` aus zwei Prozessen desselben Macs parallel
laufen. Ein vorhandener Lock wird **nie autonom als stale gelöscht**: Auch bei
mutmaßlich toter PID stoppt der Start fail-closed. Erst nach manueller Prüfung,
dass wirklich kein Live-/Eval-Prozess mehr läuft, darf die Lockdatei entfernt
werden. So kann kein zweiter Starter bei einer Stale-Bereinigung den gerade
neu erworbenen Lock eines anderen Laufs löschen.

Die 15 Minuten begrenzen den bezahlten Kindprozess. Anmeldung sowie Vor- und
Nachmessung besitzen jeweils eine eigene feste 20-Sekunden-Grenze; damit gibt
es auch außerhalb des Kindprozesses keinen unbeschränkten Wartepfad. Nach
SIGTERM folgt nach höchstens zwei Sekunden SIGKILL und danach ein garantierter
lokaler Abschluss, selbst wenn ein fehlerhaftes Kind kein `exit`-Event liefert.

## Release-Reihenfolge des Einzelrequest-Zauns

Der universelle Datenbankzaun liegt in
`20260808120000_ai_anbieter_request_kostenzaun.sql`. Die sichere Reihenfolge
ist absichtlich **Function zuerst, Migration danach**:

1. neue `ai-task`-Function deployen und noch keinen bezahlten Test starten;
2. die neue Function verweigert ohne den DB-Wert jeden zahlenden Request
   fail-closed (`anbieter-request-kostenzaun-ungueltig`);
3. alle ausstehenden Migrationen kontrolliert in Reihenfolge anwenden: zuerst
   `20260801194500_stapelimport_medien.sql`, danach
   `20260808120000_ai_anbieter_request_kostenzaun.sql`; die erste stellt den
   Modell-/Token-/Task-Cap-Vertrag für P23 her, die zweite den Kostenzaun;
4. `health` muss effektiven und Owner-Deckel 500 sowie die Timeout-Deckel
   melden; erst danach Budgetcheck und Smoke starten.

Nur die Kostenzaun-Migration zu spielen genügt für P23 ausdrücklich nicht, weil
die Stapelimport-Migration auf Staging noch unbelegt ist. Migration-first wäre
unsicherer, weil die alte Function noch mit ihrer weniger
konservativen Reservierung gegen den neuen SQL-Deckel laufen könnte. Der
datenfreie `current_schema.sql`-Snapshot wird erst nach dem tatsächlichen
Staging-Lauf neu erzeugt, nicht vorab erfunden.
