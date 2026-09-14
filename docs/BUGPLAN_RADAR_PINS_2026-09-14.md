**Bugplan: Radar für Testkonten und kontogebundene Titel-Pins**

Erste Diagnose: 14.09.2026, 20:57 Uhr Europe/Vienna. Zunächst wurden die Fehler
und ihr Ursprung untersucht und geplant. Danach hat Max Umsetzung und
Freischaltung aller normalen Produktfunktionen für die Tester beauftragt.
Der aktuelle Bau- und Lieferstand steht im Meilensteinregister und den
anschließenden Lieferbelegen.

Max bestätigt: Sein Radar funktioniert wie gewünscht. Dieses Verhalten ist die
Referenz für die Abnahme der normalen Konten.

**Ergebnis und Priorität**

| Fehler | Befund | Betroffene | Reihenfolge |
|---|---|---|---|
| R-01: Radar synchronisiert keine Ziele | Kontofreigabe fehlt; zusätzlich fehlen Voraussetzungen für die anschließende Suche | Alle 16 aktiven Mitgliedskonten, einschließlich riccardo; Max besitzt die Freigaben | Zuerst vollständig beheben |
| R-02: Berechtigungssperre erscheint als Verbindungsfehler | Der Client macht aus einer verweigerten Feed-Abfrage einen wartenden, erneut synchronisierbaren Zustand | Konten ohne Radarfreigabe | Zusammen mit R-01 |
| P-01: Titel-Pins fehlen nach Anmeldung auf einer weiteren Installation | Titel-Pins sind ausschließlich gerätelokal und fehlen im Kontosync | Alle Konten, auch Max | Nach Radar |

**Belege und Grenzen der Diagnose**

- Produktions-Readback von `https://kinodreieck.at/build-meta.json`:
  `ffec89cd8b44ebd1ddbe66305eb939bc144736ad`, `appEnvironment=production`.
  Analysiert wurde der dazu passende saubere Checkout
  `/private/tmp/kd-password-toggle-20260914`. Der ursprüngliche Hauptcheckout
  ist älter und enthält fremde Änderungen; diese wurden nicht angefasst.
- Supabase wurde zweimal über die Management-API mit `read_only=true` und
  `BEGIN READ ONLY` gelesen, zuletzt um 20:57:42 Uhr. Zugangsdaten wurden nur
  im Prozess verwendet. Die Ausgabe enthielt Berechtigungen, aggregierte
  Kontozahlen und Funktionsregeln; keine Passwörter oder persönlichen Titel.
- Live-Matrix: 16 × `member`, `active=true`, `personal_ai=false`, keine Zeile
  in `kd_radar_capabilities`. Das gilt ausdrücklich auch für riccardo.
  1 × `owner`, `active=true`, `personal_ai=true`, `radar_pilot=true`,
  `radar_review=true`. `radar_unlimited=false` bei allen.
- Die globalen Datenbankflags `radar_aktiv`, `radar_provider_aktiv` und
  `radar_scheduler_aktiv` sind true. Die GitHub-Scheduler-Aktivierung wurde
  in dieser Diagnose nicht zusätzlich live abgefragt.
- Eine lokale Probe mit dem unveränderten Produktionscode und einer
  simulierten Antwort `403 / 42501 / radar_pilot_forbidden` ergab exakt:
  `status=pending`, eine offene Zieloperation, null sichtbare Abonnements,
  `retryable=true`. Nur der Feed wurde im Mock aufgerufen; kein Schreib-RPC
  und kein Anbieterrequest.
- Riccardos konkreter Netzwerkverkehr und seine Browser-/PWA-Speicher wurden
  nicht ausgelesen. Die allgemeine Kontosperre ist live belegt und die
  Fehlerdarstellung lokal reproduziert. Sein genauer Pin-Titel und die
  ursprünglich verwendete Domain bleiben unbekannt.

**R-01/R-02: Ursprung**

