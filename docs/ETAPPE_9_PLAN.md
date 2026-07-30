# Etappe 9: Distribution, Betriebsminimum und geschlossene Beta

Stand: 30.07.2026

Status: Technischer Release von 9a und die ausführbaren 9b-Gates sind
produktiv grün; 9c ist vorbereitet und wartet auf reale Geräte und Kohorte

Ausgangspunkt: Etappe 8 vollständig abgenommen, Commit `d4876f2`

Modellentscheidung Max, 30.07.2026: Sämtliche Bau-, Prüf- und
Koordinationsaufgaben der Etappe 9 laufen mit **GPT-5.6 Sol**. Es gibt keine
Aufteilung auf Spark oder andere schnellere Modelle.

## Zweck

Dieses Dokument macht aus den drei eigenständigen Roadmap-Etappen 9a, 9b und
9c einen ausführbaren, bewusst kleinen Bau- und Abnahmeplan.

Die Leitentscheidung lautet:

> Etappe 9 baut keine neue Plattform. Sie macht den vorhandenen Weg
> verständlich, beweist die vorhandenen Rückwege praktisch und öffnet ihn
> anschließend kontrolliert für vier bis fünf bekannte Tester.

## Arbeitsstand 9a

Am 30.07.2026 wurde auf `codex/etappe-9a-distribution` der erste kleine
Bauabschnitt umgesetzt:

- `/download/` ist eine öffentliche Seite zum Ausprobieren und Installieren,
- Demo und leerer Start verwenden nur `?start=demo` beziehungsweise
  `?start=clean` und niemals den löschenden `fresh`-Auftrag,
- Android erhält einen PWA-Installationsknopf mit ehrlichem Browser-Fallback,
- iPhone und iPad erhalten die kurze Safari-Anleitung,
- die Einzeldatei bleibt die zusätzliche Desktop-/Offline-Option,
- Live-KI wird ausschließlich für eingeladene Konten angekündigt,
- die Distributionsseite eröffnet selbst keinen KI- oder Fremdtransport,
- nur die herunterladbare Einzeldatei bleibt `noindex`.

Der vollständige normale Testlauf ist grün; der neue Distributionstest enthält
11/11 und der Hosting-Build 48/48 grüne Prüfungen. Dabei lief kein echter oder
kostenpflichtiger KI-Aufruf.

Noch nicht als 9a abgenommen sind:

- eine praktische Installation auf Android und iPhone/iPad,
- die endgültige Freigabe der verwendeten Demo-Inhalte,
- Staging- und Produktions-Domain-Smokes,
- der Produktionsdeploy.

Die bestehende Architektur bleibt:

```text
kinodreieck.at
    |
    +-- Cloudflare Pages
    |       +-- React-PWA an /
    |       +-- Installations- und Downloadseite an /download/
    |       +-- Single-File-Download
    |
    +-- Supabase
            +-- Auth und kontogebundener Speicher mit RLS
            +-- öffentlicher Demo- und angemeldeter Live-Katalog
            +-- ai-task Edge Function
            +-- Kostenlimits, Not-Aus und Diagnoseprotokoll
```

Kein Cloudflare Worker, kein zweites Frontend, keine neue Datenbank und kein
App-Store-Projekt werden für Etappe 9 benötigt.

## Verbindliche Trennung

9a, 9b und 9c sind drei eigenständige Etappen und werden getrennt abgenommen:

1. **9a — Distribution und Landingpage:** Menschen können Kinodreieck
   kostenfrei ausprobieren und installieren.
2. **9b — Betriebsminimum:** Backup, Restore, Abschaltung, Rollback und
   Datenlöschung wurden praktisch und reversibel belegt.
3. **9c — geschlossene Beta:** Eine einzige kleine Freundeskreis-Kohorte prüft
   den vollständigen Produktpfad.

9a darf vorbereitet werden, während Etappe 8 fertig wird. 9c beginnt jedoch
erst nach dem vollständigen Etappe-8-Beta-Tor.

## Bestandsaufnahme am 30.07.2026

### Repository

