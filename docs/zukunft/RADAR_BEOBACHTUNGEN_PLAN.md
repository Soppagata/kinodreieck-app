# Zukunftsplan: Radar – aktive Suche und belegte Release-Hinweise

Stand: 09.08.2026
Erstellungsreferenz: `7a51ce7` auf `codex/rollenlogik-private-demo`
Sichtbarer Bereich: **Radar** innerhalb von **Entdecken**
Audit-Scope: `FUTURE_PLAN_METADATA_ONLY`

> **Status: Zukunftsplanung – nicht implementiert.**
> Dieses Dokument ist ausdrücklich aus Rollen-v1, der aktuellen privaten
> Demo-Schlussabnahme und dem abgeschlossenen Audit-/Cleanup-Scope
> ausgeschlossen. Es erzeugt keine offene Lieferpflicht und darf nicht als
> Produktfunktion oder Roadmap-Erfüllung gewertet werden. Umsetzung erst nach
> der privaten Demo durch einen eigenen Bauauftrag; zunächst nur auf `staging`.

> **Produktfortschreibung vom 09.08.2026:**
> `ENTDECKEN_RADAR_EMPFEHLUNGEN_PLAN.md` ist für sichtbare Begriffe,
> Navigation, kuratierte Freigaben und Empfehlungen maßgeblich. In älteren
> Formulierungen dieser Datei bedeutet „Beobachtung/Beobachten“ beim aktiven
> Suchpfad fachlich **Radar-Abo / ins Radar aufnehmen**. Der UI-Status
> **Beobachtet** bleibt dagegen ausschließlich der private, kostenlose
> `kd_series_watch`-Status. Es ist nur eine geschlossene Beta mit Max plus
> höchstens zehn kuratierten Logins geplant. Personen aus Schauspiel und Regie
> gehören nach der Produktentscheidung ebenfalls sichtbar in **Mein Radar**,
> bleiben intern aber die getrennte Discovery-Schicht aus
> `DISCOVERY_TARGETS_SKIZZE.md`; sie werden ausdrücklich **nicht** zum vierten
> Wert von `kd_radar_targets`.

## 1. Kurzentscheidung

Das Radar trennt globale Fakten von persönlichen Interessen:

```text
persönliches Abo
    -> kanonisches globales Ziel
    -> ein deduplizierter Quellenlauf für alle Beobachter
    -> globale, belegte Ereignisse
    -> persönliche Anzeige-, Gesehen-, Verwerfen- und Kalenderzustände
```

Beobachten fünf Konten „Star Wars“, wird nicht fünfmal gesucht. Das Ziel wird
global einmal geprüft; jedes Konto sieht anschließend dieselben belegten
Fakten mit seinem eigenen Abo- und Anzeigezustand.

„Frisch“ bedeutet im MVP: Der Scheduler läuft täglich, verarbeitet aber nur
Checks, deren `next_check_at` erreicht ist. Der Pilot prüft fest montags und
freitags in der Zeitzone `Europe/Vienna`. Es findet
**keine tägliche bezahlte Vollprüfung aller Ziele** statt. UI und Datenbestand
zeigen getrennt `zuletzt erfolgreich geprüft` und `nächste Prüfung`.

## 2. Produktziel

Kinodreieck erhält eine zentrale, übersichtliche Antwort auf:

- Was habe ich ausdrücklich beobachtet oder gepinnt?
- Welche neuen Filme, Serien oder Staffeln gehören belastbar dazu?
- Welche bestätigten Starttermine rücken näher?
- Was möchte ich ansehen, verwerfen oder in meine Woche übernehmen?

Die Oberfläche soll vorhandene kuratierte Zustände zusammenführen, ohne ihre
Speichersemantik zu vermischen:

- konkrete Kinotermine aus `kd:kino-pins`,
- konkrete Streamingtitel aus `kd:merkliste`,
- Must-Watch-Einträge,
- ausdrücklich beobachtete Streamingserien,
- neue allgemeine Titel-/Serien-/Franchise-Abos,
- neue Personen-Abos für Schauspiel und Regie mit einzeln zu bestätigenden
  Werk-Kandidaten,
- neue belegte Radarereignisse.

Der sichtbare Name ist **Radar** innerhalb des Hauptbereichs **Entdecken**.
Angezeigt werden eigene Radar-Abos und belegte Ereignisse, keine heimlich
erzeugte Geschmacksprognose. Der kostenlose UI-Status **Beobachtet** bleibt
außerhalb dieses aktiven Suchvertrags; Details stehen im Entdecken-Plan.

## 3. Harte Produktregeln

1. Ein Beobachtungsabo beweist nur „dieses Konto möchte Neuigkeiten zu X“,
   niemals automatisch „dieses Konto mag X“.
2. Eine Geschmackspräferenz darf nur über eine getrennte, sichtbare
   Bestätigung entstehen.
3. Ein LLM erzeugt Kandidaten, aber weder fachliche Bestätigung noch
   Kalenderwahrheit.
4. Ein Artikel- oder Suchindexdatum ist kein Veröffentlichungsdatum des Films
   oder der Serie.
5. Zwei Queryformulierungen sind keine zwei Quellen.
6. Gleiche URL, Domain-/Publisherfamilie oder syndizierte Meldung zählt nur
   einmal.
7. Mehrdeutige Titel, unklare Franchiserelationen, Regionen oder Ereignistypen
   bleiben blockiert beziehungsweise manuell prüfbar.
8. Ein bestätigtes Ereignis schreibt nie ungefragt in `kd:wochenplan` und nie
   automatisch in Apple/Google Kalender.
9. `main`, Produktionsfrontend und gemeinsam genutztes Supabase-Projekt werden
   nur an eigenen Remote-STOPs verändert.
10. Unbekannte Kosten, unbekannter Providerstatus, Timeout oder erschöpfte
    Quota stoppt fail-closed; kein automatischer Sofort-Retry.

## 4. MVP und Nicht-Ziele

### MVP-Ereignisse

Der erste geschlossene Ereigniskatalog umfasst höchstens:

- `kinostart_at`: taggenauer österreichischer Kinostart,
- `streamingstart_at`: taggenauer österreichischer Streamingstart samt
  Plattform,
- `serienstart`: Premiere einer eindeutig identifizierten Serie,
- `staffelstart`: Start einer eindeutig identifizierten Staffel.

