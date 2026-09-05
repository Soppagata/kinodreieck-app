# Nächster Masterchat: eingefrorener Etappenplan zum Privatrelease

Stand: 30.08.2026

Status: `FUTURE_PLAN_METADATA_ONLY`

Ziel: ein sauberer, privater Stand auf `kinodreieck.at` nach Abschluss des
laufenden Radar-/Entdecken-Haupttasks

> [!CAUTION]
> **Dieser Auftrag gilt ausdrücklich nicht für den aktuell laufenden
> Radar-/Entdecken-Hauptchat.** Dieser Chat baut ausschließlich seinen bereits
> vereinbarten Auftrag fertig und setzt keinen Punkt dieses Dokuments um.
> Der hier beschriebene Masterchat beginnt erst, wenn der laufende Haupttask
> separat abgeschlossen und mit einem exakten Übergabestand beendet wurde.

> [!IMPORTANT]
> **Der Punktespeicher dieses Dokuments ist eingefroren.** Der nächste
> Masterchat darf keinen Produktpunkt ergänzen, still erweitern, in ein
> Nebenprojekt umdeuten oder wegen älterer Zukunftsdokumente reaktivieren.
> Entdeckt er einen echten Widerspruch, der nicht innerhalb eines vorhandenen
> Punktes lösbar ist, fragt er Max statt den Scope selbst zu vergrößern.

> [!IMPORTANT]
> **Auch der Stand vom 30.08.2026 ist ausschließlich
> `FUTURE_PLAN_METADATA_ONLY`.** Er hält Owner-Entscheidungen und einen
> möglichen Lieferweg fest, autorisiert aber weder Produktänderungen noch
> Branches, Commits, Pushes, Pull Requests, CI, Shared-Backend-Writes,
> Staging-/Production-Deploys, Providerläufe oder praktische Abnahmen.

## 1. Verbindliches Arbeitsmodell

Der nächste Masterchat arbeitet als rein lesender Meister nach der
`kinodreieck-etappen-orchestrierung`. Er führt weder Implementierung noch
Repo-Vollaudit, Tests, Builds, Backups, Deployments oder Praxisabnahmen selbst
aus.

Für jede Etappe gilt:

1. Der Meister beauftragt **genau einen** verantwortlichen Baumeister mit der
   vollständigen Etappe.
2. Der Baumeister prüft Branch, Commit, Dirty-State und die für seine Etappe
   benötigte Baseline genau einmal. Fremde Änderungen bleiben unberührt.
3. Der Baumeister baut den kleinsten vollständigen Ende-zu-Ende-Weg und prüft
   währenddessen nur die betroffenen Flächen. Er darf kleine, eng gekoppelte
   Arbeit selbst erledigen; zusätzliche Bauchats sind keine Pflicht.
4. Der Baumeister bestätigt **jeden ihm zugeordneten Punkt genau einmal** in
   der unten festgelegten Abschlusstabelle. Die Bestätigung gilt nur, wenn alle
   Muss-Sätze des Punktes erfüllt sind.
5. Der Meister liest diese Tabelle und wiederholt weder Audit noch Beleg. Fehlt
   etwas im unveränderten Scope, beauftragt er denselben Baumeister mit einem
   kurzen Delta. Danach wird nur das betroffene Gate erneut geprüft.
6. Während des Baus laufen fokussierte Prüfungen. Bei einer seriellen Etappe
   führt ihr Baumeister auf dem finalen Etappencommit genau einmal die
   vollständige projektübliche Mocksuite und den Build als `FINAL_LOCAL` aus.
   Bei mehreren disjunkten Paketen für denselben Zielbranch führen die
   Paket-Baumeister nur fokussierte Paketchecks aus; nach sequenzieller
   Integration führt der vorab benannte Integrationsbaumeister genau ein
   gemeinsames `FINAL_LOCAL` aus. Wiederholt wird nur nach einer Änderung,
   die den jeweiligen Beleg entwertet.
7. Ein Blocker wird nicht durch Prüf- oder Kontrollschleifen ersetzt. Der
   Baumeister nennt den fehlenden Entscheid, die gestoppte Wirkung und die
   bereits fertigen unabhängigen Teile.

### Pflichtformat jeder Baumeister-Abgabe

Jede Zeile steht für genau einen Punkt. `TEILWEISE` ist kein abnehmbarer
Endzustand.

| Punkt-ID | Endzustand | Beleg | Liefergrenze |
|---|---|---|---|
| `PR-…` | `ERREICHT`, `NICHT ERREICHT` oder `BLOCKIERT` | knapper Datei-, Test-, Remote- oder Praxisbeleg; keine Rohlogs | `gebaut=…; getestet=…; committed=…; gepusht=…; CI=…; deployed=…; praktisch=…` |

Die sieben Liefergrenzen bleiben getrennt. Ein lokaler Build ist kein Deploy,
ein Deploy keine praktische Abnahme und ein grüner Test kein Beleg für einen
erfolgreichen Nutzerweg.

## 2. Eingefrorener Punktespeicher

### `PR-00` – Aktivierungs- und Integrationsgrenze

- Der Privatrelease-Plan startet erst nach einer separaten `DONE`-Übergabe des
  aktuellen Radar-/Entdecken-Haupttasks. `E0` hält danach den exakten
  Handoff-Commit auf `origin/staging`, die offenen Liefergrenzen, den lokalen
  Dirty-State und die daraus bestimmte Privatrelease-Baseline fest. Alte
  Zahlen oder Branchannahmen aus dem Review werden nicht ungeprüft übernommen.
- Der nächste Masterchat repariert oder wiederholt den Haupttask nicht.
  Etappen-Branches werden von der festgehaltenen Basis abgeleitet und niemals
  direkt auf dem gemeinsam genutzten `staging` bearbeitet.
- `E0` benennt vor der ersten Integration genau einen
  Integrationsverantwortlichen und hält den vorgesehenen Weg fest:
  Etappen-Branch → sequenzielle Übernahme in einen eigenen
  Privatrelease-Integrationsbranch → Pull Request gegen `staging` mit CI →
  erst nach objektgenauer Autorisierung Merge beziehungsweise Push nach
  `staging` mit eigener Staging-Deploy-Wirkung → finaler Release Candidate in
  `E6` → erst nach weiterer objektgenauer Autorisierung Pull Request/Merge von
  `staging` nach `main` und Production-Deploy.
