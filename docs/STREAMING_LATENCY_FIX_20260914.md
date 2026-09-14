# Streaming-Latenz: Korrektur der Produktionsregression

Meisterregister für den fortgesetzten PWA-Auftrag, 14.09.2026. Ausgangs- und
Produktionsstand: `7616f33f45e7991587473f30b7a7103c1dd85313`.

Der Nutzer meldet 2–3 Sekunden für jede 20er-Seite und einen abbrechenden
Alphabetfilter. Zuvor war der gesamte Katalog nach 3–4 Sekunden verfügbar.
Erste Inhalte und vollständige Filter müssen nutzbar werden, ohne alle
vorherigen 20er-Seiten abzuwarten. Die Meldung ist die fehlgeschlagene
praktische Abnahme derselben bereits zur Veröffentlichung beauftragten Arbeit.

| Ergebnis | Owner | Stand |
| --- | --- | --- |
| Kleine Seiten kosten keine wiederholte breite Katalogberechnung | SQL-Baumeister | Ursachenprobe / Bau |
| Neuester Filter hat Vorrang; überholte Anfragen stoppen | bestehender B | Bau |
| Reale Serverlatenz und Alphabetwechsel unter Nachladen belegt, Lieferung | Meister + genau bestehender Abschlussbaumeister | offen |

Beide Baumeister starten disjunkt von derselben veröffentlichten Basis.
SQL besitzt ausschließlich eine additive Migration und Backendtests/-doku.
B besitzt Seitenservice/-controller, die Filter-Dispatchnaht und Clienttests.
Meister: read-only Ursachenprobe, einmalige statische Integration, Release.
Kein zweiter Gesamtprüfer; Paketprüfungen werden nicht vom Meister wiederholt.

Unverändert maßgeblich sind vollständige Zähler/Filter, automatische
20er-Datenfolge, Cache-/Kontotrennung, strikte Identitäten, exakt 336 Stunden
für Neu, MotN-Verfügbarkeitsvorrang und verborgene technische Prod-Hinweise.
Keine neue dauerhafte Speicherung persönlicher Abfrageergebnisse.

Entscheidende Prüfung: realistischer kompletter Katalog, 226 reduzierte
Library-Identitäten, erste und folgende 20er-Seite sowie direkter Z-Filter.
Ziel sind serverseitig unter 500 ms je dieser Anfragen. Ein schneller lokaler
Lauf allein ist kein Releasebeleg. Ein schneller A→Z-Wechsel während einer
langsamen Folgeseite muss die alte Anfrage abbrechen und Z unabhängig von
vorherigen Seiten liefern. Kalter Aufruf und Sitzungsrückkehr werden getrennt.

Belegt vor dem Bau: In der SQL-Funktion wird die breite ausgewählte Projektion
vor dem abschließenden LIMIT wiederholt materialisiert. Ein echter
Server-Readback vom 13.09. benötigte 5.393 ms für zwei Seiten. Die neue
EXPLAIN-Probe mit leerer Library und drei Diensten benötigt 4.208 ms und
schreibt 5.290 temporäre 8-KiB-Blöcke; JIT ist aus. Der Alphabetregler startet
je Zwischenposition eine Anfrage, deren überholte Antwort nur ignoriert wird.
Diese Messungen erklären die Regression; eine Speichervariante ist eine
isolierte Diagnose, keine freigegebene globale Konfigurationsänderung.
