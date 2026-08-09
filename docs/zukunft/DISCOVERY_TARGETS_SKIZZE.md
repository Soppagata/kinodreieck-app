# Plan: Personen direkt im Radar – getrennte Discovery-Schicht

Stand: 09.08.2026
Audit-Scope: `FUTURE_PLAN_METADATA_ONLY`
Bezug: `RADAR_BEOBACHTUNGEN_PLAN.md` (bleibt die maßgebliche Planautorität)

> **Status: Personen-Automatik nach Pflichtspike geparkt – nicht implementiert.**
> Diese Skizze ist aus Rollen-v1, der privaten Demo-Schlussabnahme und dem
> abgeschlossenen Audit-/Cleanup-Scope ausgeschlossen. Der Pflichtspike vom
> 09.08.2026 erreichte nur 50 % Recall. Max hat die Personen-Automatik deshalb
> am selben Tag geparkt. Die Skizze bleibt als möglicher späterer Vertrag
> erhalten, gehört aber nicht in Phase 2. Der Event-Radarplan wird nicht ersetzt.

## 1. Auslösende Fragen

1. Kann man im Radar eine **Person** beobachten – etwa „beobachte alle Inhalte
   von Robert Rodriguez"?
2. Wie weit werden **Sonstige**-Einträge berücksichtigt? Können Bücher oder
   Videospiele im Bestand dazu führen, dass ihre **Verfilmungen** bevorzugt
   behandelt werden?

Kurzantwort: Beides ist heute nicht möglich. **Personen werden jetzt für den
ersten Radar-Bau eingeplant und stehen nach Bestätigung direkt in „Mein
Radar“.** Buch-/Spiel-Adaptionen bleiben eine spätere Anwendung derselben
Architektur und sind nicht Teil dieses Bauauftrags.

## 2. Ist-Stand – gilt nur für die Erstellungsreferenz

Alle Aussagen sind gegen den dann aktuellen Stand in Phase 0 neu zu belegen.

| Befund | Beleg |
|---|---|
| Beobachtung akzeptiert ausschließlich positive Integer-Watchmode-IDs; Personen sind strukturell nicht abbildbar | `src/services/seriesWatch.js`, `normalisiereBeobachteteIds` |
| Der Radar-Plan kennt Zieltyp `work`, `series`, `franchise` – **kein `person`** | `RADAR_BEOBACHTUNGEN_PLAN.md` §6.2 |
| Freitext darf erst nach kanonischer Auflösung Ziel werden; „unbestätigtes fuzzy Titelraten" ist ausdrückliches Nicht-Ziel | ebenda §4, §6.2 |
| Regie-Namen sind **heute schon** Suchsignal im Finder: Treffer boostet, „verlangt" wirkt als harter Filter | `src/lib/finder.js`, Regie-/Reihen-Signal und `bekannteReihen()` |
| Diese Namen stammen aus einem Wikidata-Sidecar, das an den Finder-Master gemergt wird | `src/data/master_wikidata.json` über `src/controllers/libraryController.js`; Erzeugung in `tools/wikidata.js` |
| Eine Person kann bereits als Bestandseintrag existieren (`art: "Persönlichkeit · Regisseur:In"`, `kategorie: "person"`) | `src/components/EintragForm.jsx`, `src/components/MedienForm.jsx` |
| `Sonstiges` trägt hart `bewertung: null` und wirkt in keinem Ranking-Pfad; `hatDreieck` steuert nur UI, Formulare und Export | `src/lib/typen.js` (`OHNE_DREIECK`); kein Aufruf in `finder.js`, `prognose.js`, `passung.js` |
| Buch- und Spieltermine sind bereits als Release-Evidenz ausgeschlossen – über Buch → Verfilmung sagt der Plan nichts | `RADAR_BEOBACHTUNGEN_PLAN.md` §11, blockierende Beispiele |

