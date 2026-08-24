# KI-Live-Test: ausführbare Übergabe

Stand: 25. August 2026. Dieser Auftrag ist zum Ausführen gedacht, nicht für eine
neue Planung oder einen breiten Audit.

## Ziel und unveränderlicher Kandidat

Der neue Chat soll den finalen Kandidaten bauen/deployen und anschließend genau
einmal echt über alle acht Produktpfade testen.

- `PRODUCT_COMMIT=34e3f4bf6508e680dc28281b50a755c5e7e1c124`
- Dieser Produktcommit hat lokal genau einen vollständigen `npm test` inklusive
  Build und Pages-Prüfung mit Exit 0 bestanden.
- Der aktuelle Branch-HEAD darf ein reines Doku-Kind dieses Commits sein. Einmal
  `HEAD` und dessen Parent lesen, die Beziehung zum Produktcommit bestätigen und
  danach keine Brancharchäologie betreiben.
- Der Produkt-Buildmarker ist immer `PRODUCT_COMMIT`, nicht das Doku-Kind.

Die frühere Freigabe war an `82633cdcd8e6a351f0787d1eb0345a3e1da69c43`
gebunden. Vor Remote-Writes und vor einem neuen bezahlten Lauf ist deshalb eine
neue, ausdrückliche Owner-Freigabe für den oben genannten Produktcommit und das
kontrollierte Fenster nötig.

## Bestätigter Iststand vor diesem Kandidaten

- Remote-Branch und Staging-Frontend stehen exakt auf
  `82633cdcd8e6a351f0787d1eb0345a3e1da69c43`.
- Das DB-Ledger enthält `20260824120000_entdecken_weekly_live_proof.sql` und
  `20260824130000_filmwissen_loc_nfr_v2.sql` jeweils genau einmal.
- `20260824140000_entdecken_weekly_refresh_lease.sql` fehlt remote noch.
- Die verwalteten Function-Versionen von `ai-task`, `radar-websearch-task` und
  `entdecken-daily-task` sind 59, 31 und 29; alle waren ACTIVE und die
  JWT-Einstellung stimmte. Der Marker nach dem letzten Managementvorgang ist
  noch nicht bestätigt; die unmittelbar danach gelesenen Source-Closures waren
  gegen 826 grün.
- Staging auf 826 war grün. `main` und Produktion wurden nicht verändert.
- Letzter echter Stand: Produktpfade 1–3 sind belegt. Pfade 4–6 schlugen fehl
  und sind lokal repariert. Bei Pfad 7 wurde die Zero-Feed-Claim-Ursache lokal
  repariert. Pfad 8 wurde nicht versucht; sein Harness ist lokal repariert.

## Einziger nächster Ablauf

Keine neue Gesamtprüfung, kein neues `npm test`, kein Replanning.

1. Einmal den sauberen HEAD, seinen Parent, `PRODUCT_COMMIT` und die
   Fast-forward-Beziehung zum Remote-Branch prüfen. Bei Abweichung stoppen.
2. Nur wegen der neuen Migration ein frisches Backup anlegen und in einem
   disposable PostgreSQL-17-Ziel wiederherstellen.
3. Nach ausdrücklicher Freigabe genau einen nicht erzwungenen Fast-forward-Push
   ausführen.
4. Remote ausschließlich
   `20260824140000_entdecken_weekly_refresh_lease.sql` genau einmal anwenden und
   das Ledger zurücklesen. Keine ältere Migration erneut anwenden.
5. Seriell `ai-task` und `entdecken-daily-task` deployen.
   `radar-websearch-task` nur dann deployen, wenn finaler Diff und vollständige
   Runtime-Closure das verlangen; erwartet ist: nein.
6. Bei Build und Deploy den Marker auf `PRODUCT_COMMIT` setzen. Danach für jede
   betroffene Function ACTIVE-Status, JWT-Einstellung, Marker und vollständige
   Source-Closure zurücklesen.
7. Wegen der Frontend- und Workflow-Änderungen genau einen Staging-Workflow
   ausführen und dessen Commit-/Buildmarker zurücklesen.
