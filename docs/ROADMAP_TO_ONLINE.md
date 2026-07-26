# Kinodreieck: Roadmap zum sicheren Online-Produkt

Stand: 24. Juli 2026

## Zweck

Dieser Leitfaden beschreibt den Weg von der heutigen lokalen beziehungsweise
loginfreien App zu einem verlässlich betriebenen Online-Produkt mit eigener
Domain, Accounts, geschütztem persönlichem Speicher und begrenzten
KI-Funktionen.

Er beantwortet insbesondere die Reihenfolgefrage:

> Muss zuerst die ganze App umgebaut werden oder sollen zuerst die neuen
> Funktionen entstehen?

Die Leitentscheidung lautet:

> Kein vollständiger Rewrite vorab. Zuerst den aktuellen Stand stabilisieren,
> dann nur die gemeinsam benötigten Sicherheits- und Datenfundamente bauen und
> anschließend jede neue Funktion als kleinen, vollständigen Produktpfad
> umsetzen.

Die Roadmap ergänzt:

- `docs/KI_ZWISCHENPROJEKT_LEITFADEN.md` für KI-, Datenschutz- und
  Kostenprinzipien,
- `docs/PROGRAMMDATEN_PLAN.md` für Quellen, Rechte und Veröffentlichung des
  Kinoprogramms,
- `supabase/README.md` für den heutigen öffentlichen Katalog.

## Was „online“ in dieser Roadmap bedeutet

Es gibt nicht nur einen Online-Meilenstein, sondern drei aufeinander aufbauende
Stufen.

### Online-Stufe 1: Öffentliche App-Hülle

- eigene Domain,
- statische Start- und Downloadseite,
- installierbare Web-App,
- Demo- oder Gastmodus,
- kein geheimer Schlüssel im Browser,
- keine produktiven persönlichen Accountdaten notwendig.

Diese Stufe kann relativ früh veröffentlicht werden. Sie ist noch nicht das
vollständige Account- und KI-Produkt.

### Online-Stufe 2: Geschlossene Account- und KI-Beta

- echte Anmeldung,
- persönliche Daten je Account,
- getestete Row-Level-Security,
- geschützte serverseitige KI-Schnittstelle,
- harte Nutzungs- und Kostenlimits,
- zunächst wenige ausdrücklich eingeladene Tester.

Ab dieser Stufe verarbeitet Kinodreieck produktiv persönliche Daten und erzeugt
echte KI-Kosten. Die Sicherheits- und Datenschutzanforderungen gelten daher
vollständig.

### Online-Stufe 3: Öffentliches Produkt

- stabiler Accountbetrieb,
- geklärte Programmdatenquellen,
- Datenschutz, Export und Löschung,
- Monitoring, Backups und Wiederherstellungsplan,
- kontrollierte Freischaltung für weitere Nutzer,
- nachvollziehbare Betriebs- und Kostenverantwortung.

## Ausgangslage

Die App bringt bereits viel brauchbaren Produktunterbau mit:

- React- und Vite-Web-App,
- Web-Build und eigenständiger Single-File-Build,
- lokaler Speicher mit treiberunabhängiger Oberfläche,
- Git- und loginfreier Supabase-Sync als Übergang,
- öffentlicher, read-only Programm- und Streamingkatalog,
- deterministische Suche mit sichtbaren Filtern,
- Import, Export, Backup und Wiederherstellung,
- umfangreiche jsdom- und Build-Regressionstests.

Die wichtigsten Übergangspunkte sind:

- der heutige Sync-Schlüssel ist kein dauerhaftes Accountmodell,
- der öffentliche Katalogschlüssel darf lesen, aber keine persönlichen Daten
  autorisieren,
- die KI darf nie direkt aus der statischen App mit einem Anbieter-Key
  aufgerufen werden,
- Programmdaten dürfen erst nach geklärtem Nutzungsrecht produktiv
  weiterveröffentlicht werden,
- `App.jsx` trägt noch viele Verantwortlichkeiten, muss aber nicht vorab
  vollständig zerlegt werden,
- die heutige Testsuite muss vor neuen Großbaustellen wieder eine verlässliche
  grüne Ausgangslinie bilden.

## Zielarchitektur

