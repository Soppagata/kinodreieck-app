# Personenradar: lokaler vertikaler Slice

**Stand:** 19.08.2026; Remote-Nachtrag 21.08.2026
**Status:** Serverkandidat gebaut und mockbasiert geprüft; Migration und Function
wurden laut späterem Remote-Lauf aktiviert. Die praktische Providerabnahme ist
weiterhin **NICHT BELEGT**.

> Der ursprüngliche Satz „nicht remote angewandt“ war nach dem späteren Lauf
> veraltet. Belegt gemeldet sind die remote angewandte Migration
> `20260819220000` (Hash-Präfix `d23f80f`) und `radar-websearch-task` v3. Der
> praktische Providerlauf stoppte mit `BUDGET_UNBEKANNT` vor dem Fetch; Flags
> und Subscription wurden danach bereinigt. Dieser Nachtrag ist kein neuer
> Live-Check und keine Providerfreigabe.

Der kleine Slice nutzt die vorhandenen Radar-Strukturen: dieselbe Subscription-
Outbox, denselben Feed, denselben manuellen Websearch-Aufruf und denselben lokalen
Radar-v2-Cache. Der geschlossene Discriminator besteht aus starker Personen-ID
und genau einer Rolle (`actor` oder `director`). Namen allein werden nie gematcht.

Für Gast und Einzeldatei ist die Merkfunktion rein lokal. Eine serverseitige oder
automatische Prüfung wird dort weder gestartet noch behauptet. Für Konten ist ein
lokaler Serverkandidat vorbereitet: dieselbe Subscription-Tabelle ergänzt genau
`person_external_id` und `person_role`; dieselbe Function führt genau einen
manuellen Websearch aus; ein bestätigtes kuratiertes Werk landet in den vorhandenen
Target-, Event-, Versions-, Evidence- und Operations-Primitiven und wird über den
vorhandenen Feed wieder geladen. Der vierparametrige Werkpfad bleibt erhalten.

## Lokale Kandidatengrenze

Die additive Migration
`20260819220000_radar_person_server_candidate.sql` verändert keine historische
Migration und erzeugt keine neue Tabelle. Sie schließt den Discriminator gegen ein
intern kuratiertes Personenziel, dessen starke ID, Rolle und kleinen Werkkatalog.
Rollenwiderspruch, Namensabgleich ohne ID, unbekanntes Werk und nicht kuratierte
Evidenz stoppen fail-closed. Der Kostenpfad bewahrt die atomare allgemeine
Reservierung; unbekannter Verbrauch wird nicht als Erfolg behandelt.

## Additiver Katalog-Forwardrepair

Der spätere Readback belegte auf der globalen kuratierten Personensurface nur
`4/5` aktive Ziele. Die neue Migration
`20260821120000_radar_person_catalog_repair.sql` repariert ausschließlich die
fünf bereits historisch festgelegten Paare aus starker Wikidata-QID und Rolle:
Nicolas Cage/Schauspiel, Robert Rodriguez/Regie, Greta Gerwig/Schauspiel,
Greta Gerwig/Regie und Alfred Hitchcock/Regie. Sie akzeptiert nur eine exakt
passende `4/5`-Baseline oder den bereits reparierten `5/5`-Stand. Fehlende
Werksamen, widersprüchliche Metadaten und jede unbekannte kleinere Baseline
brechen die Transaktion ab. Namen werden nicht gesucht oder unscharf gematcht.

Die Migration schreibt ausschließlich fehlende Zeilen in
`public.kd_radar_targets`. Sie ändert keine Subscription, kein Ereignis, keine
Capability, keine Accountrolle, kein Flag und kein fremdes Ziel. Ein zweiter
SQL-Lauf bleibt wirkungslos. Die historischen Ledgerzeilen
`20260819220000` und `20260820200000` müssen dabei jeweils genau einmal stehen
und werden niemals erneut angewandt.

Der spätere Remoteweg bleibt in getrennte, neu zu autorisierende Schritte
geschlossen:

1. Read-only müssen die beiden historischen Ledgerzeilen je einmal, exakt fünf
   kuratierte Werkziele, exakt `4/5` oder `5/5` unverfälschte Personenziele,
   unveränderte Fremdziele/Subscriptions und ausgeschaltete Radarflags belegt
   werden.
2. Der Migrationspayload besteht ausschließlich aus
   `20260821120000_radar_person_catalog_repair.sql`; weder die Personenmigration
   von 19.08. noch die Daily-Migration von 20.08. darf erneut gesendet werden.
3. Der Readback verlangt `5/5`, genau eine neue Ledgerzeile, weiterhin je eine
   historische Ledgerzeile sowie bytegleich projizierte Fremdziele und
   Subscriptions.
4. Die DB-Felder `radar_aktiv` und `radar_provider_aktiv` werden **separat** und
   erst nach diesem Readback, neuer ausdrücklicher Freigabe und messbarem
   Kostenstand gesetzt. Der Forwardrepair selbst enthält keinen Flag-Write.

## Noch nicht praktisch abgenommen

Die lokale PG17-Kette bleibt der reproduzierbare Strukturbeleg. Die spätere
Remote-Aktivierung belegt Migration und Function, aber keinen erfolgreichen
Providerabruf und keinen sichtbaren Personenfund im Produkt. Ein erneuter Lauf
braucht deshalb zuerst einen read-only Abgleich von Buildflag, aktiver
Subscription sowie den serverprojizierten Fähigkeiten `personal_ai`,
`radar_pilot` und `radar_review`. Erst danach darf eine separat freigegebene,
budgetüberwachte Providerprüfung folgen. Scheduler, Retry, Batch, Ranking,
Historienmodell, zweite Personenplattform und zweiter Provider bleiben außerhalb
dieses Slices.