**Zusammengefasst:** Person als Suchbegriff über den *eigenen Bestand*
existiert. Person als *prospektives Abo* fehlt. Genau diese Brücke soll der
nächste Bau ergänzen; der Ist-Stand wird dadurch noch nicht vorweggenommen.

## 3. Kernproblem: `person` ist kein vierter Zieltyp

Der naheliegende Weg wäre, `person` als vierten Wert neben `work`, `series`
und `franchise` in `kd_radar_targets` zu ergänzen. Das bricht drei tragende
Zusagen des bestehenden Plans:

1. **Ereigniskatalog passt nicht.** Der geschlossene MVP-Katalog lautet
   `kinostart_at`, `streamingstart_at`, `serienstart`, `staffelstart`. „Person
   arbeitet an etwas Neuem" ist keiner davon und wäre ein fünfter, deutlich
   unschärferer Ereignistyp mit eigenem Evidenzproblem (Anbahnungs- und
   Gerüchtemeldungen sind keine belegten Fakten).
2. **Globale Deduplizierung bricht.** Dasselbe Ereignis „Film X, Kinostart AT"
   entstünde einmal über das Werk-Ziel und einmal über das Personen-Ziel.
   Genau das ist unter „Ein Ereignis je Account separat speichern oder suchen"
   bereits verworfen – hier in anderer Gestalt.
3. **Kostenzaun bricht.** Ein Werk-Ziel ist mengenmäßig genau eins. Ein
   Personen-Ziel ist nach oben offen. Ein 10er-Limit, das zehn Ziele meint,
   deckt dann nicht mehr zehn Prüfeinheiten.

## 4. Vorschlag: Discovery-Target als eigene Schicht

Ein Zieltyp, der **selbst keine Ereignisse trägt, sondern andere Ziele
entdeckt**.

```text
Discovery-Target            Person · Schauspiel oder Regie
        │
        │ Auflösung -> Kandidatenwerke (deterministisch, mit Bestätigung)
        ▼
Event-Target                work | series | franchise      (unverändert)
        │
        │ bestehendes Evidenz-Gate, bestehende Dedup, bestehender Katalog
        ▼
kd_radar_events / _event_versions                          (unverändert)
```

Das persönliche Abo hängt am Discovery-Target und erscheint sofort als
Personenzeile in **Mein Radar**. Es darf Werk-Ziele nur **vorschlagen**, nicht
transitiv aktivieren. Erst die Einzelbestätigung eines vorgeschlagenen Werks
erzeugt ein reguläres Werk-Abo. Ereigniskatalog, Deduplizierung,
Evidenzregeln und Kalendervertrag bleiben damit unangetastet – genau das, was
ein gleichrangiger vierter Event-Zieltyp zerstören würde.

### 4.1 Was ein Discovery-Target ausdrücklich nicht tut

- Es erzeugt kein Ereignis und keine Eventversion.
- Es erzeugt keinen Kalendereintrag und keinen Reminder.
- Es erzeugt keine Geschmackspräferenz (bestehende harte Regel, unverändert).
- Es löst keine Websuche gegen den teuren Kanal aus, solange der
  deterministische Weg trägt (siehe §5).

### 4.2 Auflösungsvertrag

Analog zur bestehenden Regel „Freitext darf erst nach kanonischer Auflösung
zum wiederkehrenden Ziel werden":

1. Die globale Suche bietet bei einem Personen-Treffer **Ins Radar** an; den
   kostenlosen Status **Beobachten** gibt es für Personen nicht.
2. Die Person wird kanonisch aufgelöst (stabile externe ID). Mehrdeutigkeit –
   Namensgleichheit, mehrere Rollen – bleibt blockiert statt geraten.
3. Die Vorschau zeigt Name, belegte Rolle `Schauspiel` oder `Regie`, Quota und
   die private beziehungsweise freiwillig freigegebene Sichtbarkeit.
4. Bewusste Bestätigung legt das Personen-Abo an und zeigt es direkt in
   **Mein Radar**.