Eine belegte Terminänderung erzeugt eine neue Eventversion; eine Rücknahme
ändert den Lebenszyklusstatus. `changed` und `retracted` sind keine zusätzlichen
Ereignistypen.

Nur taggenaue Daten dürfen in „Deine Woche“ erscheinen. Angaben wie „2027“,
„Frühjahr 2027“ oder „im April“ bleiben im Radar-Ausblick ohne erfundenen Tag.

### Nicht-Ziele des ersten Blocks

- Web-Push, E-Mail- oder Betriebssystem-Benachrichtigungen,
- abonnierbarer Kalenderfeed oder direkte Kalenderkontoberechtigung,
- allgemeiner Nachrichtenreader oder Artikelarchiv,
- vollständiger automatischer Franchise-Wissensgraph,
- unbestätigtes fuzzy Titelraten,
- automatisch erzeugte Vorlieben,
- Ersetzung von Must-Watch, Merkliste, Kino-Pins oder Wochenplan,
- öffentliche Registrierung oder Self-Service-Administration,
- tägliche Vollsuche aller Ziele,
- stiller Umbau des bestehenden Serienradars.

## 5. Bestehende Anschlussstellen – vor Bau neu verifizieren

Die folgenden Aussagen gelten nur für die Erstellungsreferenz und müssen in
Phase 0 neu belegt werden:

- `src/services/seriesWatch.js` synchronisiert derzeit ausschließlich
  deduplizierte Watchmode-IDs. Es entstehen dadurch ausdrücklich keine
  allgemeinen Radar- oder Geschmacksregeln.
- `kd_series_watch` erlaubt historisch bis zu 200 Watchmode-IDs und ist nicht
  das neue Member-Limit von zehn Radar-Abos.
- `src/tabs/StartTab.jsx` projiziert Pinboard, Serienradar, „Deine Woche“,
  Must-Watch und zuletzt hinzugefügte Einträge deterministisch aus bestehendem
  State.
- `src/lib/wochenplan.js` zeigt heute plus sechs Folgetage. Ein Radarereignis
  kann später analog zu Kinovorschlägen read-only hineinprojiziert werden.
- `src/lib/personalDataRegistry.js` ist die zentrale Wahrheit für persönliche
  Töpfe, Backup, Restore und Kontoübernahme.
- Rollen-v1 kennt `member` und `owner`; `owner` besitzt ausdrücklich keine
  zusätzlichen Produktrechte. „Superadmin“ ist daher keine vorhandene
  fachliche Rolle.
- Der bestehende globale KI-Monatsdeckel beträgt an der Erstellungsreferenz
  1.000 US-Cent. Er deckt eine neue externe Such-API nicht automatisch ab.
- Der echte externe Streaming-Scheduler liegt derzeit nicht im Repository;
  im Repo existiert nur ein nicht verdrahteter Pipelineentwurf.

Der Bau darf diese Pfade nicht aufgrund dieser Planung ungeprüft umdeuten.

## 6. Vorgeschlagenes Datenmodell

Die Namen sind Arbeitsnamen, keine fertige Migration.

### 6.1 Persönlicher Topf `kd:radar`

Es gibt keine zwei gleichrangigen Abo-Wahrheiten:

- Im Gastmodus ist `kd:radar` die lokale Wahrheit für gewünschte Ziele,
  Receipts und Anzeigeoptionen. Gastregeln erzeugen keinen Hintergrundjob.
- Im Kontomodus sind `kd_radar_subscriptions` und die getrennten
  Personen-Discovery-Subscriptions gemeinsam die serverseitige Autorität für
  **wirksam aktive** Radar-Abos und das Zehnerlimit. `kd:radar` hält nur den
  accountgebundenen Offline-Cache, persönliche Receipts sowie eine
  wiederaufnehmbare Outbox für gewünschte Änderungen.
- Ein lokaler Wunsch gilt erst nach RPC-Antwort samt Serverrevision und
  Prüfsumme als wirksam aktiv. Quota-, Access- oder Konfliktablehnung bleibt
  sichtbar `pending` beziehungsweise `rejected`; sie darf keinen Job auslösen.
- Reconciliation liest den wirksamen Serversatz, vergleicht Revision und
  Prüfsumme und heilt ausschließlich die abgeleitete Cacheprojektion. Sie
  überschreibt keine ungeklärte lokale Outbox und keine persönlichen Receipts.

Der Topf enthält daher:

- gecachte wirksame Event-`target_id`-/Scope-Abos und typisierte Personen-
  Discovery-Abos samt Serverrevision,
- gewünschte noch offene Aboänderungen mit idempotenter Vorgangs-ID,
- Event-Receipts `neu`, `gesehen`, `verworfen`, `übernommen`,
- Anzeigeoptionen, aber keine globale Quellenwahrheit.

Der Topf muss als neue persönliche Datenklasse vollständig durch:

- `K`/Storage-Key,
- `personalDataRegistry`,
- Backup und Restore,
- Gast/Konto-Übernahme,
- Account-Driver/Sync,
- Supabase-Key-Allowlist,
- Größen-, beschädigte-Daten- und Konto-Wechseltests.

Gastnutzer dürfen lokale Regeln verwalten und gegen bereits geladene
Katalogdaten matchen. Bei Gast→Konto, Backup-Restore oder Gerätewechsel zeigt
die App vor dem Import eine Vorschau. Erst die atomare Serverannahme aktiviert
zulässige Abos; überzählige Einträge bleiben lokal sichtbar und auswählbar,
werden aber weder still gelöscht noch als serveraktiv behauptet.

### 6.2 `kd_radar_targets` – global, service-only

Ein kanonisches Ziel je Werk, Serie oder Franchise:

- stabile interne UUID,
- Zieltyp `work`, `series` oder `franchise`,
- kanonischer Name und bestätigte Aliasse,
- starke externe IDs, soweit vorhanden,
- globaler `target_status` `active`, `ambiguous` oder `retired`.

Eine Watchmode-ID kann eine konkrete Serie identifizieren, aber nicht
automatisch ein ganzes Franchise. Freitext darf erst nach kanonischer Auflösung
zum wiederkehrenden Ziel werden.

Die bloße Existenz eines nur durch Abos entstandenen Ziels kann ein Interesse
verraten. Browser besitzen deshalb keinen Direkt-SELECT auf die globale
Targettabelle. Sichtbare Zielmetadaten kommen ausschließlich minimiert über den
Own-Subscription-Feed. Davon getrennte, nachweislich öffentliche Katalogwerke
dürfen nur aus dem ohnehin öffentlichen Katalogvertrag gelesen werden.

