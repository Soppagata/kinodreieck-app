# Auftrag nach der privaten Demo: „Dein Radar“ sicher bauen

Stand der Auftragsplanung: 09.08.2026
Audit-Scope: `FUTURE_PLAN_METADATA_ONLY`

> **Status: Zukunftsplanung – jetzt nicht ausführen.**
> Dieser Auftrag ist ausdrücklich aus Rollen-v1, der aktuellen privaten
> Demo-Schlussabnahme und dem abgeschlossenen Audit-/Cleanup-Scope
> ausgeschlossen. Er darf erst nach dem stabilen privaten Demo-Checkpoint und
> Max' ausdrücklicher Startfreigabe verwendet werden.

> **Durch aktuellen Handoff ersetzt:** Für einen neuen Bau-Task ist
> `AUFTRAG_ENTDECKEN_RADAR.md` maßgeblich. Diese Datei bleibt als ausführliche
> technische Radar-Referenz erhalten, darf aber insbesondere bei UI-Namen,
> `Beobachtet`-Semantik, kuratierten Freigaben und Chartquellen nicht allein
> ausgeführt werden.

## 1. Ziel

Baue einen global deduplizierten Titel-/Serien-/Franchise-Radar:

- normale aktive Konten können zunächst höchstens zehn Ziele im neuen
  allgemeinen Webradar beobachten,
- Max besitzt eine eigene fachlich unbegrenzte Radar-Capability,
- gleiche Ziele mehrerer Konten werden nur einmal extern geprüft,
- globale belegte Ereignisse werden von persönlichen Abos und Receipts
  getrennt,
- neue beziehungsweise geänderte Hinweise erscheinen unter „Dein Radar“,
- nur bestätigte, taggenaue und regionsrichtige Termine werden innerhalb der
  nächsten sieben Tage read-only in „Deine Woche“ projiziert,
- der providerübergreifende Gesamtverbrauch bleibt unter dem ausdrücklich
  freigegebenen Monatsdeckel.

Die vollständige fachliche Planung steht in:

- `docs/zukunft/RADAR_BEOBACHTUNGEN_PLAN.md`
- `docs/zukunft/ENTSCHEIDUNGSLOG.md`

Lies beide Dateien sowie `docs/zukunft/README.md` vollständig, bevor du
irgendetwas änderst. Lies anschließend die dann aktuellen Fassungen dieser
verbindlichen Quellen vollständig:

- `AGENTS.md`,
- `docs/AUDIT_FORTSETZUNG_2026-08-08.md`,
- `docs/ROADMAP_TO_ONLINE.md`,
- `docs/ROLLEN_V1_BETRIEB.md`, sofern vorhanden,
- `docs/WOCHENPLAN_SERIEN.md`,
- `supabase/migrations/LIESMICH.md`,
- `supabase/current_schema.sql` und die nach Rollen-v1 maßgeblichen
  Migrationen,
- aktuelle Function-Release- und Betriebsdokumente.

Fehlt eine genannte aktuelle Quelle oder widerspricht sie dem Zukunftsplan,
halte die Abweichung in Phase 0 fest und entscheide sie nicht selbst.

## 2. Nicht-Ziele

- kein Bau vor Abschluss der privaten Demo,
- keine automatische Geschmackspräferenz aus einem Abo,
- kein Web-Push, keine E-Mail und kein abonnierbarer Kalenderfeed,
- keine ungeprüften fuzzy Franchisezuordnungen,
- kein Artikelarchiv und keine Speicherung vollständiger Artikeltexte,
- kein direktes film.at-Scraping ohne schriftliche Erlaubnis,
- keine Ablösung oder stille Kürzung von `kd_series_watch`, Must-Watch,
  Merkliste, Kino-Pins oder Wochenplan,
- keine öffentliche Registrierung oder Admin-Oberfläche,
- keine tägliche bezahlte Vollsuche,
- keine stillen Sonderrechte für `role=owner`,
- kein `main`-/Produktionsfrontend-Release ohne eigenen späteren Auftrag.

## 3. Kontext, den die Empfänger-Session neu prüfen muss

Die Auftragsplanung entstand auf Referenzcommit `7a51ce7`. Dieser Commit ist
keine Ausführungsautorität. Ermittle zu Beginn empirisch:

