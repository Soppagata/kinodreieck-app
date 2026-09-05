# Review des Privatrelease-Etappenplans

Stand: 28.08.2026

Status: `REVIEW_ONLY_KEIN_AUFTRAG`

Gegenstand: `docs/zukunft/NAECHSTER_MASTERCHAT_PRIVATRELEASE_ETAPPENPLAN.md`
(Stand 23.08.2026, 513 Zeilen)

Nachtrag: Abschnitt 6 hält Max' Antworten vom 28.08.2026 fest. Wo sie einen
Befund verändern, gilt Abschnitt 6 vor dem ursprünglichen Befundtext.

> [!CAUTION]
> **Dieses Dokument ist kein Auftrag und keine Anforderung.** Es enthält keine
> umzusetzenden Punkte, erweitert den eingefrorenen Punktespeicher `PR-00` bis
> `PR-11` nicht und ändert keine Etappenzuordnung. Kein Chat und kein Agent
> setzt hieraus etwas um. Die Befunde `B-01` bis `B-10` sind Bewertungen zur
> Vorlage an Max; welche davon in den Plan einfließen, entscheidet
> ausschließlich Max, und zwar durch Änderung des Planschriftstücks selbst.
> Solange das nicht geschehen ist, gilt der Plan unverändert.

> [!NOTE]
> Die Befunde tragen bewusst eigene Kennungen (`B-…`), damit sie nicht mit
> Produktpunkten (`PR-…`) verwechselt oder als solche gelesen werden.

## 0. Gesamturteil

Der Plan trägt. Sein Aufbau ist für ein Privatrelease dieser Größe
überdurchschnittlich sauber: ein eingefrorener Punktespeicher, sieben getrennte
Liefergrenzen, die binäre Release-Regel unter `PR-09`, ein einziges
Schlussgate statt gestaffelter Kontrollrituale und eine explizite
Ausschlussliste gegen Scope-Zuwachs. Das ist die richtige Grundform, um schnell
und trotzdem sauber fertig zu werden.

Die Schwächen liegen nicht in der Struktur, sondern an drei Stellen, an denen
der Plan den tatsächlichen Repo- und Betriebszustand nicht kennt:

1. Die Auslieferungskonfiguration schaltet in Production Funktionen ab, deren
   Funktionieren der Plan abnehmen will.
2. Die Ausgangslage für `PR-00` ist eine andere als angenommen: der lebende
   Arbeitsstand ist `origin/staging`, `main` ist seit dem 31.07.2026
   eingefroren.
3. `PR-01` ist im Plan als Zugangsregel formuliert, im Code aber ein Rückbau,
   der rund ein Viertel der Testsuite berührt.

Dazu kommen zwei Reihenfolgefehler und drei kleinere Lücken. Alle sind vor dem
Start korrigierbar, ohne den Punktespeicher aufzumachen.

## 1. Was empirisch geprüft wurde

Grundlage sind lesende Recherchen im Arbeitsverzeichnis (Stand 28.08.2026,
Branch `codex/entdecken-tagesfeed-etappe3`, 16 nicht committete Änderungen).
Es wurden keine Tests, Builds oder Deployments ausgeführt und nichts verändert.

## 2. Befunde

### `B-01` – Production-Flags schalten ab, was der Plan abnehmen will

Der Plan erwähnt Feature-Flags an keiner Stelle. `.github/workflows/deploy.yml`
setzt im Production-Job hart:

- `VITE_RADAR_PILOT_CLIENT_ENABLED: "false"`
- `VITE_ENTDECKEN_DAILY_FEED_ENABLED: "false"`
- `VITE_PRIVATE_SELF_SERVICE_ENABLED: "false"`
- `VITE_ACCOUNT_DELETE_ENABLED: "false"` (in Staging ebenfalls `"false"`)

Für `PR-09` ist das unkritisch: eine abgeschaltete Fläche ist nicht sichtbar
und fällt damit aus der binären Regel heraus. Kritisch ist es für `PR-06` und
`PR-10`:

- `PR-06` verlangt, dass Export, Kontolöschung und Löschung der betroffenen
  Daten „in den dafür sichtbaren Pfaden" funktionieren.
