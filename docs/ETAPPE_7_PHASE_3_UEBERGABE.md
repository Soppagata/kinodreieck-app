# Etappe 7, Phase 3: Übergabe und offene Befunde

Stand: 29.07.2026
Arbeitsbranch: `feat/etappe-7-geschmacksprofil`
Letzter geprüfter Claude-Commit: `ccb6fc7`

## Kurzurteil

Der letzte vollständig grüne Stand ist Phase 2c in Commit `5766fff`.
Commit `ccb6fc7` baut den KI-Weg des Geschmacksprofils, ist aber ausdrücklich
ein **Teilstand**. Die Commitnachricht ist die einzige lokale Übergabe; ein
separater Übergabebericht ist weder im Git-Baum noch in den ungetrackten
Dateien vorhanden.

Der Bau enthält gute tragende Entscheidungen: persönliche Freitexte werden
nicht protokolliert, jedes Signal braucht einen serverseitig nachgeschlagenen
Beleg, Filmtitel müssen in den Antworten vorkommen, und die Übernahme geht
durch die Zwei-Bühnen-Mechanik des Profilmodells.

Der Claude-Stand war deshalb noch nicht abnahmefähig: Der echte UI-Pfad
konnte keinen erfolgreichen `profile-extract`-Aufruf auslösen, mehrere
Vorschläge wurden bei der Bestätigung ungewollt gekoppelt, und die neue
Function-Absicherung sowie der Clienttest waren nicht grün. Die nachstehende
Liste hält sowohl diesen verifizierten Ausgangsbefund als auch den aktuellen
Reparaturstand fest.

## Gegenprüfung der Befundliste

Am 28.07.2026 wurden alle Befunde noch einmal über die vollständigen UI-,
Speicher-, Transport- und Function-Pfade geprüft. Dabei wurden keine
vermeintlichen Fehler gefunden, die an anderer Stelle bereits vollständig
gelöst sind. Vier Einordnungen mussten aber präzisiert werden:

- **H1:** Anthropic Structured Outputs erzwingt beim normalen Providerlauf
  bereits die strenge Form des `EXTRAKT_SCHEMA`. Das senkt die
  Eintrittswahrscheinlichkeit deutlich, ersetzt aber nicht die eigene
  Laufzeitgrenze für fremde Antworten, Provider-Ausnahmen und spätere Adapter.
- **H2:** `nichtDeutbar` umgeht das Bestätigungs-Gate nicht vollständig. Die
  Liste ist in der Vorschau sichtbar und wird erst mit dem gemeinsamen
  Übernahmeknopf gespeichert. Der echte Fehler ist, dass die Einträge nicht
  einzeln abwählbar, nicht gegen die Antworten belegt und später nicht
  einzeln kontrollierbar sind.
- **M1:** Das späte Konto-Gate ist kein Sicherheitsleck. `aiService` stoppt
  Gäste und Konten ohne `personalAi` sicher vor dem Transport. Es ist ein
  Vorlauf-/UI-Fehler, weil persönliche Antworten trotzdem bis zum Absenden
  eingegeben werden können.
- **M5:** Der Wertebereich ist bereits eindeutig entschieden: `0..5` oder
  `null`. Profilmodell, Serverprüfung und Bestandstests tragen die `0`; nur
  der neue KI-Prompt und ein alter Kommentar behaupten noch `1..5`.

Zusätzlich zeigte die Vollpfadprüfung einen zweiten Teil von B1: `DatenTab`
übergibt die Streaming-Hülle als `bekannteTitel`, obwohl der deterministische
Weg eine echte Filmliste erwartet. Der Test hatte diesen Fehler verdeckt,
indem er `streamingBekannt` in einer Laufzeitform übergab, die Produktion nie
verwendet. Die vorhandene, bereits bewährte Genre-Lösung ist
`bekannteWerte()` aus `src/lib/finder.js`; sie soll wiederverwendet statt
nachgebaut werden.