- Ein Pull Request gegen `staging` löst CI aus. Ein Push oder Merge nach
  `staging` ist davon getrennt und löst eine reale Staging-Deploy-Wirkung aus.
  Weder dieser Plan noch ein grüner CI-Lauf autorisiert diese Wirkung.
- `staging` bleibt bis einschließlich `E6` Release-Candidate-Umgebung. Erst
  nach abgeschlossenem Privatrelease darf `PR-11` dort den read-only Anker für
  ein späteres persönliches LAB festhalten.
- Nach dem Handoff und vor `E2` werden die drift-sensitiven Releaseflächen
  anhand des tatsächlichen Stands verbindlich als `BEHALTEN`, `VERBERGEN` oder
  `ENTFERNEN` festgezogen. Das ist eine Entscheidung innerhalb von `PR-09`,
  keine zusätzliche Prüfetappe; umgesetzt und abgeschlossen wird `PR-09` erst
  in `E5`.

### `PR-01` – Privater Production-Zugang

Für `kinodreieck.at` gilt:

- Beim anonymen Erstaufruf ist nur der minimale Einstieg erreichbar: Benutzername,
  Passwort, `Anmelden`, `Ohne Konto fortfahren`, Status-/Fehlerausgabe und
  genau ein Link zu `Datenschutz & Rechtliches`.
- Eine öffentliche Registrierung existiert nicht und wird für diesen Release
  nicht neu gebaut. Der eine Legal-Link öffnet die notwendige kombinierte
  Legal-Fläche; ein privater Kontakt wird dort oder im Frontend nicht
  offengelegt.
- Die Sperre ist serverseitig wirksam: anonyme Datenbank-, Function-, API-,
  Sharing-, Download- und Einzeldateipfade liefern keine geschützten App- oder
  Anbieterdaten aus.
- Anonym erreichbar sind insbesondere weder persönliche Daten noch
  bereitgestellte Kino-, Streaming- oder Blogdaten, öffentliche Daten-JSONs,
  Backups oder Source Maps. Das Production-Bundle ist minifiziert und wird
  ohne öffentliche Source Maps
  ausgeliefert.
- RLS und serverseitige Berechtigungen schlagen bei fehlenden, inaktiven,
  widersprüchlichen oder unlesbaren Kontorechten geschlossen fehl.
- Production erhält einen kleinen zentralen Discovery-Schutz:
  `X-Robots-Tag: noindex, nofollow` als globaler HTTP-Header, eine entsprechende
  Meta-Angabe nur als HTML-Fallback und keine Sitemap. Die Konfiguration bleibt
  modular und leicht entfernbar; ein zentraler Cloudflare-Block für
  AI-Crawler ist verbindlicher Teil dieser Privatschutz-Konfiguration. Daraus
  entsteht kein SEO-System.
- Ein `User-agent: *` mit `Disallow: /` ist keine tragende Google- oder
  Zugriffssperre. Der Discovery-Schutz vermindert Auffindbarkeit, ersetzt aber
  niemals Anmeldung, RLS oder serverseitige Datengrenzen.
- Frontendcode wird nicht als Geheimnis behandelt. Es besteht keine Pflicht zu
  kompliziertem Split-Bundling oder einem zweiten Login; geschützt werden
  Daten und Aktionen durch Authentifizierung und serverseitige Berechtigungen.
- Alte öffentlich nutzbare Browser- und Service-Worker-Caches werden mit dem
  Release entwertet.
- Konten werden ausschließlich kontrolliert und nicht öffentlich vergeben;
  insgesamt sind organisatorisch höchstens 15 Konten vorgesehen. Diese
  Vergabegrenze ist kein technischer Account-Cap.
- Die bekannten Abo- und Methodenbeschränkungen begründen keine eigene
  Lizenzetappe. Der Baumeister bestätigt hier lediglich knapp, dass anonyme
  oder öffentlich indexierbare Ausgabe geschlossen ist und der Localmodus
  keinen davon abweichenden geschützten Datenweg eröffnet. Es findet keine
  breite erneute Anbieterrechtsprüfung statt.

### `PR-02` – Lokaler Modus ohne Konto

- `Ohne Konto fortfahren` öffnet auf einem frischen Browser einen inhaltlich
  leeren Localmodus. Es gibt keine Demo-Version und keine bereitgestellten
  Kino-, Streaming- oder Blog-Inhalte.
- Der Localmodus umfasst nur eigene lokale Einträge und die dafür benötigten
  lokalen Funktionen. Er führt keinen Konto-Sync, Server-Write, KI-Write oder
  laufendes Serverbackup aus und verspricht keine allgemeine
  Wiederherstellung.
- Beim Login wird niemals automatisch importiert oder gemergt. Stattdessen
  wird der accountgebundene Stand aus `kd_personal` sichtbar; der getrennte
  lokale Gaststand bleibt unverändert erhalten und erscheint nach Logout
  wieder.
- Konfliktauflösung, Transferdialog und eine Import-/Restorezusage sind nicht
  Teil dieses Releases.
- `E1` entfernt bestehende Demo-Oberflächen, Demo-Seeds, Demo-Snapshots und
  Demo-Assets gezielt. Die vorhandene Gastmechanik bleibt erhalten, wird aber
  auf diesen leeren Localmodus verengt.
- Geschützte Daten, Inhalts-JSON, Auth-/API-Antworten, Providerpayloads und
  Source Maps dürfen nicht in der öffentlich auslieferbaren Localmodus-Shell
  oder ihren Assets enthalten sein.

### `PR-03` – Persönliche Serverdaten und Kontotrennung

- Der Baumeister erhebt zuerst knapp den aktuellen Ist-Stand, damit bereits
  vorhandene Synchronisation nicht neu erfunden wird.
- Für angemeldete Konten existiert danach ein eindeutig abgegrenzter
  serverseitiger Live-Stand der persönlichen Datentöpfe. `E2` synchronisiert
  nur die nach dem Haupttask-Handoff ausdrücklich als `BEHALTEN` festgelegten
  persönlichen Releaseflächen; für verborgene oder zu entfernende Flächen
  wird kein neuer Sync gebaut.
- Der Browser bleibt Offline-Arbeitskopie und Cache, ist aber nicht die einzige
  verlässliche Heimat dieser Daten.
