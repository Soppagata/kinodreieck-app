# Filmwissen: echter Livebeleg ohne Cache-Fallback

## Belegter Ausgangsbefund

Der wiederholt unbelegte P18-Fall war ein Harnessproblem, kein Nachweis eines
defekten Anbieters: Im Owner-Lauf war kein `KD_FILMWISSEN_TARGET_ID` gesetzt.
Damit verwendete `ai_smoke.mjs` seinen festen historischen Fallback. P18 hatte
exakt null gemessene Kosten und keinen korrelierbaren `providerReceipt`; der
Harness klassifizierte den Pfad deshalb korrekt als
`provider-receipt-absent-zero-cost`.

Der damalige Fachstatus wurde nicht erhalten. Deshalb ist nicht nachträglich
belegbar, ob der normale `ai-task` vor dem Anbieter wegen `cache_hit`, fehlender
institutioneller Evidence oder einer anderen providerfreien Wache endete. Der
Code belegt aber die gemeinsame Ursache: Alle diese legitimen Antworten liegen
vor der Anbieterreservierung und enthalten folgerichtig kein Provider-Receipt.
Ein fester, möglicherweise bereits publizierter Fallback kann daher keinen
neuen Livebeleg garantieren.

## Nachhaltiger Harnesshook

Der freigegebene Einstieg bleibt unverändert:

```text
npm run test:ai:live -- --owner-approved-server-budget
  -> keychain_runner.mjs
  -> ai_budget_guard.mjs
  -> filmwissen_live_target.mjs
  -> ai_smoke.mjs
```

Nur die Owner-Acht-Pfade-Variante führt den neuen Filmwissen-Preflight aus.
Normale TestA-Smokes und die anderen Live-Sonderwege bleiben unverändert.

Vor dem ersten potenziell zahlenden Pfad macht der Hook ausschließlich:

1. Anmeldung mit der bereits vom Keychain-Runner isolierten Owner-Sitzung.
2. Je Kandidat genau einen seriellen Read auf
   `kd_filmwissen_aktuell_lesen` mit 20-Sekunden-Grenze.
3. Prüfung durch den Produktionsparser `dekodiereFilmwissen`.
4. Auswahl des ersten `cache_miss` in der expliziten Reihenfolge.
5. Übergabe genau dieser starken Kennung an den unveränderten P18-Aufruf.

Er ruft weder `ai-task` noch einen Anbieter auf, schreibt keine Daten und
wiederholt keinen Request. Fehler, gesperrte oder formfremde Antworten sowie
eine vollständig gecachte Liste stoppen den gesamten Smoke vor P8/P12.
Ausgaben enthalten nur die Zahl gelesener Kandidaten, nie Kennungen, Titel,
Accountdaten, Token oder RPC-Antworten.

## Öffentliche lokale Zielkonfiguration

Für einen Owner-Acht-Pfade-Lauf ist jetzt genau eine der beiden Varianten in
der git-ignorierten `.env.live.local` Pflicht:

```dotenv
KD_FILMWISSEN_TARGET_ID=<starke-reale-kennung>
```

oder, für eine deterministische Fallbackliste mit höchstens acht Einträgen:

```dotenv
KD_FILMWISSEN_TARGET_IDS=<kennung-1>,<kennung-2>,<kennung-3>
```

Beide gleichzeitig, doppelte Einträge, synthetische Namespaces und schwache
Kennungen werden vor dem Kindprozess abgewiesen. Erlaubt sind nur kanonische
IMDb-, TMDB- oder Wikidata-Kennungen.

Die Liste darf ausschließlich Werke enthalten, deren Aufnahme in die aktuell
freigegebene institutionelle LOC-Quelle bereits unabhängig geprüft wurde.
Der lokale RPC-Preflight beweist bewusst nur den fehlenden aktuellen Cache.
Identität, aktuelle Quellenrechte, Wikidata-Zuordnung und LOC-Treffer prüft
anschließend weiterhin der normale serverseitige Produktpfad. Fehlt einer
dieser Belege, bleibt `nicht_belegt` legitim und wird niemals als Livebeleg
hochgestuft.

## Isolierter Testdatensatz, falls kein Kandidat sicher verfügbar ist

Ohne einen aktuell verifizierten, ungecacheten Katalogkandidaten darf kein
Ziel geraten und kein bestehender Bericht forciert regeneriert werden. Für
einen später ausdrücklich autorisierten Setup-Lauf gilt deshalb dieser
Entwurf; diese Änderung führt selbst keine Datenbankaktion aus:

- Ein neues privates Owner-Katalogelement wird über den normalen
  authentifizierten Produktpfad angelegt. Sein lokaler Datensatz erhält einen
  zufälligen Marker `kd-filmwissen-live-<uuid>` und genau eine starke externe
  Kennung eines zuvor gegen die freigegebene LOC-Liste geprüften Werks.
- Vor dem Schreiben wird über die enge Filmwissen-RPC `cache_miss` verlangt.
  Ein vorhandener persönlicher Marker, ein Cache-Hit oder eine kollidierende
  externe Kennung beendet das Setup ohne Änderung.
- Der Live-Harness erhält nur diese starke Kennung. `ai-task`, Adapter,
  Anbieter, Produktionsparser, atomare Publikation und RPC-Readback bleiben
  vollständig normal; es gibt keinen Force-/Overwrite-Parameter.
- Cleanup sucht ausschließlich im privaten Owner-Katalog nach dem exakten
  Marker und entfernt höchstens diese eine Testzeile. Fehlt sie bereits, ist
  Cleanup erfolgreich. Die normal publizierte gemeinsame Filmwissen-Version
  bleibt als legitimer, unveränderlicher Cache bestehen und wird nicht
  gelöscht.

Der Setup- und Cleanup-Schritt braucht eine eigene ausdrückliche DB-/Daten-
Freigabe. Er ist nicht Bestandteil eines Anbieter-Laufs und darf niemals
implizit aus dem Smoke heraus erfolgen.

## Nächster echter P18-Pfad

Nach lokaler Kandidatenprüfung und Integration des Commits in den autorisierten
Checkout genau den npm-Befehl einmal starten. Für diesen reinen Harnessfix ist
kein Function-, Datenbank- oder Frontend-Deploy nötig. Der Hook muss vor P12 einen
sanitisierten Cache-Miss melden. P18 sendet danach genau einen normalen
`filmwissen-synthese`-Request an `ai-task`. Erfolg ist nur belegt, wenn:

- der korrelierte Receipt genau einen Providerrequest und positive bekannte
  Kosten bindet,
- P18 `belegt` mit einer Version liefert,
- P20 dieselbe Version über `kd_filmwissen_aktuell_lesen` zurückliest und
- `pruefeAiUserTaskReadback` die normale Antwort und den RPC-Readback durch den
  Produktionsparser akzeptiert.

`cache_hit`, `nicht_belegt`, degraded Text oder ein Receipt ohne Korrelation
bleiben `FAIL/UNPROVEN`; es gibt keinen Retry.