### 6.2.1 Personen-Discovery – getrennt vom Event-Ziel

Personen aus Schauspiel und Regie werden kanonisch als
`(person_external_id, role)` aufgelöst und in eigenen Discovery-Target- und
Subscription-Verträgen geführt. Eine Person:

- erscheint nach Bestätigung sofort als persönlicher Radar-Eintrag,
- erzeugt keine `kd_radar_events` oder Eventversionen,
- darf nur global deduplizierte Werk-Kandidaten vorschlagen,
- aktiviert keinen Werk-Check ohne die einzelne Nutzeraktion **Werk ins
  Radar**,
- besitzt getrennte RLS-/Share-RPCs und keinen polymorphen Freitext-Fremdschlüssel
  auf `kd_radar_targets`.

Ein bestätigtes Kandidatenwerk nutzt danach unverändert `kd_radar_targets`,
`kd_radar_subscriptions` und den bestehenden globalen Check-Key. Damit gibt es
weder einen zweiten Ereignispfad noch versteckte Kostenvervielfachung.

### 6.3 `kd_radar_checks` – globale Prüfeinheit, service-only

Zeitplan, Cache und Kosten hängen nicht nur am Ziel, sondern an einer exakt
definierten Prüfeinheit:

```text
check_key = target_id + region + scope + query_version + provider_version
```

Je `check_key` werden Region, Scope, Query-/Providerversion,
`last_attempt_at`, `last_successful_check`, `next_check_at`, `result_hash`,
Revalidierungs-TTL, `active`, `superseded_by`, `lease_until` und ein eindeutiger
Fencing-Token geführt. Pro Ziel, Region und Scope darf genau eine
Query-/Providerversion aktiv geroutet sein. Ein Versionswechsel aktiviert den
neuen Check und legt den alten in derselben Transaktion still; Historie und
Runs bleiben erhalten, der alte Check wird aber nie wieder fällig.

Ein erfolgreicher Streamingcheck darf dadurch niemals einen offenen Kinocheck
oder eine andere Region als frisch markieren. Ergebnis- und Statuswrites
akzeptieren nur den aktuellen Fencing-Token. Nach Lease-Ablauf darf ein neuer
Worker nur übernehmen, wenn der vorherige Requestzustand sicher `not_started`
oder vollständig `settled` ist. Bei `sent` mit unbekanntem Ergebnis oder
unbekannten Kosten wird nicht erneut gesucht; der Provider-Circuit öffnet zur
manuellen Reconciliation.

### 6.4 `kd_radar_subscriptions` – persönlich, RLS

Serverprojektion für den Scheduler:

- `account_id + target_id` als stabile MVP-Eindeutigkeit; Region und Scope sind
  genau je ein Attribut dieser Zeile und werden bei einer Änderung ersetzt,
- persönlicher `subscription_status` wie `active`, `paused`, `pending` oder
  `rejected`, außerdem `created_at`, `updated_at`,
- monotone Serverrevision und letzte idempotente Vorgangs-ID,
- keine persönliche Notiz und kein Geschmacksprofil.

Browser lesen ausschließlich eigene Zeilen. Änderungen laufen über eine
atomare RPC, die `subscription_status='active'`, Kontoidentität, Limit und
gleichzeitige Adds prüft.
Für Event-Abos zählt diese Tabelle `COUNT(DISTINCT target_id)`. Das gemeinsame
Zehnerlimit addiert in derselben serverseitigen Transaktion die wirksam aktiven
eindeutigen Event-Ziele und Personen-Discovery-Ziele. Ein kontoweiter Lock oder
gleichwertiger serieller Quota-Vertrag verhindert, dass parallele Adds in den
beiden Tabellen zusammen elf Einträge erzeugen. Werk-Kandidaten zählen nicht;
erst ihr bestätigtes Event-Abo zählt.
Mehrere Regionen oder parallele Scopezeilen desselben Ziels sind im MVP nicht
zulässig; `scope=all` deckt Kino und Streaming gemeinsam ab.
Service-Role beziehungsweise der freigegebene Job darf nur die global
deduplizierten `check_key`s mit mindestens einem wirksam aktiven persönlichen
Abo lesen; Subscriberzahlen werden weder an andere Konten noch an den
Suchanbieter gegeben. Das Pausieren eines Kontos verändert niemals den
globalen `target_status` oder die Abos anderer Konten.

### 6.5 `kd_radar_events` und `kd_radar_event_versions` – global

Ein Ereignis wird einmal gespeichert und allen berechtigten Abonnenten
projiziert:

- stabile Ereignis-ID aus Werk, Ereignistyp, Region und gegebenenfalls
  Plattform – **nicht** aus dem Datum,
- kanonische Werk-ID und zugeordnete Ziel-IDs,
- unveränderlicher `event_type`, Region und Plattform am Ereignis,
- getrennter `lifecycle_status` wie `announced`, `scheduled`, `retracted` samt
  unveränderlicher Übergangshistorie,
- unveränderliche Terminversionen mit Datum/Präzision, eigenem
  `verification_status` wie `candidate`, `corroborated`, `confirmed` oder
  `ambiguous`, `last_verified_at` und eigenem Quellenstand,
- getrennte Zeiger `current_candidate_version_id` und
  `current_confirmed_version_id`.

Weil das Datum nicht Teil der Identität ist, aktualisiert eine Verschiebung
dasselbe Ereignis durch eine neue Version statt ein Duplikat zu erzeugen. Jede
neue Datumsfassung beginnt wieder als `candidate` und erbt weder Evidenz noch
Bestätigung der alten Fassung. Evidence und Reviews referenzieren zwingend die
`event_version_id`; `current_confirmed_version_id` wechselt erst nach erneut
bestandenem Gate. Erst danach darf die UI ein Update eines verknüpften
Reminders anbieten. Eine Rücknahme wird ebenfalls nur nach belegtem Gate als
Lebenszyklusübergang wirksam.

Es gibt keinen Browser-Direktzugriff auf globale Target-, Event-, Evidence-
oder Subscriber-Tabellen. Ein aktives Konto liest einen minimierten Feed nur
über eine Own-Subscription-View beziehungsweise RPC, die `auth.uid()`,
aktiven Accountzugang, `subscription_status='active'` und das eigene Abo
serverseitig prüft. Anonyme, inaktive und nicht abonnierende Konten erhalten
weder Radarziele, Eventdetails noch Subscriberzahlen.