```text
Eigene Domain
    |
    +-- Cloudflare Pages
    |       |
    |       +-- Start- und Downloadseite
    |       +-- React-Web-App / PWA
    |       +-- öffentliche Konfiguration
    |
    +-- Supabase
            |
            +-- Auth: eindeutige Account-Sitzung
            +-- persönliche Daten mit RLS
            +-- öffentlicher read-only Katalog
            +-- Edge Functions
                    |
                    +-- Accountprüfung
                    +-- Aufgabenvalidierung
                    +-- Claude-Anbieteradapter
                    +-- Rate-Limits und Monatsbudgets
                    +-- Kosten- und Fehlerprotokoll
```

Cloudflare Pages verteilt ausschließlich öffentlichen Code und öffentliche
Konfiguration. Claude-Key, Supabase-Secret-Key und Service-Role-Key bleiben
serverseitig.

Für die erste produktive KI-Stufe ist eine Supabase Edge Function der
bevorzugte Weg, weil Auth, RLS, Nutzungsprotokoll und persönlicher Speicher
bereits im selben System liegen können. Die App spricht trotzdem nur mit einer
kleinen internen KI-Schnittstelle, damit später ein Cloudflare Worker oder ein
anderer Anbieter eingesetzt werden kann, ohne die Produktoberfläche neu zu
bauen.

## Reihenfolge auf einen Blick

| Etappe | Ergebnis | Voraussetzung für |
| --- | --- | --- |
| 0. Stabilisieren | reproduzierbar grüner Stand | jede weitere Änderung |
| 1. Grenzen schärfen | klare Module und Konfiguration | Hosting, Auth und KI |
| 2. Öffentliche Hülle | eigene Domain und Staging | frühe Online-Stufe 1 |
| 3. Accounts und Speicher ✅ | echte Sitzung und RLS | persönliche Online-Daten |
| 4. Katalog und Rechte | erlaubte gemeinsame Daten | vollständiges Programm |
| 5. KI-Unterbau | geschützter, limitierter Endpunkt | alle KI-Funktionen |
| 6. Intelligente Suche | erster echter KI-Produktpfad | geschlossene Beta |
| 7. Betrieb und Datenschutz | lösch- und wiederherstellbarer Dienst | Online-Stufe 2 |
| 8. Geschlossene Beta | reale Nutzung mit wenigen Testern | Freigabeentscheidung |
| 9. Öffentlicher Start | kontrollierter Produktbetrieb | Online-Stufe 3 |

Die Etappen sind Abhängigkeiten, keine starren Kalenderwochen. Einzelne Arbeiten
können parallel laufen, aber kein späteres Freigabetor darf übersprungen werden.

---

## Etappe 0: Aktuellen Stand stabilisieren

### Ziel

Ein bekannter, wiederholbar testbarer Ausgangspunkt, auf dem sich neue Fehler
eindeutig einer neuen Änderung zuordnen lassen.

### Arbeiten

1. Laufende Änderungen in Demo-, Clean- und Personalmodus abschließen.
2. Den derzeit bekannten Fehler im alten Demo-Seed-Test klären.
3. `npm test`, Web-Build und Single-File-Build vollständig grün bekommen.
4. Unabhängige Änderungen in nachvollziehbare Commits trennen.
5. Einen stabilen Zwischenstand markieren.
6. Keine Account-, Hosting- oder KI-Arbeit in denselben Reparatur-Commit
   mischen.

### Abnahmekriterium

- frischer Checkout lässt sich installieren und bauen,
- vollständige Testsuite ist grün,
- Demo- und Clean-Start sind reproduzierbar,
- es gibt einen klaren Rückkehrpunkt.

---

## Etappe 1: Architekturgrenzen schärfen, ohne die App neu zu schreiben

**Status: abgeschlossen am 24. Juli 2026.** Die technische Abnahme und die
bewusst erhaltenen Legacy-Grenzen stehen in `ETAPPE_1_ABNAHME.md`.

### Ziel

Die Stellen entkoppeln, an denen Onlinebetrieb neue Verantwortung erzeugt.
Bestehende, funktionierende UI muss dafür nicht flächendeckend umgebaut werden.

### Arbeiten

1. Öffentliche Laufzeitkonfiguration bündeln:
   - App-URL,
   - Supabase-Projekt-URL,
   - Publishable-Key,
   - KI-Endpunktname,
   - Build- und Schemaversion.