- Der abgenommene Etappe-8-Ausgangspunkt ist Commit `d4876f2`.
- Etappe 9a arbeitet getrennt auf `codex/etappe-9a-distribution`.
- PWA, Manifest, Service Worker, Online-Build, Single-File-Build,
  `/download/`, Sicherheitsheader und Remote-Smoke existieren bereits.
- `npm test` und `npm run test:function` verwenden Mocks und laufen in GitHub
  Actions vor Deployments.
- Live-KI-Tests bleiben ausschließlich den budgetgeschützten Befehlen aus
  `AGENTS.md` vorbehalten.

### GitHub

- Die jüngsten sichtbaren Deploy- und Keep-alive-Läufe sind grün.
- `staging` und `production` besitzen jeweils zwei Secrets und fünf öffentliche
  Variablen.
- In `production` ist **Required reviewers** derzeit nicht aktiviert.
- Für `production` gilt in GitHub derzeit **No restriction** bei
  Deployment-Branches und -Tags.
- Das zusätzliche Environment `preview` besitzt derzeit keine sichtbare
  Konfiguration.

Folge für 9b: Vor dem ersten Etappe-9-Produktionsdeploy wird ein
Produktions-Reviewer aktiviert und `main` als einziger Produktionszweig
festgelegt. Das ändert keine Anwendung und ist der einfachste Schutz vor einem
versehentlichen Produktionsdeploy.

### Supabase

- Das Projekt meldet `Healthy`, läuft aber im Free-Plan.
- Es gibt derzeit drei Auth-Konten und genau eine Edge Function `ai-task`.
- Das Dashboard meldet keine Security- oder Performance-Advisor-Befunde.
- Der Free-Plan besitzt keine Plattform-Backups.
- **Allow new users to sign up** ist derzeit aktiviert, obwohl
  `docs/ETAPPE_3_ACCOUNTS.md` für die geschlossene Nutzung ausdrücklich den
  ausgeschalteten Zustand verlangt.
- **Confirm email** ist derzeit aktiviert, obwohl synthetische
  `@login.kinodreieck.at`-Adressen laut Account-Runbook nicht per E-Mail
  bestätigt werden sollen.
- Anonyme Anmeldung ist deaktiviert.

Folge für 9b/9c: Registrierung und E-Mail-Bestätigung werden vor der Kohorte
an den dokumentierten Kontovertrag angeglichen. Konten legt Max weiterhin
manuell an. Es wird keine Registrierungsoberfläche gebaut.

### Cloudflare

- Produktion, Staging und die Pages-Domain zeigen auf dasselbe bestehende
  Pages-Projekt.
- Produktion liefert derzeit den abgenommenen Etappe-7-Stand; ein neuerer
  Staging-Deploy ist vorhanden. Der aktuelle Etappe-8-Branch ist damit noch
  kein freigegebener Etappe-9-Ausgangspunkt.
- `staging.kinodreieck.at` ist öffentlich erreichbar und trägt im ausgelieferten
  HTML derzeit keinen `noindex`-Hinweis.
- Cloudflare Pages kann Preview-Deployments direkt mit Access schützen;
  Preview-Deployments erhalten standardmäßig `X-Robots-Tag: noindex`. Eine
  eigene Staging-Custom-Domain braucht bei gewünschtem Schutz zusätzlich eine
  passende Access-Anwendung.

Folge für 9b: Preview-Deployments und `staging.kinodreieck.at` werden
zuverlässig mit `X-Robots-Tag: noindex, nofollow` geprüft. Eine zusätzliche
Access-Schicht wird in Etappe 9 bewusst nicht eingeführt: Die bestehenden
GitHub-Smokes prüfen atomare Preview- und Staging-URLs ohne interaktiven Login,
und ein Access-Umbau würde dafür Service-Tokens und neue Fehlerflächen
erfordern. Die statische App bleibt öffentlich, persönliche Daten und Live-KI
bleiben weiterhin hinter Supabase-Sitzung und RLS.

## Vorbedingungen aus Etappe 8

Vor 9c müssen laut Roadmap sauber funktionieren:

