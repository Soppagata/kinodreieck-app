# Bauauftrag: Entdecken und den katalogübergreifenden Radar separat liefern

Stand der Auftragsplanung: 09.08.2026
Audit-Scope bis zur Baufreigabe: `FUTURE_PLAN_METADATA_ONLY`

> **Status: Übergabe für einen neuen Task – nicht ungeprüft ausführen.**
> Die Empfänger-Session beginnt zwingend mit Phase 0, verändert dort nichts und
> wartet danach auf Max' ausdrückliche Baufreigabe. Zielbranch ist ausschließlich
> `staging` beziehungsweise ein davon abgeleiteter `codex/`-Branch. `main`, das
> Produktionsfrontend und ein gemeinsam genutztes produktives Backend bleiben
> ohne eigenen späteren STOP unverändert.

**Auslieferungsgrenze:** keine Veröffentlichung. Der Pilot umfasst Max und
höchstens zehn weitere kuratierte Logins. Eine öffentliche Registrierung,
Indexierung oder Öffnung für weitere Nutzer ist nicht autorisiert und braucht
einen neuen Produkt-, Privacy-, Quellenrechte- und Betriebsauftrag.

## 1. Ausgangslage

Zum Planungszeitpunkt gilt:

- Rollen-v1/private Demo ist auf Staging-Commit `65a92df` abgeschlossen,
- `staging` und `origin/staging` stehen auf `65a92df`,
- Produktion/`main` steht auf `3898152`,
- die Radar-Regeln sind noch nicht gebaut,
- `docs/zukunft/` ist ungetrackte Planungsablage und gehört nicht in einen
  fremden Rollen-v1-Commit,
- der bisherige Zielblock gilt als vollständig erreicht.