- Ein Konto kann weder Daten noch Revisionen eines anderen Kontos lesen,
  verändern, sichern oder wiederherstellen.
- Gerätewechsel, Logout und erneuter Login führen wieder zum richtigen
  Kontostand; konkurrierende Revisionen werden erkannt statt still
  überschrieben.

### `PR-04` – Kontosynchronisation und lokaler Sicherheitsdownload

- Es wird kein großes automatisches Backup-, Snapshot- oder
  Historisierungssystem neu gebaut. `E2` erhebt zuerst den vorhandenen Stand
  und verwendet die bestehende Kontosynchronisation sowie die vorhandenen
  Revisionen wieder.
- Revisionen und Konflikterkennung sichern den aktuellen Kontostand gegen
  stilles Überschreiben ab; daraus wird keine zusätzliche automatische
  Restore- oder Aufbewahrungszusage abgeleitet.
- Der Zustand eines länger nicht abgeglichenen Kontos wird in `E2`
  deterministisch über Zeit- und Revisionszustand hergestellt und geprüft.
  Sieben Tage reale Kalenderzeit werden nicht abgewartet.
- Vor einer bewusst ausgelösten lokalen Gesamtlöschung wird der portable
  JSON-Sicherheitsdownload vorbereitet beziehungsweise ausgelöst. Erst danach
  folgt eine separate Löschbestätigung. Der Download ist keine Zusage für
  Restore oder Reimport.
- Ein bestehender Kontoexport ist im Release nur sichtbar, wenn sein genauer
  Umfang den vollständigen, beibehaltenen Release-Datenstand umfasst und dies
  verständlich ausgewiesen wird. Andernfalls bleibt die Exportoberfläche
  verborgen und der manuelle Weg für Betroffenenrechte wird dokumentiert;
  daraus entsteht kein breites Self-Service-System.

### `PR-05` – Maßvolle Dateneffizienz

- Es gibt keine 250-MB-Hardcap und keine eigene Kapazitäts-, Backup- oder
  Account-Rechenetappe.
- Der vollständige aktuelle Max-Account wird einmal für die beibehaltenen
  persönlichen Releaseflächen vermessen. Regenerierbare Kataloge,
  Suchresultate, Feeds, Bilder und Caches werden nicht als persönliche
  Kontokopien vervielfacht.
- Die Zugangszahl bleibt organisatorisch auf höchstens 15 Konten begrenzt;
  ein technischer Cap wird nicht neu gebaut.
- Komplexe Kompression, automatische Speicherlöschung, ein neues
  Archivsystem und ein 400-MB-Backupmonitoring sind nicht Teil dieses
  Releases.

### `PR-06` – Datenschutz, KI und Cookie-Entscheid

- Eine verständliche Datenübersicht erfasst die tatsächlich verwendeten
  Speicher- und Übertragungsorte: Browser-/Offline-Speicher, Serverdaten,
  bestehende Kontosynchronisation und Revisionen, lokaler
  Sicherheitsdownload, Service-Worker-Caches, Sitzung/Gerät,
  KI-Präferenzen, Diagnosen sowie Feedback-/Supportdaten.
- Es wird konkret beschrieben, welche persönlichen Felder an welchen
  KI-/Suchanbieter gehen. KI-/Suchanbieter und allgemeine Infrastruktur werden
  nicht vermischt.
- Persönliche KI-Berechtigung wird serverseitig kontrolliert; fehlende Rechte
  schlagen geschlossen fehl.
- Aufbewahrung, der genaue Umfang eines gegebenenfalls sichtbaren Exports,
  Kontolöschanfrage und der manuelle Rechteweg sind nachvollziehbar
  beschrieben und funktionieren in den dafür sichtbaren Pfaden. Es wird keine
  Restore-/Importfunktion behauptet, die nicht real belegt ist.
- Kontolöschung beginnt ausschließlich als authentifizierte Mailanfrage an
  einen fest gebundenen privaten Empfänger. Danach werden Konto und betroffene
  Daten im vereinbarten Einzelfall manuell deaktiviert, archiviert und/oder
  gelöscht. Der Plan verspricht weder automatische Selbstlöschung noch ein
  neues Archivsystem; der private Empfänger wird nie öffentlich offengelegt.
- Support- und Diagnosedaten werden nie ungefragt mitgesendet.
- Datenschutz und Rechtliches sind vor Anmeldung ausschließlich über den
  einen Legal-Link erreichbar. Ein erforderlicher neutraler Kontakt gehört in
  diese Legal-Fläche, nicht als zusätzlicher Login-Control; der private
  Empfänger bleibt verborgen.
- Web Analytics bleibt ausgeschaltet. Für den Release sind nur technisch
  notwendige Speicherungen vorgesehen; deshalb wird kein Cookie-Banner gebaut.
  Eine spätere nicht notwendige Analyse-, Tracking- oder Werbespeicherung wäre
  eine neue Entscheidung und ist nicht von diesem Plan autorisiert.

#### Automatische KI: einmalige 6-Stunden-Nachprüfung

Dieser Vertrag gilt ausschließlich für eine später tatsächlich aktivierte
**automatische** KI-Funktion mit Anbieterrequest:

- Beim initialen Trigger werden dauerhaft eine stabile logische Job-ID, die
  exakte Funktions-/Task-ID, die initiale Provider-Operation-ID und
  `check_due_at = triggered_at + 6h` gespeichert. Ein
  Sechs-Stunden-`setTimeout` im laufenden Prozess ist unzulässig.
- Ein kleiner periodischer Checker beansprucht jeden fälligen Job atomar
  höchstens einmal und prüft ausschließlich den exakten initialen Vorgang.
  `kd_ai_log.kosten_usd_cent > 0` allein belegt keinen echten Anbieterumsatz,
  weil der Wert bereits vor dem Providerrequest als Reservierung vorliegen
  kann.
- Als minimaler Erfolg des initialen Vorgangs gelten gemeinsam: terminaler
  Status `fertig`, finalisierte positive Kosten und vorhandene Usage-/Tokenwerte
  genau dieser Provider-Operation. Nur dann endet der Job ohne weitere Aktion.