Ein späterer Kurationstest markierte außerdem **K2**: Die Chips `kult` und
`trash` lagen zwar in der fachlichen Gruppe `haltung`, erzeugten aber Signale
der Art `ton`. Das war kein Tonfall und machte die spätere Promptzeile
irreführend. **Behoben:** Der globale Profilvertrag kennt additiv die Art
`haltung`; beide Chips verwenden sie. Die KI-Extraktion erhält diese neue Art
bewusst noch nicht: Ihre Artenliste ist eine sichere Teilmenge des
Profilvertrags, bis Prompt und Phase-4-Eval `haltung` von der bloßen
Signalrichtung abgrenzen. Ein gespeichertes Altprofil mit `ton/kult` bleibt
gültig, übersteht die Speicher-Rundreise inhaltsgleich und behält seine
bisherige Promptzeile. Da Etappe 7 noch nicht live war, ist keine
Bestandsmigration erforderlich.

Die erneute Prüfung von **B5** ergab keinen fehlenden Film-Signal-Erzeuger,
sondern einen zu schwachen Test für eine bewusste Modellgrenze: Bestätigte
Filmwahlen liegen ausschließlich in `profil.filme` und werden im Prompt
getrennt von Signalen ausgegeben. Ein zweiter Signalpfad würde dieselbe
Nutzerwahl doppelt gewichten. `filmwahl:` bleibt deshalb nur als
kollisionsfreier Namensraum für eine mögliche spätere, ausdrücklich
bestätigte Ableitung reserviert. Harte Film-only-Tests sichern nun ab, dass
Onboarding, Profileintrag, Prompt und Signalzähler diese Grenze einhalten.

## Was Claude zuletzt fertiggestellt hat

| Commit | Stand |
| --- | --- |
| `0a6ebd9` | Phase 1: Profilmodell und Speicher-Naht |
| `43bf773` | Phase 2a: KI-Schalter |
| `4d5062f` | Phase 2b: KI-Wahl im Onboarding und in den Einstellungen |
| `5766fff` | Phase 2c: deterministisches Schlagwort-Onboarding; letzter vollständig grüner Stand |
| `ccb6fc7` | Phase 3, Teilstand: `profile-extract`, Client-Umwandlung, drei Fragen und Vorschau |

Der Phase-3-Teilstand umfasst:

- `profile-extract` in `supabase/functions/ai-task/index.ts`,
- die Clientprüfung in `src/lib/extraktion.js`,
- Fragen und Vorschau in `src/components/DreiFragen.jsx`,
- Aufruf, Fehlerbehandlung und Profilübernahme in
  `src/components/GeschmackBereich.jsx`,
- die Task-Registrierung in `src/services/ai.js`,
- `ai_task_test.ts` und `extraktion_test.mjs` als neue Prüfstrecken.

Die Commitnachricht von `ccb6fc7` sagt selbst:

> UNVOLLSTAENDIG -- beide Testhaende sind mitten in der Arbeit an ein
> Nutzungslimit gestossen. Der Bau steht, die Absicherung nicht.

Die dort genannten Erstbefunde wurden überwiegend umgesetzt: die echte
Antwort-Hülle heißt jetzt `data`, fremde offene Vorschläge werden nicht mehr
pauschal bestätigt, die Extraktionsquellen sind auf K1/K2/K4 verengt, eine
fehlende Stärke wird nicht mehr erfunden, Listen als `data` werden abgewiesen,
Rahmenfehler bleiben sichtbar und titellose Filme werden gemeldet.

## Offene Produktfehler und Risiken

### Blocker

