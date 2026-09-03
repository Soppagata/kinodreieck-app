# Road to Live: Etappenplan zum privaten Release

Stand: 03.09.2026

Status: `E5_STAGING_AUSGELIEFERT`; E6 als nächster Arbeitsblock vorbereitet,
`main`/Production unverändert.

Ziel: ein einfaches, stabiles privates Produkt auf `kinodreieck.at`.

Aktueller Einstieg: [Topographie](../privatrelease/TOPOGRAPHIE.md),
[Baufolge](#3-baufolge-und-paketgrenzen) und
[einziges Masterregister](#4-master-pflichtliste-und-einziges-fortschrittsregister).

Max hat die bisherige Produktarbeit am 31.08.2026 ausdrücklich abgeschlossen
und diesen Meister mit der lokalen Umsetzung beauftragt. Der am 31.08.2026
read-only bestätigte Remote-Stand `origin/staging` ist
`31f37f61e9da8f766489b99eab8565aa14ec1d81`.
Der Primärcheckout steht auf `03ff280386e27457eaea1cc9ecf24e36969e8a65`
(`codex/entdecken-tagesfeed-etappe3`) mit 9 modifizierten und 8 ungetrackten
Dateien. Er bleibt unverändert; übernommen wird gezielt dieser vorbereitete
Plan, nicht die fremden Produktänderungen.

Die jüngsten Radar-/Suchleistenkorrekturen sind damit die Baubasis, keine neu
zu auditierende Produktetappe. Deployment und praktische iPhone-Abnahme
wurden für diesen Handoff nicht erneut geprüft und werden nicht behauptet.

> Produktentscheidungen und sämtliche Muss-Anforderungen `PR-00` bis `PR-11`
> bleiben erhalten. Technische Reihenfolge und Paketgrenzen folgen dem Auftrag
> vom 31.08.2026 und dem aktuellen Orchestrierungsskill. Größere Änderungen des
> Nutzerwegs brauchen Max' Entscheidung. Vorbauten sind keine Integration;
> Rechtstextentwürfe sind keine rechtliche Freigabe.
>
> Der frühere Status `FUTURE_PLAN_METADATA_ONLY` beschreibt die Vorbereitung
> bis 30.08.2026. Autorisierte Etappen werden durch den Meister ohne zusätzliche
> Freigabe-Ping-Pong-Schleifen umgesetzt, geprüft und an ihr bereits gebundenes
> Ziel geliefert. Neu entschieden werden nur eine echte Scope-/Budgetausweitung,
> irreversible sensible Wirkung oder ein technischer Hard-STOP. Providerläufe,
> Mailversand und Production bleiben an ihren ausdrücklich vereinbarten Zaun
> gebunden.

## 1. Verbindliches Arbeitsmodell

Es gilt ausschließlich die aktuelle `kinodreieck-etappen-orchestrierung`.
Der Meister ist Integrationsowner und führt genau das Register in Abschnitt 4.
Er kartiert selbst kurz, hält den Nutzerweg zusammen und bleibt während des
Paketbaus in Produktdateien read-only. Es gibt keine Kartierungs-, Kontroll-,
Review- oder Lieferstandsagenten.

- Ein Paket bekommt einen verantwortlichen Baumeister und einen isolierten
  Branch/Worktree. Bis zu drei wirklich disjunkte Pakete dürfen parallel bauen;
  gemeinsame Verträge, Schema, Styles, Dependencies und Tests haben eindeutige
  Write-Owner. Eng gekoppelte Arbeit bleibt zusammen oder folgt später.
- Baumeister liefern vollständige nutzbare Wege und fokussierte Mockbelege.
  Keine Vollsuite pro Zwischencommit und keine eigene Prüfverwaltung.
- Nach DELIVERED integriert der Meister sequenziell in einen gemeinsamen
  Kandidaten. Neue Fachlogik geht als kurzes Delta an ihren Baumeister zurück.
- Ein gemeinsames `FINAL_LOCAL` umfasst relevante Integration, vollständige
  Mocksuite, Build, finalen Diff und die Meilensteinzuordnung. Nur relevante
  Kandidatenänderungen entwerten den Beleg. Im Solo-Pfad gehört das Gate dem
  Ende-zu-Ende-Baumeister, nach einer Parallelwelle dem Meister.
- Bei echter Außenwirkung kommen nur `EFFECT_PRE` und `EFFECT_POST` hinzu.
  Backup/Restore gehören ausschließlich an eine konkrete Datenmutation, die
  sie benötigt, oder an eine bindende Projektvorschrift. Eine lokale Änderung,
  Integration oder reine Auslieferung erzeugt keine eigene Backup-Etappe.
- `AGENTS.md`, Zugriffs-/Datenschutzgrenzen, serverseitige Kostenlimits und
  Effekt-Guard bleiben verbindlich. Exit 75, `AUTONOMIE_STOPP` oder
  `BUDGET_UNBEKANNT` stoppen weitere echte KI-Tests; keine Umgehung.
- Fehlende Freigaben stoppen nur die betroffene Wirkung. Disjunkter lokaler
  Bau geht weiter. Kein Dummy-Endzustand ersetzt einen funktionierenden Weg.

Paketabgabe: ID / Basis / Commit / tatsächliche Dateien / fokussierte Tests /
bekannte Integrationsnaht. Der Meister aktualisiert das eine Register nur bei
Dispatch, Blocker, Delta, DELIVERED oder Integration. Liefergrenzen werden am
Etappenende einmal getrennt berichtet: gebaut / getestet / committed /
gepusht / CI-grün / deployed / praktisch abgenommen. Unbelegtes bleibt offen.

## 2. Verbindlicher Produktumfang

### `PR-00` – Aktivierungs- und Integrationsgrenze

- Die Aktivierungsgrenze ist durch Max' Abschlussauftrag vom 31.08.2026
  erfüllt; ein weiterer künstlicher DONE-Handoff ist nicht erforderlich. `E0` hält danach den exakten
  Handoff-Commit auf `origin/staging`, die offenen Liefergrenzen, den lokalen
  Dirty-State und die daraus bestimmte Privatrelease-Baseline fest. Alte
  Zahlen oder Branchannahmen aus dem Review werden nicht ungeprüft übernommen.
- Der nächste Masterchat repariert oder wiederholt den Haupttask nicht.
  Etappen-Branches werden von der festgehaltenen Basis abgeleitet und niemals
  direkt auf dem gemeinsam genutzten `staging` bearbeitet.
- `E0` benennt vor der ersten Integration genau einen
  Integrationsverantwortlichen und hält den vorgesehenen Weg fest:
  Etappen-Branch → sequenzielle Übernahme in den eigenen
  Privatrelease-Integrationsbranch → lokal belegter Kandidat → konkret
  autorisierte Lieferung nach `staging` mit CI/Deploy → praktische Abnahme
  des Release Candidate in `E6` → separat autorisierte Production-Lieferung.
  Ob die benannte Lieferung über PR/Merge oder einen direkten force-freien
  Push erfolgt, wird vor genau dieser Wirkung gebunden; keine zusätzlichen
  PR-Schleifen allein aus historischen Planformulierungen.
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
  Legal-Fläche. Dort darf ausschließlich der von Max ausdrücklich bestätigte
  öffentliche Rechtskontakt erscheinen; der private serverseitige Empfänger
  und andere Kontaktadressen werden im Frontend nicht offengelegt.
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

Dieser Vertrag gilt ausschließlich für tatsächlich aktive **automatische**
KI-Funktionen mit Anbieterrequest. Einordnung der Basis vom 31.08.2026:
Radar besitzt bereits `radar-six-day-trigger`, serverseitige Daily-Claims und
`next_check_at` mit 144 Stunden. Der reguläre Entdecken-Scheduler ist
providerfrei (`providerRequests = 0`) und erhält deshalb keinen KI-Checker.
Manuelle Entdecken-Probes, manuelle KI, Tests und Mocks bleiben ausgeschlossen.
Aktivierungsflags und tatsächlich ausgeführte Schedulerläufe werden vor E3b
gezielt read-only bestätigt; Workflowcode allein beweist keine Aktivierung.
Die GitHub-CLI war beim Handoff nicht verfügbar, daher ist dieser Remote-Beleg
ausdrücklich noch offen.

Für jeden eingeschlossenen automatischen Anbieterweg gilt:

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
- Manuelle KI-Aktionen, Mocks/Tests und inaktive Scheduler erzeugen keine
  Jobs. E3b ergänzt den vorhandenen automatischen Radarweg, sofern seine
  tatsächliche Aktivierung bestätigt ist; es erfindet keinen zweiten
  Radar-Scheduler und aktiviert keinen stillgelegten Anbieterweg. Ein neuer
  periodischer Auslöser ist nur zulässig, wenn kein vorhandener serverseitiger
  Takt den fälligen Einmal-Claim ausführen kann; er darf niemals den
  gespeicherten Sechs-Stunden-Termin zurücksetzen. Umfang und Aktivierung
  einer solchen Infrastrukturwirkung werden vorab konkret freigegeben.
  Der providerfreie Entdecken-Regelbetrieb bleibt ausdrücklich ausgeschlossen.

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
  ausgeschlossen. `E3` baut diesen Mailtyp und Transportvertrag sowie die
  Nachprüfung des tatsächlich aktiven bestehenden Radar-Schedulers; keine
  zweite Schedulerarchitektur und keine zusätzliche Anbieteraktivierung.

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

Der Integrationsowner führt auf dem eingefrorenen Release Candidate
genau einen kompakten Durchgang aus:

1. **Technischer Gesamtstand:** vollständige projektübliche Mocktests und
   Production-Build genau einmal auf dem exakten finalen RC-Commit; finaler
   Diff-, Secret- und Bundle-Check. Wiederholt wird dieser RC-Durchgang nur
   nach einer Änderung, die seinen Beleg entwertet. Derselbe Durchgang belegt
   einmalig das minifizierte Production-Bundle; alte Demo-Inhalte,
   öffentliche geschützte Datenartefakte, Backups und Source Maps sind anonym
   nicht abrufbar. Dafür entsteht keine zusätzliche Prüfetappe.
2. **Daten- und Zugriffssicherheit:** fokussierter
   RLS-/Kontotrennungscheck und Readback der in `E2` belegten Datenwege.
   Ein erforderliches logisches Backup außerhalb des Repositories und eine
   getrennte Restoreprobe gehören unmittelbar vor die konkrete Datenmutation
   in `EFFECT_PRE`. Ob sie nötig sind, wird am tatsächlichen Mutationsziel
   begründet, nicht pauschal aus dem Etappennamen abgeleitet. `E6` wiederholt
   vorhandene Belege nicht ohne eine neue relevante Risikogrenze.
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

## 3. Baufolge und Paketgrenzen

Sechs stabile Nutzerergebnisse ersetzen die alten starren Einzelwellen. Die
PR-IDs und E-Nummern bleiben als Herkunft erhalten; Abschnitt 4 ist das
**einzige** Zustandsregister, keine zweite Abnahmeakte.

| Paket | Nutzerergebnis / Etappenherkunft | Abhängigkeit |
|---|---|---|
| P1 Zugang und Localmodus | E1: minimaler Login/Legal-Zugang, eigener leerer Localmodus, getrenntes Login/Logout, private Daten-/Assetgrenze | bestätigte Basis E0 |
| P2 Kontodaten, Sync und Sicherheitsdownload | E2: vorhandener Kontostand/Revisionen, Gerätewechsel, vollständiger Export oder verborgener Einstieg, sicherer lokaler Reset, einmalige Größenmessung | P1 und festgezogene Releaseflächen |
| P3 Datenschutz, Rechtliches und Mailwege | E3a: reale Datenübersicht, Vorbautexte, Feedback, authentifizierte Löschanfrage, gemeinsamer serverseitig gebundener Mailtransport | P1; Datenumfang P2 vor Textabschluss; externe Freigaben erst am Versand/Deploy |
| P4 Automatische KI-Nachprüfung | E3b: vorhandener aktiver automatischer Radarweg mit dauerhaftem Einmaltermin, exaktem Beleg, einem normalen Retry und Betriebs-Mail | aktive Trigger read-only belegt; P3-Transportvertrag eingefroren |
| P5 Mobile Bedienung und Release-Bereinigung | E4/E5: vorhandene Kinofilter mobil, klare Texte, nur funktionierende sichtbare Releaseflächen | E4 parallel zu P1; E5 erst nach P1–P4 integriert |
| P6 Integrierter Abschluss und private Lieferung | E0/E6/E7: gemeinsame Basis, ein Schlusskandidat, autorisierte Lieferung, Praxisabnahme; später kurzer LAB-Anker | PR-00–PR-09 vollständig zugeordnet; PR-11 erst nach tatsächlichem Release |

Erste Bauetappe: **PARALLEL_WAVE W1** mit P1/E1 und P5/E4. Beide beginnen auf
`31f37f61e9da8f766489b99eab8565aa14ec1d81`, nicht auf main.
Der Meister arbeitet in
`/private/tmp/kd-road-to-live.1E81XA/integration`, gemeinsamer Zielbranch
`codex/road-to-live-integration-20260831`.

| W1-Paket | Exklusive Schreibzuständigkeit | Eingefrorene Naht / Folgearbeit |
|---|---|---|
| P1/E1, Baumeister Zugang | Einstieg, Local-/Kontowechsel, Navigation/App, erforderliche Katalog-/Inhaltsgrenzen, Release-Assets/Build/SW, neue additive Accessmigration und zugehörige Mocktests; bestehende globale Styles und bestehende mobile Tests; keine KinoTab-Datei | unveränderte KinoTab-Props; kein Mail-/KI-Checker-/Sync-Neubau; keine Provideradapteränderung; Lockfile unverändert |
| P5/E4, Baumeister Kino | ausschließlich `src/tabs/KinoTab.jsx`, neue `src/styles/kino-filter.css`, `kino_mobile_filter_test.mjs`, `tests/kino-mobile-filter.spec.mjs` | App-Props und Filterlogik bleiben; eigene CSS-Datei statt globaler Styles; lokale synthetische Kontofixture; keine Änderung gemeinsamer Tests/Config/Dependencies |
| Meister | dieser Plan, Topographie, Roadmap-/Zukunftseinstieg; nach Lieferung kleine benannte Integrationsnähte | tatsächliche Kino-Tests im gemeinsamen mobilen Testfile erst bei Integration an den entfernten lokalen Sucheinstieg anpassen |

Einmalige Kollisionsentscheidung P1×E4: **PARALLEL_OK**. Gemeinsames Lesen ist
frei; Datei-/Generatorflächen, öffentliche Props, State/Schema, Config/Styles,
Dependencies/Lockfile, Tests/Fixtures und Worktrees sind getrennt. E4 benötigt
keinen Output aus P1. Die vorhandene Konto-Prop `angemeldet` bleibt stabil.
Schreibflächen außerhalb des Auftrags erzeugen nur beim betroffenen Paket
`BLOCKER:SCOPE_DRIFT`. Keine Remote-/Live-Wirkung in W1.

P1-Scope-Delta vom 31.08.2026 (vereinbart, nach Blocker nicht umgesetzt): Der
vorhandene fertige Entdecken-Pool mit seinen Fakten steckt noch statisch im
Frontend. Als zusätzliche P1-Schreibfläche war
`supabase/functions/_shared/privateReleaseDiscoveryPool.js` vorgesehen, um
genau diesen unveränderten Bestand über den authentifizierten GET des
bestehenden Entdecken-Endpunkts zu liefern. Kein neuer Provider, keine
Rankingänderung und kein Rückfall auf einen älteren Feed. Kontoproduktdaten,
Beilagen und Backend bleiben im gelieferten Checkpoint unverändert.

P1-Freigabe und Umsetzung vom 01.09.2026: Max hat nach der konkreten
Wirkungsbeschreibung vollständig bestätigt, dass der Login ausschließlich den
Kontostand lädt, den getrennten Gaststand weder überschreibt noch merged oder
hochlädt und ihn nach Logout wieder sichtbar macht. Ebenfalls bestätigt ist
die kontogebundene Katalog-/App-Grenze: Ohne Konto gibt es keine
bereitgestellten Kino-, Streaming-, Entdecken- oder Blogflächen und keine
Katalog-HTTP-/Cache-Reads; für berechtigte Konten bleiben Live-Zeilen,
Reihenfolge, Filter und Projektionen unverändert. Integriert sind
`9804e10`, `c0743e2` und `55b8276`. Ein beim statischen Meistercheck gefundener
Rattenschwanz ist geschlossen: Der Localmodus besitzt einen schlichten
`Anmelden`-Weg zurück in denselben Minimal-Login, ohne Settings-, Sync- oder
Backuptechnik freizulegen oder lokale Daten zu verändern. Der P1-Checkpoint
ist damit lokal gebaut, aber wegen der übrigen Server-/Asset-/Releaselücken
weder vollständiger PR-01/02-Abschluss noch ein lieferbarer Privatrelease.

Integrationsreihenfolge nach Auflösung des P1-Blockers: Planstand → unabhängiger
P5/E4-Commit → kohärenter P1-Checkpoint → minimale Login-Re-Entry-Naht → einmal
FINAL_LOCAL des begrenzten lokalen Kandidaten. Die weiteren Pakete werden erst
aus dem integrierten Stand zugeschnitten; es gibt keinen zweiten
Integrationsowner.

Releaseflächen vor P2: Radar/Entdecken und die abgeschlossene globale Suche
bleiben beabsichtigte Kontofunktionen; keine neue Produktprüfung oder
Hard-false-Entleerung. Demo und öffentliche Downloads werden entfernt.
Sharing/Import/Filmscan/Bloganalyse/Watchmode-/Pilot-/Owner-/Legacy-Pfade
werden anhand vorhandener Belege innerhalb PR-09 einmal auf
BEHALTEN/VERBERGEN/ENTFERNEN festgezogen. Ein bisher funktionierender
Produktweg wird nicht ohne begründete Rückfrage verkleinert. Neue Syncflächen
für künftig verborgene Werkzeuge werden nicht gebaut.

## 4. Master-Pflichtliste und einziges Fortschrittsregister

Owner ist immer genau ein Paketverantwortlicher; bei noch nicht gestarteten
Paketen hält der Meister den Auftrag. OFFEN = Ergebnis fehlt; GEBAUT = lokal
implementiert und fokussiert belegt; DONE = einschlägig geprüftem finalen
Kandidatencommit und Zielbranch zugeordnet. BLOCKIERT nennt ausschließlich die
konkrete fehlende Entscheidung/Wirkung. Teilbelege in einer Zeile erledigen
nicht still deren übrige Muss-Anforderungen. Die vollständigen Muss-Sätze in
Abschnitt 2 sind verbindlicher Bestandteil der jeweils genannten Zeile.

### Aktueller Meisterstand und E5-Stagingkandidat – 03.09.2026

Gemeinsamer E5-Produktkandidat ist `0044769` auf
`codex/road-to-live-integration-20260902`. Er führt den auf `staging` und
`main` ausgelieferten Login-/Konto-Recovery-Stand `24bbddc`, die E1-/E2-
Grundlagen, E3a-Mail/Legal und die auf Staging ausgelieferte E3b-Nachprüfung
mit der binär bereinigten privaten Release-Oberfläche zusammen. Der Primärcheckout
`03ff280` samt fremden Änderungen bleibt unberührt.

| Meilenstein | Nutzerergebnis | Zustand | Kandidat / offen |
|---|---|---|---|
| M1 | Login schützt den Online-Einstieg, Kontodaten laden wieder, und „Ohne Konto fortfahren“ öffnet ausschließlich den lokalen Stand | GEBAUT | `2a50386`; vollständiger RC und praktische PWA-Abnahme offen |
| M2 | Konten und Revisionen bleiben getrennt; Sicherheitsdownload und Kontoexport behaupten nur belegte Umfänge | GEBAUT; REALE GRÖSSENMESSUNG ABGESCHLOSSEN | `2a50386`; der inhaltsfreie Messweg ist als `2fd5674` integriert. Der einmalige E6-Readback über alle 13 Releaseklassen ergab 177 Zeilen und 120.660 Bytes; keine Inhalte/IDs/Secrets und keine DB-Mutation. Physische Praxis auf zwei Geräten bleibt offen |
| M3 | Feedback ohne Namensangabe und authentifizierte Löschanfrage laufen über einen begrenzten, servergebundenen Mailweg | AUF STAGING AUSGELIEFERT; PHYSISCHES IPHONE OFFEN | Staging `54b4f299fb453629128cb40950c5874d4b81f542`: Migrationen, digestgebundene Secrets, `ACTIVE` Function v2 mit `verify_jwt=true`, fünfdateilige Source-Closure, Staging-CORS, Cloudflare-DNS und Resend-Domain sind belegt. Genau ein synthetischer Staging-Request endete ohne Retry mit HTTP 200 `accepted`; der inhaltsfreie Ledger zeigt eine akzeptierte Operation und zwei Rate-Buckets, Resend meldet `delivered`. GitHub-Lauf `33724772325` ist vollständig grün einschließlich `npm test`, Function-Tests, Chromium, WebKit, atomarer Deployment-URL und fester Staging-Domain. Der unabhängige frische Browserkontext belegt Minimal-Login, Legal-Fläche, exakte Build-Version und aktiven Service Worker. `main` blieb auf `24bbddc`; nur die physische iPhone-PWA-Abnahme bleibt offen |
| M4 | Nur tatsächlich aktive automatische KI-Jobs erhalten genau eine Nachprüfung nach sechs Stunden und höchstens einen Retry | AUF STAGING AUSGELIEFERT; AKTIVER +6H-BETRIEBSBELEG OFFEN | Scheduler-Authentifizierung ist korrigiert. GitHub-Lauf `33599267721`, Attempt 3, belegt genau ein fälliges Werkziel, einen Anthropic-Request, einen Websearch und 3,0078 US-Cent. Die service-only Migrationen `20260903193000`/`20260903213000` sind atomar angewandt und rückgelesen: leeres RLS-Ledger, fünf Ledger- und drei Radar-RPCs nur für `service_role`. `radar-websearch-task` v58 und `automatic-ai-check` v1 sind `ACTIVE`, ihre gebündelten Verträge rückgelesen und keine der Functions wurde nach dem Beleglauf aufgerufen. Staging `e828083` und GitHub-Lauf `33792056461` sind grün; die feste Domain liefert dieselbe Buildversion. Der stündliche GitHub-Schedule läuft technisch erst vom Default-Branch `main`; deshalb aktiviert die reine Staging-Lieferung noch keinen +6h-Checker und `main` bleibt unverändert |
| M5 | Bereinigter, integrierter Privatrelease-Kandidat mit einem gemeinsamen Abschlusslauf | AUF STAGING AUSGELIEFERT; PHYSISCHE PWA-ABNAHME OFFEN | Produktkandidat `0044769` und Dokumentationsspitze `1f0bd016`: Settings-, Radar-/Entdecken- und Blog-Pakete samt Master-Nähten integriert. `npm test` lokal vollständig grün; GitHub-Lauf `33796531485` ist einschließlich Gesamtsuite, Chromium, WebKit und `deploy-staging` erfolgreich. `origin/staging`, feste Domain-Buildmetadaten und PWA-Service-Worker liefern exakt `1f0bd01615078f501e52c865e6095841a30b4ca1`; `main` blieb `24bbddcd123d5738ab1021ff2fb14c8a949ffde6`. Keine echten KI-, Mail- oder Provideraufrufe; physische iPhone-PWA-Abnahme offen |

E6 beginnt auf der ausgelieferten Staging-Spitze `1f0bd016` und übernimmt die
grünen M1–M5-Belege, statt sie neu auszuführen. Es ergänzt keine Featurelogik.
W5 wurde auf der dokumentarischen Basis `2522091` in drei disjunkten Paketen
gebaut und als `21f814b`, `32e1111` und `915fc83` integriert: reproduzierbares
Offline-OSS-Inventar, finaler Secret-/Bundlebeleg sowie eine kompakte
5–10-Minuten-Praxismatrix. Der unveränderte Produktkandidat `0044769` besitzt
0 Source Maps und besteht den zusätzlichen Leak-Scan mit einer eng an Literal,
Anzahl, Pfade und Hashes gebundenen Ausnahme für den bestätigten öffentlichen
Legal-Kontakt. Jede andere E-Mail- oder Secretklasse bleibt blockierend.

Die einmalige reale Kontogrößenmessung ist ebenfalls abgeschlossen: 177 Zeilen
und 120.660 Bytes über alle 13 Releaseklassen, rein lesend und ohne Ausgabe von
Inhalten, Konto-ID oder Secrets. Die vorbereitete Mess-RPC-Migration ist remote
nicht installiert und wurde für den Readback nicht benötigt; es gab keine
Schema- oder Datenmutation. Das OSS-Inventar umfasst 214 Lockfile-Einträge und
ist in zwei getrennten Offline-Läufen bytegleich. Es ist ein technischer Beleg,
keine Rechtsfreigabe; insbesondere bleiben Lizenztexte/NOTICE-Auswahl und die
Werkzeugklassifikation `scheduler@0.27.0` als `UNKNOWN` offen.

Ein aktueller rein lesender Header-Readback liefert für Staging und Production
jeweils HTTP 200, die gehärteten Sicherheitsheader und
`X-Robots-Tag: noindex, nofollow`. Die bestehende produktive
54/54-RLS-Kontotrennung sowie die späteren service-role-only E3b-Readbacks
werden übernommen, weil W4/W5 weder RLS noch Backend- oder Datenlogik geändert
haben. Ein breiter neuer Echtdaten-RLS-Lauf ist deshalb nicht Teil von E6.

Damit bleiben vor der Production-Lieferung nur reale Nutzungs-/Wirkungsgrenzen:
die kurze physische iPhone-/Zweitgeräte-Praxis, die Default-Branch-Aktivierung
des bereits gebauten +6h-Checkers und danach die separat gebundene
`staging`-zu-`main`-/Production-Lieferung samt finalem Domain-/Discovery-
Readback. Vorher gibt es keinen weiteren bezahlten Testlauf und keine
künstlich erzeugte Radar-, Mail- oder Löschoperation.

W2 ist eine `PARALLEL_WAVE` auf exakt `2a50386`; Meister-Worktree und
Zielbranch bleiben `/private/tmp/kd-road-to-live-integration-20260902` und
`codex/road-to-live-integration-20260902`.

| Paket | Meilenstein | Ergebnis | Write-Ownership | Zustand |
|---|---|---|---|---|
| A / E3a-Endpoint | M3 | authentifizierter, origin-/größen-/rate-/idempotenzbegrenzter serverseitiger Requestweg; ohne belegten Provideradapter fail-closed | nur neue Function `supabase/functions/private-mail-request/**`, eigener fokussierter Test und optional eigener `supabase/config.toml`-Block | INTEGRATED als `484a63b` |
| B / E3a-UI | M3 | Feedback- und Kontolöschanfrage mit ehrlichen Zuständen, erhaltenem/kopierbarem Text und ohne private Adresse | `src/services/privateMail.js`, neue eigene UI-Komponente, `src/components/PrivatePilotOps.jsx`, `src/tabs/DatenTab.jsx`, `src/config/runtime.js`, `.env.example`, eigener fokussierter Test | INTEGRATED als `a300756` |
| C / E2-Größenbeleg | M2 | inhaltsfreier, aggregierter Größenbericht über alle beibehaltenen kontogebundenen Flächen | nur neue Größen-RPC-Migration, `tools/account_size_report.mjs` und eigener fokussierter Test | INTEGRATED als `2fd5674` |

Die vorhandenen Mail-Verträge und -Migration, `package.json`, Lockfile,
globale Styles, Radar, Entdecken, Kino und Streaming sind während W2
read-only. A×B teilen nur den eingefrorenen Request-/Responsevertrag; A×C und
B×C besitzen keine Write- oder Output-Abhängigkeit. Es gibt in W2 keine
Außenwirkung. Integrationsreihenfolge: C, A, B; der Resend-Adapter bleibt bis
zu einem echten redigierten Probe-Payload eine Folgewelle.

W2 ist auf `be77b0b` gemeinsam abgeschlossen: vollständiges Standard-
`npm test` Exit 0 einschließlich Mock-Suiten, Single-File-, Vite-Production- und
Pages-Build. `git diff --check` ist leer; das Produktionsbundle enthält keine
der geprüften Mail-/Service-Secretmarker und keine Source Maps, der öffentliche
Demo-Sidecar fehlt. Das ist ein lokaler Zwischenabschluss, kein Push, Deploy,
Migration, Providerrequest oder praktischer Releasebeleg.

E3a-Folgewelle W3 beginnt für beide disjunkten Pakete auf exakt `32bf27e`:

| Paket | Meilenstein | Ergebnis | Exklusive Write-Fläche | Eingefrorene Verträge |
|---|---|---|---|---|
| D / Resend-Adapter | M3 | serverseitig gebundener Resend-Transport aus dem realen `200/200/409`-Vertrag; API-Key, Domainabsender und privater Empfänger ausschließlich als Server-Secrets; fail-closed Aktivierung | neue Adapterdatei und eigener Test, `supabase/functions/private-mail-request/index.ts`; keine Browser-/Legal-Dateien | bestehender Mailvertrag, Endpoint-Core, UI, Migration, Radar/Entdecken/Kino/Streaming |
| E / Legal-Abschluss | M3 | vorhandene Datenschutz-/Rechtstemplates für den Privatrelease zusammenführen; bestätigter neutraler Kontakt und Resend-Hinweis; keine erfundenen Betreiber- oder Rechtsbehauptungen | Login-Legal-Komponente, neue eigene Legal-Daten-/Testdatei; keine Function-/Providerdateien | bestehender Mailvertrag, Adapterfläche, Produktfunktionen, globale Styles und Dependencies |

W3 hat keine Paket-Außenwirkung. Der Meister integriert D und E sequenziell,
verdrahtet nur die gemeinsame Testsuite und führt genau einen lokalen
Abschlusslauf aus. Erst danach folgen die bereits freigegebene Domain-
Authentifizierung, serverseitige Secrets, additive Mailmigration, Function-
Aktivierung und Staging-Lieferung. Vorgesehener Absender ist
`feedback@kinodreieck.at`; der private Empfänger bleibt ausschließlich im
Server-Secret. Der von Max bestätigte neutrale Kontakt darf in der Legal-Fläche
erscheinen.

E3a-Stagingabschluss auf
`54b4f299fb453629128cb40950c5874d4b81f542`: Die vollständige lokale
`npm test`-Suite, 334 Function-Tests sowie die fokussierten UI-, Endpoint-,
Adapter-, Release-Wiring- und Postgres-Guardprüfungen sind grün. Die
PWA-Korrektur entfernt ausschließlich den unnötigen `Cache-Control`-
Requestheader und verlängert den Browserabschluss von 20 auf 30 Sekunden.
Remote sind die Access- und Mail-Ledger-Migration einschließlich
Readback grün; die vier Basissecrets wurden nicht nur dem Namen nach, sondern
gegen ihre lokalen Sollwert-Digests rückgelesen. Das separate
Aktivierungssecret ist gesetzt. Die Function
`private-mail-request` ist `ACTIVE` in Version 2 mit `verify_jwt=true`, ihre
fünf senderelevanten Dateien sind bytegleich zum lokalen Stand und der echte
Staging-CORS-Preflight ist grün.

Die vier von Resend erzeugten DNS-Vorgaben wurden in Cloudflare eingetragen;
die bestehenden Pages-CNAMEs für Apex und Staging blieben unverändert. Der
autoritative sowie öffentliche DNS-Readback ist grün und Resend zeigt
`kinodreieck.at` als `verified`. Danach lief genau ein synthetischer,
inhaltsfreier Staging-Feedbackrequest ohne Retry: HTTP 200 `accepted`, genau
eine passende Ledgeroperation `accepted`, zwei erwartete Rate-Buckets und
Resend-Status `delivered`. Es gab keinen zweiten Send.

Der force-freie Staging-Push ist abgeschlossen. Ein erster CI-Lauf legte nur
den irrtümlich macOS-festen PostgreSQL-Testpfad offen; die portable,
hermetische Auflösung ist in `035ce62`/`39fe1f4` korrigiert. Der danach
erfolgreiche Cloudflare-Upload zeigte für einen kurzen Moment einen neuen
Service Worker neben einer alten `index.html`; `54b4f29` koppelt deshalb
Build-Meta, Service Worker, Startseite, Entry-Asset und Minimal-Login in jedem
Custom-Domain-Retry. GitHub-Lauf `33724772325` ist vollständig grün:
`npm test`, Function-Tests, Chromium, WebKit, atomare Deployment-URL und
`staging.kinodreieck.at`. Der unabhängige Direktreadback belegt dieselbe
Build-Version, revalidierten Service Worker, passendes Entry-Asset und
Sicherheitsheader. Ein frischer isolierter Chromium-PWA-Kontext belegt
Minimal-Login, Legal-Fläche mit Resend-/30-Tage-/USA-Hinweis und aktiven
Service Worker. `main` blieb unverändert auf `24bbddc`; nur die physische
iPhone-PWA-Abnahme durch Max bleibt offen.

E3b ist damit strukturell vorbereitet, aber beginnt nicht mit Retrycode,
sondern mit dem vorhandenen Scheduler-403:

| Paket | Ergebnis | Exklusive Write-Fläche | Abhängigkeit / Zustand |
|---|---|---|---|
| F / Scheduler-Authentifizierung | GitHub-Schedulersecret und Function-Default-Key ohne Wertausgabe fingerprinten, auf denselben modernen Serverkey ausrichten und genau einen planmäßigen Initiallauf beobachten | ausschließlich Workflow-/Secret-Bindung und nötiger Betriebsbeleg; keine Produktlogik | DONE: Auth-Fix und begrenzter Beleglauf `33599267721` Attempt 3 erfolgreich; danach kein weiterer Anbieterlauf |
| G / Dauerhafter +6h-Zustand | additive service-role-only/RLS-Migration für logische Job-ID, Initialoperation, unveränderliches `check_due_at`, atomaren Due-Claim, `retry_consumed`, Retryoperation und Mailstatus; keine Titel, Suchtexte, Adressen oder Payloads | neue Migration und eigener disposable-Postgres-Test | INTEGRATED als `e888f84`; Migration remote atomar angewandt, RLS/Rechte/0 Zeilen rückgelesen |
| H / Einmal-Checker | neue kleine Function plus periodischer Workflow; nur fällige allowlistete aktive automatische Anbieterjobs, kein Body, kein Curl-Retry, keine sensitiven Logs | neue `automatic-ai-check`-Function, eigener Workflow und Tests | INTEGRATED als `b866537`; Function v1 remote `ACTIVE`, nicht aufgerufen; Workflow auf Staging nur versioniert, nicht zeitgesteuert aktiv |
| I / Automatischer Radar-Ursprung | Initialclaim atomar mit Scheduler-Ursprung, logischer Job-ID und exaktem Ziel verbinden; Retry mit derselben Job-ID, neuer Provideroperation und allen bestehenden Gates | nur additive RPC/Migration und die kleinste Scheduler-Naht in `radar-websearch-task`; keine Radar-Fach-, UI-, Such- oder Ergebnislogik | INTEGRATED als `f58a844`; Bindungsmigration remote, Radar v58 `ACTIVE`; Fach-, Such- und Ergebnislogik unverändert |
| J / Betriebs-Mail-Bindung | vorhandenen internen `operational-retry`-Builder und Resend-Adapter nach terminalem Retry genau einmal aufrufen; kein Browserweg und kein Mail-Retry | neue serverinterne Checker-Bindung und fokussierte Tests | INTEGRATED als `05fe0b3`; mit Checker deployt, kein Testversand und keine reale Betriebs-Mail ausgelöst |

Erst F belegt einen real laufenden Initialtrigger. Danach können G und J
disjunkt gebaut werden; H integriert G, und I bleibt bis zur schmalen
technischen Radar-Freigabe geschlossen. Kein Paket verändert Radar-,
Entdecken-, Kino- oder Streaming-Ergebnisse. Ohne I wird kein unsicherer oder
potenziell dritter Anbieteraufruf als Ersatz gebaut.

E3b ist lokal bis `6688031` integriert und mit Dokumentationscommit `e828083`
force-frei auf Staging geliefert. `npm test` einschließlich Production-
und Pages-Build sowie `npm run test:function` mit 334/334 Tests sind grün;
`git diff --check` ist leer. Remote blieben Monatsdeckel 1000, Request-Cap 500
und Radar-Task-Cap 20 US-Cent unverändert. Nach dem einmaligen F-Beleglauf
blieben Verbrauch 3,0078 US-Cent, Ledgerzeilen 0 und weitere Provider- oder
Mailaufrufe 0. Die reine Staging-Lieferung versioniert den periodischen Workflow,
aktiviert ihn wegen GitHubs Default-Branch-Regel aber noch nicht. Ein echter
+6h-Retry samt genau einer Betriebs-Mail bleibt deshalb praktische E6-Abnahme,
nicht ein weiterer Testlauf dieser Etappe.

P5/E5 wurde als `PARALLEL_WAVE W4` auf exakt `e828083` gebaut. Die Bereinigung
ändert keine Datenmodelle, Serverpfade, Radar-/Entdecken-Ergebnisse, Kino- oder
Streaminglogik. Sichtbare Kernwege werden behalten; nicht freigegebene
Veröffentlichungs-, Import-/Restore-, externe Foto-KI-, Blogprofilanalyse-,
Wartungs-, Download- und Easter-Egg-Einstiege werden nur aus der Release-
Oberfläche entfernt. Bestehende persönliche Daten oder Serverzustände werden
nicht gelöscht oder umgeschrieben.

| Paket | Nutzerergebnis | Exklusive Write-Fläche | Eingefrorene Grenze / Zustand |
|---|---|---|---|
| K / Einstellungen | Settings zeigt Darstellung, KI-Wahl, Geschmacksprofil, Konto-/Sync, Datenrechte, Sicherheitsdownload, Streamingquellen und Legal; keine Rohdatenimporte, externe Foto-KI, Blogprofilanalyse, Owner-Wartung, Einzeldatei oder versteckten Modi | `src/tabs/DatenTab.jsx`, `src/components/GeschmackBereich.jsx`, neuer fokussierter Test | keine App-/Sync-/KI-/Kataloglogik; persönliche Daten bleiben bytegleich; geliefert `93c8454`, integriert `621db12` |
| L / Radar & Entdecken | bestehende Empfehlungen, Zielsuche, Ziel-/Funde-Trennung, Personen/Reihen/Staffeln, Status und Verwaltung bleiben; Radarwortlaut ist konsistent und es gibt kein öffentliches Share-Opt-in | `src/tabs/EntdeckenTab.jsx`, `src/components/RadarSubscriptionPreview.jsx`, neuer fokussierter Test | keine Radar-RPCs, Stores, Such-, Ergebnis- oder Datumslogik; `onConfirm` bleibt kompatibel mit `shareEnabled:false`; geliefert `0cd31d0`, integriert `a12d6f9` |
| M / Persönlicher Blog | eigene Artikel bleiben erstell-, abgleich-, les-, bearbeit- und löschbar; neue öffentliche Veröffentlichung, öffentliche Blogsuche und Rohimport sind im Privatrelease nicht sichtbar | `src/tabs/BlogTab.jsx`, neuer fokussierter Test | bestehende Artikel-/Syncdaten unverändert; kein Serverwrite im Test, sichere Altartikel-Löschung bleibt möglich; geliefert `08d5920`, integriert `be2ff5d` |

Die disjunkten Lieferungen trafen in der Reihenfolge M → L → K ein und wurden
ohne Dateikonflikt integriert. Der Meister schloss ausschließlich die lokale
Blog-Publikationsnaht (`72b2aaf`) und band die drei Paketverträge sowie die
angepassten Bestandsverträge als `f96ad93`, `cdafa7e` und `0044769` ein.
Das gemeinsame `npm test` einschließlich Production-/Pages-Build ist grün;
`git diff --check` ist leer. `main` bleibt bis zur eigenen Production-Etappe
unberührt.

Historischer Vorbereitungsstand auf `4731c0c`: Die vollständige lokale `npm test`-Suite ist
grün. Remote sind die Access- und Mail-Ledger-Migration einschließlich
Readback grün; vier Basissecrets sind vorhanden, während
`KD_PRIVATE_MAIL_TRANSPORT_ACTIVATION_SECRET` absichtlich fehlt. Die Function
`private-mail-request` ist `ACTIVE` in Version 2 mit `verify_jwt=true` und
bleibt ohne Aktivierung fail-closed. Der fertige Kandidat beschränkt den
Servertransport vor E6 auf den Staging-Origin und richtet den Deployment-Smoke
auf den privaten anonymen Leer-/Rechtestopp aus. Der Post-Deploy-Readback
belegt HTTP 401
vor dem Handler ohne Zugangsdaten, `unauthenticated` mit rein öffentlichem
Projekt-Key sowie weiterhin je null Zeilen in Operations- und Rate-Tabelle;
damit gab es keinen Claim oder Transport. Nach Resend-Dashboard-Login wurde
`kinodreieck.at` angelegt; die vier tatsächlich erzeugten DNS-Vorgaben sind
erfasst und ihre Zielnamen waren im öffentlichen Vorher-Readback leer.
Dieser historische Absatz endete noch vor DNS-Mutation, Provider-Send und
Staging-Push. DNS-, Provider- und E3a-Stagingblocker sind mit dem oben
dokumentierten Einmallauf und dem grünen Lauf `33724772325` geschlossen.
E3b ist nach obiger Paketfolge geöffnet; sein erstes Startgate bleibt der
Scheduler-403, nicht der Bau eines Retries auf Verdacht.

| Punkt / Paket | Vollständige Master-Pflichten | Verantwortlich | Zustand / knapper Beleg |
|---|---|---|---|
| PR-00 / P6, E0 | Max-Handoff; einmal exakte Staging-Basis und Dirty-State; Primärcheckout erhalten; isolierte Bau-/Integrationsbranches; ein Integrationsowner; PR/CI/Push/Deploy getrennt autorisieren; Staging bis E6 RC; Releaseflächen vor P2 festziehen | Meister | GEBAUT für Handoff/Isolation: `origin/staging` und `origin/main` am 02.09.2026 als `24bbddc` remote bestätigt; `03ff280` lokal dirty erhalten. Flächenentscheidung und spätere Lieferung OFFEN |
| PR-01 / P1, E1 | Minimaler Erstlogin: Benutzername, Passwort, Anmelden, Ohne Konto, Status/Fehler, genau ein Legal-Link; keine Registrierung; ausschließlich bestätigter öffentlicher Legal-Kontakt, kein privater Serverempfänger/weitere Kontaktadresse; serverseitige Sperren für DB/Functions/API/Sharing/Download/Einzeldateien; anonym keine persönlichen/Kino-/Streaming-/Blogdaten, Daten-JSON, Backups oder Maps; minifiziertes Bundle; fail-closed RLS/Rechte; zentrale entfernbare Noindex-Header plus HTML-Fallback, keine Sitemap, Cloudflare-AI-Crawlerblock; kein Geheimcode-/Zweitloginprojekt; alte öffentliche Caches entwerten; max. 15 Konten organisatorisch; nur schmale Prüfung öffentlicher Datenwege, keine neue Lizenzetappe | Baumeister Zugang; Cloudflare-Aktivierung später Meister | TECHNISCH GEBAUT UND AUF STAGING: Minimal-Login/Legal, leerer Localmodus, kontogebundene Flächen, Noindex-Meta/-Header, Minify und keine Maps. Der E6-Scan ist mit eng gebundener Ausnahme für den bestätigten öffentlichen Legal-Kontakt grün; jede weitere Mail-/Secretklasse blockiert. Aktueller Header-Readback: Staging und Production HTTP 200 mit `X-Robots-Tag: noindex, nofollow`. Bestehende 54/54-Produktions-RLS-Kontotrennung und spätere service-only Readbacks werden mangels RLS-/Backendänderung übernommen. Final offen: Production-RC/Cache-/Discovery-Readback einschließlich Cloudflare-AI-Crawlerregel sowie physische PWA-Praxis |
| PR-02 / P1, E1 | Frisch inhaltsleerer Localmodus; nur eigene Einträge/lokale Funktionen; keine Demo oder bereitgestellten Kino-/Streaming-/Blogdaten; kein Kontosync, Server-/KI-Write oder laufendes Serverbackup; keine Wiederherstellungszusage; Login zeigt ausschließlich kd_personal ohne Import/Merge/Transferdialog; Gaststand unverändert und nach Logout wieder da; vorhandene Gastmechanik erhalten; Demo-UI/-Seeds/-Snapshots/-Assets gezielt aus Release entfernen; öffentliche Shell ohne geschützte Inhalte/JSON/Auth-/API-/Providerpayloads/Maps | Baumeister Zugang | GEBAUT als lokaler Teilstand bis `55b8276`: Kontoautoladen zeigt ausschließlich den Kontostand; Gast-Snapshot bleibt getrennt, ohne Merge/Upload/Überschreiben. Localmodus zeigt nur eigene Mediathek plus Anmelden, hält eigene Daten bytegleich und erzeugt null Katalog-HTTP-/Cachezugriffe; berechtigte Kino-/Streaming-Payloads und Reihenfolge bleiben gleich. Kontoautoladen 8/8, Übergabekontext 18/18, Session 37/37, Katalog 100/100, Localmodus 9/9. Vollständige Entfernung alter Demo-UI/-Seeds/-Snapshots/-Assets und öffentliche Bundle-/Datenfreiheit OFFEN |
| PR-03 / P2, E2 | Vorhandenen Sync kurz erfassen und wiederverwenden; nur BEHALTEN-Datentöpfe; eindeutig persönlicher Server-Livestand; Browser Offlinekopie/Cache, nicht einzige Heimat; A/B-Kontogrenze auch für Revisionen/Export/Restore; Gerätewechsel/Logout/Relogin richtiger Stand; konkurrierende Revisionen erkennen, nicht überschreiben | Baumeister Kontodaten; Integration Meister | GEBAUT und lokal integriert bis `3cf1b4d`: zentrale Registry mit 18 persönlichen Töpfen, optimistische Revisionen, Konflikterkennung ohne stilles Überschreiben, fremde Zeilen ausgeschlossen sowie Konto-/Treibergenerationen gebunden. Zusätzlich deterministisch belegt: zwei Geräte desselben Kontos, getrennte A-/B-Daten und -Revisionen, Logout/Relogin samt Autoload, konkurrierende Revisionen ohne Überschreiben, Sieben-Tage-Zustand sowie beschädigter Cache/Owner/Epoch fail-closed (6/6). Bestehende Belege: Account-Treiber 55/55, Session 37/37, Kontoautoladen 8/8, Übergabekontext 18/18. Keine Radar-/Entdecken-Änderung. Echter physischer Gerätewechsel, Remote-Readback und praktische Konfliktabnahme OFFEN |
| PR-04 / P2, E2 | Kein neues Backup-/Historisierungssystem; bestehende Revisionen/Konflikterkennung; keine zusätzliche Restore-/Retentionzusage; veralteter Sieben-Tage-/Revisionszustand deterministisch statt Warten; vor lokaler Gesamtlöschung portabler JSON-Sicherheitsdownload, danach separate Bestätigung; sichtbarer Kontoexport vollständig für alle BEHALTEN-Flächen und genau erklärt, sonst verborgen plus manueller Rechteweg | Baumeister Kontodaten; Integration Meister | GEBAUT und lokal integriert bis `3cf1b4d`: portable JSON-Sicherheitskopie dieses Geräts bleibt strikt vom Kontoexport getrennt und verspricht keinen Restore/Reimport; erst der ausgelöste Download schaltet die separate lokale Löschbestätigung frei. Kontoexport ist standardmäßig `UNPROVEN`, verborgen und nicht ausführbar; nur zwei Freigabeflags plus exakt verifizierter 13-Flächen-Vertrag öffnen ihn. Die aktuelle serverseitige Projektion persönlicher Radar-Textfunde ist nur an dieser Export-Validatornaht exakt abgebildet. Ein einziger manueller Rechteweg bleibt sichtbar; Self-Delete ist aus der Release-UI entfernt. Lokal grün: Backup/Export 20/20, Wortlaut 20/20, React-UI 11/11, Private-Ops 97/97, Sync-Szenarien 6/6 sowie Single-File-, Vite- und Pages-Build. Praktischer Browserdownload samt Dateiprüfung/Löschung/Reload bleibt OFFEN; vollständiger Remote-Kontoexport bleibt bis zum realen Vollständigkeitsbeleg verborgen |
| PR-05 / P2, E2 | Einmal vollständigen aktuellen Max-Kontoumfang der BEHALTEN-Flächen messen; regenerierbare Kataloge/Suchergebnisse/Feeds/Bilder/Caches nicht pro Konto duplizieren; höchstens 15 Einladungen organisatorisch; keine 250-MB-Hardcap, Kapazitätsrechnung, Kompression, automatische Löschung, neues Archiv oder 400-MB-Monitoring | Baumeister Kontodaten; reale Messung später Meister | ABGESCHLOSSEN: Messvertrag und Validator als `2fd5674`; einmaliger E6-Readback am 03.09.2026 über alle 13 Releaseklassen mit 177 Zeilen und 120.660 Bytes. Nur Klasse/Zeilen/Bytes ausgegeben, keine Inhalte, IDs oder Secrets. Die vorbereitete RPC-Migration blieb remote absent; dieselbe Aggregation lief direkt in einer read-only Transaktion, daher keine DB-Mutation. Gemeinsame/regenerierbare Daten ausgeschlossen; keine Speichergrenze oder Kapazitätszusage |
| PR-06 Daten/Recht / P3, E3a | Tatsächliche Browser-/Server-/Sync-/Revisions-/Sicherheitsdownload-/SW-/Sitzungs-/Geräte-/KI-Präferenz-/Diagnose-/Supportdaten verständlich zuordnen; pro aktiver KI-/Suchfunktion konkrete Felder/Empfänger, Infrastruktur getrennt; persönliche KI serverseitig berechtigt/fail-closed; reale Aufbewahrung/Exportumfang/manueller Rechteweg; Löschanfrage authentifiziert und manuell bearbeitet, kein Autoarchiv/Self-Delete; keine ungefragte Diagnose; ein Legal-Zugang vor Login, nötiger neutraler Kontakt nur dort, privater Empfänger serverseitig; Analytics aus, nur notwendiger Speicher, kein Banner; Endtexte rechtlich freigeben | Meister bis Dispatch Datenschutz/Mail | GEBAUT UND AUF STAGING `54b4f29` AUSGELIEFERT: tatsächliche Browser-/Sync-/Revision-/SW-/Sitzungs-/KI-/Diagnose-/Supportwege, manueller Rechteweg und Resend-Hinweis zu US-Verarbeitung/30 Tagen sind in einer kombinierten Legal-Fläche zugeordnet; Max' neutraler Kontakt ist nur dort sichtbar, der private Empfänger bleibt serverseitig. Vollständiges CI und frischer Browser-/PWA-Readback sind grün. Formelle rechtliche Endfreigabe und physische iPhone-Praxis bleiben OFFEN |
| PR-06 Nachprüfung / P4, E3b | Nur tatsächlich aktive automatische Anbieterfunktionen; initial dauerhaft Job-ID/Funktion/initiale Operation/triggered_at/check_due_at=+6h; atomarer einmaliger fälliger Claim; exakten Initialvorgang prüfen, Reservierung nicht Erfolg; Erfolg nur fertig + finalisierte positive Kosten + gültige Usage/Token; sonst genau ein normaler Retry mit allen Not-Aus-/Rechte-/Provider-/Budget-/Kosten-/Idempotenzgates; gleiche Job-ID/neue Operation/retry_consumed=true; kein neuer Termin/Checkerjob/dritter Versuch; danach eine Betriebs-Mail; keine Jobs für manuelle Aktionen, Mocks, Tests, inaktive Scheduler oder providerfreies Entdecken | Meister bis Dispatch KI-Nachprüfung | GEBAUT UND BACKENDSEITIG AUSGEROLLT: Auth-Fix und exakt begrenzter Initialbeleg grün; Ledger, +6h-Claim, einmaliger Retry, exakte Radar-Zielbindung, Checker und einmalige Mailübergabe integriert und remote rückgelesen. Keine Radar-Fach-/UI-/Such-/Ergebnisänderung. Der Staging-Branch aktiviert GitHubs periodischen Schedule nicht; echter +6h-Betriebsbeleg und Betriebs-Mail bleiben bis zur später autorisierten Default-Branch-Aktivierung/praktischen E6-Abnahme offen |
| PR-07 Feedback/Löschanfrage / P3, E3a | Feedback ohne Namensangabe, kein mailto; fester Domainabsender/privater Serverempfänger/fester Betreff; keine freien Header/Adressen/Anhänge/fremdes HTML; escaped Text + HTML; keine App-DB-Ablage/Konto-/Profil-/Diagnose-/Browseranreicherung oder Sitzungsverknüpfung im Inhalt/Produktlog; Text-/Rate-/Originlimits, kein Relay; ehrliche Erfolgs-/Fehleranzeige ohne Rohfehler, Text erhalten/kopierbar; technische Zustellmetadaten erklären; Domain-Onboarding/Absenderauth/Transportverfügbarkeit fokussiert; separater authentifizierter Löschanfragetyp mit notwendiger Kontoidentität und manueller Folgeaktion | Meister bis Dispatch Datenschutz/Mail | AUF STAGING `54b4f29` AUSGELIEFERT: fokussierte Abschlussprüfungen, Migrationen, digestgebundene Secrets, bytegleiche `ACTIVE`-Function v2/JWT, Staging-CORS, Cloudflare-DNS und Resend-Domain sind belegt. Genau ein synthetischer Send endete ohne Retry mit HTTP 200 `accepted`, passendem inhaltsfreien Ledger und Resend `delivered`. CI `33724772325`, feste Domain und frischer PWA-Login/Legal/SW-Readback sind grün; physische iPhone-Praxis bleibt OFFEN |
| PR-07 Betriebs-Mail / P4, E3b | Dritter interner Typ auf gebundenem Transport, nie Frontendempfänger; genau einmal nach Retry; ausschließlich Zeitpunkt, Funktion/Task, Initialoperation, Call gemacht/nicht belegt, Kosten belegt/nicht belegt (kein Null=0), Fehlercode/knapper gespeicherter Grund, Retry-Markierung/-Operation/-Ergebnis/ggf. Fehlergrund; keine Analyse/Empfehlung/Prompts/Titel/Kontoinhalte/Payloads/Rohantworten/Stacktraces/Secrets/Adressen; Versand startet keine KI oder Prüfschleife | Meister bis Dispatch KI-Nachprüfung | GEBAUT UND DEPLOYT: interner Builder/Dispatcher `05fe0b3`, einmaliger DB-Mailclaim und Checkerbindung sind gemeinsam aktiv; Browser besitzt keinen Raw-Type-/Empfängerweg, technische Reason-Codes bleiben allowlistet. Kein Testversand und keine Betriebs-Mail in dieser Lieferung; reale Einmalzustellung erst nach einem später tatsächlich nötigen, aktivierten Retry |
| PR-08 / P5, E4 | Nur angemeldeter Kinopfad; bestehende Kino-/Datum-/NonStop-/OmU-/OV-/DF-/Rest-ab-/Tagesprogrammfilter wiederverwenden; Datum/Kino primär sichtbar; Zusatzfilter eigene mobil sichtbare Zeile; lokale Suche weg, globale Suche bleibt; aktive Anzahl/Zustand, Reset nur wenn aktiv; mindestens 44px, 320/393/Desktop umbrechend; kein Abend-/Genrefilter | Baumeister Kino | GEBAUT: `12b0d2d`, integriert als `6741b9b`; DOM 11/11, Empfehlungen 5/5, Paketbrowser 6/6. Im integrierten Stand erneut 6/6 Chromium/WebKit bei 320/393/1280; echter iPhone-Einsatz OFFEN |
| PR-09 / P5, E5 | Nur klare Textfehler in Buttons/Überschriften/Hilfe/Leerzuständen/Onboarding/Tooltips/Fehlern/Beschriftung; Radar-Wortwahl Ins Radar aufnehmen/Im Radar/Aus dem Radar entfernen; binär alle sichtbaren Wege funktionierend oder Einstieg entfernt; ausdrücklich Sharing/Pakete/Masterimport P2/Foto-Text-Filmscan/Bloganalyse/Serienradar-Watchmode/Pilot-/Wartungs-/Owner-/technische Radarwege/masterlist-enrichment/alte Doppelwege; Radar/Entdecken aktiv+belegt oder unsichtbar, kein leerer Hard-false-Tab; Kontoexport vollständig oder verborgen; Self-Delete aus, nur funktionierende Mailanfrage; keine Zukunftsbuttons/Redesign-/Easter-Egg-Projekte | Meister bis Dispatch Release-Bereinigung | AUF STAGING `1f0bd016` AUSGELIEFERT: Settings zeigt ausschließlich die freigegebenen Kernwege; Radarwortlaut ist vereinheitlicht und Share-Opt-in entfernt; der persönliche Blog behält seine privaten Artikelwege ohne öffentliche Suche/Publikation/Rohimport. Code, Handler und Daten der verborgenen Settings-Wege bleiben erhalten. Radar/Entdecken-Ziel-/Fundlogik, Kino- und Streaminglogik unverändert; Paketverträge, vollständiges `npm test`, CI/Deploy und fester Domain-/Service-Worker-Readback grün. Physische PWA-Abnahme offen |
| PR-10 / P6, E6 | Ein exakter integrierter RC: vollständige Mocksuite/Production-Build/finaler Diff-/Secret-/Bundlecheck; anonyme Daten-/Demo-/Backup-/Mapgrenze; relevante RLS/Kontotrennung/Readbacks, Backup/Restore nur an nötiger Mutation; eine Praxismatrix Login/Legal/leer lokal/Eintrag+Refresh/Login ohne Merge/Gast nach Logout/A-B-Grenze/Sync+zweites Gerät+Konflikt+defekter Cache/Sicherheitsdownload+Bestätigung/Export oder manuelle Rechte/Löschmail/Feedback/Kinomobil/Radar+Entdecken/KI-aus+Anbieterausfall/aktiver 6h-Checker/PWA+Safari/iPhone+Tastatur+320/393/Desktop; bestehende Belege übernehmen; schmaler Betrieb für Sync/Functions/Mail/Kosten/Support/Cache/Rollback; keine neue Featurelogik in E6; RC/Push/CI/Backend/Deploy/Praxis/Release-Tag getrennt; private Lieferung kinodreieck.at nur autorisiert, keine Ankündigung/Demo/Registrierung, höchstens 15 Einladungen | Meister / Integrationsowner | E6 LOKAL BIS ZUR WIRKUNGSGRENZE ABGESCHLOSSEN: Staging `1f0bd016` übernimmt das vollständige grüne Test-/Build-/CI-/Browser-/Deploygate. W5 integriert das bytegleiche OSS-Inventar (`21f814b`), den zusätzlichen hashgebundenen Leak-/Bundlebeleg mit 0 Maps (`32e1111`) und die 5–10-Minuten-Praxismatrix (`915fc83`). Die reale 13-Klassen-Größenmessung ist mit 177 Zeilen/120.660 Bytes rein lesend abgeschlossen; aktueller Staging-/Production-Headerreadback ist grün, bestehende RLS-/service-only Belege werden ohne Wiederholung übernommen. Produktstand blieb `0044769`; kein Radar-/Entdecken-/Kino-/Streaming-Code und kein Providerpfad geändert. Offen sind physische iPhone-/Zweitgeräte-Praxis, Default-Branch-Aktivierung des +6h-Checkers sowie `main`/Production/Tag einschließlich finalem Cache-/Domain-/Cloudflare-Discovery-Readback; diese echten Wirkungen werden nicht durch Doku als erledigt behauptet |
| PR-11 / P6, E7 | Erst nach abgeschlossenem Privatrelease kurzer read-only LAB-Anker; heutige Staging-Schreibpfade/Auth/Kontogrenze/strukturierte Eingaben/kleinste Anschlussstelle/Kopplung zu Production nennen; später Access Max-only vor Assets/Daten, ggf. getrennte widerrufbare Maschinenidentität nur benennen; Hostname nicht absolut geheim; keine Assistentenarchitektur/Modelle/Credentials/Migration/Maschinenwrites/Praxisprobe | Meister nach Release | OFFEN, ausdrücklich NICHT releaseblockierend; keine Umsetzung beauftragt |

W1-Zuordnung (Teil dieses Registers, keine zweite Fortschrittsliste):
P1/E1 → `codex/road-to-live-e1-zugang`,
`/private/tmp/kd-road-to-live.1E81XA/e1-zugang`;
P5/E4 → `codex/road-to-live-e4-kino-mobil`,
`/private/tmp/kd-road-to-live.1E81XA/e4-kino`.
Beide Basis `31f37f61e9da8f766489b99eab8565aa14ec1d81`.
Integrationsergebnisse und Belege werden direkt in den obigen Zeilen ergänzt.

P2/E2 → `codex/road-to-live-e2-kontodaten`,
`/private/tmp/kd-road-to-live.1E81XA/e2-kontodaten`;
Quellcommits `353cec6`, `85f23b3`, konfliktfrei integriert als `6370c4a`,
`2d58ee1`; Anschlussintegration im isolierten Release-Worktree über `2b82bb0`,
`f958876`, `2c700c6`, `3b72f6a`, `713e122` und `3cf1b4d`. Keine Außenwirkung.

P3/E3a-Foundation → `codex/road-to-live-e3a-mail-foundation`,
`/private/tmp/kd-road-to-live-next-20260901/e2-export-rights`;
Quellcommits `367a53c`, `d6ccbd6`, konfliktfrei integriert als `188b2ae`,
`93cb3b3`. Keine Providerbindung, keine UI und keine Außenwirkung.

P3/E3a-Resendvorbereitung → `codex/road-to-live-e3a-resend-probe` und
`codex/road-to-live-e3a-mail-ledger`; Quellcommits `e57b244`, `1b76472`,
konfliktfrei integriert als `7d90add`, `194aab5`. Der Prober besitzt einen
festen Drei-Request-Plan, startet aber nur mit exaktem Einmalmarker und lokalem
Keychain-Eintrag. Das Ledger ist ausschließlich als noch nicht angewendete
Migration integriert. Keine Provideranfrage, kein DNS, kein Supabase-Netz und
keine sonstige Außenwirkung.

E3a-Transportentscheid, Dokumentationsstand 02.09.2026, noch ohne echten
Payloadbeleg: Resend ist für den Privatrelease gewählt. Max hat die
US-Verarbeitung und 30 Tage reguläre Inhalts-/Logaufbewahrung ausdrücklich
akzeptiert. Technische Gründe bleiben der offizielle Supabase-/Deno-Weg, ein
domainbeschränkbarer Sendeschlüssel und 24 Stunden Provider-Idempotenz. Brevo bleibt die
EU-nähere Alternative, besitzt aber einen vollberechtigten API-Key, mindestens
einen Monat konfigurierbare Transaktionslogs und widersprüchliche offizielle
Angaben zum Idempotenzfeld bei nur rund 30 Minuten Dauer. Postmark wird für
diesen Pfad nicht bevorzugt, weil providerseitige Idempotenz vollständig
fehlt und Inhalte regulär 45 Tage in US-Infrastruktur liegen. Kein Adaptercode
vor der einmaligen redigierten Sandbox-Rohprobe; die Providerwahl ist noch
keine DNS-, Secret-, API-Request- oder Versandfreigabe.

## 5. Übernahme des Reviews vom 28.08.2026

Der Reviewtext bleibt ein untrusted Befund und keine Autorisierung. Diese
Tabelle dokumentiert historisch Max' Übernahmeentscheidung vom 29.08.2026.
Abweichende Prozess-/Gate-/Schedulerannahmen darin sind seit 31.08.2026 durch
Abschnitte 1 und 3 ersetzt, nicht erneut auszuführen:

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

## 7. Gezielte Übernahme der Vorarbeit

Primärquelle ist der von Max benannte lokale Planstand vom 30.08.2026; der
Hauptcheckout und dessen übrige Änderungen werden nicht kopiert. Alle 22
Markdown-Rahmen plus README des externen Vorbaus wurden am 31.08.2026 gelesen:
`/Users/max/.codex/visualizations/2026/08/27/01a04475-4f5a-77b1-9cc2-f021f53b9096/road-to-live-vorarbeit/`.

Wiederverwendung statt Neubau:

- UX-Paket `/Users/max/Documents/Codex/2026-08-28/kd-road-live-ux-vorbau/outputs/`:
  Minimal-Login, ein verborgener fokussierbarer Legal-Bereich, Rückfokus, kurze
  Texte und getrennte Requesttypen. Prototyp ist kein Designwechsel; die
  bestehenden Kinodreieck-Tokens bleiben. Finale Rechtsangaben fehlen weiter.
- Abnahmesoll `/Users/max/Documents/Codex/2026-08-28/kd-road-live-abnahme-vorbau/outputs/road-to-live-vorarbeit/`:
  beide Features und Evidenzmatrix sind als Szenarien gelesen, nicht als
  vorhandene Tests oder Praxisbelege behauptet. „Deaktivierte“ Zukunftsbuttons
  werden nicht übernommen; die strengere binäre Release-Regel gilt.
- Leak-Scanner `/Users/max/Documents/Codex/2026-08-28/kd-road-live-leak-scanner/`:
  vorhandene lokale CLI mit expliziter Policy am gebauten Kandidaten einsetzen;
  ein statischer Scan ersetzt keine RLS-/Remoteabnahme.
- OSS-Werkzeug `/Users/max/Documents/Codex/2026-08-28/kd-road-live-oss-lizenzen/`:
  am final verwendeten Lockfile wiederverwenden; UNKNOWN bleibt offen,
  NOTICE-DRAFT ist keine rechtliche Freigabe. Kein neues Lizenzprojekt.
  Der direkte lokale Aufruf wurde am 31.08.2026 vor Ausführung vom bestehenden
  Effect-Guard gesperrt (`DIRECT_EFFECT_COMMAND_BLOCKED`); es gibt deshalb
  noch kein neues Inventar. Keine Guardänderung oder Aufrufumgehung.

Begründete Plananpassungen: Die Produktarbeit ist abgeschlossen; E0 verlangt
keine Wiederholung. Meister übernimmt Integration/FINAL_LOCAL selbst nach
aktueller Skillrolle. E4 ist wegen eigener Komponente/Styles/Tests parallel
baubar. E3 trennt Datenschutz/Mail und davon abhängige KI-Nachprüfung. Radar
hat inzwischen einen 144h-Scheduler, der reguläre Entdeckenlauf ist dagegen
providerfrei. Historische Vorbauforderungen nach Staging-Access vor dem
Release werden nicht vorgezogen: PR-11 bleibt ein späterer read-only Anker.
Reale Datenmutationen, nicht Etappennamen, bestimmen Backup/Restore. Der
vollständige Pflichtumfang liegt allein in Abschnitt 4 mit den Muss-Verträgen
aus Abschnitt 2; kein PR-Punkt wird durch diese Prozesskorrekturen gestrichen.