- Fehlt dieser Gesamtbeleg, wird genau einmal dieselbe automatische
  KI-Funktion über ihren normalen Eingang erneut getriggert. Der Versuch
  durchläuft unverändert Not-Aus, Rechte-, Provider-, Budget-, Kosten- und
  Idempotenzgates. Er erhält eine neue Provider-Operation-ID, bleibt derselben
  logischen Job-ID zugeordnet und setzt `retry_consumed = true`.
- Dieser einmalige Retry erzeugt weder einen neuen Sechs-Stunden-Termin noch
  einen weiteren Checkerjob oder dritten Versuch. Nach seinem Abschluss wird
  genau eine interne Betriebs-Mail nach dem getrennten Vertrag aus `PR-07`
  versendet; der Mailversand löst keine weitere KI-Aktion oder Prüfschleife
  aus.
- Manuelle KI-Aktionen, Mocks/Tests und noch nicht gebaute oder nicht
  aktivierte Scheduler fallen nicht unter diesen Vertrag. Radar übernimmt ihn
  erst mit einem später tatsächlich aktivierten automatischen Scheduler;
  Entdecken kann ihn erst nach der separaten Übergabe des laufenden
  Haupttasks übernehmen. Aus diesem Plan folgt kein Implementierungs- oder
  Deploybeleg.

### `PR-07` – Feedback ohne Namensangabe

- Der sichtbare Begriff lautet „Feedback ohne Namensangabe“, nicht
  „vollständig anonym“.
- Das Formular verwendet kein `mailto:`. Die Texteingabe geht an einen
  serverseitigen Versandweg mit festem Domain-Absender (vorgesehen:
  `feedback@kinodreieck.at`), festem privaten, im Frontend nicht offengelegtem
  Empfänger und festem Betreff.
- Freie Empfänger, Absender, Betreffzeilen, Anhänge und fremdes HTML sind
  ausgeschlossen. Die Eingabe wird sicher escaped und als HTML- sowie
  Textversion versendet.
- Feedback wird nicht in der App-Datenbank abgelegt und enthält keine Konto-ID,
  Profildaten, Diagnosedaten oder Browserdaten.
- Eine zur Missbrauchsabwehr geprüfte Sitzung wird nicht in Nachricht oder
  Produktprotokoll mit dem Feedback verknüpft.
- Textlänge, Rate und Herkunft des Requests sind begrenzt; der Endpoint kann
  nicht als offenes Mail-Relay verwendet werden.
- Die Oberfläche besitzt einen klaren Erfolgs- und Fehlerzustand, zeigt keine
  technischen Rohfehler und lässt den Text bei einem Fehlschlag erhalten
  beziehungsweise kopieren.
- Der Datenschutzhinweis sagt knapp, dass der Versanddienst technische
  Zustellmetadaten verarbeiten kann.
- Domain-Onboarding, Absenderauthentifizierung und Verfügbarkeit des gewählten
  Versandwegs werden beim Bau fokussiert geprüft; daraus entsteht keine neue
  allgemeine Mailplattform.
- Die Kontolöschanfrage nutzt einen davon getrennten authentifizierten
  Nachrichtentyp mit der notwendigen Kontoidentität und demselben Prinzip der
  festen privaten Empfängerbindung. Feedback bleibt weiterhin ohne
  Konto-/Profildaten; beide Wege werden nicht vermischt.
- Ein dritter, interner Betriebs-Mailtyp darf denselben serverseitig
  gebundenen Mailtransport wiederverwenden, bleibt aber strikt von Feedback
  ohne Namensangabe und Kontolöschanfrage getrennt. Er verwendet einen festen
  Domain-Absender und privaten Empfänger; keine Empfängeradresse gelangt ins
  Frontend.
- Diese Betriebs-Mail wird nur nach Abschluss des einen in `PR-06`
  vorgesehenen Retryversuchs genau einmal versendet. Ihr Inhalt ist begrenzt
  auf: Zeitpunkt; automatische Funktion/Task-ID; initiale API-Operation;
  initialer API-Call `gemacht` oder `nicht belegt`; finalisierte Kosten
  `belegt` oder `nicht belegt` ohne geratenes `Null = 0`; initialer
  Fehlercode und knapper gespeicherter Grund; `Retry ausgelöst`;
  Retry-Operation; Retry-Ergebnis und gegebenenfalls dessen Fehlercode und
  knapper Grund.
- Analyse, Empfehlung, Payload, Prompt, Titel, Kontoinhalte, Rohantwort,
  Stacktrace, Secrets sowie öffentliche oder private Empfängeradressen sind
  ausgeschlossen. `E3` baut diesen Mailtyp und Transportvertrag, aber keinen
  noch nicht vorgesehenen automatischen Radar-Scheduler.

### `PR-08` – Bestehende Kino-Filter mobil erreichbar

Dies ist eine Anpassung des vorhandenen Filter-Dropdowns, kein Neubau einer
Suche oder Filterengine. Der Punkt gilt ausschließlich für den angemeldeten
Kinopfad und erzeugt keine Kino- oder Localmodus-Funktion ohne Konto.

- Die bestehende Filterlogik wird wiederverwendet: Kino, Datum,
  `Nur NonStop`/`Kein NonStop`, OmU, OV, DF, `Rest ab` und ganzes
  Tagesprogramm.
- Datum und Kino bleiben primär sichtbar.
- Das Zusatzfilter-Dropdown erhält eine eigene, visuell passende und mobil
  sichtbare Zeile. Die lokale Kino-Suche wird entfernt beziehungsweise
  ausgeblendet, weil die globale Suche diesen Zweck erfüllt.
- Aktive Filter sind mit Anzahl und Zustand erkennbar, beispielsweise
  `Filter · 2`. Zurücksetzen erscheint nur bei aktiven Filtern.
- Touchflächen sind mindestens 44 Pixel groß; der Bereich bricht bei 320 px
  und 393 px sauber um und bleibt auf Desktop stimmig.
- Abend- oder Genre-Filter sind nicht Teil dieses Punktes.

### `PR-09` – Grammatik und binäre Bereinigung sichtbarer Pfade

#### Schneller Textdurchgang

- Geprüft werden sichtbare Buttons, Überschriften, Hilfetexte, Leerzustände,
  Onboarding, Tooltips, Fehlermeldungen und wichtige sichtbare
  Bedienbeschriftungen.
