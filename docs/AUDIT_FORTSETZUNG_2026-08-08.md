# Vor-Merge-Audit: belastbarer Fortsetzungsstand

Stand: 08.08.2026
Arbeitszweig: `audit/fixbatch1`
Geprüfter HEAD: `3ae13001ff5a06d326d5802bf87b37263c6434bf`
Vergleichsbasis: `staging` / lokal bekannter `origin/staging` bei `3e7a954`

Dieses Dokument ist der getrackte, korrigierte Einstiegspunkt für die
Fortsetzung des Vor-Merge-Audits. Es ersetzt nicht die Detaildokumente des
Projekts, aber die ungetrackte Rohübergabe unter `_audit_handover/` als
Arbeitsplan. Die Rohübergabe enthält wertvolle Belege, zugleich aber auch
überholte Annahmen, absolute Pfade aus Claudes Arbeitsumgebung und mindestens
einen nachweislich falschen High-Befund. Sie darf deshalb nicht unverändert
committet oder als Wahrheit behandelt werden.

## 1. Auftrag und unverhandelbare Leitplanken

Ziel ist ein belastbarer Merge-Kandidat, bei dem alle gegenwärtig erreichbaren
Funktionen mindestens so stabil bleiben wie am geprüften Ausgangsstand.

- Keine stille Funktionsentfernung. Produktänderungen werden von technischen
  Härtungen getrennt und vor der Umsetzung als Entscheidung ausgewiesen.
- Die am 03.08.2026 bewusst entfernte Tour wird nicht wiederbelebt.
- Kein großer Architekturumbau während des Vor-Merge-Audits. Extraktionen sind
  nur zulässig, wenn sie eine konkrete, getestete Änderung sicherer machen.
- Kein Merge nach `main` ohne Max' ausdrückliche Freigabe.
- Normale Tests verwenden Mocks und dürfen vollständig laufen. Echte
  Anbieterproben laufen ausschließlich seriell über `npm run test:ai:live`
  beziehungsweise `npm run test:ai:eval` und stoppen hart bei Exit 75,
  `AUTONOMIE_STOPP` oder `BUDGET_UNBEKANNT`.
- Zugangsdaten und Anbieter-, Supabase- oder Cloudflare-Schlüssel gehören weder
  in Git noch in Berichte oder Chatprotokolle.
- `src/App.jsx` hat am geprüften HEAD 2.197 Zeilen. Der Test verlangt streng
  weniger als 2.200 Zeilen. Damit können nur zwei zusätzliche Zeilen sicher
  hinzukommen; die dritte zusätzliche Zeile bricht den Test. Formatierungen in
  den durch Quelltexttests gepinnten Bereichen bleiben tabu.

## 2. Was tatsächlich übernommen wurde

Der Fix-Batch 1 ist vollständig in `3ae1300` enthalten. Er umfasst:

1. Entfernung der Tour-Ruinen,
2. Korrektur lebender Hilfetexte,
3. Prüfung eines gespeicherten Startbereichs gegen gültige Navigationseinträge,
4. Trennung von „Datentopf serverseitig unbekannt“ und „Datentopf zu groß“,
5. vollständigeres Aufräumen bei `?fresh=`,
6. Korrektur veralteter Kommentare und
7. Safe-Area-Abstände der beiden Vollbildportale.

Der Commit liegt genau einen Commit vor `staging`. Für den Arbeitszweig ist
kein Upstream konfiguriert; in den lokal bekannten Remote-Referenzen ist der
Commit nicht enthalten. Die Rohübergabe selbst wurde nie committet.

Die drei relevanten lokalen Gates liefen auf diesem Stand bereits vollständig
grün:

| Gate | Ergebnis |
|---|---:|
| `npm test` | grün |
| `npm run test:function` | 279/279 |
| `npm run test:mobile` | 94/94, Chromium und WebKit |

Zusätzlich wurden die bewusst nicht exit-relevanten Diagnosemarker geprüft.
Im Finder bleibt genau eine dokumentierte Forderung offen: Weich- und
Ausschluss-Chips sind in zwei Themes farbgleich, aber durch Tooltip,
Minuszeichen und Text unterscheidbar. Der vermeintlich zweite offene
Info-Chip-Befund war ein hartkodiertes `false`, obwohl Farbe und Tooltip der
defensiven Klasse seit `af606904` implementiert sind; der Test wurde an den
tatsächlichen Vertrag angeglichen.

Kein echter oder kostenpflichtiger KI-Aufruf wurde für diese Verifikation
gestartet.

## 3. Unabhängig korrigierte Befundlage

### Fix-Batch A1 bis A7

Alle sieben Befunde sind im aktuellen HEAD behoben. Der umgekehrte Patch-Check
gegen Claudes Fix-Patch bestätigt, dass dessen Änderungen bereits im Commit
liegen; der Patch darf nicht erneut angewandt werden.

### Hohe Befunde B1 bis B5