### 6.6 `kd_radar_evidence` – service-only beziehungsweise minimiert

- zwingende `event_version_id`,
- kanonische URL,
- registrierbare Domain und Publisherfamilie,
- Quellenklasse `official`, `editorial`, `aggregator`, `unknown`,
- behauptetes Datum, Ereignistyp, Region und Plattform,
- Abrufzeitpunkt und Fingerprint für Duplikat-/Syndizierungsschutz,
- keine vollständigen Artikel, keine unnötigen Snippets.

Was gespeichert werden darf, entscheidet erst der aktuelle Provider-/Terms-
Spike. Unzulässige Rohfelder werden unmittelbar verworfen und nie geloggt.

### 6.7 `kd_radar_sources` – kuratierte Quellenautorität

Eine service-only Registry führt Domain, Publisherfamilie, Quellenklasse,
erlaubte Nutzung, Terms-Prüfdatum und Aktivstatus. `unknown`, Aggregatoren und
reine Modellklassifikationen tragen nie zur automatischen Zwei-Quellen-
Bestätigung bei. Ein LLM darf diese Registry weder anlegen noch ändern.

### 6.8 `kd_radar_reviews` – unveränderliches Reviewlog

Manuelle globale Faktenfreigabe ist von `radar_unlimited` getrennt. Nur eine
eigene service-seitige Capability, Arbeitstitel `radar_review`, darf über einen
vertraulichen Weg reviewen. Jeder Eintrag hält Actor, Grund, Quelle,
Eventversion und Zeitpunkt unveränderlich fest; keine Account-ID gehört in Git
oder Chat.

### 6.9 `kd_radar_runs` – service-only

Wiederaufnehmbarer Betriebsbeleg:

- Lauf-ID und Konfigurations-/Queryversion,
- `check_key`, Status `open`, `ok`, `no_change`, `failed`,
  `deferred_budget`, `ambiguous`,
- Request-, Tool-Use-, Token- und Kostenwerte,
- Start/Ende, Lock/Lease und nächster erlaubter Versuch,
- keine Account-ID neben der an den Provider gesendeten Suchanfrage.

## 7. Verhältnis zum bestehenden Serienradar

`kd_series_watch` darf nicht still umgedeutet oder durch ein neues 10er-Limit
abgeschnitten werden. Das Memberlimit zehn gilt für alle Abos, die den neuen
allgemeinen Webradar und damit `kd_radar_checks` auslösen. Das bestehende reine
Staffel-/Folgenbeobachten bleibt getrennt und zählt nicht, solange es keinen
allgemeinen Webradarjob erzeugt.

Bestehende beobachtete Serien werden in einer Vorschau als mögliche Webradar-
Abos angeboten. Nur eine bewusste Übernahme aktiviert den neuen Job und zählt
gegen zehn. Ein Bestand über zehn bleibt im alten Serienstand erhalten; er
wird weder gekürzt noch automatisch kostenpflichtig. Eine Vereinigung beider
Tabellen im Webradarjob, automatische destruktive Migration oder stilles
Dual-Write ist ausgeschlossen.

Phase 0 muss diese Trennung gegen den dann aktuellen Serienpipelinevertrag
bestätigen. Falls der alte Serienpfad bis dahin selbst Websuchen auslöst, wird
die Limitentscheidung neu an Max eskaliert statt umgangen.

## 8. Rollen und Quotas

### Normale aktive Konten

- Startlimit: zehn aktive Radar-Abos.
- Gezählt werden wirksam serverbestätigte Event-Radar-Abos und Personen-
  Discovery-Abos gemeinsam. Ein bloßer Werk-Kandidat zählt nicht; ein einzeln
  bestätigtes Werk-Abo zählt als eigener Eintrag.
- Erhöhung auf 15 frühestens nach vier Wochen gemessenem Pilotbetrieb.
- Zwei parallele Adds dürfen das Limit atomar nicht überschreiten.
- Inaktive oder fehlende Access-Zeilen lesen/schreiben fail-closed nichts
  Kontogebundenes und erzeugen keine neuen Jobziele.
- Bestehende Überhänge werden nie still gelöscht oder gekürzt.

### Max' Superadmin-Fähigkeit

Max erhält später eine eigene serverseitige Capability, Arbeitstitel
`radar_unlimited`. Sie darf nicht an `role=owner` oder an Cache-Owner-Begriffe
gekoppelt werden.

„Unbegrenzt“ bedeutet:

- kein fachliches Limit der gespeicherten persönlichen Abos,
- kein Vorrang vor Privacy-, Quellen- oder Evidenzregeln,
- kein Bypass des globalen Lauf- oder Monatsbudgets,
- Überhang wird geordnet verschoben und nicht kostenmäßig erzwungen.

Normale Testerziele werden zuerst oder aus einem reservierten Budgetsegment
bearbeitet, damit eine große Superadmin-Liste sie nicht verdrängt.

## 9. Scheduler und Wiederanlauf

### Takt

- Ein kleiner Scheduler darf täglich starten.
- Er verarbeitet ausschließlich `kd_radar_checks.next_check_at <= now()`.
- Pilotcadence: exakt Montag und Freitag in `Europe/Vienna`, höchstens zwei
  planmäßige Prüfungen je aktivem Check-Key und Kalenderwoche.
- Eine spätere adaptive Cadence ist nur nach Messung zulässig. Sie darf nie
  ohne Budgetrechnung aus „täglich“ eine tägliche Vollsuche machen.

### Ablauf

1. aktiven, fälligen persönlichen Bestand laden,
2. auf eindeutige `check_key`s aus Ziel, Region, Scope und Query-/Provider-
   version projizieren und global deduplizieren,
3. normale Kontingente beziehungsweise reserviertes Testersegment zuerst,
4. bereits laufende Check-Lease ausschließen,
5. `lease_until`, Fencing-Token und Requestzustand atomar setzen; verspätete
   Workerwrites mit altem Token ablehnen,
6. Check-Keys seriell oder mit sehr enger belegter Parallelität verarbeiten,
7. jeden Checkstatus sofort persistieren,
8. Fehler nur für die offene Fehlmenge beim nächsten zulässigen Lauf aufnehmen,
9. keine automatische Vollwiederholung und kein sofortiger Retry.