- Nur klare Fehler, Tippfehler und unnatürliche Formulierungen werden geändert;
  bereits gute Texte bleiben unverändert. Der App-Ton darf locker und
  natürlich sein, Datenschutz-, Kosten- und Sicherheitstexte bleiben präzise.
- Für Radar gelten als Leitformulierungen `Ins Radar aufnehmen`, `Im Radar`
  und `Aus dem Radar entfernen`; `Ins Radar hinzufügen` wird vermieden.

#### Binäre Release-Regel

Jeder sichtbare Pfad der Release-Oberfläche hat einen funktionierenden
Endzustand. Ein sichtbarer Button, Menüpunkt oder Bereich, der existiert, aber
nichts Verlässliches bewirkt, ist unzulässig.

Der Baumeister prüft insbesondere die bereits benannten Flächen:

- Teilen und Paketaustausch,
- vollständiger Master-Import P2,
- Filmscan als externer Foto-/Text-Batch,
- Bloganalyse,
- Serienradar/Watchmode,
- Pilot-Import,
- Wartungs- und Owner-Werkzeuge,
- technische Radar-Einstellungen,
- `masterlist-enrichment`-Platzhalter,
- alte oder doppelte Radar-/Entdecken-Wege nach Abschluss des Haupttasks.

Zusätzlich gilt die Release-Flagmatrix verbindlich:

| Fläche | Zulässiger Releasezustand | Unzulässig |
|---|---|---|
| Radar | erst nach dem exakten Haupttask-Handoff binär vollständig aktiv und Ende-zu-Ende belegt oder in der Release-Oberfläche unsichtbar | sichtbarer leerer oder wirkungsloser Tab durch Hard-false |
| Entdecken | erst nach dem exakten Haupttask-Handoff binär vollständig aktiv und Ende-zu-Ende belegt oder in der Release-Oberfläche unsichtbar | sichtbarer leerer oder wirkungsloser Tab durch Hard-false |
| Kontoexport | nur sichtbar, wenn der genaue vollständige Exportumfang aller beibehaltenen Release-Kontodaten belegt und ausgewiesen ist; sonst UI verborgen und manueller Rechteweg dokumentiert | still nur lokale oder unvollständige Daten exportieren |
| Kontolöschung | alter automatischer Self-Delete bleibt aus; sichtbar ist ausschließlich die funktionierende authentifizierte Mailanfrage mit fest gebundenem privaten Empfänger | deaktivierter oder scheinbar automatischer Self-Delete-Pfad |

Ein Production-Hard-false darf keine als abgenommen behauptete sichtbare
Funktion neutralisieren. `AUS` ist nur zulässig, wenn die dazugehörige
Oberfläche tatsächlich unsichtbar ist.

Für jede Fläche gibt es nur zwei zulässige Ergebnisse:

1. Der sichtbare Weg funktioniert für seinen angezeigten Zweck Ende-zu-Ende,
   einschließlich verständlichem Erfolgs- und Fehlerzustand; oder
2. der unfertige Einstieg wird vollständig aus der Release-Oberfläche
   entfernt.

Ein eingeschränkter Funktionsumfang darf nur sichtbar bleiben, wenn **jede**
angezeigte Aktion dieses Umfangs vollständig funktioniert. Platzhalter,
wirkungslos deaktivierte Zukunftsbuttons und „kommt später“-Bedienpfade zählen
nicht als funktionierend. Nicht sichtbarer, inaktiver Zukunftscode kann für
ein späteres Projekt erhalten bleiben, wird aber nicht als Release-Funktion
behauptet.

### `PR-10` – Ein einziges integriertes Schlussgate und Privatrelease

Die früher getrennt formulierten Betriebs-, Praxis- und Releaseblöcke werden
zu **einer** Etappe zusammengezogen. Vorherige Baumeisterbelege werden nicht
wiederholt. Dieses Gate ist trotzdem erforderlich, weil nur hier der exakt
zusammengesetzte Release Candidate, seine Rückkehrfähigkeit und der wirklich
ausgelieferte Nutzerweg gemeinsam belegt werden.

Der Schlussgate-Baumeister führt auf dem eingefrorenen Release Candidate
genau einen kompakten Durchgang aus:

1. **Technischer Gesamtstand:** vollständige projektübliche Mocktests und
   Production-Build genau einmal auf dem exakten finalen RC-Commit; finaler
   Diff-, Secret- und Bundle-Check. Wiederholt wird dieser RC-Durchgang nur
   nach einer Änderung, die seinen Beleg entwertet. Derselbe Durchgang belegt
   einmalig das minifizierte Production-Bundle; alte Demo-Inhalte,
   öffentliche geschützte Datenartefakte, Backups und Source Maps sind anonym
   nicht abrufbar. Dafür entsteht keine zusätzliche Prüfetappe.
2. **Daten- und Zugriffssicherheit:** fokussierter
   RLS-/Kontotrennungscheck und Readback der in `E2` belegten Datenwege. Das
   vorgeschriebene logische Backup außerhalb des Repositories und die
   getrennte Restoreprobe gehören als `EFFECT_PRE` unmittelbar vor jede
   tatsächliche `E2`-Shared-Backend-Mutation, nicht erst in `E6`. `E6`
   wiederholt sie nicht ohne eine neue reale Shared-Write-Grenze.
3. **Eine praktische Abnahmematrix:** minimaler Login und Legal-Link;
   frischer leerer Localmodus; eigener lokaler Eintrag mit Refresh; Login ohne
   Import/Merge auf den `kd_personal`-Stand; unveränderter Gaststand nach
   Logout; keine Kontoüberschneidung; normales Konto mit Sync, zweitem Gerät,
   Konflikt und beschädigtem lokalem Zustand; Sicherheitsdownload mit
   separater Bestätigung vor lokaler Gesamtlöschung; genauer vollständiger
   Kontoexport oder verborgene Export-UI samt dokumentiertem manuellem
   Rechteweg; authentifizierte Kontolösch-Mailanfrage; Feedback;
   Kino-Mobilfilter ausschließlich im angemeldeten Pfad; Radar und Entdecken
   jeweils aktiv und Ende-zu-Ende belegt oder unsichtbar; normales Verhalten
   bei deaktivierter KI oder nicht verfügbarem Anbieter; bei jeder im RC
   tatsächlich aktivierten automatischen KI-Funktion außerdem der exakte
   bereits in `E3` gebaute und in den RC integrierte Checkerpfad mit
   dauerhaftem Sechs-Stunden-Termin, atomarem Claim,
   korrektem Erfolgsbeleg statt bloßer Kostenreservierung, höchstens einem
   Retry über alle normalen Gates, neuer Provider-Operation bei gleicher
   Job-ID, `retry_consumed = true`, keinem neuen Termin/dritten Versuch und
   genau einer datenminimierten Betriebs-Mail nach dem Retry; PWA,
   Safari/iPhone, Tastatur, 320-/393-Pixel-Format und Desktop. Der veraltete
   Sieben-Tage-/Revisionszustand wird bereits in `E2` deterministisch
   simuliert und nicht real abgewartet. Derselbe grün belegte Pfad wird nicht
   in mehreren Teilabnahmen wiederholt.