- intelligente Suche,
- Geschmacksprofil und KI-Schalter,
- Vorbewertung und Empfehlungen,
- Filmscan,
- Bloganalyse,
- Blog-Kontoweg,
- `programm_demo`,
- die festgelegten eingefrorenen Demo-Beispiele,
- alle kleineren ausdrücklich im Etappe-8-Abschluss verbliebenen Beta-Punkte.

Aktuell noch nicht als abgeschlossen anzunehmen:

- manuelle Konto-Oberflächenabnahme der Vorbewertung,
- Filmscan,
- Bloganalyse,
- Blog-Kontoweg,
- endgültige Demo-Beispiele für Scan und Blog,
- kontrollierte Veröffentlichung beziehungsweise Prüfung von `programm_demo`,
- Merge, Staging- und Produktionsabnahme des vollständigen Etappe-8-Stands.

Der gemeinsame Filmwissens-Cache wird nicht künstlich zum Beta-Tor erweitert.
Offene Quellenfreigaben und redaktionelle Sonderfälle bleiben geparkt, sofern
der Etappe-8-Abschluss sie nicht ausdrücklich hochstuft.

## Festgezurrte Produktentscheidungen

### 1. Anonymer Web-Demo-Pfad: ja

Der Pfad existiert bereits: Gäste können Demo-Daten sehen und lokale Daten
bearbeiten; aktueller Live-Katalog und Live-KI verlangen ein eingeladenes
Konto. Es braucht keinen neuen Backendpfad.

Öffentliche Links dürfen `?start=demo` oder `?start=clean` verwenden. Sie dürfen
nie automatisch `fresh=…` setzen, weil dieser Pfad lokale persönliche Töpfe
bewusst leert.

### 2. App bleibt an der Domainwurzel

Die App wird nicht nach `/app/` verschoben. Ein solcher Umzug würde
PWA-Scope, Service Worker, relative Pfade, Deep Links und bestehende
Installationen ohne Nutzerwert berühren.

### 3. `/download/` wird die kleine Distributionsseite

Die vorhandene Seite wird zu „Ausprobieren und installieren“ erweitert:

- **Demo ansehen** führt in den eingefrorenen, kostenfreien Demo-Start.
- **Leer starten** führt in den lokalen Gastbetrieb.
- **Konto & Geräte-Sync** erklärt knapp, wo die Anmeldung liegt und dass diese
  Entscheidung von Demo oder leerem Start unabhängig ist.
- **Android installieren** nutzt den nativen PWA-Installationshinweis, wenn der
  Browser ihn anbietet, sonst eine kurze Anleitung.
- **iPhone/iPad installieren** erklärt Safari → Teilen →
  „Zum Home-Bildschirm hinzufügen“ → „Als Web-App öffnen“.
- **Einzeldatei herunterladen** bleibt eine sekundäre Desktop-/Offline-Option.

Die Startart `clean|demo` und der Sitzungszustand `Gast|Konto` bleiben zwei
unabhängige Achsen. Es entsteht keine irreführende Drei-Modi-Architektur.

Weil `/download/` damit vom technischen Hilfsbildschirm zur öffentlichen
Distributionsseite wird, entfällt dort das heutige HTML-`noindex`. Der
eigentliche Download `Kinodreieck.html` behält dagegen
`X-Robots-Tag: noindex, nofollow`.

### 4. Kein nativer App-Bau

Kein APK, kein iOS-Paket, kein Store-Eintrag und kein Wrapper-Framework in
Etappe 9. Die installierbare PWA ist der mobile Weg.

### 5. Keine neue Telemetrie

Für vier bis fünf bekannte Tester reichen:

- bestehende Auth- und KI-Diagnose,
- ein fester Testbogen,
- ein von Max gewählter vorhandener Feedbackkanal,
- ein kurzer manueller Betriebscheck.

Kein Analytics-SDK, Session Replay, In-App-Feedbackbackend oder zusätzliche
Trackingtabelle.

### 6. Keine neue Schema-Migration nur für Etappe 9

Landingpage, Betriebsgriffe, Konten und Beta-Protokoll brauchen kein neues
Datenmodell. Änderungen an Limits sind reversible Konfiguration, keine neue
Produktarchitektur.

## Etappe 9a — Distribution und Landingpage