- aktuellen Branch, HEAD, `origin/staging`, `main` und Working Tree,
- tatsächlich ausgelieferte Staging-/Produktions-Buildmetadaten,
- aktuellen Rollen-v1-, Function- und Remote-Migrationsstand,
- aktuellen Vertrag von `kd_account_access`, `kd_series_watch`,
  `kd_personal`, PersonalDataRegistry, Backup/Restore und Account-Driver,
- derzeitigen Streaming-/Schedulerbetrieb,
- aktuellen AI-/Provider-Kostenzaun und real messbare Monatskosten,
- aktuelle Providerpreise, Terms, Speicherung, Attribution, Datenschutz und
  Toolunterstützung.

Staging- und Produktionsfrontend können dasselbe Supabase-Projekt benutzen.
Eine Remote-Migration, RLS-/Grant-Änderung, Edge-Function oder Scheduler-
Änderung kann deshalb Produktion beeinflussen, auch wenn `main` unangetastet
bleibt. Behaupte nie „Produktion unverändert“, wenn das gemeinsame Backend
verändert wurde.

## 4. Harte Regeln

1. Diagnose vor Änderung; bei Abweichung vom Plan nicht raten.
2. Bestehende Nutzer- und Testdaten read-only, bis der exakte Migrationsweg
   freigegeben ist.
3. Keine Geheimnisse, Account-UUIDs, E-Mails, Suchinteressen oder echte
   Payloads in Repo, Chat, Logs, Fixtures oder CI-Ausgabe.
4. Kein Featurezuwachs außerhalb dieses Auftrags.
5. LLM nur zur strukturierten Kandidatenextraktion; deterministischer Code
   besitzt ID-, Evidenz-, Status-, Kalender- und Kostenwahrheit.
6. Ein Abo erzeugt keine Geschmackspräferenz.
7. Im Kontomodus ist die serverseitige Subscription die einzige Autorität für
   wirksame Hintergrundabos. Lokaler Topf nur als Cache, Receipts und
   wiederaufnehmbare Outbox; kein unkoordiniertes Dual-Write.
8. Normales Limit atomar serverseitig; UI-Limit allein genügt nicht.
   Bestehendes reines `kd_series_watch` zählt nur nach bewusster Übernahme,
   durch die es einen allgemeinen Webradar-Check erzeugt.
   Im MVP zählt die RPC höchstens zehn unterschiedliche `target_id`s; Region
   und Scope dürfen kein mehrfaches Zählen oder Umgehen erzeugen.
9. `radar_unlimited` oder gleichwertige eigene Capability; niemals still
   `owner` wiederverwenden.
10. Fachlich unbegrenzter Superadmin umgeht keinen Request-, Lauf-, Quellen-,
   Privacy- oder Monatszaun.
11. Pro fälligem globalem `check_key` höchstens ein bezahlter Search-Use; bei Claude
    Web Search technisch `max_uses: 1` erzwingen.
12. Zwei Queryvarianten, gleiche Domainfamilie oder Syndizierung zählen nicht
    als unabhängige Evidenz.
13. Artikel-/Indexdatum ist kein Release-Datum.
14. Unklarer Preis, Kostenstand, Providerstatus, Timeout, `429` oder Limit
    öffnet den providerweiten Circuit-Breaker und stoppt den gesamten Lauf;
    kein Sofort-Retry.
15. Batch sofort pro `check_key` checkpointen; Wiederanlauf ausschließlich über
    `open`, `failed` und erlaubte `deferred`-Ziele.
16. Globale Radar-Targets und Events sind nicht öffentlich und nicht direkt
    browserlesbar; nur minimierte Feed-RPC für eigene aktive Abos.
17. Faktenreview benötigt eine getrennte service-seitige `radar_review`-
    Capability; `radar_unlimited` erteilt sie nicht.
18. Alle normalen Tests und Providerverträge verwenden Mocks.
19. Unter den derzeitigen `AGENTS.md`-Regeln ist kein Radar-Live-Aufruf
    autorisiert. Die alte Owner-Ausnahme vom 08.08.2026 galt nur für den
    finalen Audit. Vor jedem echten Radar-Providerrequest braucht es eine
    frische ausdrückliche Freigabe für einen exakten, budgetgeschützten
    Einstiegspunkt; keine Direktaufrufe und keine Umgehung.