4. **Betriebsbereitschaft:** knappes Monitoring für reale Syncfehler,
   Functions, Mailversand und KI-Kosten, Supportweg, Cache-Entwertung und ein
   konkreter Rollbackweg sind für diesen privaten Umfang dokumentiert. Für
   eine tatsächlich aktive automatische KI-Funktion belegt `E6` zusätzlich
   dauerhafte Jobdaten, periodischen atomaren Claim, die Zuordnung von
   initialer und einmaliger Retry-Operation sowie den genau einmaligen
   getrennten Betriebs-Mailversand. `E6` prüft ausschließlich diesen bereits
   gebauten und integrierten Pfad und ergänzt keine Featurelogik. Ist keine
   solche Funktion Releasebestand, muss die vorgelagerte Flächenentscheidung
   den automatischen KI-Pfad sichtbar und vertraglich aus dem Release-Scope
   nehmen; es wird kein Scheduler oder Checker nur für die Abnahme erfunden
   und nichts als umgesetzt behauptet. Es entsteht weder ein
   400-MB-Backupmonitoring noch ein neues automatisches Backup-, Restore- oder
   Archivsystem.
5. **Lieferung:** Der Integrationsverantwortliche bindet den finalen
   RC-Commit an den in `PR-00` festgelegten Weg. Pull Request/CI gegen
   `staging`, Merge/Push mit Staging-Deploy, praktische Staging-Abnahme,
   Release-Commit/Tag, Pull Request/Merge `staging` → `main`,
   Production-Deploy und Smoke-Test auf `kinodreieck.at` bleiben getrennte,
   jeweils ausdrücklich zu autorisierende Wirkungen. Alte öffentliche Caches
   werden entwertet. Es gibt keine öffentliche Ankündigung, Demo oder
   Registrierung. Zugänge werden organisatorisch an höchstens 15 Konten
   vergeben; daraus entsteht kein technischer Cap.

Commit, Push, CI, Backendmutation, Deploy und praktische Abnahme benötigen
weiterhin ihre jeweils tatsächliche Liefergrenze und gegebenenfalls Max'
Freigabe. Sie werden nicht durch den Etappenplan vorautorisiert.

### `PR-11` – Nur ein kurzer Anker für das spätere Staging-LAB

`PR-11` ist ausdrücklich **keine Umsetzungs- oder Releaseanforderung** und
blockiert den Privatrelease nicht.

Nach abgeschlossenem Privatrelease erstellt der letzte Baumeister ausschließlich
eine kurze, read-only Diagnose als Anker für das nächste eigenständige
Projekt:

- Staging soll danach Max' persönlicher Spielplatz werden.
- Dort soll später ein lokaler KI-Assistent Eingaben maschinenbeschrieben
  lesen und schreiben können.
- Die Diagnose nennt knapp die derzeitigen Staging-Schreibpfade, ihre
  Authentifizierungs- und Kontogrenze, die vorhandene strukturierte
  Eingabeform sowie die kleinste konkrete Anschlussstelle für ein späteres
  Projekt.
- Sie hält fest, ob Staging und Production an dieser Anschlussstelle derzeit
  technisch gekoppelt sind; sie entwirft oder baut noch keine Trennung.
- Als späteres Ziel hält der Handoff fest: Staging wird am Hostname-Rand mit
  Cloudflare Access standardmäßig gesperrt und nur für Max freigegeben;
  anonyme Besucher und Crawler erhalten weder App-Assets noch Daten.
- Für den lokalen Assistenten nennt er höchstens den Bedarf eines getrennten,
  widerrufbaren Maschinenzugangs beziehungsweise einer Service-Identität,
  ohne diesen Zugang anzulegen.
- URL und Hostname können nicht als absolut geheim garantiert werden. Ein
  zufälliger oder gezielter Fund gibt wegen der vorgeschalteten Zugriffssperre
  dennoch keinen App-Inhalt frei.

Maximaler Lieferumfang: eine kurze Diagnose beziehungsweise ein kompakter
Handoff. Keine neue Assistentenarchitektur, kein lokales Modell, keine
Credentials, keine Staging-/Production-Migration, kein Maschinen-Schreibweg
und keine praktische Assistentenprobe.

## 3. Etappenfolge und Punktzuordnung

Die Abhängigkeiten sind verbindlich. Standard ist eine serielle Etappe. Eine
Parallelisierung ist nur zulässig, wenn vor ihrem Start die vollständige
Parallelmatrix der `kinodreieck-etappen-orchestrierung` direkte und indirekte
Disjunktheit bei Meilensteinen, Dateien/Globs, Verträgen, State/Schema,
Dependencies/Lockfiles, Konfiguration/Styles, Tests/Fixtures, Branches/
Worktrees und Remote-/Live-Wirkungen belegt. Unklar bedeutet seriell.
Gleichzeitig sind höchstens zwei Etappen-Baumeister aktiv; beide arbeiten in
getrennten Etappen-Branches und niemals direkt auf `staging`.

### Arbeitswellen und Abhängigkeiten