### Ziel

Ein Besucher versteht innerhalb einer Seite:

- was Kinodreieck ist,
- was ohne Konto funktioniert,
- wie Demo und leerer Start sich unterscheiden,
- wie die PWA installiert wird,
- dass die Einzeldatei eine zusätzliche Offline-Option ist,
- dass Live-KI nur für eingeladene Konten verfügbar ist.

### Phase A — Vertrag und Inhalte einfrieren

Ergebnisse:

- kurzer Seiteninhalt und Reihenfolge festgelegt,
- verwendete Demo-Daten und Rechte dokumentiert,
- Demo-Scanfoto und Demo-Blogtext von Max benannt,
- keine echte persönliche Bewertung, kein Rohprogramm und kein Secret in
  statischen Artefakten,
- keine Funktion verspricht offene Registrierung.

Fertig, wenn:

- alle öffentlich ausgelieferten Daten einer Positivliste zugeordnet sind,
- Demo-KI ausschließlich eingefrorene Ergebnisse verwendet,
- der kostenpflichtige Transport im Demo-Pfad nachweislich nicht aufgerufen
  wird.

### Phase B — Kleine Distributionsseite bauen

Voraussichtlich betroffene Pfade:

- `public/download/index.html`,
- gegebenenfalls eine kleine installierbare UI-Komponente,
- `pages_test.mjs`,
- `serviceworker_test.mjs`,
- `public/_headers`,
- Etappe-9-Dokumentation.

Eingefroren, solange kein Test einen echten Grund zeigt:

- `src/lib/accountDriver.js`,
- `src/lib/authDriver.js`,
- `src/lib/supabaseDriver.js`,
- `src/lib/gitDriver.js`,
- `src/legacy/`,
- Supabase-RLS-Policies,
- `supabase/functions/ai-task/index.ts`,
- Cloudflare-Pages-Projektstruktur.

### Phase C — Demo- und Installations-Gates

Automatische Prüfungen:

- `/download/` und Single-File bleiben vorhanden,
- die Distributionsseite darf indexiert werden, die herunterladbare
  Einzeldatei nicht,
- Manifest, Icons und Service Worker bleiben gültig,
- Download bleibt ein Attachment und wird nicht durch den Service Worker
  übernommen,
- Bundle- und Download-Scan finden keine Secrets oder persönlichen Daten,
- Demo- und Clean-Link setzen nie `fresh`,
- Demo-Pfad erreicht weder Edge Function noch Anbietertransport,
- `programm_demo` und `streaming_demo` sind für ein Release nicht nur Warnung,
  sondern Pflicht.

Manuelle Geräteprobe:

- Android/Chrome: installieren, schließen, vom Homescreen starten, offline
  öffnen,
- iPhone/Safari: zum Home-Bildschirm hinzufügen, als Web-App öffnen, offline
  starten,
- Desktop: Einzeldatei herunterladen und lokal öffnen,
- Gast/Demo: kein Konto und keine Live-KI nötig.

### Abnahme 9a

- öffentlicher Einstieg funktioniert ohne Konto,
- Demo erzeugt keine Anbieter-Kosten,
- ausgelieferte Artefakte enthalten nur freigegebene Daten,
- Installation ist auf Android und iOS praktisch belegt,
- bestehende PWA und bestehender Download wurden erweitert, nicht ersetzt.

## Etappe 9b — Betriebsminimum

### Ziel

Vor dem ersten fremden Konto kann Max fünf Störungen mit vorhandenen Griffen
beherrschen:

1. Daten versehentlich verändert oder gelöscht,
2. Supabase beziehungsweise Anbieter nicht erreichbar,
3. KI-Kosten auffällig,
4. Schlüssel kompromittiert,
5. fehlerhaftes Frontend- oder Function-Deployment.

### Phase D — Zwei Backup-Ebenen festlegen

#### Ebene 1: Nutzerbackup

Mit einem Wegwerf-Testkonto:

1. vollständigen App-Export erstellen,
2. Stückzahlen und Prüfsummen festhalten,
3. kontrolliert Daten verändern,
4. Backup wiederherstellen,
5. auf einem zweiten Gerät laden,
6. Prüfsummen und sichtbare Inhalte vergleichen,
7. Restore rückgängig machen,
8. beschädigtes und handbearbeitetes Backup ablehnen beziehungsweise ehrlich
   melden.

Die vorhandene Sicherung vor dem Überschreiben bleibt Pflicht. Besonderes
Augenmerk gilt dem Geschmacksprofil, das beim Restore derzeit als Objekttopf
übernommen wird.

#### Ebene 2: Datenbank-Disaster-Recovery

Der aktuelle Free-Plan hat keine Plattform-Backups. Zwei Wege sind möglich:

| Weg | Aufwand | Stabilität | Entscheidung |
|---|---:|---:|---|
| Free-Plan + regelmäßiger logischer CLI-Dump, außerhalb des Repos aufbewahrt | mittel | gut, wenn Restore geprobt wird | günstigste tragfähige Lösung |
| Supabase Pro mit täglichen Plattform-Backups plus unabhängiger Restore-Probe | niedrig im Alltag | höher | Empfehlung vor 9c, wenn 25 USD/Monat akzeptabel sind |

Ein Datenbankdump darf nie ins öffentliche Repository. Der Restore wird nie
ungeprüft in die Produktion zurückgespielt, sondern zuerst in ein
wegwerfbares lokales oder separates Ziel.

Der Restore-Beleg umfasst mindestens:

- Tabellen und Inhalte,
- Datenbankfunktionen,
- RLS-Policies,
- zwei getrennte Testkonten,
- exemplarische persönliche Daten,
- KI-Limits und Diagnoseprotokoll,
- danach einen grünen Isolationstest.

### Phase E — Notfall-Runbook

Das Runbook wird als kurze Entscheidungstabelle geschrieben:

| Störung | Erster Griff | Beleg | Rückweg |
|---|---|---|---|
| KI-Kosten auffällig | `ai_aktiv=false` | Health und kostenfreier abgewiesener Auftrag | alten Wert kontrolliert zurücksetzen |
| Anbieter ausgefallen | KI aus oder Fehlerzustand akzeptieren | deterministische Kernfunktionen laufen | keine Datenmigration |
| Supabase ausgefallen | Sitzung behalten, lokal weiterarbeiten | Offlineänderung und späterer Sync | ausstehende Änderungen senden |
| Frontend fehlerhaft | letztes gesundes Pages-Deployment zurückrollen | Domain-Smoke mit erwarteter Buildversion | korrigierter neuer Deploy |
| Function fehlerhaft | dokumentierte letzte Function-Version erneut deployen | Function-Vertrag und Health | korrigierte Version ausrollen |
| Schlüssel kompromittiert | betroffenen Schlüssel sperren/rotieren | alter Schlüssel wirkungslos | neue Referenz nur im Secret-Store |
| Accountlöschung fehlgeschlagen | Nutzerbackup sichern, Löschung erneut ausführen | Auth-Nutzer und zugehörige Kontozeilen fehlen | Eskalation, keine Scheinbestätigung |

Jeder Griff nennt Verantwortlichen, Voraussetzungen, genaue Kontrolle und
Rücknahme. Schlüsselwerte, Tokens und Dumps stehen nie im Runbook.

### Phase F — Kosten und Protokolle

Vor der Beta:

- Bau-Tageslimit `200` zurückdrehen.
- Vorläufiger einfacher Startwert: **10 Aufträge je Konto und Tag**.
- Globales Monatsbudget bleibt **1000 US-Cent**.
- Parallelgrenze bleibt unverändert, solange Etappe-8-Messungen keinen Grund
  liefern.
- `intelligent-search` wird von 8192 auf **4096 Ausgabetokens** gedrosselt,
  sofern die Etappe-8-Verträge damit weiterhin sicher passen.
- Alle Etappe-8-Aufgaben werden mit gemessenen Worst-Case-Reservierungen gegen
  den Monatsdeckel gerechnet.
- Die Sonnet-5-Preistabelle wird spätestens zum 01.09.2026 von
  200/1000 auf 300/1500 US-Cent je Million Ein-/Ausgabetokens aktualisiert,
  falls das Modell dann noch verwendet wird.