20. Keine Remote-Schreiboperation, Migration, Function-/Worker-Auslieferung,
    Scheduleraktivierung, bezahlte Probe oder Budgetänderung ohne den
    zugehörigen STOP.
21. Nach jeder Bauphase: vollständige relevante Tests, Scope-/Privacy-/Kosten-
    Review und sauberes `git diff --check`.
22. Vor Auslieferung: komplette App-, Function-, RLS- und Mobile-Suite grün;
    Testgrenzen ehrlich ausweisen.
23. `main` und Produktionsfrontend bleiben unangetastet.

## 5. Phase 0 – aktueller Audit, nur lesen

Keine Dateien verändern, keine Remote-Writes, keine Deployments, keine echten
Providerrequests.

### 0.1 Liefer- und Arbeitsstand

- Gitstatus, Branchgraph, Ahead/Behind und laufende fremde Änderungen prüfen.
- Staging-/Produktions-Buildmeta und CI read-only ermitteln.
- Noch laufende Tasks/Worktrees nicht überschreiben oder mitnehmen.

### 0.2 Daten- und Rollenbestand

- persönliche Töpfe, Backup, Restore, Gast/Konto-Übernahme und Sync inventarisieren,
- `kd_series_watch` inklusive echter Bestandsgrößen nur aggregiert prüfen,
- Rollen-v1-Felder, Capability-Projektion, RLS, Grants und RPCs inventarisieren,
- alte Clients und gemeinsam genutztes Backend als Kompatibilitätsfläche erfassen,
- klären, wie bestehende Serienbeobachtungen ohne Verlust behandelt werden,
- belegen, dass das Zehnerlimit nur neue allgemeine Webradar-Abos zählt und
  bestehende reine Staffel-/Folgenbeobachtungen weder kürzt noch still
  kostenpflichtig macht; falls der aktuelle Serienpfad inzwischen selbst
  Websuchen auslöst, die Limitfrage an Max eskalieren,
- eine einzige Autorität für wirksame Kontoabos sowie Outbox-,
  Reconciliation-, Restore-, Quota-Ablehnungs- und Konfliktvertrag festlegen,
- Read-Grenze für globale Radar-Targets und Events entwerfen: kein
  Direkt-SELECT, nur eigene aktive Subscription über minimierte RPC/View,
- getrennte Capabilities für unbegrenztes Abonnieren und Faktenreview planen.

### 0.3 UI und Kalender

- heutiges Pinboard/Serienradar, Must-Watch, Merkliste, Kino-Pins und
  Sieben-Tage-Woche codeseitig belegen,
- kleines textuelles UI-Wireframe für „Dein Radar“ erstellen,
- entscheiden, ob Start-Dashboard-Erweiterung genügt; kein neuer Tab ohne
  nachgewiesenen Bedarf.

### 0.4 Scheduler und Provider

- realen externen Streamingjob beziehungsweise dessen Fehlen belegen,
- Scheduleroptionen mit Secret-, Branch-, Kosten- und Rückwegwirkung vergleichen,
- offizielle Providerdokumentation und Terms aktuell prüfen,
- direct-Claude und Search-API-plus-Haiku mit demselben Worst Case kalkulieren,
- Speicherung/Attribution/DPA und reale Payloadprobe als offene Gates markieren,
- `check_key = target + region + scope + query/provider version` als gemeinsame
  Schedule-, Cache-, Lease- und Kostenunit bestätigen oder begründet ersetzen,
- pro Ziel/Region/Scope genau eine aktive Query-/Providerversion sowie atomare
  Stilllegung alter Check-Keys ohne Historienverlust planen,
- `lease_until`, Fencing-Token und Requestzustände so planen, dass ein
  verspäteter Worker nicht schreiben und ein unklar abgeschlossener Request
  nicht doppelt kosten kann,
- kuratierte Quellen-/Publisherregistry und Revalidierungs-TTL planen.

### 0.5 Kostenrechnung

Mindestens diese Szenarien rechnen:

- zehn Konten × drei tatsächlich aktive Ziele,
- zehn Konten × zehn vollständig verschiedene Ziele,
- 50 Prozent Zielüberschneidung,
- zehn Konten × 15 Ziele,
- zusätzliche große Superadmin-Liste,
- ein versus zwei Tool-Uses,
- heutige bestehende KI plus Radar gemeinsam.

Freikontingente nie als garantierten Sicherheitsboden verwenden. Euroziel,
USD-Cap, Steuer und Wechselkurs getrennt benennen.

Entwirf außerdem einen einzigen atomaren Reservierungs-/Istkostenvertrag für
kontobezogene bestehende KI und den accountlosen Radar-Systemactor. Er muss
parallele Reservierungen, konservative Rückbuchung, Search-Uses, Tokens und den
Abgleich mit allen Providerabrechnungen umfassen. Getrennte Zähler dürfen den
Gesamtdeckel gemeinsam nicht überschreiten.

### Phase-0-Ausgabe

| Bereich | Ist | Beleg | Empfehlung | Entscheidung nötig |
|---|---|---|---|---|
| Baseline/Deploy |  |  |  |  |
| Rollen/RLS |  |  |  |  |
| Serienbestand/Migration |  |  |  |  |
| UI/Woche |  |  |  |  |
| Scheduler |  |  |  |  |
| Provider/Rechte |  |  |  |  |
| Budget/Worst Case |  |  |  |  |
| Rückweg |  |  |  |  |

Zusätzlich exakt auflisten:

1. empfohlener MVP-Ereigniskatalog,
2. empfohlener Providerweg,
3. empfohlener Schedulerort,
4. Umgang mit `kd_series_watch`,
5. Aboautorität, `check_key`, Feed-Read-Grenze und Schema-/Capabilityvorschlag,
6. exakter vorgeschlagener providerübergreifender US-Cent-Deckel,
7. geplante Dateien und Tests,
8. alle Abweichungen von dieser Zukunftsplanung.

**Dann STOP und auf Freigabe warten.**

## 6. Phase 1 – Verträge, Fixtures und reine Logik

Erst nach Freigabe. Noch keine Remote-Writes und keine echten Providercalls.

### Bauen

- versionierte Ziel-, Subscription-, Event-, Evidence-, Receipt- und Runformen,
- strikte Decoder/Validatoren,
- Normalisierung von URL, Domain, Publisherfamilie, Werk, Eventtyp, Region,
  Plattform und Datum,
- stabile Event-ID ohne Datum,
- getrennte Eventtyp-, Verifikations-, Lebenszyklus- und Terminversionslogik,
- `verification_status`, Evidenz und Review zwingend pro `event_version_id`;
  neue Datumsfassung startet unbestätigt und ersetzt den bestätigten Zeiger
  erst nach erneutem Gate,
- globalen `target_status` strikt vom persönlichen `subscription_status`
  trennen; persönliches Pausieren darf kein globales Ziel beeinflussen,
- kuratierte Quellen-/Publisherregistry; `unknown` bestätigt niemals,
- deterministische Statusmaschine und Konfliktlogik,
- Kostenreservierung und Tool-Use-Cap als reine Logik,
- idempotenten Batch-/Checkpointvertrag,
- ausschließlich künstliche und rechtssichere Fixtures.

### Tests

- gleiche Titel verschiedener Jahre,
- Franchise versus Einzelwerk,
- mehrdeutige Kurztitel,
- Artikel-Datumsfallen und Regionsfehler,
- Syndizierung und Publisherfamilien,
- Terminänderung/Rücknahme,
- keine Bestätigungs-/Evidenzvererbung auf neue Terminversion und kein
  Reminder-Update vor erneuter Bestätigung,
- verknüpfter One-off-Reminder ohne stille Dublette oder Überschreibung,
- unveränderter Hash ohne Modellpfad,
- Teilfehler, Budgetstopp und Wiederanlauf nur über Fehlmenge,
- Nullresultat ohne erfundene Neuigkeit.

### Phase-1-Ausgabe

- Diffstat und vollständige Dateiliste,
- Datenformen und Invarianten,
- Testfälle/Ergebnisse,
- bekannte Grenzen,
- noch keine Produkt-, DB- oder UI-Behauptung.

