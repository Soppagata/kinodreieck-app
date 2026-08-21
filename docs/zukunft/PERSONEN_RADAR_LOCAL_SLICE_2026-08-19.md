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