Der frühere Max-Pilot ist weiterhin die Zugriffsgrundlage. Die live gelesene
Funktion `kd_radar_pilot_allowed()` verlangt eine aktive Anmeldung und eine
eigene Capability-Zeile mit `radar_pilot=true`. Ohne diese Zeile liefert sie
false. Bereits `kd_radar_pilot_feed_v1_internal()` wirft dann
`radar_pilot_forbidden`, SQLSTATE `42501`. Der Ziel-Schreibpfad wird im
aktuellen Client gar nicht erreicht.

Die Kontoerstellungs-Vorlage legt Mitglieder mit `personal_ai=false` und
ohne Radar-Capabilities an. Genau diese Matrix liegt bei den 16 Konten vor.
Gleichzeitig ist der Radar-Client im Produktionsbuild allgemein eingeschaltet.
Die Einführung der Testkonten hat damit die Radar-Freigabe aus dem bisherigen
Pilotbetrieb nicht mitgenommen. Es liegt keine Owner-Rollenprüfung vor, die
mit einem Rollenwechsel behoben werden müsste; die separaten Freigaben sind
entscheidend.

Eine zweite Sperre würde nach einem reinen Sync-Fix bleiben: Der aktuelle
Such- und Schedulervertrag verlangt `personal_ai`, `radar_pilot` und
`radar_review`. Nur `radar_pilot=true` zu setzen würde Ziele speicherbar machen,
aber den von Max beschriebenen vollständigen Radarweg nicht herstellen.
`radar_review` erlaubt außerdem den manuellen Import globaler Radarereignisse.
Diese zusätzliche Berechtigung sollte kein Nebenprodukt eines normalen
Benutzerzugangs sein.

Die falsche Fehlermeldung entsteht in `src/services/radarPilot.js`:
`rpcStatus()` erkennt die Berechtigungsverweigerung, `reconcileFeed()` behandelt
sie aber wie einen vorübergehend ausstehenden Feed. Der Controller gibt das
Ziel als gespeichert/pending zurück. `radarSyncProblem()` und
`RadarSyncProblem` zeigen anschließend die Verbindungsaufforderung aus dem
Screenshot. Ein bestehender Mocktest erwartet für 403 sogar ausdrücklich
`pending`; eine gelungene Nutzung mit der tatsächlich provisionierten
Mitgliedermatrix wurde damit nicht abgesichert.

Quellen am Produktionscommit:
`supabase/migrations/20260814120000_radar_max_manual_pilot.sql:10`,
`supabase/migrations/20260830140000_radar_text_findings.sql:50`,
`docs/privatrelease/e9c/ACCOUNT_CREATION_BOUNDARIES.md` (Bootstrap, Schritt 3),
`.github/workflows/deploy.yml:173`, `src/services/radarPilot.js:293`,
`src/controllers/useEntdeckenRadarController.js:317`,
`src/lib/entdeckenUi.js:479`, `src/tabs/EntdeckenTab.jsx:174`,
`radar_pilot_client_test.mjs:452`.

**Radar-Reparaturpaket**

1. Den normalen Mitgliedsvertrag vervollständigen: eigene Ziele speichern,
   lesen, pausieren und entfernen sowie die dafür freigegebene Suche nutzen.
   Mitglieder bleiben Mitglieder. Normale Suche und manuelle Review-/Importrechte
   getrennt behandeln. Die bestehenden Konto-, Ziel- und Budgetgrenzen weiter
   verwenden; kein allgemeiner Rollen- oder Authentifizierungsumbau.
2. Die KI-Freigabe ausdrücklich in den Bauplan aufnehmen. Die heutige
   `personal_ai=false`-Vorgabe sperrt auch andere persönliche KI-Funktionen.
   Vor der Livefreigabe entscheiden: Sollen Mitglieder alle normalen
   persönlichen KI-Funktionen erhalten, kann der bestehende KI-Schalter
   verwendet werden. Soll nur Radar freigegeben werden, benötigt Radar eine
   eigene Suchberechtigung durch Client, SQL-Autorisierung, Erstsuche,
   Kostenreservierung und automatische Prüfung. Empfehlung für einen auf diese
   Bugs begrenzten Auftrag: die Radar-Suchfreigabe separat halten. Das ist eine
   Planungsentscheidung, noch keine Freischaltung.
