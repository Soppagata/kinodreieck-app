# Status und Tickets

Pruefstand: `14804ce389d69114feed27b92fb11ac78423cc0e`

Dateien insgesamt: 906. Vollstaendig gelesen und bestaetigt: 874. Andere Pruefarten bestaetigt: 32.

| Etappe | Master | Status |
|---|---|---|
| E01 App-Grundgeruest | [Task](codex://threads/01a0ac26-1467-79b3-b72c-6a6ad1da9c81) | complete |
| E02 Anmeldung und Berechtigungen | [Task](codex://threads/01a0ac29-86dc-7303-9a1b-b9eec66974e8) | complete |
| E03 Persoenliche Daten und Synchronisierung | [Task](codex://threads/01a0ac29-919b-7d83-8360-08fd7bf9fab5) | complete |
| E04 Mediathek und eigene Inhalte | [Task](codex://threads/01a0ac29-e110-7e63-a4d2-31ab80731603) | complete |
| E05 Katalog, Identitaet und externe Quellen | [Task](codex://threads/01a0ac29-ebb1-7320-a68b-53180a3ba5c1) | complete |
| E06 Streaming | [Task](codex://threads/01a0ac29-f64e-7d31-bc7d-d8125e8e4ba1) | complete |
| E07 Entdecken | [Task](codex://threads/01a0ac2a-2816-7d63-99d6-aba87dcfe481) | complete |
| E08 Radar | [Task](codex://threads/01a0ac2a-369c-7810-b6c5-6bcbe5374272) | complete |
| E09 Geschmack und persoenliche Einschaetzung | [Task](codex://threads/01a0ac2a-4478-7f12-8876-a2e9743e006a) | complete |
| E10 KI und Filmwissen | [Task](codex://threads/01a0ac2a-79a6-71f3-9aa5-c5532baa77cf) | complete |
| E11 Kino und Planung | [Task](codex://threads/01a0ac2a-854c-75d1-b436-ae3ea5668d2b) | complete |
| E12 Oberflaeche und PWA | [Task](codex://threads/01a0ac2a-8fcf-7291-aa97-c0d018263a89) | complete |
| E13 Betrieb und Auslieferung | [Task](codex://threads/01a0ac2a-9d0d-7031-9051-5ac7100e33ee) | complete |
| E14 Luecken und Gesamtvertraege | [Task](codex://threads/01a0ac53-238b-7b62-8666-cb7f42c26717) | complete |

## Tickets

E14 hat die Reihenfolge nach Prioritaet, Nutzerwirkung und fachlichen Abhaengigkeiten festgelegt.

| Reihenfolge | Prioritaet | Art | Ticket | Master-Abnahme |
|---:|---|---|---|---|
| 1 | P1 | Produkt | [KD-REV-E02-001 · Verspäteter Tokenrefresh kann abgemeldete oder neue Sitzung überschreiben](tickets/E02/KD-REV-E02-001.md) | accepted |
| 2 | P1 | Produkt | [KD-REV-E03-002 · Kontoload übernimmt fehlende Server-Töpfe aus dem Gastcache](tickets/E03/KD-REV-E03-002.md) | accepted |
| 3 | P2 | Produkt | [KD-REV-E03-001 · Verspäteter Pull setzt bestätigten Kontostand zurück](tickets/E03/KD-REV-E03-001.md) | accepted |
| 4 | P2 | Produkt | [KD-REV-E09-001 · Weitere Angaben ersetzt bestätigte Profilfilme ohne Löschhinweis](tickets/E09/KD-REV-E09-001.md) | accepted |
| 5 | P2 | Produkt | [KD-REV-E08-002 · Verschiedene Plattformfunde überschreiben sich beim selben Werkstart](tickets/E08/KD-REV-E08-002.md) | accepted |
| 6 | P2 | Produkt | [KD-REV-E05-003 · `ensureIds` bewahrt leere Alt-IDs und koppelt dadurch Einträge](tickets/E05/KD-REV-E05-003.md) | accepted |
| 7 | P2 | Produkt | [KD-REV-E10-004 · Filmwissen verliert den TMDB-Medientyp und ordnet Filmbelege Serien zu](tickets/E10/KD-REV-E10-004.md) | accepted |
| 8 | P2 | Produkt | [KD-REV-E04-004 · Karteneditor verwirft unvollständige Must-Watch-Jahreseingaben](tickets/E04/KD-REV-E04-004.md) | accepted |
| 9 | P2 | Produkt | [KD-REV-E04-005 · Stapelimport verwirft korrigierte Fehlkandidaten nach Einzelwritefehler](tickets/E04/KD-REV-E04-005.md) | accepted |
| 10 | P2 | Produkt | [KD-REV-E04-006 · Blog-Rotlink speichert nach Film-Serien-Wechsel den alten Typ](tickets/E04/KD-REV-E04-006.md) | accepted |
| 11 | P2 | Produkt | [KD-REV-E04-001 · Blogabgleich verwirft bekannte Must-Watch-Metadaten](tickets/E04/KD-REV-E04-001.md) | accepted |
| 12 | P2 | Produkt | [KD-REV-E08-004 · Zulässiger ID-artiger Freitext blockiert den eigenen Radarfeed und die Entfernung](tickets/E08/KD-REV-E08-004.md) | accepted |
| 13 | P2 | Produkt | [KD-REV-E02-002 · Erzwungener Refresh nach HTTP 401 kann dasselbe Token wiederverwenden](tickets/E02/KD-REV-E02-002.md) | accepted |
| 14 | P2 | Produkt | [KD-REV-E08-003 · Bestehende Personen-Abos lassen sich mit leerem Katalog nicht entfernen](tickets/E08/KD-REV-E08-003.md) | accepted |
| 15 | P2 | Produkt | [KD-REV-E06-002 · Verwaiste Mediathek-Status-ID verhindert erneute Eintragserstellung im progressiven Streaming](tickets/E06/KD-REV-E06-002.md) | accepted |
| 16 | P2 | Produkt | [KD-REV-E11-003 · Legacy-Streamingabgleich verknüpft Konfliktfälle mit falschem Mediathekwerk](tickets/E11/KD-REV-E11-003.md) | accepted |
| 17 | P2 | Produkt | [KD-REV-E05-001 · Fehlgeschlagener Known-Nachzug mischt entfernte Angebote in lokale Consumer](tickets/E05/KD-REV-E05-001.md) | accepted |
| 18 | P2 | Produkt | [KD-REV-E06-001 · Progressive Streaming-Seiten verlieren die Quellkatalog-Ablauffrist bei Revalidierung](tickets/E06/KD-REV-E06-001.md) | accepted |
| 19 | P2 | Produkt | [KD-REV-E14-002 · Manueller Katalogrefresh invalidiert frischen progressiven Streamingcache nicht](tickets/E14/KD-REV-E14-002.md) | accepted |
| 20 | P2 | Produkt | [KD-REV-E06-003 · Progressiver Streamingpfad persistiert keine Neu-Fristanker und datiert verbrauchte Zugänge nach Diff-Pruning neu](tickets/E06/KD-REV-E06-003.md) | accepted |
| 21 | P2 | Produkt | [KD-REV-E07-001 · Gesehen-Abgleich blendet andere Werkart bei gleicher numerischer TMDB-ID aus](tickets/E07/KD-REV-E07-001.md) | accepted |
| 22 | P2 | Produkt | [KD-REV-E11-001 · Standardwert 12 wird als unbegrenzte Wiederholung gespeichert](tickets/E11/KD-REV-E11-001.md) | accepted |
| 23 | P2 | Produkt | [KD-REV-E12-003 · Wochentag-Labels im Wochenplan-Editor überlappen auf schmalen Viewports](tickets/E12/KD-REV-E12-003.md) | accepted |
| 24 | P2 | Produkt | [KD-REV-E12-002 · Kino- und Streaming-Katalogkarten haben keinen direkten Tastatur-Detailzugang](tickets/E12/KD-REV-E12-002.md) | accepted |
| 25 | P2 | Produkt | [KD-REV-E10-003 · Filmwissen-Quellenadapter hebt das Timeout vor dem Lesen des Antwortbodys auf](tickets/E10/KD-REV-E10-003.md) | accepted |
| 26 | P2 | Produkt | [KD-REV-E01-001 · Gespeicherter Titel-Pin bleibt nach frischem Start unsichtbar](tickets/E01/KD-REV-E01-001.md) | accepted |
| 27 | P2 | Produkt | [KD-REV-E04-003 · Must-Watch-Masterlink verliert sein Ziel hinter Mediathekfiltern](tickets/E04/KD-REV-E04-003.md) | accepted |
| 28 | P2 | Produkt | [KD-REV-E11-004 · Persönlicher Kinoreminder verliert beim Öffnen die Filmreferenz eines Mediathektreffers](tickets/E11/KD-REV-E11-004.md) | accepted |
| 29 | P2 | Produkt | [KD-REV-E11-002 · Persönliche Kinoempfehlungen verlieren Fokusnavigation](tickets/E11/KD-REV-E11-002.md) | accepted |
| 30 | P2 | Produkt | [KD-REV-E09-002 · Finder-Kinozeitfilter verwechselt einstellige Tage mit späteren Terminen](tickets/E09/KD-REV-E09-002.md) | accepted |
| 31 | P2 | Produkt | [KD-REV-E09-003 · Unbewertete Kino-Funde ignorieren den ausdrücklichen Heute-/Morgenfilter](tickets/E09/KD-REV-E09-003.md) | accepted |
| 32 | P2 | Produkt | [KD-REV-E01-002 · Start-Pinboard sortiert Januartermine vor Dezember und kann den nächsten Termin ausblenden](tickets/E01/KD-REV-E01-002.md) | accepted |
| 33 | P2 | Produkt | [KD-REV-E04-002 · Bearbeitete KI-Vorschläge werden als angenommen gespeichert](tickets/E04/KD-REV-E04-002.md) | accepted |
| 34 | P2 | Produkt | [KD-REV-E08-001 · Browser verwirft einen belegten Speicher-Teilerfolg als `unavailable`](tickets/E08/KD-REV-E08-001.md) | accepted |
| 35 | P2 | Produkt | [KD-REV-E05-002 · Serien-Faktenlookup sendet den internen statt des SQL-Vertragswerts](tickets/E05/KD-REV-E05-002.md) | accepted |
| 36 | P2 | Produkt | [KD-REV-E14-001 · Strukturierter Radar-Werkkontext verliert gespeichertes Bezugsjahr](tickets/E14/KD-REV-E14-001.md) | accepted |
| 37 | P2 | Produkt | [KD-REV-E07-002 · Format 8/9 verlieren ÖFI-Kinochartbelege vor der Anzeige](tickets/E07/KD-REV-E07-002.md) | accepted |
| 38 | P2 | Produkt | [KD-REV-E12-001 · Radar-Vorschau schneidet Kopf und Schließen-Fläche im Zwischen-Breakpoint ab](tickets/E12/KD-REV-E12-001.md) | accepted |
| 39 | P2 | Produkt | [KD-REV-E10-001 · JSON-null verwirft den AI-Handler statt einer kontrollierten Fehlerantwort](tickets/E10/KD-REV-E10-001.md) | accepted |
| 40 | P2 | Betrieb | [KD-REV-E13-003 · ai-task-Release-Hash und lokaler Dirty-Check lassen drei eingebundene Quellen aus](tickets/E13/KD-REV-E13-003.md) | accepted |
| 41 | P2 | Testwerkzeug | [KD-REV-E09-004 · Vier Bloganalyse-Regressionstests bestehen ohne Ausführung ihrer Testkörper](tickets/E09/KD-REV-E09-004.md) | accepted |
| 42 | P2 | Testwerkzeug | [KD-REV-E13-004 · Privat-v1-Browsergate erwartet einen entfernten Hilfe-Hero](tickets/E13/KD-REV-E13-004.md) | accepted |
| 43 | P2 | Testwerkzeug | [KD-REV-E02-003 · Transportfehler im RLS-Test überspringt die Bereinigung eigener Testproben](tickets/E02/KD-REV-E02-003.md) | accepted |
| 44 | P2 | Testwerkzeug | [KD-REV-E08-005 · Freitext-Abnahmesmoke lehnt zulässige Antworten mit mehreren Websuchen ab](tickets/E08/KD-REV-E08-005.md) | accepted |
| 45 | P2 | Betrieb | [KD-REV-E13-001 · Workflow verwirft gültigen Backlog ohne bearbeiteten Job](tickets/E13/KD-REV-E13-001.md) | accepted |
| 46 | P2 | Betrieb | [KD-REV-E13-002 · Abgelaufene Mail-Ratenbuckets werden weder bereinigt noch als fällig gemeldet](tickets/E13/KD-REV-E13-002.md) | accepted |
| 47 | P2 | Betrieb | [KD-REV-E10-002 · Modelldiagnose meldet Body-Timeout und unlesbares JSON als erfolgreichen leeren Katalog](tickets/E10/KD-REV-E10-002.md) | accepted |
| 48 | P3 | Produkt | [KD-REV-E11-005 · Leerzeichentitel löst beim Speichern eines Reminders eine unbehandelte Promise-Ablehnung aus](tickets/E11/KD-REV-E11-005.md) | accepted |
| 49 | P3 | Testwerkzeug | [KD-REV-E03-003 · Gültige Löschschutz-Fixture lässt Titel-Pins ungültig](tickets/E03/KD-REV-E03-003.md) | accepted |

## Widerlegte, doppelte oder offene Hypothesen

Diese Eintraege sind keine bestaetigten Bugtickets.

- [E04-F007](state/evidence/validations/E04-F007.json): refuted — Paketimport ueberspringt anderes Medium mit gleichem Titel und Jahr
- [E07-F003](state/evidence/validations/E07-F003.json): refuted — Verdrahteter Einmallauf verwirft erfolgreiche Format8/9-Tagesfeeds
- [E13-F005](state/evidence/validations/E13-F005.json): unresolved — Demo-SQL übernimmt Quellenzeitpunkt ungequotet als ausführbaren SQL-Ausdruck

[Vollstaendige Dateiabdeckung](COVERAGE.md) · [Auftrag](POLICY.md)

[Abschliessender Gesamtvertrags- und Migrationsbericht](reports/E14.md) · [Begruendete Ticketreihenfolge](state/evidence/inbox/E14/FINAL_REVIEW.json)