Der Wert 10 ist bewusst konservativ: Das Tageslimit schützt vor einem
Ausreißer eines einzelnen Kontos; das Monatsbudget bleibt der globale harte
Kostenschutz. Nach der ersten Kohorte darf nur anhand gemessener Kosten
erhöht werden.

Protokollprüfung:

- erlaubt: Aufgabe, Status, Modell, Tokenzahlen, Kosten, Dauer,
  Fehlerklasse, Prompt-/Profilversion, Zeitstempel,
- verboten: vollständige Suchanfragen, Blogtexte, Scanbilder, Notizen,
  Profilbelege, Anbieterantworten, Passwörter, Tokens und Konto-Payloads.

### Phase G — Zugänge und Deployment härten

Vor dem ersten Etappe-9-Produktionsdeploy:

- GitHub `production`: Required reviewer aktiv,
- GitHub `production`: nur `main` darf deployen,
- Supabase: neue Sign-ups aus,
- Supabase: Confirm email passend zum synthetischen Konto-Runbook aus,
- Cloudflare-Previews und Staging: `X-Robots-Tag: noindex, nofollow`
  auf der echten Auslieferung belegt,
- GitHub-/Supabase-/Cloudflare-Secrets anhand ihrer Namen, Ablage und
  Minimalrechte prüfen; Werte nie kopieren,
- CSP und Cache-Header auf der echten Staging- und Produktionsdomain prüfen,
- Frontend- und Function-Version gemeinsam im Releaseprotokoll festhalten.

Der heutige Keep-alive bleibt nur ein Verfügbarkeits-Ping. Er wird nicht als
Monitoring für Auth, RLS, Katalog oder Edge Function ausgegeben.

### Abnahme 9b

- App-Backup und Wiederherstellung wurden praktisch mit Rückweg geprüft,
- Datenbankdump und Restore in ein Wegwerfziel wurden praktisch geprüft,
- KI-Notaus wurde ohne echten Anbieteraufruf belegt,
- ein fehlerhaftes Pages-Deployment besitzt einen getesteten Rollbackweg,
- Accountlöschung wurde an einem Wegwerfkonto vollständig geprüft,
- Sign-ups sind geschlossen,
- Produktionsdeploy braucht Freigabe,
- Staging/Previews sind nicht offen indexierbar,
- CSP, Bundle und Secret-Ablagen sind geprüft,
- alle Runbooks sind von einer zweiten Person beziehungsweise einem
  unabhängigen Prüfer ausführbar gelesen worden.

## Etappe 9c — Geschlossene Beta

### Ziel und Umfang

- genau eine Kohorte,
- vier bis fünf eingeladene Accounts,
- Konten manuell durch Max angelegt,
- eigene Geräte und Browser der Tester,
- ein klarer vorhandener Feedbackkanal,
- keine öffentliche Registrierung,
- keine Produktanalyse im Hintergrund.

### Phase H — Interner Trockenlauf

Mit einem Wegwerfkonto einmal vollständig:

- leerer Account,
- lokaler Bestand → Konto,
- zweites Gerät,
- Offlineänderung → späterer Sync,
- abgelaufene Sitzung,
- KI-Limit,
- Anbieter- oder Supabase-Ausfall,
- Backup/Restore,
- Accountlöschung,
- Zugriffstest zwischen zwei Konten,
- Start ohne KI, späteres einzelnes Zuschalten und Widerruf.

Erst wenn kein Datenverlust, kein Account-Leck und kein unkontrollierter
Kostenpfad offen ist, werden Einladungen verschickt.

### Phase I — Kohorte durchführen

Jeder Testeintrag enthält nur:

- Szenario,
- Gerät und Browser,
- Ergebnis,
- Datenverlust ja/nein,
- verständliche Fehlermeldung ja/nein,
- Sync-Konflikt ja/nein,
- KI-Aufruf und Kosten laut bestehendem Protokoll,
- kurze freie Rückmeldung.

Die Szenarien werden auf die Kohorte verteilt. Nicht jeder Tester muss jeden
Störfall wiederholen.