- [x] **B1 – Der echte UI-Pfad übergibt weder die richtige Filmliste noch
  eine Genre-Liste.**
  `DatenTab.jsx` rendert `GeschmackBereich` nur mit `bekannteTitel`.
  Dafür reicht es aber die Hülle `streamingBekannt` statt einer Filmliste;
  der deterministische Filmschritt erhält deshalb keine Angebote.
  `bekannteGenres` bleibt zugleich `[]`; `bauePayload` sendet
  `listen.genres: []`. Die Edge Function weist genau diesen Fall vor dem
  Anbieteraufruf mit `wertelisten-fehlen` ab. Der KI-Profilweg kann aus der
  echten Oberfläche deshalb nie erfolgreich extrahieren. Die App besitzt die
  nötigen Rohdaten bereits in `master`, Programm und Streamingkatalog; die
  bestehende Funktion `bekannteWerte()` sammelt und entdoppelt die
  Genre-Anzeigeformen bereits korrekt. **Behoben:** `DatenTab` führt
  Master-, Programm- und Kataloggenres über `bekannteWerte()` zusammen,
  übergibt `master` als echte Filmliste und blendet den KI-Einstieg bei einer
  tatsächlich leeren Werteliste aus.
  Stellen: `src/tabs/DatenTab.jsx:195`,
  `src/components/GeschmackBereich.jsx:45`,
  `src/lib/extraktion.js:77`,
  `supabase/functions/ai-task/index.ts:1165`.

- [x] **B2 – Gleiche Belege koppeln mehrere Vorschläge.**
  Ein Satz kann legitim gleichzeitig etwa ein Genre und einen Ton belegen.
  `DreiFragen` benutzt aber den Beleg als React-Key und als Auswahl-ID;
  `GeschmackBereich` ordnet auch die spätere Bestätigung über eine
  Beleg-Menge zu. Zwei Signale mit derselben Textstelle werden gemeinsam
  abgewählt oder bestätigt, obwohl die Oberfläche Einzelwahl zusagt. React
  meldet zusätzlich doppelte Keys. Der vorhandene F2-Test reproduziert den
  Fehler.
  **Behoben:** Die unveränderliche Vorschau verwendet lokale Index-IDs;
  die Schreibschicht ordnet mit derselben fachlichen Signalidentität wie
  `sammle` zu. Gleicher Beleg koppelt weder React-Key noch Auswahl oder
  Bestätigung.

### Hoch

- [x] **H1 – Die eigene Function-Grenze akzeptiert formfremde Antworten
  teilweise als Erfolg.**
  `pruefeErgebnis` schließt Arrays nicht aus und ignoriert unbekannte
  Top-Level-Felder. Eine Liste oder ein Objekt wie `{ nichts: true }` kann
  dadurch als leere Extraktion mit HTTP 200 enden, statt als Schemabruch.
  Vier der fünf roten Function-Tests berühren diese Grenze. Die Tests führen
  gleichzeitig zwei unterschiedliche Verträge für fehlende bekannte Felder;
  vor dem Fix muss die beabsichtigte Toleranz einmal eindeutig festgelegt
  werden. Das beim Anbieter verwendete Structured-Output-Schema ist bereits
  streng und macht diese Formen im normalen Erfolgsfall unwahrscheinlich;
  die fehlende eigene Grenze bleibt dennoch ein echter Robustheitsfehler.
  **Behoben:** Vor jeder Fachprüfung erzwingt die Function nun die exakte
  Objektform des Extraktschemas – einschließlich Pflichtfeldern,
  Feldtypen und unbekannten Schlüsseln. Ein Strukturbruch beendet die
  gesamte Antwort mit 502; nur fachlich unbrauchbare Werte in einer korrekt
  geformten Antwort werden weiterhin einzeln verworfen. Dieser eigene
  Vertrag ist unabhängig von den Structured Outputs des Anbieters getestet.

- [x] **H2 – `nicht_deutbar` wird weder belegt noch sauber typgeprüft und
  ist nicht einzeln abwählbar.**
  Nicht-Textwerte werden durch `kurzText` in sichtbaren Modelltext verwandelt:
  `42` wird `"42"`, ein Objekt wird `"[object Object]"`. Inhaltlich muss ein
  Eintrag außerdem nicht in den Antworten vorkommen. Die Liste ist zwar in
  der Vorschau sichtbar und wird erst mit der gemeinsamen Bestätigung
  gespeichert; der Client macht ihre Einträge aber ausdrücklich unabwahlbar
  und speichert sie anschließend im persönlichen Profil.
  **Behoben:** Die strenge Formgrenze lässt ausschließlich Texte zu; jeder
  Eintrag muss in einer tatsächlichen Antwort vorkommen. Die Vorschau bietet
  pro Eintrag eine eigene Wahl, und die Profilansicht erlaubt die spätere
  Einzellöschung.

