# Handover an Sol Ultra: KI-Eval abschließen

Status 09.08.2026: **abgeschlossen** auf `staging` (`289abff`), einschließlich
Remote-Tageslimit 30, seriellem Eval 20/20 ohne Retry und grüner
Offline-Auswertung. Dieses Dokument bleibt als idempotente historische
Übergabe erhalten und ist kein Auftrag, die bezahlten Läufe zu wiederholen.

Die folgenden Angaben sind ein Referenzstand zum Übergabezeitpunkt. Ein späterer
Task muss Vorwärtsfortschritt erkennen: bereits sauber erledigte Schritte
verifizieren und überspringen, nicht als Abweichung stoppen oder wiederholen.

## Ziel

Das allgemeine KI-Tageslimit dauerhaft von 10 auf 30 setzen, die vorbereitete
Migration sicher ausrollen und danach das budgetgeschützte Eval abschließen.
Anschließend die Nachweise aktualisieren, die komplette kostenfreie Suite
ausführen und den Stand auf `staging` committen/pushen. `main` bleibt unberührt.

Max hat alle dafür nötigen Freigaben vorab erteilt. Ein neues
`AUTONOMIE_STOPP`, `BUDGET_UNBEKANNT`, unbekannter Kostenstand oder Timeout ist
trotzdem ein zwingender STOP ohne Retry.

## Empirischer Ausgangsstand

- Repo: `/Users/max/Documents/GitHub/kinodreieck-app`
- Branch/HEAD: `staging` / `53aff4981dcb1a999a4ac92c6226a9fde1d482d6`
- Supabase `ai-task`: aktiv, Version 26, Build `53aff498…`
- Remote angewandt: `20260801194500` und `20260808120000`
- Rauchprobe: 23/23 grün; Kosten 6,2825 US-Cent
- Erstes Eval: A1/A2 liefen, A3 stoppte korrekt mit HTTP 429; keine Wiederholung
- Monatsstand danach: 9,4544 / 1000 US-Cent
- Ursache belegt: Testkonto hatte exakt 10/10 Tagesaufträge; kein Anbieter-429
- Owner-Entscheid: 30 Aufträge je Konto/Tag dauerhaft; erst bei real nicht mehr
  tragbaren Kosten durch eine spätere eigene Migration senken

Lokal vorbereitet, aber **noch nicht getestet, committed, gepusht oder remote
angewandt**:

- `supabase/migrations/20260808225500_etappe9_beta_tageslimit_30.sql`
- Anpassung von `etappe9_betrieb_test.mjs`
- Lauf-/Entscheidungsnachweise in den betroffenen Docs

`docs/AUFTRAG_CLAUDE_MUSTWATCH_REDESIGN.md` ist ein älteres, unabhängiges
untracked Dokument: nicht verändern und nicht mitcommitten.

## Ausführung

1. `AGENTS.md`, `git status`, Diff und neue Migration prüfen. Keine fremden
   Änderungen überschreiben. Den Stand klassifizieren:
   - gleich oder kompatibel teilweise erledigt → nur offene Schritte fortsetzen;
   - Definition of Done bereits erfüllt → ohne Writes oder Kosten bestätigen;
   - echter Konflikt, Rückschritt oder gebrochener Sicherheitszaun → STOP.
2. Kostenfrei mindestens `node etappe9_betrieb_test.mjs`, `npm test`,
   `npm run test:function` und `git diff --check` grün machen.
3. Remote-Migrationsliste read-only prüfen. Wenn nur `20260808225500` offen ist,
   exakt diese Datei mit
   `supabase db query --linked --file supabase/migrations/20260808225500_etappe9_beta_tageslimit_30.sql`
   anwenden, Wert 30/Not-Aus/Kostenzäune read-only verifizieren und anschließend
   nur Version `20260808225500` als `applied` markieren. Ist sie bereits
   angewandt und der Wert 30 belegt, nichts erneut ausführen oder reparieren.
   Kein `db push` und kein `config push`.
4. Wenn der finale 20/20-Eval noch nicht dokumentiert ist:
   `npm run check:ai-budget`. Nur bei messbarem grünem Stand fortfahren. Ist er
   bereits vollständig belegt, keine KI-Läufe wiederholen.
5. Kein weiterer Smoke am Referenztag: Das Konto stand bei 10 Aufträgen und die 20
   Eval-Fälle füllen das neue 30er-Limit exakt. Eval ausschließlich seriell mit
   `npm run test:ai:eval -- --owner-approved-server-budget`. Keine Retries.
6. Bei Erfolg die erzeugte Rohdatei kostenfrei mit
   `node tools/ai_eval_etappe6.mjs --pruefen` bewerten.
7. Nur fehlende Nachweise ergänzen. Bereits korrekte Migrations-, Eval- und
   Kostenbelege nicht erneut erzeugen.
8. Nur wenn auftragsspezifische Änderungen existieren, testen, committen und
   auf `staging` pushen. Bei bereits sauber geliefertem Ziel keinen
   Wiederholungscommit erzeugen. `main` nicht mergen.

## Definition of Done

1. Remote-Wert `tageslimit_auftraege` ist numerisch exakt 30 und die
   Migrationshistorie vollständig deckungsgleich.
2. Budgetcheck bleibt messbar; Eval und Offline-Auswertung sind grün – oder der
   Lauf wurde bei einem harten Stoppsignal ohne Retry beendet.
3. Kosten, Testzahlen und Grenzen sind dokumentiert.
4. Auftragsspezifischer Diff ist sauber committed und auf `staging` gepusht;
   das fremde untracked Claude-Dokument blieb unberührt.