2. Vier technische Grenzen festlegen:
   - `auth`: Sitzung und Accountstatus,
   - `storage`: lokale und serverseitige persönliche Daten,
   - `catalog`: gemeinsames read-only Film- und Programmwissen,
   - `ai`: geschützte, aufgabenspezifische KI-Aufträge.
3. Netzwerkaufrufe aus UI-Komponenten hinter kleine Module legen.
4. Fehlerklassen vereinheitlichen:
   - offline,
   - nicht angemeldet,
   - nicht berechtigt,
   - Limit erreicht,
   - Serverfehler,
   - ungültige Antwort.
5. `App.jsx` nur dort verkleinern, wo Auth-, Katalog- oder KI-Zustand sonst
   mehrfach implementiert würde.
6. Gastmodus und Accountmodus technisch unterscheidbar machen.

### Bewusste Nicht-Ziele

- kein neues Designsystem,
- kein vollständiger State-Management-Wechsel,
- keine pauschale Zerlegung jeder Komponente,
- keine neue Datenbank nur wegen theoretischer Eleganz,
- kein Rewrite der funktionierenden lokalen Suche.

### Abnahmekriterium

- UI kennt keine geheimen Schlüssel,
- Auth, Katalog, persönliche Daten und KI haben getrennte Schnittstellen,
- bestehender lokaler Betrieb funktioniert unverändert,
- neue Serverfunktionen können gemockt getestet werden.

---

## Etappe 2: Öffentliche App-Hülle und eigene Domain

**Status: technisch umgesetzt am 25. Juli 2026; Live-Aktivierung und
Domain-Abnahme ausstehend.** Konfiguration, Sicherheitsmodell,
Service-Worker-Regeln, Deployment-Tore und Rückrollweg stehen in
`ETAPPE_2_HOSTING.md`.

### Ziel

Kinodreieck ist als statische App sicher erreichbar, bevor Accounts und
kostenpflichtige KI für die Öffentlichkeit freigeschaltet werden.

### Arbeiten

1. Drei Umgebungen definieren:
   - lokal,
   - Staging,
   - Produktion.
2. Cloudflare-Pages-Projekt und eigene Domain verbinden.
3. Web-Build aus `dist/` automatisiert bereitstellen.
4. Single-File-Build weiterhin als bewusst getrennten Download anbieten.
5. Umgebungsvariablen klassifizieren:
   - öffentlich und buildbar,
   - serverseitiges Secret,
   - lokal entwicklungsbezogen.
6. Sicherheitsheader festlegen:
   - Content Security Policy,
   - `Referrer-Policy`,
   - `X-Content-Type-Options`,
   - `Permissions-Policy`,
   - sinnvolle Frame-Einschränkung.
7. Service-Worker-Verhalten prüfen:
   - App-Hülle cachebar,
   - aktuelle JSON-Daten network-first,
   - kein dauerhaft eingefrorener Login- oder Katalogzustand.
8. Deployment-Checks erweitern:
   - relative Assetpfade,
   - Manifest und Icons,
   - kein Secret im Bundle,
   - Staging- und Produktions-URL erreichbar.
9. Eine dokumentierte Rückrollmöglichkeit auf den letzten funktionierenden
   Build einrichten.

### Abnahmekriterium

- Staging und Produktion sind getrennt,
- die App läuft über HTTPS auf der eigenen Domain,
- Reload, PWA und relative Pfade funktionieren,
- im ausgelieferten Bundle befindet sich kein geheimer Schlüssel,
- ein fehlerhaftes Deployment kann ohne Datenverlust zurückgerollt werden.

### Ergebnis

Nach dieser Etappe ist Online-Stufe 1 möglich: öffentliche App-Hülle mit Demo-
oder Gastmodus, aber noch ohne offenen persönlichen KI-Betrieb.

---

## Etappe 3: Echte Accounts und persönlicher Speicher

**Status: umgesetzt am 25. Juli 2026, Testsuite grün; Anmelde-Spike auf dem
iPhone, Einspielen der Migration und Staging-Durchstich stehen aus.** Umsetzung,
Entscheidungen und Runbook stehen in `ETAPPE_3_ACCOUNTS.md`.

