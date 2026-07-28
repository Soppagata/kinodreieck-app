# Etappe 7, Phase 3: Übergabe und offene Befunde

Stand: 28.07.2026
Arbeitsbranch: `feat/etappe-7-geschmacksprofil`
Letzter geprüfter Commit: `ccb6fc7`

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

Phase 3 ist trotzdem noch nicht abnahmefähig. Der echte UI-Pfad kann derzeit
keinen erfolgreichen `profile-extract`-Aufruf auslösen, mehrere Vorschläge
können bei der Bestätigung ungewollt gekoppelt werden, und die neue
Function-Absicherung sowie der Clienttest sind nicht grün.

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

- [ ] **H1 – Die eigene Function-Grenze akzeptiert formfremde Antworten
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
  Stellen: `supabase/functions/ai-task/index.ts:1232`,
  `ai_task_test.ts:3747`, `ai_task_test.ts:3770`,
  `ai_task_test.ts:4217`.

- [ ] **H2 – `nicht_deutbar` wird weder belegt noch sauber typgeprüft und
  ist nicht einzeln abwählbar.**
  Nicht-Textwerte werden durch `kurzText` in sichtbaren Modelltext verwandelt:
  `42` wird `"42"`, ein Objekt wird `"[object Object]"`. Inhaltlich muss ein
  Eintrag außerdem nicht in den Antworten vorkommen. Die Liste ist zwar in
  der Vorschau sichtbar und wird erst mit der gemeinsamen Bestätigung
  gespeichert; der Client macht ihre Einträge aber ausdrücklich unabwahlbar
  und speichert sie anschließend im persönlichen Profil.
  Stellen: `supabase/functions/ai-task/index.ts:1324`,
  `src/components/DreiFragen.jsx:59`.

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

- [ ] **H5 – Acht Zeichen sind als Mindestbeleg zu schwach.**
  Der vorhandene Test zeigt, dass ein inhaltsarmes Bindewort wie
  `"und dass"` eine frei erfundene Behauptung passieren lässt, solange diese
  häufige Wortfolge in der Antwort vorkommt. Das trifft die tragende Zusage
  der Phase: Nicht nur der Beleg, sondern das daraus abgeleitete Signal muss
  nachvollziehbar sein. Der Test nennt 16 Zeichen als robustere Messlatte;
  zusätzlich sollte die Beziehung zwischen Beleg und Wert geprüft werden.
  Stellen: `supabase/functions/ai-task/index.ts:761`,
  `supabase/functions/ai-task/index.ts:1281`,
  `ai_task_test.ts:3460`.

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

- [ ] **M2 – Die Film-Belegprüfung arbeitet mit beliebigen Teilstrings.**
  Kurztitel wie `It`, `Up` oder `Her` können zufällig innerhalb gewöhnlicher
  Wörter vorkommen und dadurch als „genannt“ gelten. In der Vorschau werden
  Filme außerdem nur über den Titel ausgewählt und als React-Key geführt;
  gleichnamige Filme verschiedener Jahre sind nicht unabhängig behandelbar.
  Stellen: `supabase/functions/ai-task/index.ts:1303`,
  `src/components/DreiFragen.jsx:141`.

- [ ] **M3 – Verworfene erfundene Filmtitel verschwinden ohne sichtbare
  Zählung.**
  Die Sicherheitsprüfung funktioniert, aber anders als bei Signalen erfährt
  der Client nicht, dass ein Filmeintrag verworfen wurde. Das widerspricht
  dem Versprechen, nichts still verschwinden zu lassen.
  Stellen: `supabase/functions/ai-task/index.ts:1301`,
  `ai_task_test.ts:3591`.

- [x] **M4 – `profilVersion` wird nicht an `profile-extract` übergeben.**
  Die KI-Fassade kann die Profilversion sauber protokollieren, der erste
  Profil-Task ruft `runTask` aber ohne dieses Optionsfeld auf. Bei einem
  bestehenden Profil fehlt im KI-Protokoll dadurch der Bezug zum
  Ausgangsstand.
  **Behoben:** `GeschmackBereich` übergibt die geladene Fassung im dritten
  `runTask`-Argument; ohne Profil bleibt der Wert ehrlich `null`.

- [ ] **M5 – Achsen sind nur als Paket bestätigbar und der Wertevertrag ist
  widersprüchlich.**
  WIE, WAS und WARUM hängen an einem gemeinsamen Schalter. Der Nutzer kann
  nicht zwei Achsen akzeptieren und die dritte ablehnen. Der Prompt nennt
  außerdem `1..5 oder null`, während Server, Client, Profilmodell und Tests
  ausdrücklich auch `0` akzeptieren.
  **Teilweise behoben:** WIE, WAS und WARUM sind in der Vorschau jetzt
  unabhängig wählbar; eine Mischwahl ist getestet. Der Prompttext `1..5`
  wird mit dem Function-Paket auf den bereits bindenden Vertrag `0..5`
  korrigiert.

- [ ] **M6 – Eine falsche Fragenquelle bleibt trotz Gegenfund bestehen.**
  Findet der Server einen Beleg nicht in der behaupteten Frage, sucht er
  ersatzweise über alle Antworten, behält danach aber die falsche
  Quellenkennung. Die Oberfläche zeigt den richtigen Text dann unter der
  falschen Frage, und die spätere fragebezogene Evaluation erhält ein
  falsches Etikett.
  Stellen: `supabase/functions/ai-task/index.ts:1240`,
  `supabase/functions/ai-task/index.ts:1282`,
  `ai_task_test.ts:3501`.

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

Am 28.07.2026 lokal reproduziert:

| Prüfung | Ergebnis | Einordnung |
| --- | ---: | --- |
| `npm test` | rot, Abbruch bei `ai_test.mjs` mit 90/91 | Staler Vertragstest erwartet vier statt fünf registrierte Tasks |
| `node extraktion_test.mjs` | 315/344 | Mischung aus echtem F2-Fehler und nicht nachgezogener Testtechnik |
| `deno test … ai_task_test.ts` | 239/244 | Function-Grenze und `nicht_deutbar` noch rot |
| `npm run build` | grün | Hauptbundle-Warnung bei rund 654,5 kB |

Offene Testschuld:

- [ ] `ai_test.mjs` auf den fünften Task `profile-extract` nachziehen.
- [ ] In `extraktion_test.mjs` die Standardhülle von `daten` auf `data`
  umstellen.
- [ ] Den Signalzeilen-Selektor so verengen, dass die Achsenzeile nicht als
  viertes Signal zählt.
- [ ] Erwartungen entfernen, die noch die bewusst abgeschaffte
  Standardstärke 3 verlangen.
- [ ] Den restlichen Clienttest nach den bereits umgesetzten
  `uebernimm`-/`data`-Änderungen neu eichen, ohne echte Befunde grünzuschreiben.
- [ ] `extraktion_test.mjs` in das normale Test-Gate aufnehmen.
- [ ] Deno im CI einrichten und `test:function` vor jedem Pages-Deploy
  ausführen.
- [ ] `test:rls` ebenfalls bewusst als Deployment-Gate einordnen oder den
  manuellen Charakter ausdrücklich dokumentieren.

Wichtig: Der Cloudflare-Workflow führt derzeit nur `npm test` aus.
`test:function` und `test:rls` sind getrennte Skripte. Die fünf roten
Function-Tests würden einen Frontend-Deploy daher nicht verhindern.

## Live- und Deploymentstand

Produktion und Staging liefern nachweislich denselben Build:

`14cf3ec5657df720751200c3aff5b73402ee0968` – **Pre-Etappe 7**

Damit gilt:

- Etappe 7 ist weder auf `kinodreieck.at` noch auf
  `staging.kinodreieck.at` enthalten.
- Der Remote-Feature-Branch endet bei `43bf773` (Phase 2a).
- Phase 2b, Phase 2c und Phase 3 existieren nur lokal.
- Die Live-Oberfläche war im Desktop-Sichttest stabil und ohne
  Console-Fehler. Im Einstellungsbereich fehlen erwartungsgemäß
  Geschmacksprofil und Etappe-7-KI-Wahl.
- Die Live-Anzeige meldete am 28.07. einen Programmstand vom 25.07. 20:17.
  Das ist zunächst eine Auffälligkeit zur Datenfrische, noch kein belegter
  Programmfehler.

Vor einem Staging-Lauf sind zusätzlich nötig:

- [ ] Migration `20260727210000_etappe7_profil_topf.sql` ausführen; sie ist im
  Migrationsprotokoll noch als **STEHT AUS** markiert.
- [ ] Die Edge Function manuell deployen; der Pages-Workflow tut das nicht.
- [ ] Danach erst das Etappe-7-Frontend auf Staging veröffentlichen.

Weitere Hosting-Auffälligkeiten:

- [ ] Live liefert `/sw.js` mit
  `Cache-Control: public, max-age=14400, must-revalidate`, obwohl
  `public/_headers` und das Hosting-Handbuch `max-age=0` verlangen. Das kann
  PWA-Aktualisierungen um bis zu vier Stunden verzögern.
- [ ] Push- und manuelle Production-Läufe können wegen unterschiedlicher
  Concurrency-Gruppen parallel deployen.
- [ ] Der Domain-Smoke-Test prüft nicht, ob die feste Domain wirklich den
  erwarteten Commit-SHA ausliefert.

## Dokumentationsdrift

- [ ] `ROADMAP_TO_ONLINE.md` behandelt Live-Aktivierung und Domain-Abnahme
  teilweise noch als ausstehend, obwohl beide Domains erreichbar sind.
- [ ] Das Kapitel „Sofort nächste Arbeitspakete“ fordert noch den bereits
  erledigten Etappe-6-Merge.
- [ ] `README.md` beschreibt den privaten GitHub-Datenpfad noch als aktuellen
  Hauptweg, obwohl der Onlinepfad inzwischen Accounts und Supabase nutzt.
- [ ] Die Definition der Achse „Warum“ in `README.md` entspricht nicht mehr
  der späteren Roadmap-Entscheidung.

## Empfohlene Arbeitsreihenfolge

1. B1 beheben und den echten UI-Aufruf mit einer befüllten Genre-Liste
   festnageln.
2. B2 mit stabilen, pro Vorschlag eindeutigen Auswahl-IDs reparieren; die
   Übernahme darf nicht mehr über den Beleg allein zuordnen.
3. Function-Grenze und `nicht_deutbar`-Vertrag entscheiden und die 244
   Function-Tests vollständig grün machen.
4. Konto-Gate sowie den Lebenszyklus von Filmen und `nichtDeutbar` klären.
5. Clienttests reparieren, alle Phase-3-Prüfungen ins CI-Gate aufnehmen und
   erst dann den gesamten Bestandstest laufen lassen.
6. Migration und Function auf Staging ausliefern, dort den echten
   kostenpflichtigen Pfad einmal kontrolliert prüfen.
7. Erst nach Staging-Abnahme den Production-Merge vorbereiten.

## Arbeitsbaum-Hinweis

Beim Audit war der Projektbaum bis auf `.claude/` sauber. Das Verzeichnis
`.claude/` ist ungetrackt und enthält vier Prüfagenten-Konfigurationen. Es
wurde bewusst weder verändert noch in einen Commit aufgenommen.