Ein fehlgeschlagener Check aktualisiert `last_attempt_at`, aber niemals
`last_successful_check`. Die UI darf ihn nicht als frisch bezeichnen.

Fehlerklassen sind getrennt:

- fachliches `no_match`, `ambiguous` oder ungültiger Kandidat bleibt am
  einzelnen `check_key`,
- Auth-/Rechtefehler, `429`, unbekannter Preis oder Verbrauch, erschöpftes
  Budget, Providerstörung oder nicht messbarer Tool-Use öffnet den
  providerweiten Circuit-Breaker und beendet den gesamten Providerlauf,
- der Circuit speichert Grund, Zeitpunkt, betroffenen Lauf, frühesten
  Wiederaufnahmezeitpunkt und Reconciliationstatus,
- im Pilot gibt es keinen rein zeitgesteuerten Auto-Reset: eine autorisierte
  service-seitige Freigabe benötigt belegte Providerverfügbarkeit, aktuelle
  Preis-/Tool-Use-Regeln, bekannten abgeglichenen Verbrauch und ausreichend
  reservierbares Restbudget,
- kein Check startet erneut, bevor dieser Reset protokolliert, der
  Requestzustand eindeutig und der nächste reguläre Lauf erreicht ist.

### Scheduler-Ort – noch offen

Vor einer Plattformentscheidung wird geprüft, ob der bereits geplante externe
Streamingjob sicher erweitert werden kann. Falls nicht, werden höchstens diese
Optionen verglichen:

- geschützter serverseitiger Supabase-/Edge-Job,
- eng begrenzter GitHub-Schedule, sofern Branch-/Secret-/Zuverlässigkeitsregeln
  passen,
- Cloudflare Scheduled Worker nur bei nachgewiesenem Infrastrukturgewinn.

Kein Scheduler-Secret, Service-Role-Key oder Provider-Key gelangt in Browser,
Repository, Action-Log oder Chat.

## 10. Such- und Extraktionspfad

### Bevorzugte Kostenarchitektur

```text
eine breite Suche je fälligem globalem Check-Key
    -> zulässige Ergebnisfelder normalisieren und hashen
    -> unverändert und innerhalb Revalidierungs-TTL: kein Claude-Aufruf
    -> neu oder geändert: Haiku extrahiert Kandidaten-JSON
    -> deterministischer Validator und Evidence-Gate
    -> globales Ereignis beziehungsweise Prüfstatus
```

Das LLM ist nur für die robuste Extraktion unstrukturierter Hinweise
vorgesehen. ID-Zuordnung, Quellenfamilien, Statusübergänge, Terminprojektion,
Deduplizierung und Budgetentscheidung bleiben deterministisch.

Der Hash umfasst nur nach Providervertrag zulässige normalisierte Felder. Er
ersetzt keine Quellenrevalidierung: bestätigte oder zeitlich nahende Ereignisse
besitzen eine feste maximale Revalidierungs-TTL und werden nach deren Ablauf
auch bei unverändertem Suchhash erneut geprüft. Dadurch kann eine geänderte
Terminangabe unter derselben URL nicht dauerhaft übersehen werden.

### Fallback: Claude Web Search direkt

Falls Providerrechte und Einfachheit dafür sprechen:

- genau ein API-Auftrag je fälligem globalem `check_key`,
- `max_uses: 1` als nicht verhandelbarer Kostenzaun,
- kleine, streng validierte strukturierte Ausgabe,
- Quellenzitate erhalten,
- unklare Fälle nicht durch einen zweiten automatischen Suchlauf „retten“.

Anthropic nennt derzeit 10 US-Dollar je 1.000 tatsächlich ausgeführten
Websuchen zuzüglich Modell-Tokens. Ein einzelner Message-Request kann ohne Cap
mehrere Suchen auslösen. Preise und Toolunterstützung werden vor dem Spike neu
verifiziert:

- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool

### Providerentscheidung

Tavily ist mengenmäßig für einen privaten Pilot interessant, aber dauerhafte
Speicher- und Weiterverwendungsrechte sind noch nicht abschließend geklärt.
Brave-Standardbedingungen sind für persistente Suchresultate zu restriktiv.
Direktes automatisiertes film.at-Scraping bleibt ohne schriftliche Erlaubnis
ausgeschlossen; die für film.at maßgeblichen Kurier-ANB werden im späteren
Phase-0-Audit aus der Primärquelle erneut geprüft. Alle Providerannahmen sind
Spike-Gegenstand, keine heutige Auswahl:

- https://docs.tavily.com/documentation/api-credits
- https://www.tavily.com/terms
- https://api-dashboard.search.brave.com/documentation/resources/terms-of-service
- https://kurier.at/info/anb/254619647

## 11. Evidenz- und Matching-Gate

### Kandidatenbildung

Ein Modell oder Suchadapter darf höchstens liefern:

- kanonisch vermutetes Werk,
- Relation zum beobachteten Ziel,
- Ereignistyp, Region, Plattform und Datumsbehauptung,
- Quellen-URLs und kurze belegbare Fundstellen,
- Unsicherheit und Konflikte.

### Deduplizierung

Jeweils nur eine Evidenzstimme:

- dieselbe kanonische URL,
- dieselbe registrierbare Domain beziehungsweise Publisherfamilie,
- nahezu identische Überschrift/Fundstelle,
- syndizierte Agentur- oder Presseaussendung,
- Aggregator und dessen Original.

Domain-, Publisher- und Official-Klassifikation stammt ausschließlich aus der
kuratierten `kd_radar_sources`-Registry. Eine unbekannte Quelle darf als
sichtbarer Hinweis dienen, trägt aber nie zur automatischen Bestätigung bei.

### Automatische Hochstufung

Ein tagesgenaues Ereignis wird nur kalenderfähig, wenn:

- Werk und Relation über starke ID oder eindeutige manuelle Kanonisierung
  feststehen,
- Ereignistyp, Region und gegebenenfalls Plattform übereinstimmen,
- kein aktueller belastbarer Gegenbeleg besteht,
- und entweder offizielle Primärquelle plus unabhängige belastbare Quelle oder
  zwei wirklich unabhängige belastbare Quellenfamilien dasselbe melden.