| Welle | Zulässige Etappen | Startbedingung | Verbindlicher Ausgang |
|---|---|---|---|
| `W0` | nur `E0` | separater `DONE`-Handoff des laufenden Radar-/Entdecken-Haupttasks | exakter `origin/staging`-Handoff-Commit, Dirty-State, Baseline, Etappen-/Integrationsbranchweg und ein Integrationsverantwortlicher; erst danach beginnt Produktarbeit |
| `W1` | standardmäßig nur `E1`; `E4` nur bei vorab vollständig belegter Parallelmatrix | `E0` abgenommen | `PR-01`/`PR-02` fokussiert belegt; ein eventuelles `E4`-Paket bleibt branchgetrennt und erhält noch keine gemeinsame Integration |
| `W2` | nur `E2` | `E1` final committed; nach Handoff Releaseflächen `BEHALTEN`/`VERBERGEN`/`ENTFERNEN` festgezogen | `PR-03` bis `PR-05`; Sync nur für beibehaltene persönliche Flächen; Zeit-/Revisionsfall deterministisch belegt |
| `W3` | nur `E3` | `E2` final committed und jede reale Shared-Wirkung geschlossen; nach Handoff tatsächlich aktive automatische KI-Releasefunktionen festgelegt | `PR-06` und `PR-07`; Web Analytics aus/kein Banner; getrennte Feedback-, Löschanfrage- und interne Betriebs-Mailverträge; für jede tatsächlich aktive automatische KI-Releasefunktion dauerhafter einmaliger Sechs-Stunden-Checker-/Retrypfad gebaut und dem Betriebs-Mailtyp zugeordnet; inaktive Flächen nicht künstlich aktiviert |
| `W4` | gegebenenfalls seriell `E4`, danach nur `E5` | `E1` bis `E3` sowie ein eventuelles `E4`-Paket sequenziell integriert | `PR-08` und anschließend `PR-09` abgeschlossen; bereinigter gemeinsamer Stand ohne wirkungslosen sichtbaren Pfad |
| `W5` | nur `E6` | `PR-00` bis `PR-09` sind abgenommen | integriertes Schlussgate und abgeschlossener oder klar blockierter Privatrelease |
| `W6` | nur `E7` | der Privatrelease aus `E6` ist tatsächlich abgeschlossen | ausschließlich der kurze read-only Folgeprojekt-Anker |

`E1` und `E4` sind nicht pauschal disjunkt; ohne vollständig belegte Matrix
laufen sie seriell. `E2` und `E3` laufen standardmäßig seriell, weil
Shared-Backend, Konfiguration und der Mail-/Löschanfragevertrag nicht als
disjunkt belegt sind. Gemeinsame Writes, Integration, Pull Requests, CI-
Lieferung, Deploys und Live-/Kostenläufe laufen immer seriell.

### Merge- und Wirkungsverantwortung

- Der in `E0` benannte Integrationsverantwortliche übernimmt fertige
  Etappencommits sequenziell in den eigenen Privatrelease-Integrationsbranch.
  Nur er verantwortet den gemeinsamen Zielstand, den später autorisierten Pull
  Request gegen `staging` und den Handoff an `E6`.
- Bei seriellen Etappen läuft die vollständige Mocksuite plus Build genau
  einmal auf dem finalen Etappencommit. Gibt es nach belegter Parallelmatrix
  mehrere Pakete für denselben Zielbranch, liefern deren Baumeister nur
  fokussierte Paketchecks; der Integrationsverantwortliche führt nach der
  sequenziellen Übernahme genau ein gemeinsames `FINAL_LOCAL` aus.
- Unmittelbar vor jeder tatsächlichen Shared-Backend-Mutation in `E2` bündelt
  dessen Baumeister logisches Backup außerhalb des Repositories und getrennte
  Restoreprobe mit Ziel, Autorisierung und Readiness in `EFFECT_PRE`. Erst
  danach darf genau die autorisierte Mutation erfolgen; Readback und Cleanup
  gehören in `EFFECT_POST`. Diese Schutzgrenze ist keine zusätzliche Etappe.
- Push oder Merge nach `staging`, Staging-Deploy, Shared-Backend-Write,
  Production-Merge/-Deploy sowie Live-/Kostenlauf sind jeweils eigene reale
  Wirkungen. Sie bleiben seriell und benötigen ihren objektgenau
  autorisierten Baumeister; Vorbereitung, Plantext, Pull Request oder grüner
  CI-Lauf erteilen keine Freigabe.

| Etappe | Ein Baumeister verantwortet | Zugeordnete Punkte | Abschluss dieser Etappe |
|---|---|---|---|
| `E0 – Aktivieren und Baseline festhalten` | fertigen Haupttask-Handoff, exakten `origin/staging`-Commit, Dirty-State, Branch-/Integrationsweg und Verantwortlichen festhalten | `PR-00` | exakte Baseline; keine direkte Arbeit auf `staging`, keine Radar-/Entdecken-Doppelarbeit |
| `E1 – Privatzugang und lokaler Modus` | minimalen Login/Legal-Pfad und leeren Localmodus bauen; bestehende Demo-UI/-Seeds/-Assets entfernen und Gastmechanik verengen | `PR-01`, `PR-02` | Login, Leerstart, lokale Trennung, Login ohne Merge und Logout fokussiert belegt |
| `E2 – Kontodaten und Sicherheitsdownload` | bestehende Synchronisation/Revisionen für beibehaltene persönliche Flächen wiederverwenden; Sicherheitsdownload und Dateneffizienz | `PR-03`, `PR-04`, `PR-05` | zweites Gerät, Konflikt, deterministischer Zeit-/Revisionsfall und Löschvorbereitung fokussiert belegt; jedes Shared Write mit `EFFECT_PRE/POST` |
| `E3 – Datenschutz, Feedback und automatische KI-Nachprüfung` | verständliche Daten-/KI-Transparenz, fest entschiedener Cookie-Pfad, Feedback, Kontolösch-Mailanfrage und getrennter interner KI-Betriebs-Mailtyp auf gebundenem Transport; für jede nach Handoff tatsächlich aktivierte automatische KI-Releasefunktion den dauerhaften einmaligen Sechs-Stunden-Checker-/Retrypfad bauen und dem Betriebs-Mailtyp zuordnen | `PR-06`, `PR-07` | getrennte Formular-/Mailtyp-/Empfängergrenzen und jeder tatsächlich benötigte Checkerpfad fokussiert belegt und integrationsbereit; inaktive Funktionen nicht künstlich aktiviert; kein Radar-Scheduler vorweggenommen; privater Kontakt nicht öffentlich |
| `E4 – Kino mobil` | vorhandenes Filter-Dropdown nur im angemeldeten Kinopfad mobil erreichbar machen | `PR-08` | 320 px, 393 px und Desktop fokussiert belegt; keine Localmodus-Funktion |
| `E5 – Release-Oberfläche bereinigen` | Grammatikdurchgang und binäre Entscheidung aller benannten unfertigen sichtbaren Pfade | `PR-09` | kein wirkungsloser sichtbarer Release-Pfad |
| `E6 – Integriertes Schlussgate` | einen Release Candidate einmal gesamt prüfen, bei tatsächlich aktiver automatischer KI ausschließlich den bereits in `E3` gebauten und integrierten Sechs-Stunden-Checker-/Retry-/Betriebs-Mailpfad praktisch abnehmen und nach Freigabe liefern | `PR-10` | alle sieben Liefergrenzen getrennt ausgewiesen; vorhandener Checkerpfad real belegt oder automatische KI-Fläche sichtbar/vertraglich aus dem Release-Scope genommen und nicht als implementiert behauptet; keine neue Featurelogik in `E6`; Privatrelease abgeschlossen oder klar blockiert |
| `E7 – Folgeprojekt-Anker` | nach dem Release ausschließlich die kurze read-only Staging-Diagnose schreiben | `PR-11` | knapper Maschinen-Schreibpfad-Handoff; keinerlei Bau |