| ID | Status am aktuellen HEAD | Konsequenz |
|---|---|---|
| B1 Desktop-/iPad-Suche | **Bestätigt.** Die globale Suchleiste ist nur bis 760 px sichtbar und der frühere Finder-Navigationseintrag wurde entfernt. | Vor der finalen Hilfe und Geräteabnahme zwischen sichtbarer Desktop-Leiste und Navigationseintrag entscheiden. |
| B2 1-MiB-Mastergrenze | **Grenze bestätigt, konkrete Überschreitung ungemessen.** Im Repository liegt nur eine kleine Demo, nicht Max' reale Masterliste. | Keine Migration auf Basis einer Schätzung. Echten Export als UTF-8-Bytes messen; erst dann Grenze und Warnschwelle festlegen. |
| B3 Filmwissen-Aufträge bleiben dauerhaft `laufend` | **Widerlegt.** Migration `20260730140000_etappe8_filmwissen_adapter_sperren.sql` und `current_schema.sql` enthalten `kd_filmwissen_verwaiste_schliessen()`. Der Produktionspfad ruft die Bereinigung mit einem Altersfenster vor der Synthese auf. | Keine weitere „Reaper“-Migration bauen. Falschen Altbefund aus Abschlussdokumenten entfernen. |
| B4 mobile Backupwarnung | **Im Kern bestätigt, präzisiert.** Backup-Flächen und die proaktive Warnung sind mobil ausgeblendet; ein Mobilnutzer erhält keinen direkt ausführbaren Sicherungsweg, obwohl Hilfe und Settings Sicherungen erwähnen. | Mobile, ausführbare Backupfläche oder ehrliche, direkt führende Warnung gestalten. |
| B5 Offline-Einzeldatei | **Bestätigt.** Der Download lädt die Demo-Masterliste dynamisch aus `Programmdateien/System/demo_masterliste.js`, liefert diese Datei aber nicht mit. Der eingebaute Programmsnapshot ist abgelaufen; zugleich nennt die Oberfläche ein davon abweichendes hartkodiertes Datum. | Paket vollständig einbetten oder Offline-Versprechen und Status ehrlich begrenzen; danach echten `file://`-Test fahren. |

### Mittlere Befunde C1 bis C11

Alle elf Kernaussagen sind statisch bestätigt:

| ID | Bestätigter Kern |
|---|---|
| C1 | Gesamt-Backup markiert den Exportwächter nicht; „Sicherung öffnen“ kann sichtbar ohne Wirkung bleiben. |
| C2 | Feldhilfe koppelt Hover und Klick so, dass Touch/Klick sofort wieder schließen kann; das Ziel ist zudem sehr klein. |
| C3 | Ein eindeutiger Wochenplan-Treffer wird unsichtbar automatisch verknüpft und lässt sich im Editor nicht lösen. |
| C4 | Ein globaler Fehlerstring lässt unabhängige asynchrone Fehler einander überschreiben. |
| C5 | Die mobile Kino-Fehlerhilfe verweist auf einen nur am Desktop erreichbaren Importweg. |
| C6 | Verknüpfte Reminder verschwinden, wenn der gerade geladene Katalog den Film nicht enthält. |
| C7 | „verbunden/aktuell“ kann nur konfigurierte oder eingebettete Fallbackdaten bezeichnen und dadurch Offline-Zustände beschönigen. |
| C8 | Ein ungültiges beziehungsweise zu kurzes `?fresh=` bleibt ohne sichtbare Rückmeldung. |
| C9 | Ein Gast sieht den kostenpflichtigen Finder-Knopf vor der Konto-Prüfung. |
| C10 | Filmwissen hat keinen eigenen Schalter; Lesen und kostenpflichtige Recherche hängen an unterschiedlichen Regeln. |
| C11 | Mehrere Touchziele bleiben unter dem angestrebten Mindestmaß; ein pauschaler 44-px-Fix beschädigt nachweislich das Kartenlayout. |

Für Fix-Batch 2 haben C1, C4 und C6 Vorrang, weil sie Sicherung,
Fehlerdiagnose und Datenwahrnehmung betreffen. C2, C3, C5 und C7 bis C11
folgen als getrennte, visuell überprüfbare Änderungen.

### Kleine Befunde D1 bis D23

- **Bestätigt:** D1, D3–D6, D8–D13 und D15–D22.
- **Widerlegt:** D2 — `MedienForm` besitzt Quelle und Quellenwahl und speichert
  `quelle`. D7 — ein manueller `file://`-Refresh setzt ausdrücklich die globale
  Meldung „Programmdaten nicht aktualisierbar“.
- **Teilweise:** D14 — die App isoliert Kopien nicht selbst, die pauschale
  Behauptung eines gemeinsamen `file://`-Origins für alle Browser ist aber
  nicht aus dem Repository beweisbar. D23 — es gibt kein automatisches Pruning
  beendeter Reminder; „monoton und nie gelöscht“ war wegen manueller Löschung
  zu absolut formuliert.