**Dann STOP und auf Freigabe warten.**

## 7. Phase 2 – lokaler vollständiger Build hinter Not-Aus

Erst nach Freigabe. Migrationen und Servercode nur lokal vorbereiten; nichts
remote anwenden oder deployen.

### Persönlicher Datenpfad

- neuen Topf vollständig in Storage, PersonalDataRegistry, Backup, Restore,
  Übernahme, Sync und Allowlist integrieren,
- im Kontomodus nur Cache, Receipts und idempotente Outbox lokal halten;
  serverbestätigte Subscription ist die wirksame Autorität,
- RPC-Ack, Serverrevision, Prüfsumme, Quota-Ablehnung, Offlinekonflikt und
  Reconciliation ohne Verlust offener Outboxeinträge testen,
- beschädigte/fehlende/valide-leere Zustände unterscheiden,
- Accountwechsel-, Logout-, Offline-, Konflikt- und Größenfälle testen.

### Server-/DB-Pfad

- additive Tabellen/Indizes/RLS/Grants/RPCs vorbereiten,
- Memberlimit zehn unter Parallelität atomar beweisen,
- Limit als höchstens zehn unterschiedliche neue Webradar-Targets beweisen;
  Region-/Scopeänderung aktualisiert dasselbe Abo statt eine Quota-Lücke zu
  erzeugen,
- getrennte `radar_unlimited`- und `radar_review`-Capabilities fail-closed
  modellieren,
- Subscriberdaten von globalen Targets/Events trennen,
- globalen `target_status` von `subscription_status` trennen und Konto-A-Pause
  gegen unverändertes Ziel/Konto-B-Abo testen,
- Eventversionen mit eigener Evidenz/Verifikation sowie getrenntem
  Kandidaten-/Bestätigt-Zeiger modellieren,
- `kd_radar_checks` mit scopegebundenem Zeitplan/Hash/Lease statt globalem
  Target-Frischestempel,
- globale Target-/Event-Browser-SELECTs schließen und minimierte
  Own-Subscription-Feed-RPC positiv/negativ testen,
- service-only Evidence/Run-Zugriff schließen,
- `radar_aktiv=false` und Provider-Not-Aus als sichere Defaults,
- aktuelle Produktionsclients müssen mit dem additiven Schema weiterarbeiten.

### Scheduler-/Function-Pfad

- fällige `check_key`s global deduplizieren,
- Prozess-/Check-Lock, `lease_until`, Fencing-Token, Revalidierungs-TTL,
  aktive Routingversion, Requestzustände, Checkpoints und harte Laufcaps,
- exakt einen Search-Use je Check-Key technisch erzwingen,
- einen atomaren providerübergreifenden Kostenledger samt Radar-Systemactor vor
  dem Call reservieren,
- providerweiten Circuit-Breaker für Auth, Preis, Messung, `429`, Budget und
  Providerstörung; fachliche Kandidatenfehler bleiben checklokal,
- Pilot-Reset nur autorisiert und protokolliert nach Provider-Health-, Preis-,
  Kostenabgleichs- und Restbudgetbeleg; kein rein zeitgesteuerter Auto-Reset bei
  unbekanntem Zustand,
- keine Prompts/Interessen in Kostenlogs,
- alle Transportwege mocken.

### UI-Pfad

- „Dein Radar“ hinter ausgeschaltetem Featureflag,
- Abos, neue/geänderte Ereignisse und Receipts,
- getrennte Links zu Pins/Merkliste/Must-Watch,
- read-only Wochenprojektion nur für bestätigte tagesgenaue Ereignisse,
- bewusste idempotente Übernahme mit `event_id`, `event_version_id` und
  `reminder_id`; Terminänderung nur als sichtbares Updateangebot,
- ICS-Snapshot,
- kein automatischer Profilwrite.

### Pflichtreviews

- Scope,
- persönlicher Datenpfad/RLS,
- Kosten-/Providerpfad,
- Datenschutz/Logging,
- Accessibility/Mobile,
- alte Client-/Backend-Kompatibilität,
- Forward-Fix und Not-Aus.

### Phase-2-Ausgabe