5. Neu entdeckte Kandidatenwerke erscheinen später einzeln mit **Werk ins
   Radar** oder **Verwerfen**.
6. Getrennt und nie vorausgewählt: „Auch als Vorliebe merken".

Neu entdeckte Kandidatenwerke nach der Anlage werden **nicht still** aktiv,
sondern erscheinen als bestätigungspflichtiger Vorschlag. Andernfalls würde ein
einziges Abo unbemerkt Prüfeinheiten und Kosten aufmachen.

### 4.3 Rollenschärfe bei Personen

Der Bestand kennt bereits die Rollen `Regisseur:In`, `Schauspieler:In`,
`Komponist:In`, `Drehbuch:In`, `Sonstige`. Falls die Personen-Automatik nach
einem neuen Spike wieder geöffnet wird, erlaubt ihr erster Scope ausschließlich
`Regie` und `Schauspiel`. Ein Personen-Abo ohne Rollenangabe wäre
unterspezifiziert. Die Identität lautet deshalb `(person_id, role)`; bei einer
Person mit mehreren belegten Rollen wählt der Nutzer bewusst. Komposition,
Drehbuch und sonstige Rollen brauchen später einen eigenen Nutzen-/Kostencheck.

## 5. Bücher und Spiele bleiben derselbe Mechanismus – aber geparkt

Ein Buch- oder Videospiel-Eintrag wäre ein Nicht-Film-Werk mit einer
Adaptionsbeziehung zu einem Film. Damit ist es ein Discovery-Target wie eine
Person: es entdeckt Werk-Ziele, es trägt selbst keine Ereignisse. Der
bestehende Ausschluss von Buch- und Spielterminen als Release-Evidenz bleibt
davon unberührt – er betrifft Termine, nicht Beziehungen. Diese Anwendung wird
im ersten Bau weder modelliert noch in der Oberfläche angeboten.

### 5.1 „Bevorzugt" trifft zwei verschiedene Systeme

| Lesart | Bewertung |
|---|---|
| **Radar** – die Verfilmung eines Buchs im Bestand wird beobachtet | passt architektonisch, deterministisch auflösbar, Kandidat für die Erweiterung |
| **Ranking** – die Verfilmung wird in Finder/Empfehlung höher gewichtet | kollidiert mit der harten Regel „Beobachtung erzeugt keine automatische Geschmackspräferenz" |

Gegen die Ranking-Lesart kommt ein zweites, unabhängiges Argument hinzu:
`Sonstiges` trägt hart `bewertung: null`. Ein Buch im Bestand ist ein binäres
„existiert", keine Präferenzstärke. Es gibt schlicht keinen Wert, aus dem sich
ein Boost ableiten ließe. Fachlich ist die Richtung außerdem nicht einmal
sicher positiv: Ablehnung der Verfilmung eines geschätzten Buchs ist ein
verbreitetes Muster.