Eine einzelne offizielle Quelle darf als starker Hinweis erscheinen. Max kann
sie nur über die getrennte service-seitige `radar_review`-Capability bewusst
manuell bestätigen; Actor, Grund, Quelle, Eventversion und Zeitpunkt werden im
unveränderlichen Reviewlog protokolliert. `radar_unlimited` allein besitzt
keine Faktenfreigabe.

### Blockierende Beispiele

- „Star-Wars-Star dreht romantische Komödie“ ist kein Star-Wars-Werk.
- „Avatar“, „Alien“ oder „It“ ohne starke ID wird nicht automatisch gematcht.
- US-Kinostart wird nicht als österreichischer Kinostart behandelt.
- Trailer-, Convention-, Buch-, Spiele- oder Merchandise-Termin wird nicht als
  Film-/Serienrelease gespeichert.
- `03/04/2027` ohne eindeutigen Sprach-/Regionskontext bleibt mehrdeutig.
- Artikelveröffentlichung, Seitenalter oder Indexierungsdatum zählt nicht.

## 12. Zustände und sichtbares Verhalten

### Globales Ziel (`target_status`)

- `active`: ist kanonisch nutzbar; geprüft wird es nur bei mindestens einem
  wirksam aktiven persönlichen Abo,
- `ambiguous`: braucht Auflösung,
- `retired`: bewusst beendet, historische Ereignisse bleiben nachvollziehbar.

### Persönliches Abo (`subscription_status`)

- `active`: zählt gegen die persönliche Quota und kann globale Providerarbeit
  mit auslösen,
- `paused`: bleibt nur für dieses Konto gespeichert, zählt im MVP nicht als
  wirksam aktiv und verändert das globale Ziel nicht,
- `pending`: lokale Outboxänderung wartet auf Serverannahme,
- `rejected`: Server hat Quota, Access oder Vertrag abgelehnt; kein Job entsteht.

### Ereignis und Terminversion

Die drei Achsen werden nicht in einem Status vermischt:

- `event_type`: `kinostart_at`, `streamingstart_at`, `serienstart` oder
  `staffelstart`,
- `verification_status` je `event_version_id`: `candidate`, `corroborated`,
  `confirmed` oder `ambiguous`,
- `lifecycle_status`: `announced`, `scheduled` oder `retracted`.

Eine Terminänderung erzeugt eine neue unveränderliche Eventversion, die wieder
als `candidate` beginnt. Die alte bestätigte Version bleibt maßgeblich, bis die
neue das Evidenzgate selbst bestanden hat. `changed` ist weder Ereignistyp noch
Bestätigungsstatus.

### Persönliches Receipt

- `new`,
- `seen`,
- `dismissed` für genau diese Eventversion,
- `accepted_week`,
- `exported_ics` als historischer Hinweis, nicht als synchronisierter Kalender.

Eine echte neue Terminversion darf nach einer früheren Verwerfung wieder
erscheinen.

## 13. UI-Plan

### Erste Ausbaustufe

Kein achter Navigationstab. Der vorhandene technische `blog`-Bereich wird
sichtbar zu **Entdecken** und erhält dort die interne Ansicht **Radar**; das
Start-Dashboard darf höchstens einen kompakten Deep-Link beziehungsweise neue
Funde zeigen. Die Radarprojektion gruppiert:

- **Neu im Radar:** neue oder geänderte Ereignisse,
- **Mein Radar:** persönliche Event-Zielabos und Personen-Discovery-Abos samt
  typgerecht beschriftetem Prüfstand,
- **Gemerkt:** bestehende Pins, Merkliste und Must-Watch als Links auf ihre
  unveränderten Fachbereiche.

Globale Fakten werden nicht je Konto kopiert. Sichtbare persönliche Badges wie
„neu“, „gesehen“, „verworfen“ und „in meine Woche übernommen“ stammen aus dem
persönlichen Topf.

### Suche und Anlegen

Die globale Suche zeigt bei kataloggestützten Titeln **Beobachten** und **Ins
Radar** als zwei getrennte Aktionen; bei kanonischen Personen aus Schauspiel
oder Regie ausschließlich **Ins Radar**. Keine Aktion schreibt sofort:

1. geschlossene Befehlsabsicht erkennen,
2. kanonisches Ziel beziehungsweise bei Personen stabile ID plus Rolle und
   Mehrdeutigkeit anzeigen,
3. Vorschau „Dieses Radar-Abo anlegen“,
4. bewusste Bestätigung,
5. optional und getrennt „Auch als Vorliebe merken“ – nie vorausgewählt.

**Beobachten** bleibt vollständig im bestehenden `kd_series_watch`-Pfad. Eine
Personenbestätigung legt eine Discovery-Subscription an; ein späterer
Werk-Kandidat durchläuft dieselbe Vorschau erneut und erzeugt erst dann ein
Event-Zielabo.

### „Deine Woche“ und Kalender

- Ein bestätigtes Ereignis wird sofort global gespeichert.
- Sobald sein Datum in heute bis plus sechs Tage fällt, wird es read-only als
  Radarvorschlag in „Deine Woche“ projiziert.
- Erst „In meine Woche übernehmen“ schreibt den persönlichen Reminder.
- Die Übernahme speichert `event_id`, `event_version_id` und eine stabile
  `reminder_id`; pro Eventversion entsteht höchstens ein One-off-Reminder.
- Ändert sich der Termin später, bietet die App eine Aktualisierung des
  verknüpften Reminders an. Sie dupliziert oder überschreibt ihn niemals still.
- Unbestätigte oder nur monatsgenaue Hinweise erscheinen nie auf einem Tag und
  nie im Sieben-Tage-Sammelexport.
- ICS bleibt ein Schnappschuss. Ein exportierter Termin kann bei späterer
  Verschiebung nicht automatisch zurückgerufen werden.

## 14. Datenschutz und Löschung

Ein beobachteter Titel ist Interesseninformation und damit personenbezogen,
auch wenn nur IDs gespeichert werden.

- Der Provider erhält ausschließlich globalen Zielnamen, Region und Scope –
  nie Account-ID, E-Mail, persönliche Tags oder Subscriberzahl.
- Suchanfrage und persönliche Zuordnung stehen nie gemeinsam im Anbieter- oder
  Kostenlog.
