-- ===========================================================================
-- Tageslimit für die Bauphase anheben
--
-- ADDITIV, nur Konfiguration. Ein Wert in kd_ai_limits.
--
-- WARUM
-- `tageslimit_auftraege` steht seit Etappe 5 auf 25 Aufträgen je Konto und
-- Kalendertag (Europe/Vienna). Für den Betrieb ist das eine vernünftige Zahl.
-- Für einen Bautag nicht: ein einziger Eval-Lauf sind 20 Aufträge, dazu die
-- Rauchproben nach jedem Deploy. Am 27.07. lief deshalb der zweite Eval-Lauf
-- vollständig ins Limit — 20 von 20 Anfragen mit `tageslimit-erreicht`
-- abgewiesen, kein einziger Anbieteraufruf, kein Messergebnis.
--
-- 200 ist bewusst reichlich und ausdrücklich EIN ZWISCHENSTAND für die
-- Bauphase (Entscheidung Max, 26.07.: „wichtig ist jetzt nur, dass es sauber
-- funktioniert, egal wie teuer. Ich werde drosseln, sobald die ersten Tester
-- Zugang haben").
--
-- WARUM DAS NICHT GEFÄHRLICH IST
-- Das Tageslimit ist nicht der Kostenschutz — das ist `monatsbudget_usd_cent`
-- (1000 Cent = 10 USD über ALLE Konten). Bei gemessenen 0,82 US-Cent je
-- Deutung sind 200 Aufträge am Tag rund 164 Cent; das Monatsbudget greift also
-- weiterhin als die härtere Grenze und ist unverändert. Das Tageslimit schützt
-- gegen den Ausreißer eines einzelnen Kontos, nicht gegen die Gesamtsumme.
--
-- VOR DER TESTERRUNDE ZURÜCKDREHEN
-- Dann gehört der Widerspruch aufgelöst, der seit dem 26.07. offen ist:
-- Tageslimit × 30 Tage × 0,82 Cent darf das Monatsbudget nicht übersteigen,
-- sonst läuft ein Vielnutzer vor Monatsende in eine Wand, die er nicht
-- versteht. Bei 10 USD Monatsbudget sind das rund 40 Aufträge je Tag.
--
-- WIEDERHOLBAR: setzt einen festen Wert, kein Inkrement.
-- ===========================================================================

update public.kd_ai_limits
   set wert = '200'::jsonb,
       notiz = 'Auftraege pro Konto und Kalendertag (Europe/Vienna). Am 27.07.2026 fuer die Bauphase '
               || 'von 25 auf 200 angehoben: ein Eval-Lauf sind allein 20 Auftraege, der zweite Lauf '
               || 'des Tages lief vollstaendig ins Limit. VOR DER TESTERRUNDE ZURUECKDREHEN -- bei '
               || '10 USD Monatsbudget und 0,82 Cent je Deutung sind rund 40 der widerspruchsfreie Wert.',
       geaendert_at = now()
 where schluessel = 'tageslimit_auftraege';

-- Kontrolle: muss 200 zeigen.
-- select schluessel, wert, notiz from public.kd_ai_limits where schluessel = 'tageslimit_auftraege';