**Abweichung von der Leitentscheidung unten:** Statt Magic Link oder Einmalcode
kommt eine Anmeldung mit **Benutzername und Passwort** ohne echte E-Mail-Adressen
(synthetische Adresse in eigener Domain, kein Mailversand). Begründung: Die
Anmeldung dient allein der Zuordnung des Datenbereichs, nicht der
Identitätsprüfung; Postfächer wären eine Hürde ohne Gegenwert, und in der
installierten iPhone-App ist der Passwortweg der robusteste. Preis: keine
Selbstregistrierung, kein Zurücksetzen ohne Max. Vor Etappe 9 neu zu bewerten.

### Ziel

Eine gültige Sitzung bestimmt serverseitig, auf welche persönlichen Daten ein
Nutzer zugreifen darf.

### Leitentscheidung

Für die erste produktive Version wird Supabase Auth empfohlen. Eine vom Browser
mitgesendete freie Account-ID oder der heutige gemeinsame Sync-Schlüssel genügt
nicht als Berechtigung.

### Arbeiten

1. Loginverfahren für die Beta festlegen:
   - zunächst Magic Link oder Einmalcode,
   - später optional Passkey oder weitere Anbieter.
2. Auth-Modul in der App einführen:
   - anmelden,
   - Sitzung erneuern,
   - abmelden,
   - abgelaufene Sitzung verständlich behandeln.
3. Persönliches Datenmodell aufbauen.
4. Jede persönliche Zeile mit der serverseitig abgeleiteten Account-ID
   verbinden.
5. RLS-Regeln schreiben und negativ testen:
   - Account A darf nichts von Account B lesen,
   - Account A darf nichts für Account B schreiben,
   - anonyme Nutzer sehen keine persönlichen Zeilen,
   - Servicezugriff bleibt auf kontrollierte Serverprozesse begrenzt.
6. Den heutigen Storage-Treiber weiterverwenden:
   - lokaler Cache bleibt möglich,
   - angemeldeter Treiber synchronisiert in den Account,
   - UI-Aufrufer müssen nicht alle neu geschrieben werden.
7. Für die erste Migration ein dokumentorientiertes Modell erwägen:
   - `account_id`,
   - `key`,
   - `value`,
   - `revision`,
   - `updated_at`.
8. Bereiche erst dann normalisieren, wenn serverseitige Abfragen sie wirklich
   benötigen. Bewertungen und KI-Prognosen müssen dabei technisch getrennte
   Felder oder Tabellen bleiben.
9. Migration anbieten:
   - lokales Gesamt-Backup erzeugen,
   - Vorschau der zu übernehmenden Bereiche,
   - einmalige Accountübernahme,
   - Zähl- und Prüfreport,
   - lokaler Stand bleibt bis zur Bestätigung erhalten.
10. Verhalten bei Konflikten, Offlinebetrieb und mehreren Geräten festlegen.

### Gastmodus

Der Gastmodus kann bestehen bleiben, aber mit ehrlichen Grenzen:

- Daten bleiben lokal,
- kein stiller Accountabgleich,
- keine persönliche serverseitige KI,
- Export und Backup bleiben möglich,
- späteres Übernehmen in einen Account erfordert eine Vorschau.

### Abnahmekriterium

- zwei Testaccounts sind vollständig voneinander isoliert,
- lokale Daten können verlustfrei in einen Account übernommen werden,
- Abmeldung entfernt keine lokalen Daten ungefragt,
- Backup und Wiederherstellung funktionieren auch mit Accountdaten,
- der alte Sync-Schlüssel ist für neue Accounts nicht mehr notwendig.

---

## Etappe 4: Gemeinsamer Katalog, Programmdaten und Rechte

**Stand 26.07.2026: ABGESCHLOSSEN.** Quellenregister `kd_quellen`,
Zugriffstrennung (anon sieht nur `manifest` + Demo-Zeilen), Herkunftspflicht,
Feldfreigabe und Löschfristen sind in der Produktionsdatenbank; die App sendet
das Sitzungstoken und meldet ehrliche Zustände; die Demo-Mediathek ist
veröffentlicht. Alle vier Abnahmekriterien gegen die echte Datenbank belegt.
Restpunkt ohne Abnahmerelevanz: `programm_demo` für den Kino-Tab.
Einzelheiten und Runbooks in `ETAPPE_4_KATALOG_RECHTE.md`.

### Ziel