- `kd_radar_subscriptions` und persönliche Receipts besitzen Own-Row-RLS.
- Andere Konten sehen weder fremde Abos noch Subscriberzahlen.
- Globale Radar-Targets und Events sind nicht allgemein oder direkt lesbar.
  Browser besitzen keinen Direkt-SELECT; die minimierte Own-Feed-RPC liefert
  nur Daten zu eigenen aktiven Abos. Davon getrennt darf die im Entdecken-Plan
  definierte Share-RPC ausschließlich explizit im kuratierten Elf-Konten-Kreis
  freigegebene Zielprojektionen ohne Identitäts-, Zeit- oder Countdaten liefern.
- Kontolöschung entfernt persönliche Abos und Receipts. Das globale Ziel darf
  bleiben, wenn andere Konten es weiterhin benötigen.
- Wird ein globales Ziel ohne Abonnenten nicht aus fachlichen Gründen gebraucht,
  erhält es eine dokumentierte Aufbewahrungs-/Purgefrist.
- Rohartikel, vollständige Snippets und Prompts werden nicht persistiert.
- Anbieterrolle, Aufbewahrung, Löschung, Drittlandtransfer und sichtbare
  Quellenattribution werden vor Testerfreigabe geklärt.

## 15. Budget und Betriebsgrenzen

### Mengengerüst

Sei `U` die Zahl unterschiedlicher aktiver globaler `check_key`s in der festen
Pilotcadence:

```text
maximale planmäßige Check-Key-Prüfungen pro Woche = U × 2
```

Zehn Konten mit je zehn Abos ergeben 100 persönliche Abos. Bei identischem
Region-/Scope-Vertrag entstehen zwischen einem und 100 globale Check-Keys.
Mehrere Regionen oder Scopes erhöhen `U` und müssen in der Worst-Case-Rechnung
explizit mitgezählt werden. 200 Prüfungen pro Woche gelten nur bei 100
vollständig unterschiedlichen Check-Keys und exakt einer Suche pro Lauf.

Bei direkter Claude-Websuche lag die Planungsrechnung am 09.08.2026 mit Haiku
und einem Search-Use je Prüfung grob bei 13,50 bis 21 US-Dollar je fünf Wochen
für `U=100`. Das ist eine Größenordnung, keine spätere Preisgarantie.

### Owner-Ziel

Max akzeptiert insgesamt höchstens ungefähr 20 Euro monatliche
Anbieterkosten. Der historisch niedrige Verbrauch von ungefähr 1,10 Euro ist
eine Erfahrungsangabe, aber kein Kostenbeleg für den neuen Worst Case.

Da Provider in US-Dollar abrechnen und Steuer/Wechselkurs schwanken, wird vor
Rollout ein konservativer US-Cent-Deckel ausdrücklich freigegeben. Vorschlag
für den Pilot:

- Warnung bei 70 bis 80 Prozent,
- harter providerübergreifender Monatsstopp zunächst bei höchstens 1.500
  US-Cent,
- Radar-Softallocation darunter,
- Freikontingente zählen nie als garantierter Sicherheitsboden,
- keine stille Erhöhung des bestehenden 1.000-US-Cent-KI-Deckels.

Der exakte Wert und die Aufteilung zwischen bestehender KI, Websuche und
Modelltokens sind ein eigener Remote-STOP.

Phase 0 muss einen einzigen atomaren providerübergreifenden
Reservierungs-/Istkostenvertrag entwerfen. Er umfasst kontobezogene bestehende
KI und den accountlosen Radar-Systemactor, parallele Reservierungen,
konservative Behandlung nicht sicher rückbuchbarer Reservierungen sowie den
Abgleich mit beiden Providerabrechnungen. Zwei voneinander unabhängige
Monatszähler dürfen zusammen den Ownerdeckel nicht überschreiten.

### Vor jedem bezahlten Request

- Preisversion und Providerstatus bekannt,
- Restbudget atomar reserviert,
- Search-Use-Cap bekannt,
- Check-Lease samt aktuellem Fencing-Token aktiv,
- Request- und Laufcap nicht überschritten.

Nachher werden ausschließlich Metadaten gebucht: Provider, Modell, Tool-Uses,
Input-/Output-Tokens, geschätzte und tatsächliche US-Cent, Status. Keine
Suchprompts oder Interessenliste im Kostenlog.

Ein fachlich ungültiger Einzelkandidat beendet nur seinen Check. Unbekannte
Kostenmessung, Auth-/Preisfehler, `429`, erschöpftes Budget, Timeout oder
Providerstörung öffnet dagegen den providerweiten Circuit-Breaker und beendet
den gesamten Lauf. Die offene Fehlmenge wartet ohne Sofort-Retry auf den
nächsten freigegebenen Zustand. Der Superadmin kann den Budgetzaun nicht
umgehen.

## 16. Test- und Spikeplan

### Provider-/Payload-Spike vor dem Bau

30 bis 60 Minuten, eng begrenzt und erst nach eigener Kostenfreigabe:

- maximal 15 vorab gelistete schwierige `check_key`s mit dokumentierter
  Zuordnung zu anonymen Testzielen,
- vorab definierte Region-/Scope-Varianten, Queries und ein Tool-Use je
  freigegebenem `check_key`,
- keine automatische Wiederholung,
- Payloadfelder, Zitate, Tool-Use-Zähler, Tokens und Fehlerform empirisch
  belegen,
- Speicher-/Attributionsrechte gegen den echten Vertrag prüfen,
- Kostenhochrechnung mit den gemessenen Tokens aktualisieren.

Testkorpus mindestens:

- Star Wars als Franchise und konkrete Einzelwerke,
- gleichnamige Werke verschiedener Jahre,
- `Avatar`, `Alien`, `It`,
- falsche Region,
- Artikel-Datumsfalle,
- verschobener beziehungsweise zurückgenommener Termin,
- syndizierte Meldung,
- keine relevante Neuigkeit.

Der Korpus wird vor dem Lauf manuell gelabelt und enthält mindestens fünf
echte positive Releasefälle. Ein ausschließlich leeres Ergebnis kann den
Spike nicht bestehen.

Go nur bei:

- null falschen kalenderfähigen Terminen,
- 100 Prozent blockierten Artikel-Datumsfallen,
- 100 Prozent blockierten bekannten Mehrdeutigkeiten/Konflikten,
- korrekter Quellenfamilien-Deduplizierung,
- mindestens 80 Prozent Wiederfindung der vorab gelabelten positiven Fälle,
- mindestens 95 Prozent korrekter Werk-/Event-/Regionszuordnung unter allen
  hochgestuften Hinweisen,