**Vorgeschlagene Auflösung:** die Adaptionsbeziehung wird als sichtbarer
Kontexthinweis geführt („Basiert auf einem Buch in deinem Bestand"), nicht als
stiller Ranking-Boost. Eine Gewichtung entsteht nur nach ausdrücklicher
Bestätigung – konsistent mit der bestehenden Trennung von Beobachtung und
Vorliebe.

## 6. Deterministisch vor Websuche

Filmografien und Adaptionsbeziehungen sind strukturierte Daten. Wikidata führt
sie als eigene Aussagen (Regie, „based on"), und das Projekt nutzt Wikidata
bereits über `tools/wikidata.js` und das Master-Sidecar.

Eine Websuche „was macht Person X als nächstes" wäre genau der teure,
unpräzise, modellabhängige Pfad, den der Radar-Plan für Werke schon bewusst
minimiert. Kanonische Person, Rolle und kommende Projekte werden deshalb
zuerst über eine strukturierte, rechtlich erlaubte Quelle aufgelöst. Eine
Personenroutine darf global dedupliziert neue **Werk-Kandidaten** erzeugen,
aber weder ein Ereignis bestätigen noch ein Werk-Abo aktivieren. Die teure
Eventsuche beginnt erst, nachdem der Nutzer ein Werk einzeln ins Radar nimmt.

Reicht die strukturierte Abdeckung nicht, wird nicht still auf generische
Codex-/Claude-/Tavily-Websuche pro Person umgeschaltet. Ein solcher Pfad wäre
eine eigene Quellen-, Qualitäts- und Kostenentscheidung. Bis dahin darf eine
Person im Radar sichtbar bleiben und ehrlich „noch keine bestätigten Projekte"
anzeigen.

**Ungeprüfte Annahme, spike-pflichtig:** ob die Abdeckung angekündigter,
unproduzierter oder gerade erst besetzter Projekte für einen brauchbaren
Radar ausreicht. Genau dort ist die Datenlage strukturierter Quellen
typischerweise am dünnsten – und genau dort liegt der Produktnutzen. Diese
Frage entscheidet über die Machbarkeit der ganzen Erweiterung und wird
empirisch beantwortet, nicht argumentativ (siehe §9).

## 7. Fan-out, Limit und Kosten

Für den ersten Bau gilt der einfache, kostenfeste Vertrag:

- Jedes aktive Personen-Abo zählt als **ein** Eintrag des normalen
  Zehnerlimits.
- Ein Werk-Kandidat erzeugt noch keinen Webradar-Check und zählt noch nicht.
- Erst die einzelne Aktion **Werk ins Radar** erzeugt ein reguläres Werk-Abo;
  dieses zählt als weiterer Eintrag desselben Zehnerlimits.
- Keine Sammelbestätigung, kein automatisch transitives Abo und kein
  verstecktes Fan-out-Budget.
- Max' separate `radar_unlimited`-Capability hebt nur das fachliche
  Eintragslimit auf, niemals Quellen-, Request-, Lauf- oder Monatszäune.

Der providerweite Circuit-Breaker und der gemeinsame Kostenledger gelten
unverändert. Ein Discovery-Target darf keinen eigenen Zähler und keine eigene
Retry-Logik bekommen.

## 8. Benennung

**Entschieden (09.08.2026): „Radar" wird der sichtbare Sammelname.** Das
bisherige „Serienradar" verschwindet als eigenständiger Produktbegriff.

Die Entscheidung trägt eine Auflage, weil §7 des Radar-Plans die beiden
Verträge bewusst hart trennt – `kd_series_watch` und `kd_radar_*` haben
unterschiedliche Limits, Kosten und Datenschutzprofile. Ein gemeinsamer Name
über getrennte Verträge ist nur zulässig, wenn die Oberfläche die Zeilentypen
sichtbar unterscheidet und erklärbar macht, warum die eine Beobachtung gegen
ein Limit zählt und die andere nicht. Ohne diese Unterscheidung wird der
Unterschied für den Nutzer zu einem unerklärlichen Zufall.

Die Benennung ändert **keine** Datenstruktur, keine Tabelle und keinen
Speicherschlüssel. Sie ist eine reine Oberflächenentscheidung.

## 9. Pflicht-Spikes vor jeder Umsetzung

Timeboxt, empirisch, gegen echte Payloads – nicht gegen Dokumentation.

1. **Abdeckung Personenfilmografie:** für eine kleine Menge realer Namen aus
   Schauspiel und Regie prüfen, wie viele kommende beziehungsweise angekündigte
   Projekte die deterministische Quelle tatsächlich führt und mit welchem
   zeitlichen Verzug.
   Ergebnis entscheidet über Machbarkeit, nicht über Ausgestaltung.
2. **Fan-out-Messung:** wie viele Werk-Kandidaten erzeugt ein typisches Personen-Abo
   real? Ohne diese Zahl ist keine Limitentscheidung belastbar.
3. **Mehrdeutigkeit:** Anteil der Namen, die nicht eindeutig auflösbar sind.
   Bestimmt, wie oft der blockierende Pfad in der Praxis greift.

Der Spike beginnt mit vorhandenen lokalen Fixtures und wenigen namentlich
festgelegten Beispielen wie Nicolas Cage und Robert Rodriguez. Ein echter
Providerabruf benötigt vorher Rechte-/Payloadprüfung und bei potenziellen
Kosten einen eigenen STOP. Buch-/Spiel-Adaptionen erhalten keinen Mitlauf im
Personenspike.

## 10. Kollisionen mit bereits getroffenen Entscheidungen

| Bestehende Entscheidung | Verhältnis zu dieser Skizze |
|---|---|
| „Beobachtung erzeugt keine automatische Geschmackspräferenz" | bleibt unverändert; §5.1 folgt ihr ausdrücklich |
| „Vollständiger automatischer Franchise-Wissensgraph" ist Nicht-Ziel | Discovery-Targets sind ein begrenzter, bestätigungspflichtiger Sonderfall – kein Wissensgraph. Die Grenze muss beim Bau ausdrücklich gehalten werden, sonst wächst das eine ins andere. |
| „Ein Ereignis je Account separat speichern oder suchen" ist verworfen | §3 Punkt 2 ist derselbe Fehler in anderer Gestalt und wird deshalb vermieden |
| „Ein globaler Check-Key wird pro Fälligkeit höchstens einmal gesucht" | abgeleitete Werk-Ziele teilen sich den Check-Key mit direkt abonnierten Werk-Zielen; kein zweiter Suchpfad |
| Normale Konten: maximal zehn aktive Radar-Einträge | §7 hält die Grenze: Person zählt einmal, Kandidat zählt nicht, bestätigtes Werk zählt als eigener Eintrag |

## 11. Nicht-Ziele dieser Skizze

- Kein Ereignistyp „neues Projekt angekündigt" für Personen im MVP.
- Keine automatische Übernahme bestehender `Persönlichkeit`-Einträge aus der
  Mediathek in Radar-Abos.
- Keine Buch-, Videospiel-, Studio-, Theaterstück-, Kompositions- oder
  Drehbuch-Discovery im ersten Bau.
- Keine generische Web-/LLM-Suche je Person und keine automatische
  Sammelübernahme ihrer Projekte.
- Keine Bewertungsachsen für `Sonstiges`; `OHNE_DREIECK` bleibt unverändert.
- Kein Ranking-Boost ohne ausdrückliche Bestätigung.
- Keine Änderung an Finder, Prognose oder Passung.

## 12. Entschieden und verbleibende Bau-Gates

Die ursprüngliche Produktentscheidung sah Personen direkt im Radar vor. Das
empirische Bau-Gate ist jedoch gescheitert: Wikidata erreichte im Pflichtspike
nur 50 % Recall und keinen der beiden Rodriguez-Pflichttreffer. Deshalb ist die
Personen-Automatik geparkt und nicht Teil von Phase 2.

Vor echtem Bau bleiben zwei empirische Gates:

1. Liefert die erlaubte strukturierte Quelle angekündigte Projekte mit
   ausreichender Abdeckung und stabilen Personen-/Werk-IDs?
2. Bleiben Mehrdeutigkeit und Kandidatenmenge im gemessenen Spike so klein,
   dass Vorschau, Review und Betrieb für den Elf-Konten-Pilot praktikabel sind?

Wieder geöffnet wird sie nur nach einem neuen Owner-STOP und einem rechtlich wie
technisch geprüften Quellen- oder Scope-Spike, der die dann festgelegten Gates
besteht. Ein Featureflag allein kann das Parkschloss nicht aufheben. Der
Event-Radar wird ohne Personenpfad weitergebaut; ein bezahlter oder generischer
Websuchpfad wird nicht automatisch zum Ersatz.
