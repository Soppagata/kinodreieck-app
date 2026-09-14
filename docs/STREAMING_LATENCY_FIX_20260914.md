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
| Kleine Seiten kosten keine wiederholte breite Katalogberechnung | SQL-Baumeister | integriert, lokal und am echten Server belegt |
| Neuester Filter hat Vorrang; überholte Anfragen stoppen | bestehender B | integriert, fokussiert geprüft |
| Reale Serverlatenz und Alphabetwechsel unter Nachladen belegt, Lieferung | Meister + genau bestehender Abschlussbaumeister | Gesamtlauf bestanden, Veröffentlichung offen |

Beide Baumeister starten disjunkt von derselben veröffentlichten Basis.
SQL besitzt ausschließlich eine additive Migration und Backendtests/-doku.
B besitzt Seitenservice/-controller, die Filter-Dispatchnaht und Clienttests.
Meister: read-only Ursachenprobe, einmalige statische Integration, Release.
Kein zweiter Gesamtprüfer; Paketprüfungen werden nicht vom Meister wiederholt.

Unverändert maßgeblich sind vollständige Zähler/Filter, automatische
Nachladefolge, Cache-/Kontotrennung, strikte Identitäten, exakt 336 Stunden
für Neu, MotN-Verfügbarkeitsvorrang und verborgene technische Prod-Hinweise.
Keine neue dauerhafte Speicherung persönlicher Abfrageergebnisse.

Nutzerentscheid 14.09.: Die Anzeige bleibt in 20er-Portionen, Datenabrufe
dürfen größer sein. Kandidat: erste Anfrage 20, danach automatisch bis 1000,
mit Prüfung von Antwortumfang und realer Laufzeit. Bei 8806 Titeln sind das
neun statt rund 440 Folgerequests. Der Server muss die neue Obergrenze vor
Auslieferung des Frontends akzeptieren. Bestehende 20/200 bleiben kompatibel.

B integriert: `5d5dc4c` (Root `ea6e9c4`) und `1de3443`.
22 State- und 12 Cacheprüfungen belegen Filterverdichtung, echtes AbortSignal,
Kontotrennung, serielles Nachladen und 20/1000. Sichtbare Portion unverändert 20.

Erster SQL-Kandidat `5fbdcf1` (Root `f243b46`): beide Funktionen ersetzt,
Payload erst nach Seitenwahl, leere Neu-Evidenz übersprungen. 18 Backendchecks
mit synthetischer Defaultfixture und realem Opt-in-Katalog bestanden. Ein
Review-Fund bewahrt die heutigen Dienste bei MotN nach Diff-Rückrechnung.

Rollback-Serverprobe 14.09., 06:07 UTC, SHA-256
`b651c9fe15e8d971fe4f67ceccbc3869e32770ab001a1055be8d62260244800c`:
8806 Titel, 226 reduzierte synthetische Library-Identitäten, 2184kB work_mem.
Basis erste20/Folge20/Z: 4529.90/3481.08/3458.03ms; Kandidat
837.41/706.34/673.87ms. 1000er-Paket: 730.55ms, 331400Bytes. Alle drei
vergleichbaren Antworten bytegenau identisch. Rollback, Funktionsdefinitionen,
Quellen und Revision verifiziert unverändert. Unter-500ms-Ziel noch offen;
deshalb kein Release dieses Kandidaten. Die Folgeprüfung umfasst zusätzlich
226 Gesehen-IDs und 660 synthetische Fristanker, um quadratische Alias-Joins
auszuschließen. Genau der bisherige Abschlussbaumeister bereitet die betroffene
Prüfung vor; Gesamtlauf erst nach dem endgültigen Serverkandidaten.

Finaler SQL-Kandidat `d546684` (Root `dab1688`): vorhandene Dienste-Indizes
früh genutzt, Status-/Filterstufen weiter verschmälert, Aliasauflösung bleibt
ein Gleichheitsjoin. Lokale 18 Checks bestanden; dichter Fall mit 226 Gesehen-
IDs und 660 Fristankern 94ms. Keine zusätzliche Schema- oder Speicheränderung.

Zweite Rollback-Serverprobe 14.09., 06:22 UTC, finaler SHA-256
`8f32982974ffc6fa674a842756ffe2b4bbaf7cdc70625f33944bb4c6e01d9395`:
erste20 601.87ms, Folge20 537.11ms, Z 493.92ms, Hintergrund1000 549.55ms
bei 331400Bytes; dichter Fall 641.21ms. Die jeweilige Basis lag bei
4576.08/3164.63/3162.88/3248.38ms. Alle vier vergleichbaren Antworten
bytegenau identisch, vollständiger Rollback erneut verifiziert.
Das 500ms-Messziel ist für Z erreicht, für den ersten Aufruf knapp verfehlt.
Der Meister akzeptiert den belegten rund fünf- bis siebenfachen Gewinn und
stabile dichte Profile für die zeitnahe Korrektur; keine weitere Ausweitung.
Genau der bestehende Abschlussbaumeister hat GO für den betroffenen lokalen
Gesamtfluss mit echtem PostgreSQL und gefencetem mobilen Browser erhalten.

Einziger Abschlussbaumeister: Vorbereitung `e276fcb`, finales Testdelta
`211e361`; dessen geprüfter Worktree-HEAD `211e361ef7cbc8e5b5fd951e9b6e28bf5a6fa285`
enthält dieselben Produkt-/Migrationsbytes wie der integrierte Kandidat.
Produktionsbuild bestanden; PG17→Service→Controller 5/5, fokussierter mobiler
Gesamtfluss 1/1. Browser: Chromium 393×852, CPU×4, neutrale portable 1260-Titel-
Fixture, Fremdnetz gefencet. Erste 20 + vollständiger Count nach 912ms;
1000er Hintergrundpaket hält DOM20, Scrollen erweitert auf40. Langsamer alter
Fetch tatsächlich abgebrochen/verworfen, A→Z sendet ausschließlich Z (490ms
bis zum Ergebnis). Sitzungsrückkehr bewahrt Z ohne initialen Neulauf. Maximal
ein aktiver RPC, kein Legacyfallback, keine technischen Prod-Hinweise.
Diese Browserzeiten sind lokale Vergleichswerte; die echte Servermessung steht
oben. Kein zweiter Gesamtprüfer, keine Wiederholung der Pakettests durch Root.
Unmittelbar vor dem richtigen Produktionsbuild lief einmal versehentlich ein
Standardbuild; dessen Bundle wurde vor der Prüfung vollständig ersetzt.

Backend veröffentlicht und verifiziert am 14.09., 06:29 UTC:
Migration `20260914100000`, exakte finale SQL-Bytes im Migrationsledger;
RPC-Definition-MD5 `dac78ff3228aa388527d3ac5bdb39c56`. Quelle-MD5
`34eaedb5a181658b98c62b0737aa7329`, Revision1, 24678 Basis- und 1069
Overlayzeilen unverändert. RLS aktiv, authentifiziertes RPC erlaubt,
anonymes RPC und direkter Tabellenzugriff weiter gesperrt. Der erste
Einspielversuch scheiterte vor jeder Änderung an der Escapierung des
Ledgertexts im lokalen Hilfsskript; der unveränderte Zustand wurde gelesen,
der Hilfsfehler korrigiert und dieselbe Migration danach erfolgreich angewandt.

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