Öffentliche Film-, Kino- und Streamingdaten bleiben technisch und rechtlich von
persönlichen Accountdaten getrennt.

### Arbeiten

1. `kd_catalog` als read-only Veröffentlichungsbereich erhalten.
2. Schreibzugriff ausschließlich über kontrollierte Importprozesse erlauben.
3. Quellenregister und Freigabestatus pro Datenquelle führen.
4. Nur erlaubte Felder veröffentlichen.
5. Abrufzeit, Quelle, Gültigkeit und gegebenenfalls Buchungslink erhalten.
6. Aktuelle Verfügbarkeit nie aus Claude-Modellwissen ableiten.
7. Für nicht freigegebene Programmdaten:
   - keine produktive Wiederveröffentlichung,
   - keine Aufnahme in das Downloadpaket,
   - gegebenenfalls nur lokaler technischer Test.
8. Verhalten bei abgelaufener, widerrufener oder pausierter Quelle definieren.
9. Cache- und Löschfristen aus der jeweiligen Vereinbarung technisch abbilden.

### Abnahmekriterium

- jede veröffentlichte Programmdatenquelle hat einen dokumentierten Status,
- Accounttabellen und öffentlicher Katalog besitzen getrennte Regeln,
- ein Quellenwiderruf kann ohne App-Release umgesetzt werden,
- die App zeigt keine KI-erfundene Verfügbarkeit.

### Hinweis

Die öffentliche App-Hülle und eine Suche im eigenen Bestand können früher
online gehen. Ein vollständiges öffentliches Wiener Kinoprogramm wartet auf die
im Programmdatenplan beschriebenen Freigaben.

---

## Etappe 5: Geschützter KI-Unterbau

### Ziel

Ein kleiner serverseitiger Endpunkt kann genau definierte KI-Aufgaben
ausführen, ohne Anbieter-Key, private Daten oder Kostenkontrolle in den Browser
zu verlagern.

### Arbeiten

1. Providerneutrales Auftragsformat definieren:
   - Funktionsname,
   - Schemaversion,
   - Promptversion,
   - erlaubte Eingabedaten,
   - Vorgangs-ID.
2. Erste Supabase Edge Function anlegen.
3. Account-Sitzung im Endpunkt prüfen.
4. Account-ID ausschließlich aus der gültigen Sitzung ableiten.
5. Claude-Key als serverseitiges Secret hinterlegen.
6. Modellrouting über serverseitige Konfiguration steuern.
7. Strukturierte Antwortformate verwenden und anschließend fachlich
   validieren.
8. Grenzen einbauen:
   - maximale Requestgröße,
   - maximale Antwortgröße,
   - Timeout,
   - Tageslimit,
   - Monatsbudget,
   - gleichzeitige Aufträge pro Account.
9. Einheitliches Nutzungsprotokoll führen:
   - Account oder administrativer Auftrag,
   - Funktion,
   - Modellalias,
   - Input- und Output-Tokens,
   - geschätzte Kosten,
   - Dauer,
   - Erfolg und Fehlerklasse,
   - Prompt- und Profilversion.
10. Nicht in allgemeine Logs schreiben:
    - vollständige Blogtexte,
    - Notizen,
    - Scanbilder,
    - geheime Schlüssel,
    - standardmäßig vollständige Suchanfragen.
11. Anbieterfehler, Refusal, ungültiges Schema und Kostenlimit getrennt
    behandeln.
12. Gesundheits- und Testauftrag ohne persönliche Daten bereitstellen.

### Abnahmekriterium

- anonyme Aufrufe werden abgewiesen,
- der Claude-Key ist weder im Repository noch im Browser-Bundle,
- ein Account kann sein Limit nicht durch frei gewählte IDs umgehen,
- ungültige Modellantworten erreichen keine persönliche Datenbank,
- Kosten und Fehler sind pro Funktion nachvollziehbar,
- bei KI-Ausfall bleiben deterministische App-Funktionen nutzbar.

---

## Etappe 6: Erste KI-Funktion – intelligente Suche

### Ziel

Claude übersetzt schwierige natürliche Suchwünsche in ein enges Filterschema.
Die eigentliche Suche und alle Treffer bleiben deterministisch.

### MVP-Grenze

Claude erhält:

- den aktuellen Suchsatz,
- erlaubte Filtertypen,
- kleine Listen verfügbarer Genres, Kategorien und Stimmungsbegriffe,
- keine vollständige Masterliste,
- keinen vollständigen Katalog,
- keine Blogtexte oder Notizen.

### Ablauf

1. Normale Suche zuerst lokal interpretieren.
2. Direkte Titel und bereits vollständig verstandene Filter ohne KI suchen.
3. Bei unklarer Anfrage bewusst „Mit KI deuten“ anbieten.
4. Claude erzeugt ein validiertes Filterschema.
5. Erkannte harte Filter, weiche Wünsche und Ausschlüsse getrennt darstellen.
6. Nicht unterstützte Wünsche sichtbar benennen.
7. Nutzer kann Chips entfernen oder korrigieren.
8. Bestehende Finder-Funktionen suchen ausschließlich in echten Daten.
9. Bei Fehler, Timeout oder Limit bleibt die normale Suche erhalten.

### Unterstützte erste Kriterien

- Genres und Genreausschlüsse,
- Jahr von/bis,
- ausgeschlossene Jahrzehnte,
- Kino, Streaming oder physischer Bestand,
- heute oder morgen,
- Kategorien,
- weiche Stimmungen,
- WIE-, WAS- oder WARUM-Schlagseite.

### Zunächst nicht unterstützt

- Laufzeit, solange sie nicht verlässlich im Katalog steht,
- frei erfundene semantische Eigenschaften ohne Datenbasis,
- Embeddings über den gesamten Katalog,
- persönliches KI-Geschmacksprofil,
- allgemeiner Filmchat,
- Schreibaktionen.

### Abnahmekriterium

- Claude erhält nie den vollständigen Katalog,
- Treffer stammen ausschließlich aus der echten Suche,
- Titel werden nicht erfunden,
- Filter sind sichtbar und änderbar,
- ein KI-Fehler beschädigt weder Verlauf noch normale Suche,
- jeder kostenpflichtige Aufruf ist bewusst ausgelöst und protokolliert.

---

## Etappe 7: Datenschutz, Sicherheit und Betrieb

### Ziel

Der Dienst kann nicht nur deployt, sondern verantwortbar betrieben, gelöscht
und wiederhergestellt werden.

### Datenschutz

1. Datenschutzerklärung an den realen Datenfluss anpassen.
2. Verantwortliche Stelle und Kontakt nennen.
3. Zwecke und Rechtsgrundlagen je Datenbereich dokumentieren.
4. Auftragsverarbeiter und Drittlandtransfers prüfen.
5. KI-Verarbeitung transparent erklären.
6. Opt-ins für Bloganalyse, Scanbilder und Hintergrundempfehlungen getrennt
   halten.
7. Aufbewahrungsfristen festlegen:
   - Accountdaten,
   - KI-Nutzungslogs,
   - Fehlerlogs,
   - temporäre Bilder,
   - gelöschte Backups.
8. Datenexport und vollständige Accountlöschung testen.
9. Abgeleitete Daten wie Profile und Prognosen in Export und Löschung
   einschließen.

### Sicherheit

1. RLS-Negativtests automatisieren.
2. Secrets getrennt für Staging und Produktion führen.
3. Schlüsselrotation dokumentieren.
4. Content Security Policy testen.
5. Importierte Texte als nicht vertrauenswürdig behandeln.
6. Schreibende KI-Aktionen nicht ohne Bestätigung zulassen.
7. Abhängigkeiten und Build-Artefakte regelmäßig prüfen.
8. Missbrauchs- und Kostenlimits serverseitig erzwingen.

### Betrieb

1. Monitoring für:
   - Deploymentstatus,
   - Auth-Fehler,
   - Datenbankfehler,
   - KI-Fehler,
   - Latenz,
   - Budgetverbrauch.
2. Alarmgrenzen festlegen.
3. Automatische Datenbankbackups prüfen.
4. Wiederherstellung in einer getrennten Umgebung testen.
5. Runbook schreiben:
   - Provider ausgefallen,
   - KI-Kosten laufen hoch,
   - Schlüssel kompromittiert,
   - Katalogquelle widerrufen,
   - fehlerhaftes Deployment,
   - Accountlöschung fehlgeschlagen.
6. Verantwortlichkeit für Freigabe und Notabschaltung festlegen.

### Abnahmekriterium

