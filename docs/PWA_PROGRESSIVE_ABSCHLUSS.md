# Progressive PWA-Seiten: kontrollierte Abschlussprüfung

Stand: 13.09.2026

## Urteil

Der integrierte Kandidat wurde lokal über die echte Kette PostgreSQL 17 →
`kd_streaming_page` → authentifizierter App-Service → Controller sowie in der
gewöhnlichen Mock-Suite und in einem mobilen Produktionsbundle geprüft. Die
SQL-, Service-, Controller-, Cache-, Filter-, Auto-20-, Entdecken- und
Produktionsdarstellungsverträge sind belegt. Das lokale Gesamturteil ist grün;
es gibt keinen offenen Produktblocker aus dieser Abschlussprüfung. Konkrete
Reste im ersten kontrollierten Lauf wurden den Paketownern zugeordnet, dort
klein korrigiert und anschließend nur im jeweils betroffenen Browserabschnitt
erneut belegt.

Das ist ein lokaler, commitfähiger Stand. Die Migration wurde nicht auf
Supabase angewandt, kein Commit wurde aus diesem Abschlusslauf gepusht, es gab
keinen Cloudflare-Deploy und keinen Produktions- oder iPhone-Readback.

## Geprüfter Kandidat

Die Abschlussarbeit begann exakt auf `547ba28`; dessen Produktbasis war
`74659f7`. In der Prüfarbeitskopie wurden die bereits fachlich geprüften Deltas
getrennt übernommen:

- Owner A: `13fce4a` als `b67a592` (materialisierte Library-/Marker-Normalisierung
  und Gleichheitsjoins).
- Owner B: `155873a` als `7a7bd17` (Account-Boot-/Startziel-Gate, normale
  Folgepakete 20 und Cachegrenze) sowie `c17f864` als `de8b368` (Entfernung
  zweier vorzeitiger Legacy-Vollkatalogstarter), `a8ee8cf` als `564ecfa` und
  `9543a29` als `fd50168` (Pagingabsicht während des Konto-Boots) sowie
  `c746848` als `30827e7` (Cage-Vollpool erst nach der ersten Seite).
- Owner C: `91cecd7` als `e22a0d1`, `a6325ed` als `e06da65` und `60700af` als
  `2c83237` (beide Beschriftungsmodi sowie automatische 20er-Portionen in
  Streaming und Entdecken einschließlich wartender Datenankunft) sowie
  `57b7088` als `badb6a4` (wiederverwendeter neutraler Entdecken-Projektionsindex).

Eigene Abschluss-Harness-Commits vor diesem Bericht sind `47b6c71`, `e8c8712`
und `43aa30e`.
Sie enthalten keine Produktsemantik. Der Harness erzeugt im normalen
`npm test` eine neutrale synthetische Fixture. Die große lokale Lab-Fixture
wird nur mit `KD_STREAMING_FINAL_USE_LAB_FIXTURE=1` gewählt. Dabei werden aus
`streaming_bekannt.json` ausschließlich neutrale Identitäts-, Katalog- und
Fristfelder übernommen; historische Notizen und Bewertungswerte werden weder
ausgegeben noch in neue Fixtures geschrieben.

## Echte SQL-Service-Controller-Kette

Der fokussierte Lauf

```sh
KD_STREAMING_FINAL_USE_LAB_FIXTURE=1 node streaming_progressive_integration_test.mjs
```

bestand mit 5/5 Prüfungen. Die lokale Projektion enthielt 24.678 Titel und
benötigte 11.242,5 ms. Die erste Seite mit 20 Titeln benötigte 335,6 ms, die
folgende Seite 335,7 ms. Fünf RPC-Aufrufe liefen mit höchstens einem Aufruf
gleichzeitig. Der vollständige Zähler war 8.806 für `Alles`, 660 für `Neu` und
82 für `Mein Programm`. Der Textfilter fand den erst jenseits der ersten Seite
liegenden Titel `xXx: Return of Xander Cage` als genau einen Treffer. Die
reduzierte App-Nutzlast umfasste 226 Library-Identitäten und keine Notiz oder
Bewertung.

