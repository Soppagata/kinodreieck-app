-- ===========================================================================
-- Etappe 6 — Ausgabebudget der intelligenten Suche anheben
--
-- ADDITIV, nur Konfiguration. Kein Schema, keine Tabelle, keine Policy, keine
-- Funktion wird angefasst. Ein einziger Wert in kd_ai_limits.
--
-- WARUM
-- Die Etappe-5-Migration hat `intelligent-search` in `task_max_tokens` auf
-- 1024 gesetzt. Der Wert war an einer GEWÖHNLICHEN Antwort bemessen (rund 190
-- Token) — die falsche Bezugsgröße. Maßgeblich ist die größte Antwort, die das
-- Schema noch zulässt: 12 Werte je Liste, 12 Reihen, 24 gemeldete Wünsche à 60
-- Zeichen, 220 Zeichen Klartext. Das sind rund 9000 Zeichen JSON, also 2270 bis
-- 3030 Token je nach Umrechnung.
--
-- Gemessen am 26. und 27.07. im Eval-Lauf gegen die deployte Function: drei von
-- zwanzig Anfragen endeten als HTTP 502 `antwort-abgeschnitten` — bezahlt und
-- ohne Ergebnis. Betroffen waren durchweg Anfragen, die das Modell zum Ausholen
-- verleiten. Ein zu knappes Budget ist die teuerste Sparsamkeit: der Aufruf
-- kostet voll und liefert nichts.
--
-- WARUM 8192 UND NICHT KNAPPER
-- Entscheidung Max, 26.07.: „groß genug und nicht genau passend … wichtig ist,
-- dass es sauber funktioniert, egal wie teuer. Ich werde drosseln, sobald die
-- ersten Tester Zugang haben."
--
-- Im Betrieb kostet das nichts: abgerechnet werden die TATSÄCHLICH erzeugten
-- Token (gemessen 0,82 US-Cent je Deutung). Vom Höchstwert geht allein die
-- Reservierung aus, und die wird beim Abschluss durch den Istwert ersetzt.
--
-- BEIM SPÄTEREN DROSSELN
-- 4096 ist die naheliegende Stufe — Faktor 1,35 über der konservativen
-- Rechnung. Unter 3072 sollte niemand gehen, ohne die Schemagrenzen in
-- `supabase/functions/ai-task/index.ts` (SUCHE_MAX_WERTE, KLARTEXT_MAX_ZEICHEN,
-- WUNSCH_MAX_ZEICHEN) neu zu rechnen.
--
-- Ergänzend, nicht ersetzend: der Systemprompt begrenzt die Mengen jetzt
-- ausdrücklich (höchstens 12 Werte je Liste, höchstens 3 Meldungen, niemals
-- Filme aufzählen). Das Schema kann Anzahlgrenzen nicht zuverlässig
-- ausdrücken; `max_tokens` ist die einzige harte Schranke und greift zu spät,
-- weil sie die Antwort mitten im JSON abbricht. Die Mengengrenze gehört
-- deshalb VOR die Erzeugung, das Budget ist nur das Auffangnetz dahinter.
--
-- WIEDERHOLBAR: jsonb_set auf einen vorhandenen Schlüssel ist idempotent.
-- ===========================================================================

update public.kd_ai_limits
   set wert = jsonb_set(wert, '{intelligent-search}', '8192'::jsonb, true),
       notiz = 'Obergrenze der Antwortlaenge je Aufgabe (Pflichtfeld max_tokens der Anbieter-API). '
               || 'intelligent-search am 27.07.2026 von 1024 auf 8192: 1024 deckte die groesste vom '
               || 'Schema erlaubte Antwort (2270-3030 Token) nicht, drei Eval-Anfragen endeten als '
               || 'bezahlter 502 antwort-abgeschnitten. Bewusst reichlich bis zur Testerrunde, '
               || 'danach drosseln (4096 naheliegend, unter 3072 neu rechnen).',
       geaendert_at = now()
 where schluessel = 'task_max_tokens';

-- Kontrolle: muss genau eine Zeile mit "intelligent-search": 8192 zeigen.
-- select schluessel, wert from public.kd_ai_limits where schluessel = 'task_max_tokens';
