# Handover an Sol Ultra: KI-Eval abschließen

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
   Änderungen überschreiben. Bei Abweichung vom obigen Stand STOP.
2. Kostenfrei mindestens `node etappe9_betrieb_test.mjs`, `npm test`,
   `npm run test:function` und `git diff --check` grün machen.
3. Remote-Migrationsliste read-only prüfen. Wenn nur `20260808225500` offen ist,
   exakt diese Datei mit
   `supabase db query --linked --file supabase/migrations/20260808225500_etappe9_beta_tageslimit_30.sql`
   anwenden, Wert 30/Not-Aus/Kostenzäune read-only verifizieren und anschließend
   nur Version `20260808225500` als `applied` markieren. Kein `db push` und kein
   `config push`.
4. `npm run check:ai-budget`. Nur bei messbarem grünem Stand fortfahren.
5. Kein weiterer Smoke: Das Konto steht heute bei 10 Aufträgen und die 20
   Eval-Fälle füllen das neue 30er-Limit exakt. Eval ausschließlich seriell mit
   `npm run test:ai:eval -- --owner-approved-server-budget`. Keine Retries.
6. Bei Erfolg die erzeugte Rohdatei kostenfrei mit
   `node tools/ai_eval_etappe6.mjs --pruefen` bewerten.
7. Migrationskopf und `supabase/migrations/LIESMICH.md` von „ausstehend“ auf den
   empirischen Erfolg ändern, final nochmals komplette kostenfreie Suite und
   Remote-Stand prüfen.
8. Nur die zu diesem Auftrag gehörenden Dateien committen und auf `staging`
   pushen. `main` nicht mergen.

## Definition of Done

1. Remote-Wert `tageslimit_auftraege` ist numerisch exakt 30 und die
   Migrationshistorie vollständig deckungsgleich.
2. Budgetcheck bleibt messbar; Eval und Offline-Auswertung sind grün – oder der
   Lauf wurde bei einem harten Stoppsignal ohne Retry beendet.
3. Kosten, Testzahlen und Grenzen sind dokumentiert.
4. Auftragsspezifischer Diff ist sauber committed und auf `staging` gepusht;
   das fremde untracked Claude-Dokument blieb unberührt.