3. Einen schmalen, wiederholbar sicheren Kontenabgleich und die künftige
   Kontoanlage auf denselben Sollvertrag bringen. Alle 16 vorhandenen
   Mitgliedskonten abdecken; fehlende, deaktivierte oder fremde Konten bleiben
   gesperrt. Max' bestehenden funktionierenden Vertrag als Regression prüfen.
4. Verweigerte Feed-Abfragen als fehlende Kontofreigabe darstellen. Netzwerk-,
   Sitzungs-, Server- und Berechtigungsfehler unterscheidbar halten. Bei einer
   Berechtigungssperre keine nutzlose Retry-Aufforderung anzeigen.
5. Bereits erfasste Ziele und Operation-IDs erhalten und sichtbar als noch
   nicht bestätigte Ziele führen. Nach korrigierter Freigabe durch den
   bestehenden idempotenten Sync bestätigen; keine doppelten Ziele und keine
   Suche vor bestätigter Speicherung. Bestehende Zielinhalte nicht löschen.
6. Vor der Freigabe für 16 Konten den vorhandenen Suchdurchsatz prüfen:
   Der versionierte Scheduler bearbeitet maximal zehn Claims pro Tageslauf.
   Bei zehn Zielen je Konto wären 160 Ziele vorhanden; ein dauerhaftes
   Sechstageintervall benötigt dann durchschnittlich rund 27 Prüfungen täglich.
   Grenzen und reale Zielmenge prüfen, bevor ein Takt für alle versprochen wird.
   Aktivierungs- und Kostenwirkung gehören in den konkreten Liveplan; in dieser
   Diagnose wurde kein Zeitplan gestartet oder verändert.

**P-01: Ursprung und Reparaturpaket**

`useEntdeckenPins()` schreibt direkt nach `localStorage`, Schlüssel
`kd:entdecken-pins`. Der Kommentar nennt die fehlende Kontosynchronisation
ausdrücklich. Der Hook besteht seit Commit `69e161c` vom 29.08.2026 in dieser
Form. Derselbe Pinpfad wird inzwischen auch für Streaming-Titel benutzt.

Der Schlüssel fehlt im zentralen persönlichen Datenregister und damit in
`ACCOUNT_SYNC_KEYS`, Backup, Restore und Kontoübernahme. Auch die live gelesene
Datenbank-Allowlist `kd_personal_key_erlaubt` akzeptiert ihn nicht.
`kd:kino-pins` und `kd:streaming-dienste` sind dagegen Teil des Kontovertrags.
Das erklärt den Unterschied zwischen Titel-Pins und übernommenen Diensten.
Eine frische PWA-Anmeldung kann Titel-Pins über das Konto derzeit nicht erhalten.

1. `kd:entdecken-pins` als persönlichen Datentopf ergänzen: zentrales Register,
   Datennormalisierung, Backup/Restore/Übernahme und additive Erweiterung der
   Datenbank-Allowlist. Den bestehenden Account-Treiber verwenden.
2. Den Pin-Hook an kontogebundenes Laden, Schreiben und Remote-Aktualisierung
   anschließen. Direkt nach dem Klick lokal anzeigen; Kontobestätigung und
   Offline-Rückstand korrekt behandeln. Speicherfehler sichtbar machen.
3. Konto- und Sitzungswechsel absichern. Alte gewöhnliche Titel-Pins besitzen
   keine Eigentümerbindung; nicht pauschal dem nächsten angemeldeten Konto
   zuschlagen. Eindeutig zuordenbare Altbestände geschützt übernehmen;
   unklare Bestände bis zu einer bewussten Übernahme lokal erhalten.
4. Automatische Pinbereinigung prüfen: `StartTab` entfernt heute vom Resolver
   verworfene Pins. Ein gerade fehlender Katalogtreffer oder unvollständiger
   Erstabruf darf künftig keine kontoweite Löschung auslösen. Den bestehenden
   Katalog- und Pin-Identitätsvertrag erhalten.