- [x] **H3 – Gespeicherte `nichtDeutbar`-Einträge sind in der Profilansicht
  weder sichtbar noch löschbar.**
  Sie werden gespeichert und über den Profil-Topf synchronisiert, aber
  `ProfilAnsicht` bietet dafür keine Korrektur. Damit kann persönlicher
  Modelltext im Konto liegen, den der Nutzer nach der Übernahme nicht mehr
  einzeln kontrollieren kann.
  **Behoben:** Die Profilansicht zeigt jeden Eintrag und bietet eine
  einzeln beschriftete Löschung; sie schreibt genau einmal und hebt die
  Profilfassung.

- [x] **H4 – Bestätigte Filmnennungen bleiben dauerhaft `sicher: false`.**
  Extrahierte Filme werden vor der Übernahme einzeln gezeigt, danach aber
  weiterhin unsicher gespeichert. `promptFassung` filtert unsichere Filme
  aus, und die Profilansicht hat keinen Weg, sie auf sicher zu setzen. Die
  bestätigten Daten bleiben damit für den vorgesehenen Folgeeinsatz in
  Etappe 8 wirkungslos.
  **Behoben:** Die rohe Extraktion bleibt bis zur Vorschau unsicher; erst
  der sichtbare Einzel-Übernahmeklick setzt ausgewählte Filme auf
  `sicher:true`. Danach erscheinen sie wie vorgesehen in der Prompt-Fassung.

- [x] **H5 – Acht Zeichen sind als Mindestbeleg zu schwach.**
  Der vorhandene Test zeigt, dass ein inhaltsarmes Bindewort wie
  `"und dass"` eine frei erfundene Behauptung passieren lässt, solange diese
  häufige Wortfolge in der Antwort vorkommt. Das trifft die tragende Zusage
  der Phase: Nicht nur der Beleg, sondern das daraus abgeleitete Signal muss
  nachvollziehbar sein. **Behoben:** Die Untergrenze liegt nun bei 16
  Zeichen; reine Stoppwort-Belege werden zusätzlich abgewiesen. Der Server
  prüft weiterhin den wörtlichen Ursprung, während die inhaltliche Deutung
  bewusst erst durch die sichtbare Einzelbestätigung des Nutzers verbindlich
  wird.

### Mittel

- [x] **M1 – Das Konto-Gate sitzt erst hinter dem Freitextformular.**
  `kiWegOffen` prüft den KI-Schalter, aber nicht den Kontozustand. Ein Gast
  darf die persönlichen Antworten vollständig eingeben und erfährt erst beim
  Absenden, dass persönliche KI ein Konto verlangt. Der Kommentar verspricht
  ein früheres Ausblenden.
  **Behoben:** App leitet aus dem reaktiven Sitzungssnapshot
  `account + ready + personalAi` ab; `DatenTab` verbindet diese Fähigkeit mit
  dem globalen und dem Funktionsschalter, bevor der Drei-Fragen-Weg sichtbar
  wird. Die bestehende Servicegrenze bleibt die zweite, harte Schranke.

- [x] **M2 – Die Film-Belegprüfung arbeitet mit beliebigen Teilstrings.**
  Kurztitel wie `It`, `Up` oder `Her` können zufällig innerhalb gewöhnlicher
  Wörter vorkommen und dadurch als „genannt“ gelten. In der Vorschau werden
  Filme außerdem nur über den Titel ausgewählt und als React-Key geführt;
  gleichnamige Filme verschiedener Jahre sind nicht unabhängig behandelbar.
  **Behoben:** Titel werden als vollständige Unicode-Wortfolge gesucht.
  `It`, `Up` und `Her` treffen damit nicht mehr auf `damit`, `super` oder
  `nachher`. Lokale Vorschau-IDs halten auch gleichnamige Filme unabhängig
  wählbar.