- Nutzer kann seine Daten exportieren und löschen,
- Wiederherstellung wurde praktisch getestet,
- kritische Fehler werden bemerkt,
- KI kann unabhängig vom Rest der App abgeschaltet werden,
- Programmdatenquellen können unabhängig pausiert werden,
- Staging-Secrets können niemals Produktion autorisieren.

---

## Etappe 8: Geschlossene Beta

### Ziel

Mit wenigen bekannten Testern prüfen, ob der vollständige Produktpfad unter
realer Nutzung funktioniert.

### Empfohlener Umfang

- vier bis fünf eingeladene Accounts,
- eigene Geräte und Browser,
- begrenztes Monatsbudget,
- intelligente Suche als einzige echte KI-Produktfunktion,
- kein allgemeiner Assistent,
- klarer Feedbackkanal.

### Testszenarien

1. neuer Account ohne Daten,
2. Migration eines vorhandenen lokalen Bestands,
3. zweites Gerät,
4. Offlineänderung und spätere Synchronisierung,
5. abgelaufene Sitzung,
6. KI-Limit erreicht,
7. Claude oder Supabase vorübergehend nicht erreichbar,
8. Backup, Export und Restore,
9. Accountlöschung,
10. Zugriffstest zwischen zwei Accounts.

### Beobachtete Kennzahlen

- erfolgreiche und fehlgeschlagene Logins,
- Sync-Konflikte,
- KI-Aufrufe pro Nutzer,
- Kosten pro erfolgreicher Suchinterpretation,
- Zeit bis zum Suchergebnis,
- Anteil korrigierter KI-Filter,
- Fallback-Nutzung,
- unverständliche Fehlermeldungen,
- Datenverlust- oder Berechtigungsbefunde.

### Freigabetor

Die öffentliche Erweiterung erfolgt nur, wenn:

- kein offener Account-Isolationsfehler besteht,
- keine persönlichen Daten verloren gingen,
- Export und Löschung funktionieren,
- Kostenlimits praktisch greifen,
- normale Suche bei KI-Ausfall funktioniert,
- offene rechtliche Punkte die freizugebenden Daten nicht betreffen.

---

## Etappe 9: Kontrollierter öffentlicher Start

### Ziel

Das getestete Produkt wird schrittweise freigeschaltet, ohne sofort unbegrenzte
Kosten oder Nutzerzahlen zuzulassen.

### Arbeiten

1. Einladungen oder Warteliste vor vollständig offener Registrierung nutzen.
2. Nutzerzahl und KI-Budget stufenweise erhöhen.
3. Status- und Hilfeseite bereitstellen.
4. Releasehinweise und bekannte Grenzen veröffentlichen.
5. Support- und Datenschutzanfragen einem festen Prozess zuordnen.
6. Kosten, Fehler und Missbrauch täglich beobachten.
7. Erst nach stabiler Suche weitere KI-Funktionen auswählen.
8. Jede weitere Funktion über denselben Account-, Validierungs- und
   Kostenunterbau führen.

### Abnahmekriterium

- Registrierung, Betrieb und Abschaltung sind kontrollierbar,
- Kosten steigen nachvollziehbar mit realer Nutzung,
- keine Funktion hängt von einem geheimen Browserwert ab,
- Nutzer verstehen den Unterschied zwischen echten Daten und KI-Vorschlägen,
- Rückroll- und Notfallwege sind bekannt.

---

## Kritischer Pfad

Der kürzeste verantwortbare Weg zur geschlossenen KI-Beta lautet:

```text
grüne Baseline
    -> Staging
    -> Supabase Auth
    -> Account-RLS
    -> Migration eines lokalen Testbestands
    -> geschützte KI-Edge-Function
    -> intelligente Suche
    -> Export/Löschung/Monitoring
    -> geschlossene Beta
```

Die vollständige Umstrukturierung der UI liegt nicht auf diesem kritischen
Pfad. Die Lizenzierung des gesamten Wiener Kinoprogramms liegt auf dem Weg zum
vollständigen öffentlichen Produkt, blockiert aber nicht jeden Account- oder
Suchprototyp mit erlaubten beziehungsweise persönlichen Daten.

## Entscheidungen, die früh fallen müssen

### Vor Accountbau