Quellen am Produktionscommit: `src/controllers/useEntdeckenPins.js:5`,
`src/lib/personalDataRegistry.js:73`, `src/lib/accountDriver.js:37`,
`src/App.jsx:1974`, `src/tabs/StartTab.jsx:243`,
`src/lib/entdeckenPins.js:264` sowie die live gelesene DB-Allowlist.

**Abnahme und Lieferreihenfolge**

| Prüfung | Erwartetes Ergebnis |
|---|---|
| Radar mit normalem Mitglied | Ziel speichern → Kontobestätigung → bestätigtes Ziel sichtbar → freigegebene Suche → Ergebnis oder ehrlicher Leerstand |
| Radar mit Max | Bisheriger funktionierender Ablauf besteht unverändert |
| Zweites Mitglied / deaktiviertes Konto | Keine fremden Ziele oder Schreibrechte; deaktivierter Zugang klar gesperrt |
| Radar 403, Sitzungsablauf, Offlinefall | Passende Meldung, Entwurf/Ziel bleibt erhalten, kein unerlaubter Suchstart |
| Vorher hängendes Ziel | Nach Freigabekorrektur genau einmal bestätigt, keine Duplikate |
| Titel-Pin Browser → frische PWA | Nach Kontosync und Anmeldung auf Start sichtbar |
| Titel-Pin entfernen / Netzrückkehr | Änderung bleibt nach Neuanmeldung erhalten; alter Stand überschreibt sie nicht |
| Pin bei Kontowechsel / fehlendem Katalog | Keine Vermischung und kein unbeabsichtigter Verlust |

Zuerst Radar lokal mit der realen Mitgliedermatrix und Mock-Anbieter prüfen,
dann ein angemessenes gemeinsames Abschlussgate. Danach den konkreten
Backend-/Konten-/Deploymentplan zur Livefreigabe vorlegen. Für den tatsächlichen
Mitgliedsweg anschließend eine freigegebene Kontoprobe und Browser-/PWA-Abnahme
durchführen; Max' Referenzweg mitprüfen. Echte KI-Proben ausschließlich über die
erlaubten npm-Laufwege und mit den geltenden Budgets.

Radar hat bei der Auslieferung Vorrang. Die unabhängige Pin-Umsetzung darf
während der Radar-Kompatibilitätsprüfung und CI weiterlaufen.
Die Pin-Abnahme umfasst insbesondere riccardos beschriebenen Wechsel von
Browser zu frisch angemeldeter PWA. Eine Neuinstallation ist kein Bestandteil
des Fixes und soll keine noch lokal vorhandenen Ziele oder Pins beseitigen.

Die erste Diagnose endete ohne Code- oder Liveänderung. Die anschließend
beauftragte Umsetzung und ihre tatsächlichen Wirkungen sind unten erfasst.


**Umsetzung ab 14.09.2026 – einziges Meilensteinregister**

Max hat die Umsetzung des Plans beauftragt. Gewählter Ablauf: SOLO mit einem
Ende-zu-Ende-Baumeister; Radar vor Pins. Der Meister bearbeitet dieses Register
und die Lieferbelege, der Baumeister besitzt Produktcode, Migrationen und Tests.
Gemeinsame Basis: `ffec89cd8b44ebd1ddbe66305eb939bc144736ad` aus `origin/staging`,
vor Baubeginn gegen beide Remote-Refs bestätigt.

| ID | Nutzerergebnis | Stand | Beleg |
|---|---|---|---|
| R1 | Normale Mitglieder können eigene Radarziele speichern und suchen | DONE | Release 9214db7 auf main/staging; volle lokale Suite und CI grün, Servermigration bestätigt |
| R2 | Radar erklärt Berechtigungssperren und erhält offene Ziele | DONE | Gleicher Release; offene Ziele sichtbar, IDs erhalten, Fehlerklassen getrennt |
| P1 | Titel-Pins folgen dem Konto zwischen Browser und PWA | DONE | e0e78fa + 737d186 + efd2be6 integriert bis 523fbde, Ziel main; neuer Sync und echter Legacy-Upgradeweg geprüft |
| A1 | Weitere kontobedingte Funktionssperren sind erfasst und normale Produktfunktionen freigeschaltet | DONE | Release 9214db7 und Live-Readback; 16 Mitglieder um 21:16:47 Uhr freigeschaltet |