Tester erhalten vorab einen kurzen Beta-Hinweis:

- welche persönlichen Bereiche mit Supabase synchronisiert werden,
- dass freiwillig aktivierte KI-Aufgaben Inhalte an den Anbieter senden,
- dass Diagnosemetadaten und Kosten protokolliert werden,
- dass Passwortreset und Kontolöschung vorerst über Max laufen,
- dass lokale Daten nach einer serverseitigen Kontolöschung auf Geräten
  bestehen bleiben können,
- dass es eine geschlossene Testphase und kein fertiger öffentlicher Dienst
  ist.

### Phase J — Beta auswerten

Freigabeentscheidung anhand weniger harter Aussagen:

- kein offener Account-Isolationsfehler,
- keine verlorenen persönlichen Daten,
- Backup und Restore funktionieren,
- Kostenlimits greifen,
- KI-Ausfall lässt deterministische Kernfunktionen intakt,
- Fehlermeldungen sind für die Tester handlungsfähig,
- keine ungeklärte Quelle liegt in den öffentlich ausgelieferten Daten.

Verbesserungswünsche ohne Sicherheits-, Datenverlust- oder
Funktionsblockerstatus gehen in den Backlog und verlängern 9c nicht
automatisch.

## Subagents und Gates

Die Bau-Session bleibt verantwortlich. Subagents prüfen read-only; sie ändern
keinen Code und führen keine echten Anbieteraufrufe aus.

### Bereits für diese Planung eingesetzte Rollen

- **Repo- und Roadmap-Audit:** Ziele, Abhängigkeiten und technische Drift.
- **Test- und Betriebs-Audit:** vorhandene Gates, Restore, Deploy und Limits.
- **Produkt- und Scope-Audit:** kleinster tragfähiger Nutzerweg und
  Nicht-Ziele.

### Verbindliche Rollen während des Baus

Die vorhandenen Vorlagen unter `docs/pruefagenten/` werden wiederverwendet:

| Rolle | 9a | 9b | 9c |
|---|---|---|---|
| `scope-waechter` | nach jeder Bauphase | nach jeder Runbook-/Konfigphase | vor Beta-Start und Abschluss |
| `ki-datenpfad-pruefer` | wenn Demo-/KI-Datenpfade berührt werden | bei Restore, Löschung und Protokollprüfung | bei Datenverlust- oder RLS-Befund |
| `kosten-limit-pruefer` | Beleg: Demo ohne Kosten | Limit-, Notaus- und Log-Gate | Kostenreview während und nach der Kohorte |
| `privatsphaere-pruefer` | Downloadinhalt und Demo-Daten | Logs, Dumps, Secrets, Löschung | Beta-Hinweis und Abschluss |

Zusätzlich je Abnahme genau ein adversarialer read-only Endreview:

- **9a Distributionsreview:** PWA, Links, öffentliche Daten und kostenfreier
  Demo-Pfad.
- **9b Betriebsreview:** Eine Person liest Runbooks ohne Vorwissen und benennt
  fehlende Voraussetzungen oder irreversible Schritte.
- **9c Beta-Review:** Freigabetor ausschließlich anhand der erhobenen Belege,
  nicht anhand des allgemeinen Eindrucks.

Die vier Projekt-Prüfagenten ersetzen weder `npm test`, `npm run test:function`,
`npm run test:rls`, Geräteproben noch Remote-Smokes.

## Test- und Release-Matrix

| Gate | 9a | 9b | 9c |
|---|---:|---:|---:|
| `npm test` | Pflicht | Pflicht | Pflicht vor Start/Abschluss |
| `npm run test:function` | Pflicht, falls Function berührt | Pflicht | Pflicht vor Start/Abschluss |
| `npm run test:rls` | nur bei RLS-Bezug | Pflicht nach Restore-/Löschprobe | Pflicht vor Start |
| Secret-/Bundle-Scan | Pflicht | Pflicht auf finalem Build | Pflicht vor Start |
| Staging-Domain-Smoke | Pflicht | Pflicht | Pflicht vor jeder Beta-Version |
| Produktions-Domain-Smoke | bei 9a-Freigabe | bei Konfig-/Releasewechsel | Pflicht vor Einladung |
| Android-/iOS-PWA-Probe | Pflicht | — | mindestens ein realer Wiederholungstest |
| App-Backup-Roundtrip | — | Pflicht | Testszenario |
| Datenbank-Dump/Restore | — | Pflicht | nur erneut bei Schemaänderung |
| echter KI-Test | nur wenn fachlich nötig und budgetgeschützt | für Notaus nicht nötig | nur ausdrücklich geplant und budgetgeschützt |