- Bleibt der Gastmodus dauerhaft?
- Welche Loginmethode startet in der Beta?
- Werden persönliche Daten zunächst dokumentorientiert oder sofort
  normalisiert gespeichert?
- Wie werden lokale Änderungen bei der ersten Anmeldung übernommen?

### Vor KI-Unterbau

- Supabase Edge Function als erster Endpunkt bestätigen oder begründet einen
  Cloudflare Worker wählen.
- Monatsbudget und Tageslimit für Tester festlegen.
- Aufbewahrungszeit der KI-Nutzungslogs festlegen.
- Anbieter- und Datenschutzbedingungen prüfen.

### Vor intelligenter Suche

- erlaubtes Filterschema bestätigen,
- harte Filter und weiche Wünsche definieren,
- Umgang mit Ausschlüssen festlegen,
- nicht vorhandene Katalogfelder ehrlich kennzeichnen.

### Vor öffentlichem Start

- Bedeutung von WARUM endgültig vereinheitlichen,
- Inhalt des Downloadpakets festlegen,
- Programmdatenrechte dokumentieren,
- Datenschutz-, Lösch- und Supportprozesse abnehmen.

## Was bewusst später kommt

Diese Arbeiten dürfen wichtig sein, sind aber keine Voraussetzung für die erste
Online- und KI-Beta:

- vollständiger visueller Relaunch,
- allgemeiner Filmassistent,
- Embeddings und Vektordatenbank,
- Filmscan,
- automatische Vorbewertung,
- vollständige Bloganalyse,
- Benachrichtigungen,
- normalisiertes Datenmodell für jeden heutigen Storage-Topf,
- öffentliche Registrierung ohne Begrenzung.

## Sofort nächste Arbeitspakete

1. Aktuelle Testsuite vollständig grün herstellen.
2. Stabilen Zwischenstand sichern.
3. Kurze Account-Spezifikation schreiben:
   - Login,
   - Gastmodus,
   - Datenübernahme,
   - Abmeldung,
   - Löschung.
4. Staging-Projekt für Hosting und Supabase festlegen.
5. Account-Schema und RLS mit zwei Testaccounts prototypisch beweisen.
6. Danach den geschützten KI-Testauftrag bauen.
7. Anschließend die intelligente Suche als ersten vollständigen KI-Pfad
   umsetzen.

## Definition of Done für „online“

Kinodreieck gilt nicht allein deshalb als produktiv online, weil eine URL
erreichbar ist. Für Online-Stufe 3 müssen mindestens folgende Aussagen wahr
sein:

- [ ] Produktion und Staging sind getrennt.
- [ ] Vollständige Testsuite ist grün.
- [ ] Kein Secret befindet sich im Repository oder Browser-Bundle.
- [ ] Account-Isolation ist durch positive und negative Tests belegt.
- [ ] Lokale Daten können kontrolliert migriert werden.
- [ ] Persönliche Daten können exportiert und gelöscht werden.
- [ ] Datenbankbackup und Wiederherstellung wurden praktisch getestet.
- [ ] Öffentliche Katalogdaten besitzen einen dokumentierten Quellenstatus.
- [ ] KI-Antworten werden strukturell und fachlich validiert.
- [ ] KI besitzt Rate-Limit, Monatsbudget und Notabschaltung.
- [ ] KI-Ausfall legt die deterministischen Kernfunktionen nicht lahm.
- [ ] Datenschutz- und Kontaktinformationen entsprechen dem realen Betrieb.
- [ ] Fehler und ungewöhnliche Kosten werden überwacht.
- [ ] Ein fehlerhaftes Deployment kann zurückgerollt werden.
- [ ] Bekannte Grenzen werden Nutzern verständlich angezeigt.

## Pflege

Diese Roadmap ist die übergreifende Reihenfolgeplanung. Detaillierte
Schnittstellen, Tabellen, UI-Abläufe und Testfälle gehören in eigene
Spezifikationen.

Nach jeder Etappe wird nur Folgendes aktualisiert:

- tatsächlicher Stand,
- neue dauerhafte Entscheidungen,
- verschobene Abhängigkeiten,
- Abnahmekriterien, die sich in der Praxis als unzureichend erwiesen haben.

Damit bleibt die Roadmap ein Entscheidungsinstrument und wird nicht zu einem
zweiten, veralteten Ticketsystem.