Integrationsworktree: `/private/tmp/kd-radar-pins-integration-20260914`.
Baumeister: `/private/tmp/kd-radar-pins-build-20260914`.
Der ursprüngliche Hauptcheckout und dessen fremde Änderungen bleiben erhalten.


**Zusatzprüfung: weitere Funktionen nur für Max?**

Ergebnis am unveränderten Produktionscommit `ffec89c`, ergänzt durch einen
Live-Schema-/Berechtigungs-Readback um 21:10:28 Uhr: Radar ist nicht der einzige
Unterschied. Alle 16 Mitglieder haben dieselbe `personal_ai=false`-Sperre.

| Normale Produktfunktion | Warum Mitglieder sie derzeit nicht ausführen können |
|---|---|
| Persönliche KI-Bewertung / Vorbewertung | `useIntelligenceController` und `film-forecast` benötigen personalAi |
| Geschmacksprofil mit KI erstellen/verfeinern | `profile-extract` über den gesperrten AI-Service |
| Suchtexte und eigene Begriffe mit KI deuten | `intelligent-search` über den gesperrten AI-Service |
| Neues belegtes Filmwissen recherchieren | `filmwissen-synthese` benötigt personalAi |
| Mehrere Titel mit KI erfassen | `media-batch-extract` benötigt personalAi |
| Blogtexte für das Geschmacksprofil analysieren | `blog-profile-extract` benötigt personalAi |

Die Clientgrenze liegt zentral in `src/services/ai.js:183`; die Edge Function
prüft `personal_ai` erneut vor Konfiguration, Reservierung und Anbieteraufruf
(`supabase/functions/ai-task/index.ts:299`). Ein eingeschalteter lokaler
KI-Schalter allein gibt einem Mitglied diese Funktionen deshalb nicht frei.
Es handelt sich nicht um fest codierte Sonderrechte für den Namen max, sondern
um die tatsächlich nur seinem Konto erteilte Capability.

Bewusste administrative Unterschiede: technische Owner-Diagnosen, lokale
Crashdiagnostik sowie manuelles Erzeugen/Aktualisieren des gemeinsamen
Entdecken-Feeds; beim Radar außerdem manuelle Review-/Importrechte. Die
gewöhnliche Anzeige des Entdecken-Feeds akzeptiert aktive Mitglieder auch mit
`personal_ai=false`. Vorhandenes Filmwissen kann mit remoteStorage gelesen
werden, ohne eine neue Recherche freizuschalten.

Die normalen Account- und Katalogpfade verwenden active/remoteStorage und
Own-Row-Isolation. Für Kino, Streaming, manuelle Bewertungen und Listen,
Diensteauswahl, normalen Kontosync und manuelle Profilbearbeitung wurde an
diesen Freigabegrenzen keine zusätzliche Owner-Sperre gefunden. Das ist ein
Berechtigungsbefund; es ersetzt keinen vollständigen Gerätetest jeder Funktion.

Die Produktionsflags schalten Kontoselbstlöschung und den privaten
Self-Service-Pfad insgesamt aus; das ist keine Ausnahme zugunsten von Max.
Der Pinfehler ist ebenfalls keine Rechteausnahme, sondern fehlender Sync.

Der Zusatzauftrag begann als Prüfung. Max hat danach ausdrücklich alle
normalen Funktionen für alle Tester freigegeben. Damit ist auch die
allgemeine persönliche KI für die 16 Mitglieder Teil der beauftragten Korrektur.
Die normale Radar-Suche wird nun aus den vorhandenen Freigaben active +
personal_ai + radar_pilot abgeleitet; Review-/Importrechte bleiben separat.

Kapazitätsreadback: Aktuell liegen nur vier aktive Radarziele des Owners und
keine bestätigten Mitgliederziele vor. Der vorhandene Tagesdurchsatz ist damit
aktuell ausreichend; die im Plan beschriebene Grenze bei breiter Nutzung
bleibt als belegtes Wachstumsthema bestehen.