| Gate | Ergebnis | Beleg | Offen |
|---|---|---|---|
| Daten/Backup/Restore |  |  |  |
| RLS/RPC/Concurrency |  |  |  |
| Scheduler/Wiederanlauf |  |  |  |
| Budget/Not-Aus |  |  |  |
| Evidence/Matching |  |  |  |
| UI/Woche/ICS |  |  |  |
| bestehende Regression |  |  |  |
| Rückweg |  |  |  |

Zeige zusätzlich die exakten Remote-Schritte in Reihenfolge, aber führe sie
nicht aus.

**Dann STOP und auf Freigabe warten.**

## 8. Phase 3 – Shared-Supabase-Grundlage, weiter ausgeschaltet

Nur nach ausdrücklicher Freigabe des exakten Zielprojekts und der exakten
Migrationen.

1. Remote-Fingerprint und Migrationsstand rücklesen.
2. Backup-/Rückwegbeleg prüfen.
3. Additive Basismigration einzeln anwenden; kein unqualifiziertes
   `supabase db push`.
4. `radar_aktiv=false` und Provider aus rücklesen.
5. Grants, RLS, Constraints, RPCs und alte Clientkompatibilität remote prüfen.
6. Max' `radar_unlimited`- und `radar_review`-Capabilities getrennt nur über
   einen vertraulichen service-only Weg setzen und getrennt rücklesen; keine
   UUID in Git oder Chat.
7. RLS-Tests ausschließlich mit Wegwerfkonten/-zeilen, Target-Fingerprint und
   nachgewiesenem Cleanup.
8. Keine Function-/Schedulerauslieferung und kein Providerrequest.

### Phase-3-Ausgabe

- angewandte Migrationen und Remote-Fingerprint,
- Feature-/Provider-Not-Aus,
- Capability-/Limitbeleg ohne Kontoidentität,
- RLS-/Grant-/Cleanup-Beleg,
- Produktionsclient-Kompatibilität,
- Rückweg beziehungsweise Forward-Fix.

**Dann STOP und auf Freigabe warten.**

## 9. Phase 4 – Provider-/Scheduler-Shadow-Mode

Vor dieser Phase braucht es zwei getrennte Freigaben:

1. Function/Worker/Scheduler-Deploy,
2. exakt begrenzte echte Providerprobe samt Budget.

### Zuerst ohne Geld

- Function-/Worker-Build deployen, aber Provider aus,
- Health/Buildversion und Autorisierung positiv/negativ prüfen,
- Scheduler gegen Fixtures und künstliche Targets laufen lassen,
- Lock, Checkpoint, Budgetstopp und Not-Aus remote belegen.

### Danach optionaler bezahlter Spike

Nur über den frisch genehmigten Einstiegspunkt:

- maximal 15 vorab gelistete anonyme `check_key`s mit vollständig
  festgelegten Ziel-/Region-/Scope-Varianten,
- seriell,
- exakt ein Search-Use je freigegebenem `check_key`,
- keine Retries,
- feste Request-/Laufzeitgrenzen,
- Vor-/Nachmessung des providerübergreifenden Budgets,
- sofortiger Stopp bei unbekanntem Verbrauch, Timeout oder Limit,
- Rohpayload nur flüchtig; zulässige Metadaten minimiert speichern.

Ergebnisse manuell gegen den gelabelten Korpus prüfen. Kein automatischer
Kalenderpfad im Shadow Mode.

### Go-Kriterien

- null falsche kalenderfähige Termine,
- alle Mehrdeutigkeiten, Konflikte und Artikeldaten blockiert,
- mindestens fünf vorab gelabelte echte Positivfälle im Korpus,
- mindestens 80 Prozent Wiederfindung dieser Positivfälle,
- mindestens 95 Prozent korrekte Werk-/Event-/Regionszuordnung unter allen
  hochgestuften Hinweisen,
- Eventupdates idempotent,
- Hash-/Revalidierungs-TTL erkennt Terminänderungen unter unveränderter URL,
- Providerfehler öffnet nachweislich den Circuit-Breaker und löst weder
  Folgerequest noch Sofort-Retry aus,