Der CI-unabhängige Datenweg wurde ohne Lab-Verzeichnis geprüft:

```sh
env -u KD_STREAMING_FINAL_USE_LAB_FIXTURE node streaming_progressive_integration_test.mjs
```

Auch dieser Lauf bestand 5/5 Prüfungen: 260 synthetische Titel, 78,8 ms
Projektionsaufbau, 43,2 ms für die erste und 43,4 ms für die folgende 20er-Seite,
maximal ein paralleler RPC. PostgreSQL-Daten- und Playwright-Ergebnisverzeichnisse
liegen über `node:os.tmpdir()`; der Unix-Socket verwendet innerhalb des
temporären Clusters einen kurzen Pfad.

Während der Abschlussprüfung ersetzte die aktuelle Nutzervorgabe die zunächst
gebaute Folgegröße und die Nachladebuttons: Der normale App-Pfad lädt Netzwerk-
und DOM-Daten nun automatisch in 20er-Paketen, solange der Bereich offen ist;
auch Entdecken erweitert seinen bestehenden Pool beim Scrollen automatisch um
20. Das Backend behält seinen allgemeinen RPC-Höchstwert 200, der normale
App-Controller nutzt dafür 20.

## Gewöhnliche Mock-Suite

Der kontrollierte Gesamtlauf wurde einmal mit

```sh
npm run test:streaming-progressive:final
```

gestartet. Er wurde nach konkreten Stopps nur ab der offenen Stelle fortgesetzt;
bereits grüne Abschnitte wurden nicht pauschal wiederholt:

- Die Pretest-Kette stoppte bei einer veralteten Kartenbeschriftungsassertion.
  Nach Übernahme des C-Deltas lief `node kartenlayout_test.mjs` mit 14/14; die
  verbleibende Kette von `node streaming_pin_neu_test.mjs` über
  `npm run test:kino-mobile-filter` war grün.
- `node motn_pg_test.mjs` lief außerhalb der Sandbox mit 16/16, nachdem die
  Sandbox den lokalen PostgreSQL-Shared-Memory-Start verhindert hatte.
- Der neue echte Integrationstest legte die frühere SQL-Laufzeit von mehr als
  120 Sekunden mit 226 Library-Einträgen offen. Nach Owner-As
  semantikerhaltendem Join-Delta bestand er mit den oben genannten 5/5 Werten.
- `node keychain_runner_test.mjs` stoppte zunächst korrekt mit
  `RELEASE_CLOSURE_DIRTY`, weil die neue `package.json`-Verdrahtung noch nicht
  committed war. Nach dem Commit bestand der gezielte Lauf mit 108/108.
- `node build-single.mjs && node strukturtest.mjs dist-single/Kinodreieck.html`
  bestand mit 13/13, nachdem der lokale Single-File-Build wieder mit seiner
  vorgesehenen Offline-Umgebung erzeugt worden war.
- Der verbleibende Haupttestabschnitt war grün. Der abschließende Online-Build
  lief mit
  `./node_modules/.bin/vite build && node tools/prepare-online-build.mjs && node pages_test.mjs`;
  der Pages-Test bestand 72/72.

Nach der abschließenden C-Änderung wurde die betroffene Single-File-Laufzeit
noch einmal schmal geprüft:

```sh
node build-single.mjs && node echtdatei_test.mjs dist-single/Kinodreieck.html
```

Ergebnis: 34/34 grün. Der Lauf blieb vollständig ohne HTTP-, Katalog- oder
Cachezugriff. Der von Owner C bereits fokussiert belegte
`entdecken_projection_index_test.mjs` ist zusätzlich in
`test:streaming-progressive` verdrahtet; er wurde im Abschlusslauf nicht
unnötig dupliziert.