**Live-Freischaltung der normalen Produktfunktionen, 21:16:47 Uhr**

Auf ausdrücklichen Auftrag „Schalte alles für alle frei! Sofort!“ wurden
exakt die 16 zuvor gesicherten aktiven Mitgliedskonten in einer bewachten
Transaktion aktualisiert. Vorzustand und Ergebnis liegen geschützt außerhalb
des Repositorys. Bei verändertem Kontenbestand oder abweichendem Vorzustand
hätte die Transaktion vollständig abgebrochen.

| Gruppe | Anzahl | active | personal_ai | radar_pilot | radar_review | radar_unlimited |
|---|---:|---|---|---|---|---|
| Mitglieder | 16 | true | true | true | false | false |
| Owner | 1 | true | true | true | true | false |

Die Änderungen und Kontozahlen wurden nach COMMIT live zurückgelesen.
Keine Limits oder Scheduler-Einstellungen geändert, keine Anbietersuche
gestartet. Die allgemeinen KI-Funktionen sowie Radar-Speicher-/Feedrechte
sind damit freigegeben. Für den vollständigen Radar-Suchweg muss das
Codepaket weiterhin die alte Review-Kopplung korrigieren.

GitHub-Readback vor der Freischaltung: Produktions-CI `34882416583` für
`ffec89c` erfolgreich; Radar-Workflow aktiv und
`KD_RADAR_SCHEDULE_ENABLED=true`. Das production-Environment besitzt einen
Reviewerschutz. Die Berechtigungskorrektur ist ein zusätzlicher Live-Schritt,
kein Beleg für ein bereits ausgeliefertes neues Codepaket.

Bei der Zusatzsuche wurden außerdem zwei max-spezifische Beschriftungen
gefunden: `src/components/FilmCard.jsx:168` und `src/tabs/KinoTab.jsx:729`
leiten „von dir“/„bewertet“ noch aus `bewertet_von === "max"` ab. Diese Stellen
sperren keine Bewertungsfunktion; sie sind als Darstellungsbefund erfasst.


Ergänzender Konfigurationsreadback nach der Kontofreischaltung:
`ai_aktiv=true`, Anthropic-Registry freigegeben und aktuell geprüft.
Unverändert: Monatsbudget 1000 US-Cent, Tageslimit 200 Aufträge,
Anbieterrequest-Zaun 500 US-Cent; Radar-Taskreservierung maximal 20 US-Cent.
Diese Werte sind Konfiguration, kein Nachweis des noch verfügbaren Budgets
und keine neue Erlaubnis für autonome kostenpflichtige Testläufe.


**Radar-Serverkorrektur und Releasekandidat, 21:34 Uhr**

Der Baumeister lieferte Radar mit `9cf4517` und das Kompatibilitätsdelta mit
`0ae2075`; Integration bis `31e3159`. Die bereits produktiven Ein- und
Zweiargument-Signaturen von `kd_radar_pilot_feed` bleiben unverändert.
Ein gesonderter RPC attestiert die normale Suchfreigabe. Offene Ziele sind
als „Bestätigung offen“ sichtbar; bestätigte Ziele ohne Suchlauf erhalten
eine ehrliche Statusanzeige, ohne automatisch alle Altziele neu anzufragen.

Fokussierte Belege am Radar-Delta: Client 46/46, Erstsuche 16/16, echter
PostgreSQL-17-Harness 28/28 einschließlich Legacy-PWA-Vertrag, Mitglied ohne
Reviewrecht, Own-Row-Isolation, Kosten- und Schedulergrenzen; Entdecken 72/72,
E9 16/16, Radar-News 19/19 und erfolgreicher Build mit 260 Modulen.

Migration `20260914210000_radar_member_search_access` wurde nach Sicherung und
exakter Definitionenprüfung atomar ausgeführt und im Migrationsledger erfasst.
Live-Readback um 21:34:16 Uhr: Suchfreigabe für 16/16 Mitglieder und den Owner;
Reviewrechte weiterhin 0/16 Mitglieder und 1/1 Owner. Beide alten
Feed-Definitionen stimmen mit der Sicherung überein. Keine Inhalts-, Limit-
oder Scheduleränderung und keine Anbietersuche durch diesen Schritt.
Die Clientauslieferung folgt über die normale CI.