- idempotentem Wiederholungslauf ohne Duplikate,
- eingehaltenem Request- und Kostenhardcap.

Andernfalls bleibt Websuche ein Hinweisgenerator mit manueller Bestätigung.

### Pflichtregressionen des späteren Builds

- reine Funktionen für Ziel-, Alias-, Domain-, Publisher- und Eventnormalisierung,
- stabile Event-ID und Terminversionierung,
- keine Vererbung von Evidenz, Review oder Bestätigung auf eine neue
  Terminversion; Reminder-Update erst nach neuem Gate,
- Evidence-Gate mit positiven und negativen Fällen,
- Member-Limit zehn, parallele Adds, Abo-Outbox/Reconciliation und
  Superadmin-Capability,
- keine stille Kürzung bestehender Beobachtungen,
- RLS zwischen Konto A/B, inaktivem Konto, Gast und Service-Job,
- Accountwechsel/Logout während Subscription-Projektion,
- Backup/Restore und beschädigter `kd:radar`-Topf,
- Scheduler-Lock pro Check-Key, Checkpoint, targetlokaler Fachfehler,
  Fencing-Token, Lease-Crash, versionierte Check-Aktivierung,
  providerweiter Circuit-Breaker, autorisierter Reset, Budgetstopp und
  Wiederanlauf nur über Fehlmenge,
- Kostensimulation für Überschneidung, 10×10 Worst Case und große
  Superadmin-Liste,
- Wochenprojektion an beiden Sieben-Tage-Grenzen,
- Terminänderung, verknüpfte Reminder-ID, idempotentes Übernehmen,
  Änderungsangebot und ICS-Snapshot,
- Feature-/Provider-Not-Aus,
- vollständige bestehende App-, Function-, RLS- und Mobile-Suite vor
  Auslieferung.

Alle normalen Tests verwenden Mocks. Echte Providerproben erfolgen nur über
einen ausdrücklich freigegebenen, budgetgeschützten Weg mit festen Caps.

## 17. Rolloutfolge nach der privaten Demo

1. **Phase 0: aktueller Audit und Spikeplan** – read-only; Baseline, Provider,
   Scheduler, Datenbestand, Kosten und offene Entscheidungen berichten.
2. **STOP:** Max bestätigt MVP, Providerweg, Umgang mit bestehendem
   Serienradar, Budgetvorschlag und Schedulerort.
3. **Phase 1: reine Verträge und Mocktests** – Normalisierung, Datenformen,
   Evidence- und Kostenlogik; keine Remote-Writes.
4. **STOP:** Diff, Testmatrix, Daten-/RLS-Entwurf und Rückweg prüfen.
5. **Phase 2: additive lokale Migrationen und Servercode** – weiterhin nicht
   remote; alte Clients müssen kompatibel bleiben.
6. **STOP vor Shared-Supabase-Wirkung:** exakte Migration, Zielprojekt,
   Produktionsclient-Kompatibilität, Backup und Forward-Fix/Rückweg freigeben.
7. **Phase 3: Remote-Grundlage mit `radar_aktiv=false`** – einzeln anwenden,
   rücklesen, RLS/Grants belegen; noch kein Providerlauf.
8. **STOP vor Function/Scheduler-Deploy und jedem bezahlten Spike.**
9. **Phase 4: Shadow Mode nur für Max** – Kandidaten und Kosten messen, keine
   automatischen Kalenderprojektionen.
10. **STOP:** Präzision, Monatsprojektion und Datenschutz prüfen.
11. **Phase 5: Staging-UI nur Superadmin**, danach drei Tester mit kleinem
    Limit, danach höchstens zehn Tester mit Limit zehn.
12. **STOP vor Erhöhung auf 15, `main` oder Produktion.**

## 18. Definition of Done des späteren Funktionsblocks

1. Globale Targets und Events werden unabhängig von persönlichen Abos genau
   einmal gespeichert; Region/Scope-/Providercaches liegen getrennt je
   `check_key`.
2. Im Kontomodus ist die serverseitige Subscription die einzige Autorität für
   wirksame Hintergrundabos; Offline-Outbox und Reconciliation sind belegt.
3. Jedes Konto sieht nur eigene Abos/Receipts sowie abonnierte minimierte
   Target-/Eventdaten; RLS-/RPC-Gegenproben für Nichtabonnent und inaktives
   Konto sind grün.
4. Memberlimit zehn und Superadmin-Capability sind serverseitig atomar.
5. Ein großes Superadmin-Set kann weder Budget noch Testerfairness umgehen.
6. Ein Lauf verarbeitet globale Check-Keys dedupliziert, idempotent und
   wiederaufnehmbar.
7. Maximal ein bezahlter Search-Use je Check-Key-Prüfung ist technisch erzwungen.
8. Kein LLM kann allein ein Ereignis bestätigen oder einen Kalendertermin
   erzeugen.
9. Nur belegte, taggenaue, regionsrichtige Ereignisse erscheinen innerhalb des
   Sieben-Tage-Fensters als read-only Vorschlag.
10. Eine bewusste Wochenübernahme erzeugt pro Eventversion höchstens einen
    verknüpften One-off-Reminder; Terminänderungen werden angeboten, nie still
    dupliziert oder überschrieben.
11. Kein Artikeltext, Secret oder Accountbezug gelangt in unzulässige Logs oder
   Providerpayloads.
12. Der gemessene Worst Case bleibt unter dem ausdrücklich freigegebenen
    providerübergreifenden Monatsdeckel; unbekannte Kosten stoppen.
13. Feature und Provider besitzen einen serverseitigen Not-Aus.
14. Vollständige lokale Tests, Function-/RLS-Gates, Mobile-Gates, Staging-
    Buildmeta und Rückweg sind belegt.
15. Personen stehen direkt als typisierte Schauspiel-/Regie-Abos in **Mein
    Radar**, erzeugen selbst keine Events und können Werk-Abos nur nach
    Einzelbestätigung unter demselben Limit aktivieren.
16. Die globale Suche beweist getrennte Write-Wege für **Beobachten** und **Ins
    Radar**; keine Aktion setzt den jeweils anderen Status.
17. `main` und Produktionsfrontend bleiben unverändert, bis Max sie separat
    freigibt; jede Wirkung auf das gemeinsam produktiv genutzte Backend ist
    vorab freigegeben und anschließend ausdrücklich belegt.