- [x] **M3 – Verworfene erfundene Filmtitel verschwinden ohne sichtbare
  Zählung.**
  Die Sicherheitsprüfung funktioniert, aber anders als bei Signalen erfährt
  der Client nicht, dass ein Filmeintrag verworfen wurde. Das widerspricht
  dem Versprechen, nichts still verschwinden zu lassen.
  **Behoben:** Jeder unbelegte Filmtitel erhöht nun denselben sichtbaren
  Verwurfzähler wie ein unbelegtes Signal.

- [x] **M4 – `profilVersion` wird nicht an `profile-extract` übergeben.**
  Die KI-Fassade kann die Profilversion sauber protokollieren, der erste
  Profil-Task ruft `runTask` aber ohne dieses Optionsfeld auf. Bei einem
  bestehenden Profil fehlt im KI-Protokoll dadurch der Bezug zum
  Ausgangsstand.
  **Behoben:** `GeschmackBereich` übergibt die geladene Fassung im dritten
  `runTask`-Argument; ohne Profil bleibt der Wert ehrlich `null`.

- [x] **M5 – Achsen sind nur als Paket bestätigbar und der Wertevertrag ist
  widersprüchlich.**
  WIE, WAS und WARUM hängen an einem gemeinsamen Schalter. Der Nutzer kann
  nicht zwei Achsen akzeptieren und die dritte ablehnen. Der Prompt nennt
  außerdem `1..5 oder null`, während Server, Client, Profilmodell und Tests
  ausdrücklich auch `0` akzeptieren.
  **Behoben:** WIE, WAS und WARUM sind in der Vorschau unabhängig wählbar;
  eine Mischwahl ist getestet. Der Prompt und der Clientkommentar verwenden
  nun ebenfalls den bereits bindenden Vertrag `0..5 oder null`.

- [x] **M6 – Eine falsche Fragenquelle bleibt trotz Gegenfund bestehen.**
  Findet der Server einen Beleg nicht in der behaupteten Frage, sucht er
  ersatzweise über alle Antworten, behält danach aber die falsche
  Quellenkennung. Die Oberfläche zeigt den richtigen Text dann unter der
  falschen Frage, und die spätere fragebezogene Evaluation erhält ein
  falsches Etikett.
  **Behoben:** Liegt der Beleg eindeutig in genau einer anderen Antwort,
  korrigiert der Server die Quelle. Bei mehreren möglichen Fundstellen wird
  der Vorschlag verworfen, statt eine falsche Sicherheit zu erzeugen.

- [x] **M7 – Der Datenschutzhinweis ist stärker als der belegte Vertrag.**
  Die Oberfläche sagt, der Freitext werde „nicht gespeichert“. Sicher belegt
  ist, dass Kinodreieck und `kd_ai_log` ihn nicht speichern. Die Antworten
  werden aber an den KI-Anbieter übertragen; dessen Aufbewahrungsdauer ist in
  der Projektdokumentation noch ausdrücklich offen. Der Text sollte App-
  Speicherung und Anbieter-Verarbeitung auseinanderhalten.
  **Behoben:** Der Text trennt nun ausdrücklich
  „Kinodreieck speichert nicht“ von der einmaligen Übertragung an den
  KI-Anbieter und der späteren, bestätigten Profilspeicherung.

## Teststand

Am 28.07.2026 nach den Reparaturen lokal reproduziert:

| Prüfung | Ergebnis | Einordnung |
| --- | ---: | --- |
| `npm test` | grün | Vollständiger Bestandstest einschließlich Online-Paket |
| `node geschmack_test.mjs` | 124/124 | K2 und die B5-Trennung von Filmwahl und Signal sind harte Verträge |
| `node profil_test.mjs` | 286/286 | Einschließlich `ton/kult`-Altprofil über Validierung, Speicher und Prompt |
| `node extraktion_test.mjs` | 391/391 | Alle zwölf nachgezogenen Befunde und die sichere Arten-Teilmenge grün |
| `deno test … ai_task_test.ts` | 247/247 | Function-Vertrag einschließlich neuer Negativfälle grün |
| `npm run build` | grün | Hauptbundle-Warnung bei rund 656,9 kB bleibt |