Die anschließende READ-ONLY-Leseprobe im jeweiligen authenticated-Kontext
bestätigte um 21:36:41 Uhr bei allen 16 Mitgliedern und Max den neuen Feed mit
Suchfreigabe. Der jeweilige Legacy-Feed entspricht derselben Antwort ohne das
neue Suchrechtfeld. Keine Ziele oder Suchaufträge wurden dabei angelegt.

Radar-Staging-CI `34887782110` inklusive Chromium, WebKit und festem
Domain-Readback erfolgreich. Produktions-CI `34888834492` am identischen
Commit `9214db7` vollständig grün; die normale Environment-Freigabe wurde
erteilt, ohne den Produktionsschutz zu ändern.


**Pin-Paket und additive Servermigration, 21:48 Uhr**

Der Pin-Sync aus `e0e78fa` und die CI-Verdrahtung aus `737d186` sind bis
`32ecd0a` integriert. Alle Produktdateien entsprechen dem lokal vollständig
geprüften Baumeisterstand; nur dieser Fehlerbericht unterscheidet sich.
Der vollständige lokale Abschlusslauf einschließlich PG17-Harnesses,
Single-File- und Vite-Build war erfolgreich. Die zusätzlichen Geräte-/Account-
Tests 15/15 und der PG17-Allowlist-/RLS-Test 3/3 sind Teil des Standardlaufs.

Migration `20260914230000_entdecken_pins_personal` ist nach Sicherung und
Driftprüfung atomar ausgeführt und im Ledger erfasst. Live-Readback
21:48:08 Uhr: genau 19 erlaubte Keys, ausschließlich `kd:entdecken-pins`
ergänzt, Constraint validiert und RLS aktiv. Keine vorhandenen Pins oder
anderen Kontoinhalte wurden durch die Migration geschrieben.

Der reale Upgradeweg alter lokaler Pins ist mit `efd2be6`, integriert als
`523fbde`, ergänzt: Der echte AccountDriver erhält den Altbestand vor einem
überschreibenden Kontorefresh. Nur bestätigter gleicher Owner mit Epoch und
Binding erlaubt automatische Übernahme. Andernfalls zeigt die Startansicht
einen separaten lokalen Altbestand und die ausdrückliche Aktion
„Titel-Pins in dieses Konto übernehmen“. Erst diese Aktion schreibt ihn in
das gewählte Konto. Der gesicherte Bestand bleibt bis zum erfolgreichen Write
erhalten. Produktcode und Tests entsprechen vollständig dem gelieferten
Baumeisterstand; nur dieser Fehlerbericht ist zusätzlich vorhanden.

Die gezielte Upgradeprüfung umfasst den echten AccountDriver 5/5,
Pin-Sync 15/15, Account-Epoch 14/14, Session 43/43, Entdecken mit sichtbarer
Übernahmeaktion 73/73 plus E9 16/16 und den PG17-Allowlist-Test 3/3.
Der Build mit 260 Modulen ist erfolgreich. Ein weiterer vollständiger lokaler
Prüflauf wurde entsprechend der Nutzersteuerung nicht gestartet.

Für die Pin-Lieferung folgt auf die fokussierte Upgradeprüfung ausschließlich
die reguläre Produktions-CI und ein abschließender Readback. Es gibt keinen
weiteren Staging-Rundlauf oder zusätzlichen vollständigen lokalen Prüflauf.

Beim Radar-Produktionsdeploy war das atomare Deployment erfolgreich, der
Domain-Schritt meldete dagegen für `app-layer-1-Dq5ioLFE.js` vorübergehend
HTML statt JavaScript. Die konkrete Datei wurde anschließend mit HTTP 200
und `application/javascript` gelesen. Ausschließlich der fehlgeschlagene
Deployjob `104128813138` wurde wiederholt; alle grünen Testjobs bleiben erhalten.
