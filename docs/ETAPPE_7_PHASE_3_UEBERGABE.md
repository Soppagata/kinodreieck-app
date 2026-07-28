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

- [ ] **B1 – Der echte UI-Pfad übergibt keine Genre-Liste.**
  `DatenTab.jsx` rendert `GeschmackBereich` nur mit `bekannteTitel`.
  `bekannteGenres` bleibt dadurch `[]`; `bauePayload` sendet
  `listen.genres: []`. Die Edge Function weist genau diesen Fall vor dem
  Anbieteraufruf mit `wertelisten-fehlen` ab. Der KI-Profilweg kann aus der
  echten Oberfläche deshalb nie erfolgreich extrahieren.
  Stellen: `src/tabs/DatenTab.jsx:195`,
  `src/components/GeschmackBereich.jsx:45`,
  `src/lib/extraktion.js:77`,
  `supabase/functions/ai-task/index.ts:1165`.

- [ ] **B2 – Gleiche Belege koppeln mehrere Vorschläge.**
  Ein Satz kann legitim gleichzeitig etwa ein Genre und einen Ton belegen.
  `DreiFragen` benutzt aber den Beleg als React-Key und als Auswahl-ID;
  `GeschmackBereich` ordnet auch die spätere Bestätigung über eine
  Beleg-Menge zu. Zwei Signale mit derselben Textstelle werden gemeinsam
  abgewählt oder bestätigt, obwohl die Oberfläche Einzelwahl zusagt. React
  meldet zusätzlich doppelte Keys. Der vorhandene F2-Test reproduziert den
  Fehler.
  Stellen: `src/components/DreiFragen.jsx:42`,
  `src/components/DreiFragen.jsx:91`,
  `src/components/GeschmackBereich.jsx:137`,
  `extraktion_test.mjs:1708`.

### Hoch

- [ ] **H1 – Die Function-Grenze akzeptiert formfremde Antworten teilweise
  als Erfolg.**
  `pruefeErgebnis` schließt Arrays nicht aus und ignoriert unbekannte
  Top-Level-Felder. Eine Liste oder ein Objekt wie `{ nichts: true }` kann
  dadurch als leere Extraktion mit HTTP 200 enden, statt als Schemabruch.
  Vier der fünf roten Function-Tests berühren diese Grenze. Die Tests führen
  gleichzeitig zwei unterschiedliche Verträge für fehlende bekannte Felder;
  vor dem Fix muss die beabsichtigte Toleranz einmal eindeutig festgelegt
  werden.
  Stellen: `supabase/functions/ai-task/index.ts:1232`,
  `ai_task_test.ts:3747`, `ai_task_test.ts:3770`,
  `ai_task_test.ts:4217`.

- [ ] **H2 – `nicht_deutbar` wird weder belegt noch sauber typgeprüft.**
  Nicht-Textwerte werden durch `kurzText` in sichtbaren Modelltext verwandelt:
  `42` wird `"42"`, ein Objekt wird `"[object Object]"`. Inhaltlich muss ein
  Eintrag außerdem nicht in den Antworten vorkommen. Der Client macht diese
  Einträge ausdrücklich unabwahlbar und speichert sie anschließend im
  persönlichen Profil.
  Stellen: `supabase/functions/ai-task/index.ts:1324`,
  `src/components/DreiFragen.jsx:59`.

- [ ] **H3 – Gespeicherte `nichtDeutbar`-Einträge sind in der Profilansicht
  weder sichtbar noch löschbar.**
  Sie werden gespeichert und über den Profil-Topf synchronisiert, aber
  `ProfilAnsicht` bietet dafür keine Korrektur. Damit kann persönlicher
  Modelltext im Konto liegen, den der Nutzer nach der Übernahme nicht mehr
  einzeln kontrollieren kann.
  Stellen: `src/components/ProfilAnsicht.jsx`,
  `src/lib/profil.js`.

- [ ] **H4 – Bestätigte Filmnennungen bleiben dauerhaft `sicher: false`.**
  Extrahierte Filme werden vor der Übernahme einzeln gezeigt, danach aber
  weiterhin unsicher gespeichert. `promptFassung` filtert unsichere Filme
  aus, und die Profilansicht hat keinen Weg, sie auf sicher zu setzen. Die
  bestätigten Daten bleiben damit für den vorgesehenen Folgeeinsatz in
  Etappe 8 wirkungslos.
  Stellen: `src/lib/extraktion.js:183`,
  `src/lib/profil.js:621`,
  `src/components/ProfilAnsicht.jsx:159`.

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

- [ ] **M1 – Das Konto-Gate sitzt erst hinter dem Freitextformular.**
  `kiWegOffen` prüft den KI-Schalter, aber nicht den Kontozustand. Ein Gast
  darf die persönlichen Antworten vollständig eingeben und erfährt erst beim
  Absenden, dass persönliche KI ein Konto verlangt. Der Kommentar verspricht
  ein früheres Ausblenden.
  Stelle: `src/components/GeschmackBereich.jsx:79`.

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

- [ ] **M4 – `profilVersion` wird nicht an `profile-extract` übergeben.**
  Die KI-Fassade kann die Profilversion sauber protokollieren, der erste
  Profil-Task ruft `runTask` aber ohne dieses Optionsfeld auf. Bei einem
  bestehenden Profil fehlt im KI-Protokoll dadurch der Bezug zum
  Ausgangsstand.
  Stellen: `src/components/GeschmackBereich.jsx:183`,
  `src/services/ai.js:103`.

- [ ] **M5 – Achsen sind nur als Paket bestätigbar und der Wertevertrag ist
  widersprüchlich.**
  WIE, WAS und WARUM hängen an einem gemeinsamen Schalter. Der Nutzer kann
  nicht zwei Achsen akzeptieren und die dritte ablehnen. Der Prompt nennt
  außerdem `1..5 oder null`, während Server, Client, Profilmodell und Tests
  ausdrücklich auch `0` akzeptieren.
  Stellen: `src/components/DreiFragen.jsx:127`,
  `supabase/functions/ai-task/index.ts:1198`,
  `supabase/functions/ai-task/index.ts:1318`.

- [ ] **M6 – Eine falsche Fragenquelle bleibt trotz Gegenfund bestehen.**
  Findet der Server einen Beleg nicht in der behaupteten Frage, sucht er
  ersatzweise über alle Antworten, behält danach aber die falsche
  Quellenkennung. Die Oberfläche zeigt den richtigen Text dann unter der
  falschen Frage, und die spätere fragebezogene Evaluation erhält ein
  falsches Etikett.
  Stellen: `supabase/functions/ai-task/index.ts:1240`,
  `supabase/functions/ai-task/index.ts:1282`,
  `ai_task_test.ts:3501`.

- [ ] **M7 – Der Datenschutzhinweis ist stärker als der belegte Vertrag.**
  Die Oberfläche sagt, der Freitext werde „nicht gespeichert“. Sicher belegt
  ist, dass Kinodreieck und `kd_ai_log` ihn nicht speichern. Die Antworten
  werden aber an den KI-Anbieter übertragen; dessen Aufbewahrungsdauer ist in
  der Projektdokumentation noch ausdrücklich offen. Der Text sollte App-
  Speicherung und Anbieter-Verarbeitung auseinanderhalten.
  Stellen: `src/components/DreiFragen.jsx:193`,
  `docs/ETAPPE_5_KI_UNTERBAU.md:347`.

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