## Mobiler Produktionsfluss

Das Browserbundle wurde explizit mit `VITE_APP_ENV=production`, synthetischer
Supabase-URL und synthetischem Publishable Key gebaut. Die Laufbedingung war
Chromium bei 393 × 852 CSS-Pixeln, CPU-Faktor 4, blockiertem Service Worker,
`Cache-Control: no-store`, synthetischem Konto und lokalem PostgreSQL-Adapter.
Alle nichtlokalen Requests wurden gemockt oder blockiert. Es gab keine Provider-,
Supabase- oder Cloudflare-Schreibwirkung.

Der Produktionsbuild und die beiden engen Fortsetzungen liefen mit:

```sh
VITE_APP_ENV=production VITE_APP_URL=https://kinodreieck.test \
  VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co \
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_progressive_final \
  ./node_modules/.bin/vite build
KD_STREAMING_FINAL_USE_LAB_FIXTURE=1 KD_STREAMING_FINAL_START_GATE_ONLY=1 \
  ./node_modules/.bin/playwright test --config=playwright.streaming-progressive-final.config.mjs
KD_STREAMING_FINAL_USE_LAB_FIXTURE=1 KD_STREAMING_FINAL_DISCOVER_ONLY=1 \
  ./node_modules/.bin/playwright test --config=playwright.streaming-progressive-final.config.mjs
```

Beide gezielten Playwright-Läufe bestanden 1/1. Der letzte Vite-Build lief in
994 ms und erzeugte unter anderem `index-Oox0fRfx.js` sowie die aktualisierten
App-Layer; der Entdecken-Lauf verwendete genau dieses Bundle.

Die folgende Tabelle verbindet den kontrollierten vollständigen Browserlauf
mit den ausschließlich betroffenen Fortsetzungen für Startreihenfolge und
Entdecken-Index. Die übrigen grünen Abschnitte wurden nach den beiden Deltas
nicht pauschal wiederholt:

| Schritt | Wandzeit | Task | Script | Layout | längster Task | RPCs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Direkter Start bis erste 20 `Alles`-Karten | 3.522 ms | 2.762 ms | 1.070 ms | 88 ms | 565 ms | 5 |
| automatische DOM-Portion 20 → 40 | 232 ms | 104 ms | 15 ms | 3 ms | 0 ms | 1 |
| erster Wechsel `Alles` → `Neu` | 1.166 ms | 838 ms | 629 ms | 3 ms | 447 ms | 2 |
| Sitzungsrückkehr `Neu` → `Alles` | 160 ms | 114 ms | 19 ms | 4 ms | 0 ms | 1 |
| vollständiger X-Filter, 17 Treffer | 1.242 ms | 895 ms | 692 ms | 17 ms | 484 ms | 2 |
| Verlassen/Rückkehr zum fertigen Filter | 1.117 ms | 246 ms | 81 ms | 16 ms | 0 ms | 0 |
| Reload mit Cache vor verzögerter Hintergrundantwort | 3.122 ms | 0 ms | 0 ms | 0 ms | 505 ms | 4 |
| Entdecken Erstbesuch, automatisch 20 → 40 | 2.245 ms | 1.943 ms | 1.691 ms | 12 ms | 1.004 ms | 3 |
| Entdecken → Streaming | 463 ms | 139 ms | 42 ms | 8 ms | 0 ms | 0 |
| Entdecken-Sitzungsrückkehr mit 40 | 509 ms | 242 ms | 108 ms | 6 ms | 89 ms | 1 |