8. Für Filmwissen einen echten, providerfreien `cache_miss` an den Lauf binden.
9. Nach der separaten, frischen Kostenfreigabe exakt einmal seriell ausführen:

   ```sh
   npm run test:ai:live -- --owner-approved-server-budget
   ```

   Nach einem möglichen Anbieterrequest gibt es keinen Retry. Ein Pfadfehler
   bei exakt bekannten, innerhalb aller Limits liegenden Kosten wird als
   `FAIL/UNPROVEN` festgehalten; der Lauf geht mit dem nächsten Pfad weiter.
10. Danach genau ein kurzer Chrome-Readback in Staging: Entdecken-Feed,
    Radar-Freitext-Ergebnis und die sichtbaren Zustände der übrigen Pfade. Kein
    breiter UI-Audit.

## Abnahme der acht Produktpfade

Reihenfolge: die drei Basispfade, dann Entdecken und Radar, danach Filmwissen,
Blog und Media.

1. Intelligente Suche: normale Providerantwort, Produktionsparser,
   Speicherung und identischer Readback sind belegt.
2. Profilextraktion: Signale besitzen wörtliche Belege; Parser, Speicherung und
   Readback bleiben identisch.
3. Filmprognose: Schema und getrenntes WARUM bestehen; Speicherung und Readback
   sind belegt.
4. Entdecken: ein frischer Feed enthält 5–7 Einträge. Der unabhängige GET ist
   rein lesend und liefert den persistierten Stand; er beansprucht nie Lease
   oder Recovery. „Für mich“ und „Andere“ sind enthalten, bereits Gesehenes ist
   ausgeschlossen und Verfügbarkeit ist fachlich belegt. Nur Schedule- oder
   Owner-POST darf Lease/Recovery beanspruchen.
5. Radar-Freitext: Tippen erzeugt 0 Requests, explizites Absenden genau 1. Das
   persistierte Ergebnis ist sicher dem Ziel zugeordnet und in Staging sichtbar.
6. Filmwissen: der gebundene LOC-v2-`cache_miss` führt zu einer publizierten
   Version; die enge Lese-RPC liefert genau diese Version zurück. Ein bloßer
   Entwurf ist nicht belegt.
7. Blogprofil: ein korrektes Listenpaar wird geparst, gespeichert und identisch
   gelesen; zwei ausdrücklich leere Listen sind gültig. Degraded/null ist kein
   fachlicher Erfolg.
8. Media-Stapelimport: ein sicheres Teilresultat darf `partial` sein. Nur
   ausgewählte gültige Kandidaten werden übernommen; Warnungen, Speicherung und
   Readback bleiben erhalten, verworfene Teile werden nicht als Erfolg maskiert.

Für alle acht Pfade gilt: Fehlender oder nicht korrelierter Provider-Receipt bei
exakt bekannten, zulässigen Kosten macht nur diesen Pfad `FAIL/UNPROVEN`.

## Harte Stopps und Grenzen

Terminal sind ausschließlich die in `AGENTS.md` festgelegten Fälle:
unbekannte Kosten beziehungsweise `BUDGET_UNBEKANNT`, Budget- oder Cap-Verstoß,
Timeout, Lock-Fehler, fehlende/ungültige Owner-Freigabe sowie Exit 75 oder
`AUTONOMIE_STOPP`. Dann nichts weiter echt testen und Max den Stand melden.

- Keine automatischen Retries.
- Keine Raw-Capture-, Diagnose- oder temporären Flags.
- Keine Secrets, Kontenkennungen, Testinhalte, URLs oder Provider-Rohpayloads in
  Chat, Repository oder Log-Zusammenfassung.
- Nach dem letzten bezahlten Lauf ist für jeden weiteren Kostenlauf erneut eine
  ausdrückliche Freigabe nötig.
- Der Wochenplan aktiviert sich nur auf dem Default-Branch. Er gehört nicht zu
  diesem Staging-Live-Test. `main` und Produktion ohne eigene ausdrückliche
  Freigabe nicht berühren.

Erst nach dieser KI-Abnahme ist als separater späterer Auftrag
`docs/zukunft/NAECHSTER_MASTERCHAT_PRIVATRELEASE_ETAPPENPLAN.md` relevant. Im
KI-Test-Task weder lesen noch umsetzen.