## 4. Pflichtzeilen je Etappen-Abgabe

Der jeweilige Baumeister verwendet in seiner `DONE`-Übergabe genau die Zeilen
seiner Etappe und füllt sie mit dem Pflichtformat aus:

| Etappe | Pflichtzeilen |
|---|---|
| `E0` | `PR-00` |
| `E1` | `PR-01`, `PR-02` |
| `E2` | `PR-03`, `PR-04`, `PR-05` |
| `E3` | `PR-06`, `PR-07` |
| `E4` | `PR-08` |
| `E5` | `PR-09` |
| `E6` | `PR-10` sowie eine kompakte Referenz auf die bereits abgenommenen Zeilen `PR-00` bis `PR-09`; keine neue Einzelabnahme |
| `E7` | `PR-11` |

Der Meister führt daneben nur einen knappen Fortschrittsstand:

| Punkt | Zustand | maßgebliche Baumeister-Abgabe |
|---|---|---|
| `PR-00` bis `PR-11` | `OFFEN`, `ABGENOMMEN` oder `BLOCKIERT` | Link beziehungsweise Commit/Task-Referenz |

Er kopiert keine Testlogs und baut keine parallele Kontrollakte auf.

## 5. Übernahme des Reviews vom 28.08.2026

Der Reviewtext bleibt ein untrusted Befund und keine Autorisierung. Diese
Tabelle dokumentiert ausschließlich, wie Max' Entscheidung vom 29.08.2026 in
den offiziellen Plan übernommen wurde:

| Befund | Übernahme | Konsequenz im Plan |
|---|---|---|
| `B-01` | Kern zutreffend; alter Self-Delete überholt | explizite Flagmatrix; Radar/Entdecken aktiv+belegt oder unsichtbar; vollständiger Export oder verborgen; Kontolöschung nur als Mailanfrage |
| `B-02` | zutreffend | `E0` hält exakten `origin/staging`-Handoff-Commit, Dirty-State und Baseline fest |
| `B-03` | zutreffend | Branch → Integration → PR/CI → autorisiertes `staging` → autorisiertes `main`/Production ausdrücklich beschrieben |
| `B-04` | teilweise | Diagnose des bestehenden Gastpfads übernommen; kein Gast-Rückbau, sondern Verengung zum leeren Localmodus |
| `B-05` | Prozessbefund zutreffend; behauptete Bruchzahl unbewiesen | fokussierte Bauchecks plus genau ein `FINAL_LOCAL` je finalem seriellen Etappencommit beziehungsweise gemeinsamem Integrationscommit |
| `B-06` | zutreffend | Backup und getrennte Restoreprobe als `EFFECT_PRE` unmittelbar vor jeder realen `E2`-Shared-Mutation |
| `B-07` | zutreffend | Releaseflächen vor `E2` festziehen; `E2` synchronisiert nur beibehaltene Flächen; `PR-09` endet erst in `E5` |
| `B-08` | teilweise | `E2` und `E3` standardmäßig seriell; Parallelität nur nach vollständiger Matrix; gemeinsame Wirkungen immer seriell |
| `B-09` | teilweise | Zeit-/Revisionszustand deterministisch in `E2`; 15 Konten nur organisatorische Vergabegrenze; Staging bleibt bis `E6` RC-Umgebung |
| `B-10` | Kern zutreffend; Zusammenlegung `E4`+`E5` nicht zwingend übernommen | Web Analytics aus/kein Banner; `PR-08` reine mobile Layout-/Bedienkorrektur im angemeldeten Kinopfad; keine Registrierung neu bauen |

## 6. Bewusst nicht Teil dieses Masterauftrags

- Umsetzung weiterer Abend-/Genre-Kinofilter;
- öffentliche Registrierung, aktive SEO, Erstellung oder Veröffentlichung
  einer Sitemap, Marketing, öffentliche Auffindbarkeit oder App-Store-Release;
  eine Demo und Demo-Inhalte existieren nicht; der kleine zentrale
  Discovery-Block aus `PR-01` ist eine entfernbare Privatschutz-Konfiguration
  und ausdrücklich kein SEO-Projekt;
- öffentliche Downloads;
- Neubau von vollständiger Bloganalyse, vollständigem In-App-Filmscan,
  vollständigem Sharing oder vollständigem Master-Import allein für dieses
  Release – wenn diese Wege nicht schon vollständig funktionieren, greift die
  binäre Entfernung unter `PR-09`;
- Aufbau des persönlichen Staging-LABs;
- Bau oder Anbindung des lokalen KI-Assistenten;
- eine eigene Anbieterrechts-, Kapazitäts-, Prüf-, Review- oder
  Release-Management-Etappe;
- Web Analytics, Tracking, Werbung oder Cookie-Banner; für diesen Release
  bleibt es bei technisch notwendiger Speicherung.

Diese Ausschlüsse sind keine neuen Backlogpunkte. Sie verhindern lediglich,
dass der eingefrorene Releaseplan während der Abarbeitung anwächst.