- `PR-10` Punkt 3 verlangt die praktische Abnahme von „Export und Löschung"
  sowie von „Radar/Entdecken".

Beides ist mit der heutigen Production-Konfiguration nicht abnehmbar. Zusätzlich
ist der Export serverseitig ein zweites Mal per Flag gesperrt
(`export_enabled`, Default deaktiviert, vgl. `src/lib/privatePilotOps.js` und
`supabase/migrations/20260809220000_private_pilot_ops.sql`).

Offen ist damit eine Entscheidung, die der Plan nicht stellt: **welche
Flag-Kombination ist der Privatrelease?** Ohne diese Festlegung prüft jede
Etappe gegen einen anderen Funktionsumfang als den ausgelieferten, und das
Schlussgate scheitert an einer Anforderung, die es selbst gestellt hat.

### `B-02` – Die Ausgangslage von `PR-00` ist eine andere als angenommen

`PR-00` beschreibt die Übernahme eines fertigen Haupttask-Stands und die
Einrichtung eines eigenen Nicht-`main`-Arbeitsstands. Der reale Zustand:

- `main` steht auf `3898152` vom 31.07.2026.
- `origin/staging` ist **335 Commits vor `main`**, mit Commits bis zum
  28.08.2026. Der Haupttask lebt dort und wird über die CI nach Staging
  deployed.
- Lokal existieren 62 Branches, 57 davon nicht in `main`, mehrere davon neuer
  als der aktuell ausgecheckte Branch. Der lokale `staging` ist 158 Commits
  hinter `origin/staging`.

Daraus folgt zweierlei. Erstens: der geforderte Nicht-`main`-Arbeitsstand
existiert bereits — es ist `staging`. Wenn Max das bestätigt, schrumpft `E0`
von einer Integrationsetappe auf einen kurzen Baseline-Vermerk. Zweitens: der
in `PR-10` Punkt 5 genannte „kontrollierte Merge von `staging` nach `main`" ist
kein Schlussschritt, sondern die Freigabe von vier Wochen Arbeit plus dem
gesamten Privatrelease in einem Zug. Der Plan behandelt ihn als Formalie.

### `B-03` – Der Weg auf `staging` ist im Plan nicht beschrieben

`PR-00` legt einen lokalen Nicht-`main`-Stand fest, die Wellenlogik erlaubt
ausdrücklich, dass `E1` „weder gepusht noch deployed" ist, und `PR-10` setzt
plötzlich einen Stand auf `staging` voraus. Dazwischen fehlt, wann der
integrierte Stand nach `staging` gelangt und wer ihn dorthin bringt.

Praktisch relevant, weil die CI ausschließlich bei Push auf `main`/`staging`
und bei Pull Requests gegen diese beiden Branches läuft
(`.github/workflows/deploy.yml`). Der gesamte Weg `E1` bis `E5` läuft damit
ohne einen einzigen CI-Lauf, und der erste grüne oder rote CI-Befund entsteht
im Schlussgate.

### `B-04` – `PR-01` ist ein Rückbau, kein Zugangsschalter