`Alles` meldete den vollständigen Bestand von 8.806 bei zunächst 20 Karten;
Scrollen erweiterte den DOM automatisch und ohne Datenknopf auf 40. Alle
normalen Folgeseiten verwendeten Limit 20 und höchstens einen gleichzeitigen
Aufruf pro Query. Der erste Wechsel zu `Neu` ist eine neue Query; die Rückkehr
zu `Alles` verwendete sofort die sitzungsgebundene 40er-Portion und startete
keinen Cursor-null-Vollstart. Ein noch unvollständiger Sitzungsrecord darf dabei
im Hintergrund weitere Cursorseiten laden. Der fertige 17-Treffer-X-Filter
blieb über Verlassen und Rückkehr ohne zusätzlichen RPC erhalten. Entdecken
zeigte 20 bestehende Empfehlungen und nach Scrollen automatisch 40; die
Rückkehr bewahrte diese Portion.

Der erste vollständige Lauf hatte für den kombinierten Entdecken-Abschnitt
14.621 ms Wandzeit, 13.396 ms Scriptzeit und einen längsten Task von 6.774 ms
gemessen. Der PerformanceObserver wurde nach jedem Schritt geleert; das war
keine Reload-Altlast. Dieser Befund führte zum neutralen Projektionsindex. Im
gezielten finalen Lauf brauchten dieselben drei Nutzeraktionen zusammen
3.217 ms Wandzeit und 1.841 ms Scriptzeit; der längste Task sank auf 1.004 ms.
Der neu verdrahtete Index enthält weder Profil-, Status- noch Rankingcache;
Owner Cs große neutrale Alt-/Neu-Paritätsprobe blieb für 24.678 Kandidaten und
50 Feedfälle bytegleich. Der verbleibende rund einsekündige Longtask unter
CPU-Faktor 4 ist eine sichtbare lokale Laborgrenze; der Bericht behauptet weder
Longtaskfreiheit noch eine daraus abgeleitete iPhone-Latenz.

Die Laufzeiten sind lokale Laborwerte. Der Browseradapter startet für jeden RPC
einen lokalen `psql`-Kindprozess; Wandzeiten dürfen deshalb nicht als iPhone-
oder Produktionslatenz gelesen werden. Die frühere Basis `cfcaae6` maß mit
einem anderen Startweg und 200 statt 20 Karten 11,577 s kalt, 3,269 s für
`Alles` → `Neu`, 3,578 s zurück, 11,076 s nach Verlassen/Rückkehr und 12,249 s
nach Reload. Nur die warmen Wechsel sind näherungsweise vergleichbar; der neue
kalte Messpunkt startet direkt in Streaming und endet nach 20 Karten.

Die Produktionsdarstellung enthielt außerhalb Datenschutz keine Nennung von
Movie of the Night, MotN, Watchmode, FlixPatrol, Anthropic oder einen technischen
Katalog-/Datenstand. Der vollständige Known-Read einschließlich MotN-Anhang
bleibt absichtlich bestehen. Im finalen direkten Startbeleg begann er 112 ms
nach der ersten echten Seitenantwort; diese lieferte 20 von 8.806 `Alles`-
Treffern.

Für Konten mit freigeschaltetem Cage-Easteregg bleibt außerdem dessen einmaliger
vollständiger Poolaufbau einschließlich Entdecken-Katalog vorgesehen. Die
progressive Startseite verschiebt diesen Abruf hinter die erste Seite, beseitigt
ihn für diese Konten aber nicht. Die Diagnose des offenen Startrests ordnete den
vorzeitigen Vollabruf genau diesem Cage-Vorlader zu; die temporären
Caller-/Gate-Logs wurden nach der Probe bytegenau aus `src/App.jsx` entfernt und
nicht committed.

## Auslieferungsgrenze

Der Workflow `.github/workflows/deploy.yml` führt Webtests, Build und
Cloudflare-Auslieferung aus, aber keine SQL-Migration. Bei einer später
autorisierten Veröffentlichung muss deshalb zuerst die neue SQL-Migration und
danach das Frontend ausgerollt werden. Fehlt das RPC, besitzt der Client den
begrenzten Legacy-Fallback; das ersetzt keine Migration. Remote-Migration,
Push, CI, Deploy, Produktionsreadback und physische iPhone-/PWA-Abnahme bleiben
unbelegt.