Erledigte Testschuld und bewusste Ausnahme:

- [x] `ai_test.mjs` auf den fünften Task `profile-extract` nachziehen.
- [x] In `extraktion_test.mjs` die Standardhülle von `daten` auf `data`
  umstellen.
- [x] Den Signalzeilen-Selektor so verengen, dass die Achsenzeile nicht als
  viertes Signal zählt.
- [x] Erwartungen entfernen, die noch die bewusst abgeschaffte
  Standardstärke 3 verlangen.
- [x] Den restlichen Clienttest nach den bereits umgesetzten
  `uebernimm`-/`data`-Änderungen neu eichen, ohne echte Befunde grünzuschreiben.
- [x] `extraktion_test.mjs` in das normale Test-Gate aufnehmen.
- [x] Deno im CI einrichten und `test:function` vor jedem Pages-Deploy
  ausführen.
- [x] `test:rls` bleibt ausdrücklich ein manueller Infrastrukturtest. Er
  braucht echte Zugangsdaten und eine vorbereitete Zielumgebung und ist
  deshalb kein hermetischer Pull-Request- oder Pages-Test.

Der Cloudflare-Workflow richtet Deno nun im Testjob ein und führt sowohl
`npm test` als auch `npm run test:function` aus. Jeder Staging- und
Production-Deploy hängt von diesem Job ab. `test:rls` bleibt wie oben
beschrieben ein bewusster manueller Abnahmeschritt.

## Live- und Deploymentstand

Produktion und Staging enthalten Etappe 7:

- `kinodreieck.at` liefert Merge-Commit
  `db8199c16a8f6121468ada831ec0f1546fb54986`. Workflow `30476307220`
  schloss Testjob, atomaren Deployment-Smoke und festen
  Produktions-Domain-Smoke am 29.07. vollständig grün ab.
- `staging.kinodreieck.at` liefert den in Pull Request #1 enthaltenen
  Feature-Stand `35051a7ecf0a446cc919220d3560d7d52f62f1df`. Workflow
  `30473608271` hat den vollständigen Testjob, den Function-Vertrag, den
  Build, den atomaren Deployment-Smoke und die feste Staging-Domain grün
  abgeschlossen.
- `14cf3ec5657df720751200c3aff5b73402ee0968` bleibt als
  **Pre-Etappe-7-Rollback-Punkt** erhalten.

Die Backend-Gegenprüfung vom 28.07.2026 und der kontrollierte Rollout vom
29.07.2026 haben Claudes Übergabestand präzisiert:

- [x] Migration `20260727210000_etappe7_profil_topf.sql` ist bereits gelaufen.
  Der echte RLS-Lauf belegt den Profil-Topf, die Trennung der Testkonten und
  die anon-Sperre; 36/36 Prüfungen grün. Nur der ursprüngliche Laufzeitpunkt
  war im Migrationsprotokoll nicht nachgetragen.
- [x] Die Edge Function wurde nach 247/247 lokalen Vertragstests manuell von
  Version 13 auf Version 14 deployt; der Pages-Workflow tut das weiterhin
  bewusst nicht. Der vorherige Plattformstand und dessen Quellcode wurden
  als Rollback-Punkt gesichert.
- [x] `npm run test:ai:contract` erhält nun HTTP 400
  `wertelisten-fehlen`. Damit ist `profile-extract` deployt und das
  Wertelisten-Gate stoppt vor dem Anbieter. Der Budgetwächter maß davor und
  danach 49,7615 US-Cent, also exakt 0,0000 US-Cent Mehrverbrauch.
- [x] Das Etappe-7-Frontend ist auf Staging veröffentlicht; der feste
  Domain-Smoke prüfte den erwarteten Build-SHA.