Der Plan formuliert `PR-01` als Regel („es gibt keinen Weg ‚Ohne Konto
fortfahren'"). Im Code ist der Gastmodus ein durchgängig implementierter
Betriebsmodus:

- `src/components/EinstiegsGate.jsx` bietet den Button „Ohne Konto fortfahren".
- `src/services/auth.js` und `src/components/SyncStatusChip.jsx` führen den
  Gastzustand durch die App.
- Das heutige „Demo-Daten entfernen" funktioniert ausschließlich im Gastmodus
  (`src/App.jsx`: „Demo-Daten entfernen geht nur ohne Konto").
- Das `EinstiegsGate` ist ein einmaliges Onboarding-Overlay, kein Auth-Guard:
  bei vorhandenem lokalem Stand läuft die App ohne Konto weiter.

**26 von 114 Testdateien** enthalten Gast- beziehungsweise Demo-Bezug, darunter
`konto_logout_test.mjs`, `authservice_test.mjs`, `einstieg_test.mjs`,
`architekturgrenzen_test.mjs` und `tests/mobile-layout.spec.mjs`.

`PR-01` und `PR-02` sind damit gekoppelt und beide grösser als der Plantext
nahelegt: der heutige Demo-Weg **ist** der Gastmodus, und der künftige Demo-Weg
soll ein Konto sein. Die Zuordnung beider Punkte zu `E1` ist richtig; die
implizite Aufwandsannahme ist es nicht.

### `B-05` – Der Plan spart Testläufe genau dort, wo sie am billigsten wären

Die Merge- und Wirkungsverantwortung erlaubt in parallelen Ständen nur
„fokussierte Mockprüfungen"; die vollständige Suite läuft laut `PR-10`
„genau einmal" im Schlussgate.

Realität der Suite: `npm test` ist eine `&&`-Kette aus rund 85 Schritten
inklusive zweier vollständiger Builds, ohne Parallelität und ohne Reporter.
Sie bricht beim ersten roten Test ab. Eine dokumentierte Gesamtlaufzeit
existiert nicht.

In Kombination mit `B-04` heißt das: `E1` bricht voraussichtlich einen Teil von
26 Testdateien, `E2` bis `E5` legen weitere Änderungen darüber, und der erste
vollständige Lauf findet im teuersten Gate statt — wo jeder rote Test einen
neuen Durchlauf der abbrechenden Kette erzwingt. Die Ersparnis in den Etappen
kauft Risiko im Schlussgate.

### `B-06` – Das Sicherheitsnetz kommt nach dem Risiko

`PR-10` Punkt 2 verlangt „vor einer tatsächlichen produktiven Backendmutation
ein logisches Backup außerhalb des Repositories plus getrennte
Wiederherstellungsprobe". Die erste echte produktive Backendmutation findet
aber bereits in `E2` statt (serverseitiger Live-Stand, Revisionen,
Sicherungsmodell, `PR-03`/`PR-04`).

Die Anforderung selbst ist richtig formuliert und an eine Wirkungsgrenze
gebunden. Sie steht nur in der falschen Etappe.

### `B-07` – Aufbau vor Rauswurfentscheidung

`PR-03` verlangt serverseitige Persistenz unter anderem für „Radarziele und
-einträge". `PR-09` erlaubt demselben Release, Serienradar/Watchmode,
technische Radar-Einstellungen und „alte oder doppelte Radar-/Entdecken-Wege"
binär zu entfernen. `E2` liegt vor `E5`.

Damit kann `E2` Synchronisation für Flächen bauen, die `E5` anschließend
entfernt. Der Plan erzwingt diese Reihenfolge, ohne sie zu begründen.

### `B-08` – `W2` widerspricht der eigenen Serialitätsregel

Die Wellentabelle lässt in `W2` `E2` und den Feedbackteil von `E3` parallel
laufen. Die Merge- und Wirkungsverantwortung verlangt gleichzeitig, dass
„Shared-Backend-Writes, Deployments, Live-/Kostenläufe und jede
Production-Wirkung strikt seriell" laufen.

`E2` schreibt am Backend (Tabellen, RLS, Revisionen), der Feedbackteil von
`E3` braucht einen serverseitigen Versandweg (Edge Function, Secret,
Domain-Authentifizierung). Beide Etappen berühren genau die Fläche, die
seriell bleiben soll. Der Widerspruch ist auflösbar — die Regel benennt ein
Wirkungsfenster mit genau einem Verantwortlichen —, steht aber ungelöst im
Plan.

### `B-09` – Drei kleinere Lücken

- **Sieben Tage offline:** `PR-10` Punkt 3 verlangt die praktische Abnahme
  eines Kontos, das „mehr als sieben Tage offline" war. Ein Zeitraffungs- oder
  Simulationspfad ist weder im Plan noch im Testbestand erkennbar. Ohne
  Festlegung ist das ein Kalender-Blocker im letzten Gate.
- **15 Konten:** Die Grenze steht dreimal im Plan, jeweils als
  „organisatorisch", ohne technischen Riegel und ohne eigene Abnahmezeile —
  im Unterschied zu jeder anderen Zugangsregel, die serverseitig geschlossen
  fehlschlagen muss.
- **`staging` in Doppelrolle:** `PR-10` nutzt `staging` als Release-Quelle,
  `PR-11` beschreibt es als künftigen persönlichen Spielplatz und muss die
  Kopplung zu Production dort erst diagnostizieren — obwohl `PR-10` sie
  vorher bereits vorausgesetzt hat.

### `B-10` – Drei Punkte sind kleiner als der Plan annimmt

Diese Befunde sprechen für den Plan, nicht gegen ihn:

- **`PR-06` Cookie-Entscheid:** Es wurde kein Tracking gefunden — kein GA,
  Plausible, Sentry, PostHog oder Matomo, keine externen Fonts (self-hosted
  woff2), CSP mit `script-src 'self'`, Abhängigkeiten nur `react`/`react-dom`.
  Der binäre Entscheid tendiert klar zu „kein Banner". Verbleibende
  Unsicherheit liegt außerhalb des Repos: ob im Cloudflare-Pages-Projekt Web
  Analytics zugeschaltet ist.
- **`PR-08` Kino-Filter:** Zusatzfilter-Dropdown, Filterlogik, lokale Suche und
  die globale Suchleiste existieren bereits (`src/tabs/KinoTab.jsx`,
  `src/components/GlobalSearchBar.jsx`). Der Punkt ist im Wesentlichen
  Layoutarbeit und der mit Abstand kleinste im Plan.
- **`PR-01` Registrierung:** Eine öffentliche Registrierung existiert gar
  nicht; `src/services/auth.js` kennt nur `signIn`, der Logintext verweist auf
  eingeladene Konten. Nur der Gastweg ist offen (siehe `B-04`).

Bereits vorhanden und im Plan nicht als Baubedarf missverstanden werden sollte
außerdem: Revisions- und Konfliktmechanik (`kd_personal` mit serverseitigem
Revisionstrigger, optimistische Sperre in `src/lib/accountDriver.js`),
manueller Gesamtexport (`src/lib/backup.js`), Datenschutzübersicht mit
Anbieterregister (`src/components/PrivatePilotOps.jsx`) und serverseitig
gehaltene KI-Schlüssel (`supabase/functions/ai-task/index.ts`). Nicht vorhanden
ist die automatische Sicherung aus `PR-04` — die Migration bezeichnet das
System ausdrücklich als „System ohne Backup-Automatik". `PR-04` ist damit der
grösste Neubau des Plans.

## 3. Zur Vorlage: mögliche Straffungen

Zeitgewinn liegt nicht darin, Punkte zu streichen, sondern darin,
Entscheidungen aus dem kritischen Pfad herauszuziehen. Zur Entscheidung durch
Max:

1. **Baseline vorab klären statt in `E0` erarbeiten.** Wenn `origin/staging`
   der Haupttask-Stand ist, wird `E0` ein Vermerk statt einer Etappe.
2. **Flag-Zielbild vor `E1` festlegen** (siehe `B-01`). Eine Zeile, die
   verhindert, dass das Schlussgate an der eigenen Abnahmematrix scheitert.
3. **Die binäre Entscheidung aus `PR-09` für die vier ohnehin ausgeschlossenen
   Flächen vorwegnehmen.** Abschnitt 5 des Plans schließt Neubau von
   Bloganalyse, Filmscan, Sharing und Master-Import bereits aus. Wenn Max diese
   vier vorab auf „entfernen" setzt, entfällt die teure
   Ende-zu-Ende-Prüfung und `E5` wird reine Entfernungsarbeit. Für die
   Radar-/Entdecken-Flächen wirkt dieselbe Vorabentscheidung zusätzlich gegen
   `B-07`.
4. **Versanddomain als Vorlauf, nicht als Etappenarbeit.** DNS-Records und
   Domain-Verifikation beim Versanddienst sind Wartezeit, keine Bauzeit, und
   von keiner Etappe abhängig. Früh gestartet, sind sie fertig, wenn `E3`
   beginnt.
5. **Cookie-Bestandsaufnahme vorziehen** (siehe `B-10`): der Repo-Teil ist
   erledigt, offen ist nur ein Blick ins Cloudflare-Dashboard.
6. **`E4` mit `E5` zusammenlegen.** Beides ist reine Oberflächenarbeit am
   integrierten Stand, und `PR-08` ist klein. Das gibt in `W1` den zweiten
   Arbeitsplatz frei.
7. **Vollständigen Suitenlauf je Etappe zulassen** statt nur fokussierter
   Mockprüfungen (siehe `B-05`), mindestens für `E1`.
8. **Backupschritt aus `PR-10` Punkt 2 vor `E2` ziehen** (siehe `B-06`).

## 4. Was nicht kritisiert wird

Damit die obige Liste nicht als Gesamturteil missverstanden wird — folgende
Konstruktionen sind ausdrücklich gut und sollten unverändert bleiben:

- die sieben getrennten Liefergrenzen und das Verbot von `TEILWEISE`;
- die binäre Release-Regel unter `PR-09`;
- ein einziges Schlussgate statt gestaffelter Prüfetappen;
- die Ausschlussliste in Abschnitt 5;
- der ausdrückliche Verzicht auf vorsorglichen Cookie-Banner, SEO und
  Split-Bundling;
- die Feststellung, dass `robots.txt` keine Zugriffssperre ist;
- die Trennung von Synchronisation und Sicherung in `PR-04`.

## 5. Zum Verhältnis dieses Dokuments zum Plan

Der Punktespeicher bleibt eingefroren. Dieses Review fügt ihm nichts hinzu.
Die Befunde `B-01` bis `B-09` betreffen Voraussetzungen, Reihenfolge und
Aufwandsannahmen — nicht den Funktionsumfang. Werden sie berücksichtigt,
geschieht das durch Max' Änderung am Planschriftstück, nicht durch Auslegung
dieses Dokuments.


## 6. Nachtrag 28.08.2026 — Klärungen durch Max

### Zu `B-02` – Baseline geklärt

`staging` ist bestätigt der aktuelle Stand, der später auf `main` kommt. Damit
schrumpft `E0` auf einen Baseline-Vermerk: Commit festhalten, Dirty-State des
Arbeitsverzeichnisses klären, fertig. Keine Integrationsetappe.

Zwei Folgefragen bleiben offen und sind nicht Teil dieses Reviews:

- Arbeiten die Etappen-Baumeister direkt auf `staging` oder auf Branches, die
  von `staging` abzweigen? Der Plan verlangt getrennte Nicht-`main`-Stände;
  `staging` ist zugleich der einzige Branch, auf dem CI und Deploy laufen.
- Der Schlussmerge `staging` → `main` gibt beim heutigen Abstand 335 Commits
  plus den gesamten Privatrelease in einem Zug frei.

### Zu `B-10` – Cookie-Entscheid abgeschlossen

Max: Web Analytics wird nicht gebraucht und bleibt aus. Zusammen mit dem
Repo-Befund (kein Tracking, keine externen Fonts, CSP `script-src 'self'`) ist
der binäre Entscheid aus `PR-06` damit entschieden: **kein Cookie-Banner**.
Es ist nichts abzuschalten — es ist nichts vorhanden.

### Zu `B-01` – Die Schalter, geklärt und verschärft

Recherchiert wurde, was die vier Schalter aus `deploy.yml` sichtbar bewirken
(Einlesen in `src/config/runtime.js`, Auswertung über `src/`). Alle vier stehen
in Production hart auf `false`; `VITE_ACCOUNT_DELETE_ENABLED` auch in Staging.

| Schalter | Wirkung, wenn AUS |
|---|---|
| `VITE_RADAR_PILOT_CLIENT_ENABLED` | Entdecken-Tab, Unteransicht Radar bleibt sichtbar, aber wirkungslos: dauerhaft „Noch keine bestätigten Ereignisse für deine aktiven Werke", kein „Jetzt prüfen"-Button, kein Kontoabgleich des Radarstands |
| `VITE_ENTDECKEN_DAILY_FEED_ENABLED` | Entdecken-Tab, Unteransicht Empfehlungen: Bereich „Von anderen empfohlen / Weitere Entdeckungen" bleibt leer mit „Noch keine belegten Webtipps geladen."; keine Quellenzusätze, keine „Quelle ansehen"-Links |
| `VITE_PRIVATE_SELF_SERVICE_ENABLED` | Gesamt-Backup lädt herunter, enthält aber nur lokale Browserdaten — die serverseitigen Kontodaten fehlen still; sperrt zusätzlich die Kontolöschung |
| `VITE_ACCOUNT_DELETE_ENABLED` | Klappe „Konto löschen" zeigt nur „Die Kontolöschung ist derzeit nicht freigeschaltet…"; kein Löschablauf vorhanden |

Damit verschärft sich `B-01`. Es geht nicht nur um eine im Plan fehlende
Variable, sondern um drei bereits heute bestehende Konflikte mit dem
Punktespeicher:

1. Die ersten beiden Schalter erzeugen in der heutigen Production genau das,
   was die binäre Release-Regel aus `PR-09` verbietet: sichtbare Bereiche ohne
   verlässliche Wirkung. Sie sind damit keine Randnotiz, sondern zwei der
   Flächen, die `E5` ohnehin entscheiden muss.
2. `PR-04` führt den manuellen JSON-Gesamtexport als „zusätzliche
   Sicherheitsleine". Mit `VITE_PRIVATE_SELF_SERVICE_ENABLED=false` ist diese
   Leine unvollständig, ohne dass es der Nutzer merkt.
3. `PR-06` verlangt funktionierende Kontolöschung, `PR-10` deren praktische
   Abnahme. Beide Schalter dafür stehen auf `false`, in Staging ebenso.

Zu entscheiden ist deshalb je Fläche eine von zwei Richtungen — an (dann muss
sie funktionieren und wird im Schlussgate abgenommen) oder aus (dann fällt die
sichtbare Fläche unter die binäre Entfernung). Für Export und Kontolöschung
ist „aus" mit `PR-04` und `PR-06` nicht vereinbar.

Nebenbefund: `src/config/entdeckenFlags.js` definiert fünf weitere Schalter
(`VITE_RADAR_UI_ENABLED`, `VITE_RADAR_PEOPLE_ENABLED`,
`VITE_RADAR_SHARES_ENABLED`, `VITE_RECOMMENDATIONS_ENABLED`,
`VITE_POPULARITY_ENABLED`), die in `src/` nirgends importiert werden — ein
toter Schaltersatz, der nur noch von `radar_contract_test.mjs` gelesen wird.

### Zu `B-09` – Sieben Tage offline: Kern richtig, Verortung falsch

Max' Rückfrage nach dem Zweck trifft. Die Zahl „sieben Tage" ist keine
Wartezeit, sondern die Aufbewahrungsgrenze aus `PR-04`: höchstens ein stabiler
Wiederherstellungspunkt pro Tag, sieben Tage lang. Der zu belegende Zustand ist
deshalb nicht „sieben Tage vergangen", sondern „der lokale Stand ist älter als
die Aufbewahrung reicht" — es existiert kein Wiederherstellungspunkt mehr aus
der Offline-Zeit. Die Frage lautet: gleicht das Konto dann sauber ab, oder
verliert es still.

Der reale Fall dahinter ist alltäglich: längere Abwesenheit, am Zweitgerät
offline etwas geändert, danach Rückkehr auf das Hauptgerät.

Max' Vermutung, dass das messbar ist, stimmt: `public.kd_personal` führt
`updated_at timestamptz` und `revision bigint`, beide serverautoritativ über
den Trigger `kd_personal_touch` gesetzt. Der Abstand seit dem letzten Abgleich
ist damit direkt ablesbar, und der Zustand ist durch Setzen dieser Werte
herstellbar. Sieben Tage Kalenderzeit sind nicht nötig.

Folgerung für den Plan: Der Punkt ist berechtigt, steht aber in der falschen
Etappe. Als Mockprüfung in `E2` — dort, wo Revisionen und Sicherung gebaut
werden — ist er billig. Als praktische Abnahme in `PR-10` ist er der einzige
Punkt der Matrix, dessen Herstellbarkeit ungeklärt ist.