Der per E-Mail gemeldete Fehler zu `fa225c1f` ist als historischer
Custom-Domain-Propagationsfehlalarm eingeordnet: In
[GitHub-Run #116](https://github.com/Soppagata/kinodreieck-app/actions/runs/31282899404)
waren Tests, Build, Wrangler-Deploy und die atomare Deployment-URL grün; nur
`staging.kinodreieck.at` lieferte beim Smoke noch kurz den vorherigen Build
`289abff`. Commit `bf82304` verlängerte genau dieses Wartefenster. Run
[#117](https://github.com/Soppagata/kinodreieck-app/actions/runs/31283519387)
und der aktuelle Run
[#120](https://github.com/Soppagata/kinodreieck-app/actions/runs/31318268618)
für `65a92df` sind vollständig grün; die feste Staging-Domain lieferte beim
Read-only-Gegencheck `65a92df`. Deshalb kein Rerun und kein Deploy-Fix aus
diesem Auftrag. Phase 0 prüft den dann aktuellen Stand erneut und stoppt nur
bei neuer Abweichung.

Diese Hashes sind Referenzen, keine spätere Ausführungsautorität. Belege den
tatsächlichen Stand neu.

Lies vor jeder Änderung vollständig:

- `AGENTS.md`,
- `docs/zukunft/README.md`,
- `docs/zukunft/ENTDECKEN_RADAR_EMPFEHLUNGEN_PLAN.md`,
- `docs/zukunft/RADAR_BEOBACHTUNGEN_PLAN.md`,
- `docs/zukunft/DISCOVERY_TARGETS_SKIZZE.md`,
- `docs/zukunft/ENTSCHEIDUNGSLOG.md`,
- die aktuellen Rollen-, Betrieb-, Roadmap-, Supabase-, Function- und
  Schedulerdokumente, die in Phase 0 im Repository gefunden werden.

## 2. Ziel

Liefere den katalogübergreifenden aktiven Radar als **eigenständigen
Funktionsblock** und integriere ihn danach unter der sichtbaren Oberfläche
**Entdecken**, ohne die bestehenden Domänen zu vermischen:

1. `Beobachtet` bleibt der private, kostenlose katalogbasierte Status aus
   `kd_series_watch`.
2. `Im Radar` wird das persönliche kostenfähige Abo auf aktive Suche. Werke,
   Serien und Franchises nutzen Event-Ziele; Personen aus Schauspiel und Regie
   stehen direkt in **Mein Radar**, bleiben intern aber eine getrennte
   Discovery-Schicht ohne eigene Eventtypen.
3. Die globale Suche bietet für kataloggestützte Titel **Beobachten** und **Ins
   Radar** als getrennte Aktionen; Personen bieten ausschließlich **Ins Radar**.
4. Gleiche globale Radarziele und Checks werden über Konten hinweg dedupliziert;
   persönliche Subscription, Receipt und Share bleiben getrennt.
5. Ein Radar-Abo ist privat als Default und kann per nicht vorangekreuzter
   Checkbox ohne angezeigte Identität für andere aktive Konten freigegeben
   werden.
6. Andere Konten können ein freigegebenes Ziel mit **In mein Radar** selbst
   abonnieren; normales Limit und Kostenvertrag gelten unverändert.
7. Der bestehende sichtbare Menüpunkt `Blog` wird zu `Entdecken`; sein
   technischer Key `blog` bleibt zunächst kompatibel. Interne Ansichten sind
   `Empfehlungen | Radar | Meinungen`.
8. Empfehlungen werden rein deterministisch aus bestätigtem Geschmacksprofil,
   ausdrücklich bewerteter Mediathek und vorhandenen freigegebenen
   Katalogkandidaten gereiht. Sie rufen keine KI-/Suchquelle auf und schreiben
   nichts ins Profil zurück.
9. Popularitätsquellen werden nur als abgeschaltete Adapterverträge und
   synthetische Fixtures vorbereitet. Keine echte Chart-Ingestion, solange die
   jeweilige schriftliche Rechtefreigabe fehlt.

Der Radar muss auch dann vollständig funktionieren, wenn Empfehlungen oder
Charts per Featureflag aus sind. Rollen-v1 darf keinen Radar-Code erhalten.

## 3. Nicht-Ziele

- keine Änderung an `main`,
- keine Produktion oder gemeinsam genutzte Remote-Ressource ohne exakten STOP,
- keine nachträgliche Radarsemantik in `kd_account_access`, `role=owner` oder
  Rollen-v1,
- kein Umbau von `kd_series_watch` zum Webradar und kein stilles Dual-Write,
- kein Teilen von `Beobachtet`,
- keine automatische Geschmackspräferenz aus Beobachtung, Radar, Community,
  Charts, Klicks oder Blogtexten,
- kein LLM im Empfehlungsranking,
- kein gemeinsamer Tabellen-/RPC-Pfad für Blogs und Radar-Shares,
- keine öffentliche Veröffentlichung oder Erweiterung über den kuratierten
  Elf-Konten-Piloten,
- kein HTML-Scraping von Netflix, FlixPatrol oder ÖFI,
- keine bezahlte FlixPatrol-, Tavily-, Search- oder KI-Probe ohne eigenen
  Kosten-STOP,
- höchstens eine neue bezahlte Chartquelle im MVP; kein zweiter Anbieter nur
  zur Erzeugung einer scheinbaren Konsensrangliste,
- kein automatischer Kalenderwrite, Push oder E-Mail,
- keine Buch-, Videospiel-, Studio-, Theaterstück-, Kompositions- oder
  Drehbuch-Discovery im ersten Bau,
- kein `person` als vierter Event-Zieltyp, kein Personen-Event „neues Projekt"
  und kein automatischer Werk-Fan-out,
- keine generische Web-/LLM-Suche je Person ohne eigenen späteren
  Quellen-/Qualitäts-/Kosten-STOP,
- kein Verschweigen blockierter Quellen hinter Demo-Fixtures.

## 4. Harte Verträge

### 4.1 Status

- UI-Wort `Beobachtet` ausschließlich für den bestehenden kostenlosen Status.
- UI-Wort `Im Radar` ausschließlich für aktive Websuche.
- Bestehende beobachtete IDs werden nie automatisch zu Radar-Abos.
- Ein bewusster späterer Übernahmedialog braucht Vorschau, Quota und
  wiederaufnehmbaren Vertrag; er ist nicht Teil des ersten Builds.

### 4.1.1 Globale Suche

- Titel/Serie mit gültigem bestehendem Katalogvertrag: getrennte Aktionen
  **Beobachten** und **Ins Radar**.
- Person mit stabiler ID und belegter Rolle `Schauspiel` oder `Regie`:
  ausschließlich **Ins Radar**.
- Jede Radar-Aktion zeigt erst Vorschau, Typ beziehungsweise Rolle, Quota,
  private-default Share-Checkbox und Mehrdeutigkeit; Schreiben erst nach
  Bestätigung.
- Mehrdeutige oder nicht kanonisch aufgelöste Ergebnisse schreiben nichts.
- Kein Radar-Write setzt `Beobachtet`; kein Beobachtet-Write erzeugt
  Subscription, Share, Providerjob oder Geschmackssignal.

### 4.2 Radar-Daten

- globale `targets`, `checks`, `events`, `event_versions`, `evidence`, `runs`,
  `sources` service-only beziehungsweise über minimierte RPC,
- persönliche Event-`subscriptions`, `receipts` und `shares` mit RLS,
- getrennte globale Personen-Discovery-Targets und Werk-Kandidaten sowie
  persönliche Discovery-Subscriptions/-Receipts/-Shares mit RLS,
- Konto-Subscription ist im Kontomodus die einzige Hintergrund-Aboautorität,
- `target_status` und `subscription_status` getrennt,
- normales Limit zunächst zehn aktive Radar-Einträge insgesamt: Event-Zielabo
  oder Personen-Discovery-Abo; bloße Werk-Kandidaten zählen nicht, ein einzeln
  bestätigtes Werk-Abo zählt als weiterer Eintrag,
- eigene fail-closed Capabilities für `radar_unlimited` und `radar_review`;
  niemals `owner` semantisch überladen,
- ein fälliger `check_key = target + region + scope + query/provider version`
  wird global höchstens einmal geprüft.

### 4.2.1 Personen direkt im Radar, intern separat

- kanonische Identität `(person_external_id, role)`; erste Rollen ausschließlich
  `actor|director`,
- nach Bestätigung sofort sichtbare Zeile in **Mein Radar**,
- kein Eintrag in `kd_radar_targets`, keine `kd_radar_events`, keine
  Eventversion und kein Kalenderschreibpfad für die Person selbst,
- strukturierte, erlaubte Discovery-Quelle darf global dedupliziert neue
  Werk-Kandidaten vorschlagen,
- jeder Kandidat bleibt kostenneutral und inaktiv, bis der Nutzer einzeln
  **Werk ins Radar** bestätigt,
- keine Sammelbestätigung, kein stiller transitiver Subscribe und kein
  eigener Personen-Kostenledger oder Retrypfad,
- wenn der Pflichtspike keine ausreichende angekündigte Projektabdeckung zeigt,
  bleibt der Personenpfad hinter eigenem Featureflag aus; der Event-Radar wird
  davon nicht blockiert.

### 4.3 Freigabe im kuratierten Kreis

- eigene Tabelle `kd_radar_target_shares` oder fachlich gleichwertig,
- für Personen eine getrennte `kd_radar_discovery_shares`-Projektion oder
  fachlich gleichwertig; keine polymorphe Social-/Blogtabelle,
- private-default, expliziter Opt-in und jederzeitiger Widerruf,
- Beenden des eigenen Abos widerruft den eigenen Share,
- Direct SELECT aus dem Browser verboten,
- Feed-RPC nur für Max und die höchstens zehn weiteren aktiven kuratierten
  Konten; sie liefert nur Ziel-ID, Titel, Typ, sicheres Jahr, erlaubtes Artwork
  und optional ein bereits freigegebenes globales Ereignis,
- niemals Account/Autor, Share-ID, Zeitpunkt, Subscriberzahl, Query,
  Notiz, Receipt oder privaten Status liefern,
- UI sagt „ohne Namen“, nicht „garantiert anonym“,
- Freigabe erzeugt keinen zusätzlichen Providercheck,
- ein fremdes Übernehmen erzeugt ein eigenes privates Abo; Share bleibt aus.
- keine öffentliche Route, kein anonymer Zugriff und keine Indexierung; eine
  spätere Öffnung ist ein neuer STOP.

### 4.4 Empfehlungen

- Primärsignale: bestätigtes `kd:geschmacksprofil`,
- positive Mediatheksevidenz nur bei vollständiger Bewertung mit Achsensumme
  mindestens `10/15`,
- unbewerteter Besitz liefert kein Genresignal,
- mindestens drei eindeutig derselben Franchise zugeordnete Titel dürfen nur
  als schwacher letzter inhaltlicher Gleichstandsbrecher wirken,
- Nutzer kann die Mediatheksprojektion deaktivieren,
- keine Profilmutation und keine Rankingtelemetrie,
- Rankingreihenfolge und Erklärgründe exakt wie im Entdecken-Plan,
- Charts sind Kandidatenquelle und höchstens source-interner letzter
  Gleichstandsbrecher, niemals Geschmack oder Qualität.

### 4.5 „Neu“, Remake und Kult

- Streaming-/Kinokandidat ab heute bis +90 Tage,
- seit höchstens sieben Tagen verfügbar als `Seit kurzem verfügbar`,
- älteres Werk auf neuem Dienst als `Neu auf <Dienst>`, nicht „neuer Film“,
- Remake-Label nur bei starker `remake_of`-Beziehung,
- Kult-/Retrovorstellung nur mit echter kommenden Kinovorstellung und Passung
  im getrennten Block `Kult & wieder im Kino`.

### 4.6 Quellen und Kosten

- FlixPatrol Start ist die bevorzugte und einzige neue Streaming-Chartquelle:
  kein HTML-Scraping, kein Plus/Premium/Enterprise, maximal 25 Requests pro
  Monat und API erst nach schriftlichem Cache-/Anzeigerecht für elf
  authentifizierte Nutzer, Owner-Kauf- und Kostenfreigabe.
- Der Chart-Unterdeckel ist höchstens 15 Euro pro Monat einschließlich Steuer
  und Wechselkurspuffer und bleibt innerhalb des providerübergreifenden
  Zielkorridors von ungefähr 20 Euro. Reicht dieser neben Radar/KI nicht,
  bleiben Charts aus; kein stilles Erhöhen.
- Watchmode wird nur als bereits vorhandener Kontrollbeleg für starke IDs und
  `AT`-Dienstverfügbarkeit verwendet: keine Popularity als Rang, keine Bilder,
  Attribution und höchstens 30 Tage Cache. Phase 0 belegt die dann aktuellen
  Terms und die verbleibende Quota neu.
- Netflix Top-10-TSV und offizielle Plattformansichten: technische Fixtures
  beziehungsweise manuelle QA erlaubt; kein automatischer Produktionsabruf
  oder Weiteranzeige ohne schriftliche Freigabe.
- ÖFI-/Comscore-Charts: echter Abruf bis schriftlicher Freigabe für
  Automatisierung, Speicherung, Anzeige, Attribution und Comscore-Werte
  blockiert. Ziel ist ein vom ÖFI bereitgestellter Wochenfeed zu 0 Euro;
  direkter Comscore-Zugang ist kein zusätzlicher MVP-Anbieter.
- JustWatch ist ausschließlich ein möglicher Ersatz für FlixPatrol, niemals
  eine parallele Rangquelle. Bei Nutzung muss die UI ehrlich JustWatch-
  Nutzeraktivität statt Dienst-Top-10 oder Sehquote benennen.
- Tavily wird für Entdecken/Empfehlungen/Charts nicht benötigt und bleibt für
  den aktiven Radar separat geparkt.
- Eine von Max ein- bis zweimal wöchentlich über den persönlichen Codex- oder
  Claude-Zugang gestartete Routine ist höchstens eine **optionale
  Einlesehilfe** für bereits erlaubte Dateien/Abrufe: LLM erzeugt begrenzte
  `proposal.json`, deterministischer Validator und unabhängiger Gegencheck
  entscheiden, fixer Importer schreibt erst nach Vorschau. Kein Service-Role-
  Key, kein direkter DB-Zugriff, kein LLM-Matching, kein Rechteersatz und kein
  unbeaufsichtigter Produktions-SLA.
- Ein LLM darf keine gesperrte Chartseite „auf eigene Verantwortung" scrapen.
  Unklare Quelle, Lizenz, Payload, Accountkosten oder Wiederanlaufslage stoppt
  vor jedem Write; kein automatischer Vollretry.
- Unter den aktuellen `AGENTS.md`-Regeln reale KI-/Providerläufe nur über die
  dort erlaubten budgetgeschützten Einstiegspunkte; bei `AUTONOMIE_STOPP`, Exit
  75 oder `BUDGET_UNBEKANNT` sofortiger Gesamtstopp.

## 5. Phase 0 – aktueller Audit, nur lesen

Keine Dateien ändern, keine Branchänderung, keine Remote-Writes, kein Deploy,
kein echter Quellen- oder Providerrequest.

### 5.1 Lieferstand

- `git status --short --branch`, Branchgraph, HEAD, `origin/staging`, `main`,
  Ahead/Behind und fremde Änderungen belegen,
- aktuelles CI, Staging- und Produktions-Buildmeta getrennt belegen,
- den historischen Run-#116-Propagationsfehler von einem aktuellen
  Auslieferungsfehler unterscheiden; solange Staging nicht exakt den
  beauftragten Build liefert, kein Radar-Bau und kein blindes Rerun,
- `docs/zukunft/` als ungetrackte Nutzerplanung schützen,
- gemeinsam genutzte Supabase-/Function-Wirkung ausdrücklich kennzeichnen.

### 5.2 Architektur

- `App.jsx`, Navigation, Blogroute/-service, Profil, Mediathek,
  PersonalDataRegistry, Backup/Restore und Account-Driver inventarisieren,
- `kd_series_watch` und `seriesWatchService` inklusive kostenloser
  Katalogzuordnung belegen,
- globale Suche, Resultattypen, vorhandene Personen-IDs/Rollen sowie den
  bestehenden Wikidata-/Katalogauflöser für Schauspiel und Regie belegen,
- Rollen-v1, Capability-Projektion, RLS, Grants und Remote-Schema inventarisieren,
- Scheduler-/Streamingjob und Provider-/Kostenledger empirisch belegen,
- exakt geplante Dateien, Migrationen, RPCs, Flags, Tests und Rückweg nennen.

### 5.3 Vertragstabellen

Vor jeder Umsetzung diese Tabellen ausfüllen:

| Domäne | Autorität | privat/global | Browser-Read | Write-Weg | Löschung |
|---|---|---|---|---|---|
| Beobachtet |  |  |  |  |  |
| Radar-Subscription |  |  |  |  |  |
| Radar-Target/Event |  |  |  |  |  |
| Personen-Discovery-Subscription/Kandidat |  |  |  |  |  |
| Radar-Share im kuratierten Kreis |  |  |  |  |  |
| Empfehlung |  |  |  |  |  |
| Blog/Meinung |  |  |  |  |  |
| Popularity |  |  |  |  |  |

| Quelle/Provider | Rechte | Payload belegt | Preis/Quota | Speicherung/Anzeige | Status |
|---|---|---|---|---|---|
| Radar-Suche |  |  |  |  |  |
| Personenauflösung/-Discovery |  |  |  |  | `SPIKE_REQUIRED` erwartet |
| Netflix Top 10 / offizielle Plattformansichten |  |  | kostenlos/manuelle QA |  | `MANUAL_QA_ONLY` erwartet |
| FlixPatrol |  |  |  |  | `BLOCKED` erwartet |
| Watchmode-Kontrolle |  |  |  |  | `RE_AUDIT` erwartet |
| JustWatch-Ersatzoption |  |  |  |  | `PARKED` erwartet |
| ÖFI/Comscore |  |  |  |  | `BLOCKED` erwartet |
| optionale Codex-/Claude-Einlesehilfe | persönlicher Operatorweg, kein Rechteersatz | Proposal-Schema noch zu belegen | kein potenziell zahlender Lauf ohne STOP | kein DB-Direktzugriff | `OPTIONAL` erwartet |

### 5.4 Phase-0-Ausgabe

Berichte:

1. verifizierte Baseline und Arbeitsgrenze,
2. Unterschiede zum Zukunftsplan,
3. finaler Status-/Daten-/RLS-/UI-Vertrag,
4. empfohlene Phasengröße für den ersten Bau,
5. Kosten-Worst-Case und konkreter Not-Aus,
6. konkrete Tests und Staging-Abnahme,
7. alle noch nötigen Owner-/Rechteentscheidungen.

Zusätzlich für Personen: lege vor dem Bau anhand vorhandener lokaler Daten die
Testnamen (mindestens Nicolas Cage und Robert Rodriguez), eindeutige IDs,
Rollen, erwartete Kandidaten und den geplanten Featureflag-/Fallbackpfad fest.
Ein echter externer Payloadabruf gehört nicht in die read-only Phase 0.

**Dann STOP und auf Max' ausdrückliche Baufreigabe warten.**

## 6. Phase 1 – Verträge, reine Logik und Fixtures

Erst nach Freigabe. Keine Remote-Writes, Deployments oder echten Providercalls.

- Statusvokabular und Validatoren,
- kanonische Target-/Event-/Share-Typen,
- getrennte Suchaktions-Contracts `watch` und `radar`,
- Personen-Discovery-Typen `(person_id, actor|director)`, Kandidatenzustände
  und ausschließlich synthetische beziehungsweise vorhandene lokale Fixtures,
- serverseitig spiegelbare Quota-/Capabilitylogik,
- deterministic recommendation ranking inklusive Gründe,
- Neu-/Remake-/Kult-Klassifikation,
- Popularity-Adapterinterface ausschließlich mit synthetischen Fixtures,
- Matchzustände `matched|unmatched|ambiguous|blocked`,
- Tests für keinerlei Profilwrite und keinerlei Beobachtet-/Radarvermischung.

Vollständige relevante Mock-Tests und `git diff --check`; danach **STOP**.

### 6.1 Pflichtspike für Personen-Discovery

Vor Datenbank- oder UI-Bau des Personenpfads wird die tragende Annahme isoliert
belegt. Nutze eine rechtlich und technisch geprüfte strukturierte Quelle und
mindestens Nicolas Cage sowie Robert Rodriguez plus wenige Gegenbeispiele:

- stabile Personen-ID und richtige Rolle,
- Abdeckung tatsächlich angekündigter kommender Projekte,
- stabile Werk-IDs und Aktualitätsverzug,
- Mehrdeutigkeitsquote und Kandidatenmenge,
- Request-/Quota-/Cache-/Attributionsvertrag.

Kein Produktwrite, kein generisches Webscraping und kein bezahlter Aufruf ohne
eigenen STOP. Ergebnis, Rohpayloadschema, Messwerte und Kostenprojektion
vorlegen; danach **STOP**. Trägt die Quelle nicht, darf die Session weder eine
andere Quelle noch ein LLM hineinraten. Sie fragt Max, ob Quelle/Scope geändert
oder der Personenblock geparkt wird. Der übrige Radar kann weitergebaut, der
Gesamtauftrag aber nicht als vollständig erfüllt bezeichnet werden.

## 7. Phase 2 – lokaler Radar-Kern hinter Not-Aus

- additive lokale Migrationen/Typen/RPC-Verträge vorbereiten,
- Subscription, globale Deduplizierung, Receipts und Share separat,
- Personen-Automatik nach dem `NO_GO` aus §6.1 vollständig geparkt lassen;
  keine Discovery-Migration, kein Discovery-RPC und keine Aktivierung über Env,
- Limit/Concurrency/RLS negativ und positiv testen,
- Provider und Scheduler standardmäßig aus,
- bestehende `kd_series_watch`-Daten und -UI unverändert beweisen,
- kein Rollen-v1- oder Shared-Article-Schema anfassen,
- Backup-/Restore-/Accountwechsel-/Logout-/Offlinepfade vollständig planen und
  testen.

Keine Remote-Anwendung. Exakte Remote-Schritte und Rückweg zeigen; **STOP**.

## 8. Phase 3 – Entdecken-Oberfläche und Empfehlungen lokal

- sichtbares Label `Entdecken`, technischer Key `blog` kompatibel,
- interne Ansichten `Empfehlungen | Radar | Meinungen`,
- bestehende Blog-Daten/Links unverändert,
- Zahnrad `Entdecken verwalten`: Desktop-Dialog, mobiles Full-Sheet,
- globale Suche: Titel/Serie mit getrennten Aktionen **Beobachten** und **Ins
  Radar**; Personen aus Schauspiel/Regie direkt **Ins Radar** mit Vorschau,
- Beobachtet nur privat verwalten; Radar inklusive Share; Profil/Mediathek-
  Projektion transparent verwalten; Meinungen öffnen,
- Kreis-Feed und Quellenlisten zunächst aus Fixtures,
- reale Chartadapter deaktiviert und Blockgrund sichtbar dokumentiert,
- Desktop plus echte iPhone-Viewports, Fokus, Escape/Zurück, Scroll-Lock,
  Overflow und gefüllte Zustände testen.

Danach vollständige App-/Mobile-/Privacy-Regression; **STOP**.

## 9. Phase 4 – Remote-Grundlage, weiter Provider aus

Nur nach Freigabe des exakten Staging-/Supabase-Ziels:

- additive Migration/RLS/RPC anwenden,
- alte Produktionsclients gegen das additive Schema prüfen,
- Konto A/B: eigene Subscription/Receipt, fremder privater Share unsichtbar,
  im kuratierten Kreis freigegebener Share identity-hidden sichtbar,
- Konto A/B für Personen: eigenes Discovery-Abo, fremdes privates Abo
  unsichtbar, explizit freigegebene Personenprojektion ohne Identität sichtbar,
  Kandidat erzeugt vor Einzelbestätigung weder Werk-Abo noch Providerjob,
- Revoke, Accountlöschung, Aboende, Quota und Concurrent Subscribe beweisen,
- Function-/Scheduler-/Radarprovider bleiben aus.

Remote-Beleg und Rückweg berichten; **STOP**.

## 10. Phase 5 – Radar-Shadow und Staging

Folge dem ausführlichen Evidenz-, Matching-, Scheduler- und Kostenvertrag aus
`RADAR_BEOBACHTUNGEN_PLAN.md`. Function/Scheduler-Deploy und jede bezahlte Probe
benötigen getrennte Freigaben. Serial, keine Retries, harte Request-/Laufcaps,
Vor-/Nachmessung, providerweiter Circuit-Breaker und sofortiger Stopp bei
unklarem Verbrauch.

Nach Shadow-Go:

- Entdecken/Radar zunächst nur für Max auf `staging`,
- kompletter Schedulerzyklus,
- Konto A/B, Community-Übernahme, Titel- und Personenlimit, Personenauflösung,
  Einzelübernahme eines Werk-Kandidaten, Pause, Revoke, Logout, Offline,
  Ereignisänderung und Rückweg,
- vollständige App-, Function-, RLS-, Mobile- und CI-Suite,
- exakte Staging-Buildmeta und realer Kostenbericht.

**STOP vor weiteren Testern, jeder Chartquelle, `main` oder Produktion.**

## 11. Phase 6 – Popularity je Quelle, optional und unabhängig

Eine Quelle darf erst beginnen, wenn schriftlich belegt sind:

- automatisierter Abruf,
- erlaubte Felder,
- Speicherung/Aufbewahrung,
- Anzeige gegenüber dem vorgesehenen kuratierten Elf-Konten-Publikum,
- Attribution und Bildrechte,
- bei ÖFI zusätzlich die Comscore-Unterlizenz,
- bei FlixPatrol zusätzlich Start-Tarif, 1.000er-Quota, maximal 25 geplante
  Requests pro Monat und technisch erzwungener 15-Euro-Unterdeckel innerhalb
  des Gesamtbudgets.

Danach zuerst isolierter Payload-Spike ohne Produktcode, dann neuer STOP. Der
Spike muss starke IDs, Region, Dienst, Charttyp, Zeitraum und Rang an einem
echten Payload belegen. Vier Wochen Shadow vergleichen wöchentlich eine kleine,
gleich datierte Stichprobe manuell mit den offiziellen Plattformansichten;
danach höchstens zehn Positionen monatlich. Null falsche Titelverbindungen,
kein sichtbares unaufgelöstes Item sowie keine personalisierte Karte ohne
bestätigte `AT`-Verfügbarkeit sind harte Abnahmegates. Der letzte bestätigte
Streamingstand wird nach acht Tagen ausgeblendet, nicht durch ein Ersatzranking
verlängert.

Blockierte Charts verhindern nicht die Abnahme des Radars.

## 12. Definition of Done

Der freigegebene Kern ist erst fertig, wenn:

1. `Beobachtet` privat, kostenlos und technisch unverändert bleibt,
2. die globale Suche für unterstützte Titel **Beobachten** und **Ins Radar**
   über getrennte Services anbietet und Personen nur **Ins Radar** erhalten,
3. Schauspiel-/Regiepersonen nach eindeutiger Vorschau direkt in **Mein
   Radar** stehen, intern aber getrennte Discovery-Subscriptions ohne eigene
   Events bleiben,
4. ein Personenkandidat erst nach einzelner Bestätigung ein reguläres Werk-Abo
   und damit einen kostenfähigen Check erzeugt,
5. Radar-Subscription, globales Ziel/Ereignis, Receipt und Share getrennt
   und RLS-geprüft sind,
6. Personen-Discovery-Target/-Kandidat/-Subscription/-Share auch vom Event-
   Radar und vom Blogpfad getrennt und RLS-geprüft sind,
7. gleiche Check-Keys nur einmal fällig werden und normale Konten atomar auf
   zehn aktive Radar-Einträge einschließlich Personen-Abos begrenzt sind,
8. Max' Fachcapability keine Privacy-, Review-, Request- oder Kostenbarriere
   umgeht,
9. Share private-default, widerrufbar, identity-hidden und ohne Mehrkosten ist,
10. Community-Übernahme ein eigenes privates Abo unter normalem Limit erzeugt,
11. Entdecken Blogs nur visuell bündelt und bestehende Blog-/Deep-Link-Verträge
   grün bleiben,
12. Empfehlungen deterministisch, erklärbar, abschaltbar und ohne Profilwrite
   sind,
13. Beobachtet, Radar, Personen-Abos, Kreis-Freigaben, Charts und Klicks keine
    stillen Geschmackssignale werden,
14. Neu-/Remake-/Kultlabels nur mit den vereinbarten Datenbelegen erscheinen,
15. blockierte Chartquellen weder abgerufen noch als live behauptet werden,
16. höchstens eine neue bezahlte Chartquelle aktiv ist, ihr Kostenzaun
    technisch greift und jeder angezeigte Charttitel source-genau beschriftet,
    stark aufgelöst und für `AT` kontrolliert ist,
17. eine optionale Codex-/Claude-Einlesehilfe nur Vorschläge aus erlaubten
    Inputs erzeugt, nie Datenbank-/Service-Role-Zugang erhält und vollständig
    ausfallen kann, ohne den Produktkern zu stoppen,
18. Provider-/Feature-Not-Aus und Forward-Fix/Rückweg praktisch belegt sind,
19. vollständige lokale, RLS-, Function-, Mobile-, CI- und Staging-Gates grün
    sind,
20. der Funktionsblock auf `staging` praktisch abgenommen wurde,
21. `main`, Produktionsfrontend und nicht freigegebene Remote-Ressourcen
    unverändert geblieben sind.

## 13. Stand und Roadmap nach der Radar-Abnahme

Nach grüner praktischer Staging-Abnahme ist **dieser Entdecken-/Radar-
Funktionsblock** fertig. Das bedeutet nicht, dass Gesamtprodukt, formale Beta
oder öffentlicher Start fertig sind.

- Rollen-v1/private Demo wird nicht noch einmal gebaut. Neue fachliche Rechte
  bleiben separate Capabilities; `owner` erhält keine Radarsemantik. Ein echtes
  Rollen-v2 wäre ein neuer Auftrag.
- Radar-spezifischer Datenschutz ist Teil dieser Definition of Done und darf
  nicht auf Etappe 10 verschoben werden: private-default, RLS, Share-Widerruf,
  Export/Löschung der Radar-Personaldaten, Retention und keine stillen
  Geschmackssignale.
- Danach zuerst die realen Android-/iOS-PWA-Installationen aus Etappe 9a
  schließen.
- Danach die drei offenen 9b-Praxisproben: Backup + zweites Gerät + Restore +
  Undo, Supabase-/Anbieterausfall-Trockenlauf und Function-Rollback.
- Vor einer formalen 9c entscheiden, ob Filmscan und Bloganalyse dauerhaft
  Backlog bleiben oder wieder Beta-Gates werden.
- Falls Max die formale 9c starten möchte: eigene Kohorte und vollständige
  Konto-, Geräte-, Offline-, Kosten-, Backup-, Lösch- und Isolationstests.
- Danach Etappe 10 für den gesamten realen Datenfluss: Datenschutzerklärung,
  KI-Transparenz, Aufbewahrung, Auftragsverarbeiter/Drittlandtransfer,
  Selbstexport/-löschung, Monitoring und Support.
- Weil keine Veröffentlichung geplant ist, bleibt der öffentliche Startteil
  von Etappe 10 geparkt; dies lockert weder den Datenschutz der elf privaten
  Konten noch Quellenrechte.

Hinweis zur Doku-Drift: `ROADMAP_TO_ONLINE.md` § „Sofort nächste
Arbeitspakete“, `ETAPPE_9_PLAN.md` am alten Folgeschritt und der Rollen-
Ausgangspunkt in `ETAPPE_9C_BETA.md` nennen teils noch Rollen-v1 beziehungsweise
`289abff` als Zukunft. Für diesen Bau ist das nach `65a92df` historisch; nicht
als Anlass nehmen, Rollen-v1 erneut zu implementieren. Die Roadmap-Dokumente
werden erst in einem eigenen freigegebenen Dokumentationsschritt bereinigt.