Die vollständige fachliche Einordnung der liegen gebliebenen Funktionen und
Ideen steht in
[`PLANUNGSARCHAEOLOGIE_2026-08-08.md`](./PLANUNGSARCHAEOLOGIE_2026-08-08.md).

## 4. Aktiver Arbeitsplan

| Phase | Inhalt | Stand / Abschlusskriterium |
|---|---|---|
| P0 — Wahrheitsbasis | Git-Stand, Rohübergabe und ZIP inventarisieren; sämtliche Befunde unabhängig prüfen; reale Mastergröße messen. | Inventar und Codeprüfung erledigt. Reale Mastergröße offen, weil die private Echtdatei nicht im Repository liegt. |
| P1 — sichere Gates | Alle drei lokalen Tests als Pflichtgates führen; CI-Suiten parallelisieren, Required-Check `test` stabil halten und Cloudflare-Deploypfade unverändert lassen. | Lokal implementiert und statisch validiert; vollständiger Testlauf und echter Actions-Zeitvergleich noch offen. |
| P2 — Fix-Batch 2 | Erst Daten-/Sicherungsfehler, dann Erreichbarkeit und Bedienung: B5, B1/B4, C1/C4/C6, danach übrige bestätigte C- und D-Befunde. | Noch nicht begonnen. Jeder Produktentscheid bleibt eigener Block. |
| P3 — ZIP-Härtungen | Sichere Teile der Anschlussplanung portieren: keine neuen `filmreihe`-Werte, Must-Watch-Schreibvorgänge serialisieren, bestehende Sprungziele additiv klickbar machen. | Vorbereitet, aber bewusst noch nicht ins Repository übernommen. Muss Besitz, Beschreibung, Blogbezüge und Exporte erhalten. |
| P4 — Produktentscheidungen | Merkliste/Must-Watch, Desktop-Suche, Teilen & Tauschen, Filmscan/Bloganalyse, Serienpipeline, Fotoablauf, Easter Eggs und weitere ZIP-Ideen entscheiden. | Entscheidungsliste vollständig erhoben; Umsetzung offen. |
| P5 — Live-Abnahme | Staging-Build-SHA, Konto-/Gast-Journey, Sync, echte Katalogwege, Backup/Restore, iPhone-Gegencheck und Ausfall-/Rollbackproben. | Offen. Keine Live-Behauptung wird aus Mocktests abgeleitet. |
| P6 — KI-Proben | Nur regelkonforme, budgetbewachte Anbieterproben für tatsächlich erlaubte Entry-Points. | Offen. Die aktuelle Sammelsuite deckt nicht alle im alten Plan genannten Tasks gezielt ab; vor dem Lauf Entry-Points klären. |
| P7 — Dokumentation und Merge | `FUNKTIONSBERICHT`, Roadmap, Betriebs-/Beta-Checklisten und Befundregister an den echten Endstand angleichen; Restrisiken und Merge-Empfehlung. | Offen. Merge ausschließlich durch Max beziehungsweise nach seiner Freigabe. |

Die Reihenfolge ist absichtlich datenorientiert: neue Verweisfelder oder
Mehrfachlisten vergrößern `kd:master` und dürfen deshalb nicht vor der realen
B2-Messung gebaut werden. Echte Geräte- und Liveprüfungen folgen erst einem
reproduzierbar grünen lokalen Stand.

## 5. Definition of Done

Der Vor-Merge-Audit ist erst abgeschlossen, wenn:

1. jedes A–E-Finding einen belegten Endstatus hat: behoben, widerlegt oder mit
   Begründung und Verantwortlichkeit verschoben;
2. `npm test`, `npm run test:function` und beide Mobile-Browser lokal und in CI
   grün sind; Testausgaben zusätzlich auf nicht-gatende Marker wie `○ OFFEN`
   geprüft wurden;
3. ein echter Actions-Lauf den stabilen Required-Check und die Zeitwirkung der
   neuen Aufteilung belegt;
4. die reale Masterliste bytegenau gegen das Serverlimit geprüft wurde;
5. Staging exakt den geprüften Commit ausliefert und die Konto-/Gast-/Sync-
   Journey protokolliert ist;
6. Backup, Restore, Ausfall und Function-Rollback praktisch geprüft sind;
7. der echte iPhone-Gegencheck einschließlich Safe Area, Tastatur, Installation
   und lokalem Speicher durchgeführt wurde;
8. nur die erlaubten KI-Entry-Points seriell und unter funktionierendem
   Budgetwächter gelaufen sind;
9. `docs/FUNKTIONSBERICHT.md` keine fehlende, falsche oder nur dokumentierte
   Geisterfunktion mehr enthält; und
10. Max eine Merge-Empfehlung mit ausdrücklich benannten Restrisiken erhalten
    und den Merge freigegeben hat.