- [x] Der echte Profilweg ist mit synthetischen Drei-Fragen-Antworten
  abgenommen. Der erste Lauf machte einen echten Betriebsfehler sichtbar:
  `timeout_ms=30000` trug die Erstkompilierung des Structured-Output-Schemas
  nicht und endete nach +4,1452 US-Cent als `anbieter-zeitgrenze`.
  Migration `20260729200000_etappe7_structured_output_timeout.sql` setzt
  Function und Parallel-Reservierung gemeinsam auf 120 Sekunden, ordnet
  `profile-extract` explizit Haiku zu und begrenzt die Ausgabe auf 4096
  Tokens. Der einzelne Post-Fix-Lauf bestand mit 6 Signalen, 3 Filmen und
  einem korrekt verworfenen unbelegten Vorschlag für +0,4849 US-Cent.
  Endstand des Testkontos: 54,3916/500 US-Cent.
- [x] `npm run test:rls` ist 36/36 grün. Der Lauf ist nun wiederholbar und
  datenbewahrend: vorhandene Profile werden nur gelesen, temporäre Proben
  eindeutig markiert und ausschließlich über ihren exakten Testwert
  entfernt.
- [x] Eine alte, exakt dem früheren RLS-Prüfwert entsprechende beschädigte
  Profilzeile von Testkonto A wurde gezielt entfernt. Anschließend zeigt
  Staging wieder beide Profil-Anlagewege; der Geräte-Sync kehrte auf
  `synchron` zurück. Es wurde dafür kein weiterer Anbieteraufruf ausgelöst.

Weitere Hosting-Auffälligkeiten:

- [x] Der Feature-Branch ist mit workflow-berechtigter GitHub-Anmeldung
  gepusht; die frühere PAT-Sperre ist erledigt.
- [x] Cloudflare `Browser Cache TTL` steht auf `Respect Existing Headers`.
  Produktion und Staging liefern `/sw.js` mit
  `Cache-Control: public, max-age=0, must-revalidate`; der Remote-Smoke hält
  diese Kante dauerhaft.
- [x] Push- und manuelle Läufe teilen jetzt je Zielumgebung eine feste
  Concurrency-Gruppe und können nicht parallel auf dasselbe Ziel deployen.
- [x] Jeder Online-Build liefert `build-meta.json`; der Domain-Smoke vergleicht
  deren Version cache-bustend mit dem erwarteten Commit-SHA.

## Dokumentationsdrift

- [x] `ROADMAP_TO_ONLINE.md` hält Produktion und Staging auf dem
  abgenommenen Etappe-7-Stand fest und nennt den Pre-Etappe-7-Commit nur
  noch als Rollback-Punkt.
- [x] „Sofort nächste Arbeitspakete“ beginnt mit Etappe 8 und dem
  versionierten Vorbewertungs-Steckbrief.
- [x] `README.md` beschreibt Supabase mit kontogebundener RLS als aktuellen
  Onlinepfad und den privaten GitHub-Datenweg nur noch als Legacy.
- [x] `README.md` verwendet die bindende WARUM-Definition: filmhistorische
  und popkulturelle Relevanz; persönliche Prägung ergänzt nur.

## Nächste Arbeitsreihenfolge

Die Phase-3-Implementierung, ihre Staging-Abnahme und der getrennte
Produktionsrelease sind erledigt. Pull Request #1 wurde am 29.07.2026 als
Merge-Commit `db8199c16a8f6121468ada831ec0f1546fb54986` nach `main`
übernommen. Workflow `30476307220` schloss Testjob, atomaren
Produktionsdeploy und festen Domain-Smoke vollständig grün ab.
`kinodreieck.at/build-meta.json` bestätigt denselben Merge-Commit in der
Umgebung `production`; `14cf3ec5657df720751200c3aff5b73402ee0968` bleibt
der dokumentierte Pre-Etappe-7-Rollback-Punkt.

Etappe 8 beginnt anschließend mit der Vorbewertung auf Branch
`feat/etappe-8-vorbewertung`.

## Arbeitsbaum-Hinweis

Beim Audit war der Projektbaum bis auf `.claude/` sauber. Das Verzeichnis
`.claude/` ist ungetrackt und enthält vier Prüfagenten-Konfigurationen. Es
wurde bewusst weder verändert noch in einen Commit aufgenommen.