Bei Exit-Code 75, `AUTONOMIE_STOPP` oder `BUDGET_UNBEKANNT` enden alle echten
KI-Tests sofort gemäß `AGENTS.md`.

## Nicht-Ziele

- kein visueller Relaunch,
- keine native Android- oder iOS-App,
- keine Stores,
- keine offene Registrierung oder Warteliste,
- kein zweites Frontend oder Pages-Projekt,
- kein neuer Cloudflare Worker,
- kein zweites dauerhaftes Supabase-Backend nur für die Beta,
- keine Normalisierung der bestehenden Dokumenttöpfe,
- kein neues Analytics-, Monitoring- oder Feedbackprodukt,
- kein allgemeiner Assistent,
- keine Embeddings oder Vektordatenbank,
- keine Benachrichtigungen,
- keine Kalenderintegration,
- keine vollständige Etappe-10-Datenschutz- und Supportarchitektur.

## Noch von Max zu entscheiden

Diese vier Entscheidungen verändern keine Architektur, müssen aber vor dem
jeweiligen Gate fallen:

1. **Supabase vor 9c:** Pro für tägliche Backups und Nicht-Pausieren
   (Empfehlung) oder Free plus diszipliniertem externem Dump-Verfahren.
2. **Demo-Material:** das eine freigegebene Scanfoto und der eine freigegebene
   Blogtext.
3. **Feedbackkanal:** ein bereits genutzter privater Kanal; kein Neubau.
4. **Kohorte:** vier bis fünf konkrete Personen und grobe Verteilung der
   Testszenarien.

## Empfohlene Reihenfolge

```text
Etappe 8 vollständig abnehmen
    -> 9a Inhalte einfrieren
    -> kleine /download/-Distribution bauen
    -> Demo-/PWA-/Bundle-Gates
    -> 9a Produktion
    -> 9b Nutzerbackup praktisch
    -> Datenbank-Dump/Restore praktisch
    -> Notaus, Rollback, Löschung, Secrets und Zugänge prüfen
    -> Limits auf Beta-Werte drosseln
    -> 9b abnehmen
    -> interner vollständiger Trockenlauf
    -> Sign-ups geschlossen verifizieren
    -> 4–5 Konten manuell einladen
    -> 9c beobachten und auswerten
```

## Quellen für veränderliche Plattformpunkte

- Supabase empfiehlt Free-Projekten regelmäßige logische Dumps außerhalb des
  Projekts; tägliche Plattform-Backups beginnen bei bezahlten Plänen:
  <https://supabase.com/docs/guides/platform/backups>
- Supabase beschreibt den vollständigen CLI-Weg über Rollen-, Schema- und
  Datendump sowie den Restore in ein neues Projekt:
  <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- Supabase beschreibt `Allow new users to sign up` als den Schalter, nach
  dessen Deaktivierung nur vorhandene Nutzer anmelden können:
  <https://supabase.com/docs/guides/auth/general-configuration>
- Cloudflare dokumentiert öffentliche Preview-Deployments, Pages Access und
  den standardmäßigen `X-Robots-Tag: noindex`:
  <https://developers.cloudflare.com/pages/configuration/preview-deployments/>
- Apple beschreibt die aktuelle Safari-PWA-Installation über
  „Zum Home-Bildschirm hinzufügen“ und „Als Web-App öffnen“:
  <https://support.apple.com/de-de/guide/iphone/iphea86e5236/ios>
- Anthropic nennt für Sonnet 5 den Einführungspreis bis 31.08.2026 und die
  Standardpreise ab 01.09.2026:
  <https://www.anthropic.com/claude/sonnet>