- Quellenzitate und Rechtepfad geklärt,
- gemessene Monatsprojektion unter Ownerdeckel,
- normales Testersegment wird durch Max' Liste nicht verdrängt.

Bei Nichterfüllung bleibt der Radar Hinweisgenerator mit manueller Bestätigung.

**Dann STOP und auf Freigabe warten.**

## 10. Phase 5 – Staging-UI und gestufter Pilot

Erst nach Shadow-Go:

1. Stagingfeature zunächst nur für Max aktivieren.
2. Vollständige lokale App-/Function-/RLS-/Mobile-Suite ausführen.
3. CI und exakte Staging-Buildmeta belegen.
4. Auf echtem iPhone/iPad/Android prüfen: Abo, Limit, Konto A/B, Logout,
   Offline, neue Hinweise, Terminänderung, Wochenprojektion, Übernahme, ICS.
5. Mindestens einen vollständigen Schedulerzyklus beobachten.
6. Kosten, Präzision, Fehler und Deferred-Queue berichten.

Danach eigener STOP vor:

- drei ausgewählten Testern,
- allen bis zu zehn Testern,
- Limit 15,
- `main`, Produktionsfrontend oder formaler 9c-Erweiterung.

**Dann STOP und auf Freigabe warten.**

## 11. Definition of Done

Der Auftrag ist erst erledigt, wenn:

1. private und globale Daten nachweislich getrennt sind,
2. im Kontomodus die serverseitige Subscription die einzige wirksame
   Aboautorität ist und Cache, Outbox, Quota-Ablehnung sowie Reconciliation
   ohne Datenverlust belegt sind,
3. gleiche `check_key`s aller Konten nur einmal fällig geprüft werden,
4. normale Konten serverseitig atomar auf zehn aktive allgemeine Webradar-
   Ziele begrenzt sind und Region-/Scopevarianten das Limit nicht umgehen,
5. Max fachlich unbegrenzt abonnieren kann, ohne Sicherheits-/Budgetbypass,
6. `radar_review` davon getrennt und jede manuelle Faktenfreigabe
   unveränderlich protokolliert ist,
7. alte Serienbeobachtungen nicht verloren, gekürzt, still umgedeutet oder
   ohne Opt-in gegen das neue Limit gezählt sind,
8. jeder Batch idempotent, gelockt, checkpointed und über Fehlmengen
   wiederaufnehmbar ist; Fencing-Token sperren verspätete Worker und alte
   Checkversionen werden atomar stillgelegt,
9. exakt ein bezahlter Search-Use je `check_key`-Prüfung technisch erzwungen
   ist,
10. bestehende Konto-KI und der Radar-Systemactor atomar gegen denselben
    providerübergreifenden Deckel reservieren und Istkosten abgleichen,
11. unbekannte Kosten oder systemische Providerfehler den gesamten Providerlauf
    fail-closed stoppen und nur nach autorisiertem, belegtem Reset fortsetzen,
12. LLM-Ausgaben strikt validiert sind und keine Bestätigungsautorität besitzen,
13. globale Radar-Targets und Events nicht direkt lesbar sind und der
    minimierte Feed nur Daten zu eigenen aktiven Abos ausliefert,
14. nur starke, regionsrichtige und taggenaue Ereignisse als Wochenvorschlag
    erscheinen,
15. eine bewusste Wochenübernahme genau einen mit Eventversion verknüpften
    One-off-Reminder erzeugt und eine neue Terminversion erst nach eigener
    Bestätigung als Update anbietet,
16. kein automatischer Profil- oder ungefragter Kalenderwrite stattfindet,
17. RLS-, Privacy-, Backup-/Restore-, Konto-Wechsel- und Löschtests grün sind,
18. volle App-, Function-, RLS-, Mobile-, CI- und Staging-Gates grün sind,
19. Feature-/Provider-Not-Aus und Rückweg praktisch belegt sind,
20. reale Monatsprojektion unter dem ausdrücklich freigegebenen Gesamtdeckel
    liegt,
21. Dokumentation Ist, Grenzen, Providerrechte, Betrieb und offene
    Produktionsentscheidung korrekt wiedergibt,
22. `main` und Produktionsfrontend ohne ausdrückliche Folgefreigabe
    unverändert geblieben sind.
