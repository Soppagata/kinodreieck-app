# Befund: Entdecken-Tab und Radar

Stand: 22.08.2026 · Analysebasis: `codex/radar-product-finish` @ `6080562`
Live geprüft: `https://staging.kinodreieck.at/build-meta.json` meldet
`buildVersion 6080562dafb5f6d2fc45d97843d8a00eb29eeb6c`, `appEnvironment staging`
→ **der ausgelieferte Staging-Stand ist tatsächlich `6080562`.** Das war die einzige
Behauptung aus dem Handoff, die ich direkt gegen die Live-Umgebung belegen konnte.

Nur gelesen, nichts geändert: keine Datei im Repo angefasst, kein Branch gewechselt,
kein Commit, kein Deploy.

---

## 1. Analyse

### 1.1 Lage der Arbeitskopie (vor allem anderen klären)

| Fakt | Wert |
|---|---|
| Ausgecheckter Branch | `codex/entdecken-tagesfeed-etappe3` — **nicht** der ausgelieferte Branch |
| Uncommittete Änderungen | 8 geänderte Dateien (u. a. `src/tabs/EntdeckenTab.jsx`, `src/lib/entdeckenUi.js`, `src/index.css`, `GlobalSearchBar.jsx`, `tools/entdecken_daily_live.mjs`) + 2 unversionierte Dateien |
| Verhältnis der Branches | gemeinsamer Vorfahr `fc1cd6b`; danach **7 Commits** auf etappe3 gegen **27 Commits** auf `codex/radar-product-finish` |
| `origin/staging` | steht auf `2596b7a` und enthält `6080562` **nicht** — Staging wurde per `workflow_dispatch` aus dem Feature-Branch deployt, nicht über einen Push auf `staging` |

**Risiko:** Wer jetzt auf dieser Arbeitskopie „einfach weiterarbeitet“, baut auf dem
überholten Zweig und auf ungesicherten Änderungen. Der erste Handgriff ist, diese
8 Dateien zu sichern (Stash oder Wegwerf-Commit) und auf `codex/radar-product-finish`
zu wechseln — nicht die etappe3-Änderungen blind übernehmen.

### 1.2 Wie „Entdecken“ tatsächlich gebaut ist

Der Menü-Tab „Entdecken“ läuft intern weiter unter dem Key `tab === "blog"`
(`App.jsx:2069`) und rendert `EntdeckenTab` mit drei Unteransichten:
`Empfehlungen | Radar | Blog` plus Zahnrad „Entdecken verwalten“.

Datenpfad je Ansicht:

```
Empfehlungen
  streamingDiscover (12.540 Titel) + streamingKnown (100 bewertete)
      → localRecommendationCandidates()        entdeckenUi.js:266
      → rankRecommendations()                  recommendationRanking.js
      → selectDailyRecommendations()           Tagesrotation aus Top 20
  webDiscoveryFeed  ← useWebDiscoveryFeed → entdeckenDailyFeedService.load()
      → GET functions/v1/entdecken-daily-task
      → matchWebDiscoveryFeed()  → Abschnitt „Weitere Entdeckungen“

Radar
  Werk:   Katalogsuche → Auswahl → onRadarPreview → RadarSubscriptionPreview
          → bestaetigeRadarVorschau → lokale Outbox → radarPilotService.sync()
          → RPCs kd_radar_pilot_*
  Person: searchPersonRadarCatalog() (5 fest einprogrammierte Personen)
          → fuegePersonRadarHinzu → Outbox → sync
  Prüfen: „Jetzt prüfen“ → radarWebsearchService.checkNow/checkPersonNow
          → POST functions/v1/radar-websearch-task
```

Drei Schalterebenen, alle unabhängig voneinander:

1. **Build-Flags** (`src/config/runtime.js`), gesetzt in `deploy.yml` aus GitHub-Variablen:
   `VITE_RADAR_PILOT_CLIENT_ENABLED` ← `vars.STAGING_RADAR_PILOT_CLIENT_ENABLED`,
   `VITE_ENTDECKEN_DAILY_FEED_ENABLED` ← `vars.STAGING_ENTDECKEN_DAILY_FEED_ENABLED`.
2. **Konto-Capabilities** aus der Session: bestätigte `owner`-Rolle, `personalAi`,
   und der aus dem Pilot-Feed gelesene `radarReview`.
3. **Serverflags** `radar_aktiv`, `radar_scheduler_aktiv`, `radar_provider_aktiv`,
   `radar_proposal_import_aktiv`, `radar_shares_aktiv` (laut deinem Handoff alle aus).

Nebenbefund: `src/config/entdeckenFlags.js` (`VITE_RADAR_UI_ENABLED` usw.) wird
**ausschließlich von `radar_contract_test.mjs` benutzt** — im Produktivcode kommt die
Datei nirgends vor. Diese fünf Flags sind tote Konfiguration und dürfen bei der
Fehlersuche nicht als Erklärung herhalten.

---

## 2. Die fünf Live-Befunde, einzeln

### B1 · Persönliche Empfehlungen sind leer bzw. immer dieselben — **belegt, härtester Befund**

Das ist kein Anzeigefehler und kein Rotationsfehler. Die Empfehlungsstrecke hat
**keine Merkmalsdaten**, aus denen sie eine Begründung bilden könnte.

`rankRecommendations` lässt nur Kandidaten durch, die mindestens einen Grund haben
(`reasoned = hardEligible.filter(row => row.analysis.reasons.length > 0)`,
`recommendationRanking.js:171`). Gründe entstehen nur aus **Genre, Tag oder
Franchise** des Kandidaten. Und genau die fehlen im echten Katalog:

Messung gegen `dist-single-beta/streaming_entdecken.json` (12.540 Titel, Region AT):

```
genres gefüllt:            0 von 12.540
genre gefüllt:             0
tags gefüllt:              0
franchise_id gefüllt:      0
relevanz_signale gefüllt:  12.477   → einzige vorkommende Art: "jahrzehnt"
```

`structuredCatalogAttributes()` (`entdeckenUi.js:248`) parst `relevanz_signale` und
verwirft jede Art, die nicht in `PROFIL_ATTRIBUT_ARTEN` steht. Diese Liste enthält
`epoche` — aber **nicht `jahrzehnt`**. Die einzige real gefüllte Signalart wird also
still weggeworfen. Ergebnis: alle 12.540 Entdecken-Titel kommen mit
`genres: [], tags: [], franchiseId: null` in das Ranking und können nie einen Grund
erzeugen.

Was übrig bleibt: `localRecommendationCandidates` merged `streamingKnown` über die
`watchmode_id` in denselben Topf. Und `streaming_bekannt.json` — deine 100 bereits
bewerteten Titel — trägt als einziger Bestand ein Feld `genre`. **Die „persönliche
Passung“ kann daher strukturell nur Titel vorschlagen, die du längst bewertet hast.**
Das ist exakt das, was du als „die gleichen Einträge aus dem Streamingbereich“ siehst.

Gegenprobe, gefahren mit dem echten Katalog gegen den `6080562`-Code, mit einem
absichtlich großzügigen Profil (4 starke Signale) und 2 hoch bewerteten Mediathek-Einträgen:

```
Kandidaten nach Dienstefilter:            6.240
davon mit Genre/Tag/Franchise:               54   (0,9 % — alle aus streaming_bekannt)
Trichter: serviceAvailable 6.240 → hardEligible 6.240 → reasoned 16 → personal 16
angezeigt:                                    6   (One Hour Photo, Face/Off, Kill Bill 1+2, Scarface, Watchmen)
```

Mit einem realistischeren, dünneren Profil fällt `reasoned` unter 6 — und dann greift
`selectDailyRecommendations` gar nicht mehr (`ranked.length <= safeLimit` → früher
Rückgabe, `entdeckenUi.js:468`). **Die Tagesrotation ist nicht kaputt; sie hat schlicht
nichts zu rotieren.** Der Schalter `entdeckenTaeglich` ist übrigens per Default an
(`normalisiereEntdeckenTaeglich` gibt `wert !== false` zurück) — dort liegt der Fehler nicht.

Warum die Tests das nicht sehen: die Fixtures in `entdecken_phase3_test.mjs:143 ff.`
setzen `genres: ["drama"]`. Diese Datenform existiert im Produktivkatalog nicht. Die
Suite ist grün gegen eine Welt, die es nicht gibt.

Bereits im Juli dokumentiert und bewusst nicht behoben:
`claude/uebergabe_codex_etappe7_2026-07-28.md`, §7 — *„`genres` ist bei allen 12.540
Entdecken-Titeln `null`“*. Der Befund ist alt; die Empfehlungsstrecke wurde später
darauf gebaut, ohne ihn zu berücksichtigen.

Ergänzend: auch der mitgelieferte Ersatzstand `src/data/streaming_entdecken_snapshot.json`
(3 Titel) hat `genres: null` — solange der Vollkatalog lädt, ist die Liste ebenfalls leer.

### B2 · Personensuche zeigt scheinbar nur Nicolas Cage — **belegt, kein Backend-Problem**

`src/lib/personRadarCatalog.js` ist eine fest einprogrammierte 5-Zeilen-Liste:

| Name | Rolle |
|---|---|
| Nicolas Cage | actor |
| Greta Gerwig | actor |
| Greta Gerwig | director |
| Robert Rodriguez | director |
| Alfred Hitchcock | director |

Die Suche filtert **hart auf die im Dropdown gewählte Rolle**
(`searchPersonRadarCatalog`, Zeile ~62: `nameMatches.filter(entry => entry.role === role)`).
Das Rollen-Dropdown startet auf **„Schauspiel“**. Damit gilt im Auslieferungszustand:

- „Nicolas Cage“ → Treffer
- „Greta Gerwig“ → Treffer (sie steht doppelt drin)
- „Hitchcock“, „Rodriguez“ → Status `role_mismatch`, sichtbarer Text
  *„Name gefunden, aber nicht in der gewählten Rolle.“*

Es ist also kein Index-, DB- oder Deployfehler: Regie-Personen erscheinen erst, wenn
das Dropdown vorher auf „Regie“ gestellt wird. Das ist ein Bedienfehler-Provokateur,
kein Defekt — die Reihenfolge (erst Rolle, dann Name) ist im UI nirgends gesagt.

### B3 · „Ins Radar“ reagiert beim einzigen sichtbaren Eintrag nicht — **sehr wahrscheinlich, zwei Kandidaten**

Der Knopf im Personen-Panel ist
`disabled={!personRadarAvailable || !selectedPerson || personAddBusy}`
(`EntdeckenTab.jsx`, Personenpanel). Ein deaktivierter Knopf gibt keinerlei Rückmeldung —
das Symptom „passiert nichts“ ist genau das.

Zwei mögliche Ursachen, beide passen:

1. **`selectedPerson` ist leer.** Der Treffer erscheint in einem *zweiten* Auswahlfeld
   („Person auswählen“). Wer nur tippt und dann auf „Ins Radar“ drückt, ohne im zweiten
   Feld auszuwählen, klickt gegen einen toten Knopf. Das ist der wahrscheinlichere Fall.
2. **`personRadarAvailable` ist false.** Bedingung:
   `radarAuthority === "guest" || (remoteKontoAktiv && session.capabilities.personalAi === true)`
   (`useEntdeckenRadarController.js`). Fehlt am Staging-Konto `personalAi`, ist der Knopf
   dauerhaft tot; darüber steht dann der Satz *„Die lokale Personensuche funktioniert.
   Hinzufügen ist in diesem Konto noch nicht freigeschaltet.“* — dieser Satz ist die
   Unterscheidungshilfe: **steht er da → Fall 2, steht er nicht da → Fall 1.**

Der Werk-Pfad ist davon unabhängig und im Code vollständig verdrahtet
(`onRadarPreview={setRadarPreviewTarget}` → `RadarSubscriptionPreview` →
`bestaetigeRadarVorschau`). Er schreibt zuerst rein lokal.

### B4 · Es erscheinen keine Radar-Ergebnisse — **Gate-Kette belegt, greifendes Gate offen**

„Jetzt prüfen“ wird überhaupt nur gerendert, wenn:

```
radarCheckAvailable = !SINGLE_FILE
                   && remoteKontoAktiv
                   && radarAuthority === "account-cache"
                   && radarPilotProjection.active === true      ← braucht radarPilotClientEnabled
                                                                  UND radarState.pilot.status === "ready"
                   && radarPilotProjection.radarReview === true ← braucht Capability radar_review
```

Zusätzlich prüft der Service selbst noch einmal:
`config.radarPilotClientEnabled !== true → { status: "forbidden" }` (`radarWebsearch.js`).

**Der kritische Punkt: dein Handoff nennt nur `STAGING_ENTDECKEN_DAILY_FEED_ENABLED=true`.
Über `STAGING_RADAR_PILOT_CLIENT_ENABLED` steht dort nichts.** Ist diese GitHub-Variable
nicht `true`, dann gilt im Staging-Build:

- `radarPilotSyncStatus` startet auf `"disabled"`,
- `syncRadarPilot()` kehrt sofort mit `{status: "disabled"}` zurück, ohne je einen RPC zu senden,
- der Knopf „Änderung bestätigen“ meldet folgerichtig *„Die Bestätigung ist noch nicht
  abgeschlossen. Die Änderung bleibt sichtbar ausstehend.“*,
- „Jetzt prüfen“ existiert nicht, also entsteht nie ein Ergebnis.

Das erklärt in einem Zug „Speicherung am Server passiert nicht“ **und** „keine
Radar-Ergebnisse“ — ohne dass an Migration, Function oder RLS irgendetwas kaputt sein muss.
Diese eine Variable ist deshalb der erste Prüfpunkt, noch vor jedem Code-Eingriff.

Selbst wenn sie `true` ist, bleiben `pilot.status === "ready"` und `radarReview === true`
als zwei weitere Bedingungen — beide kommen vom Server und hängen an den fünf Radar-Flags,
die laut deinem Handoff aus sind.

### B5 · „Weitere Entdeckungen“ bleibt leer — **Gate-Kette belegt, greifendes Gate offen**

Der Abschnitt speist sich **ausschließlich** aus dem Websearch-Tagesfeed
(`further = external.filter(...)`, `entdeckenUi.js:506`). Fällt der Feed aus, wird
bewusst **nicht** mit Katalogtiteln aufgefüllt — das ist so gewollt und der Grund für
die Leermeldung. Notwendig sind, in dieser Reihenfolge:

1. `VITE_ENTDECKEN_DAILY_FEED_ENABLED === true` — laut Handoff gesetzt,
2. `hatBestaetigteOwnerRolle(session)` **und** `session.capabilities.personalAi === true`
   (`entdeckenDailyFeed.js`, plus dieselbe Bedingung nochmals in `App.jsx:214` als
   `webDiscoveryOwnerFreigegeben`),
3. Function `entdecken-daily-task` deployt und Migration `20260820200000_entdecken_daily_feed.sql`
   remote angewandt,
4. Antwort mit Status `fresh`/`stale` und `validUntil >= heute (Wien)`,
5. lokal ein eindeutiger Match gegen den AT-Katalog (starke ID, sonst exakt Titel+Jahr+Typ).

Dein Handoff listet als deployt nur `radar-websearch-task` v5 und die Migrationen
`20260821120000` / `20260821130000`. **Ob `entdecken-daily-task` überhaupt deployt und
`20260820200000` angewandt ist, ist damit nicht belegt.** Solange das offen ist, ist ein
leerer Abschnitt das erwartbare, korrekte Verhalten — kein Bug.

Nebenbemerkung zu Schritt 5: selbst bei laufendem Feed hängt der Match an tmdb/imdb-IDs
oder exakt Titel+Jahr+Typ. Der Katalog hat `tmdb_id`/`imdb_id` gefüllt — das sollte tragen.

---

## 3. Empfehlung

Die fünf Symptome haben **nicht eine gemeinsame Ursache**. Sie zerfallen in zwei Gruppen,
und die zweite Gruppe ist die, die deine Live-Abnahme immer wieder scheitern lässt:

**Gruppe A — Konfiguration/Deployment (B3 Fall 2, B4, B5).**
Der Code ist da, die Schalter sind es nicht. Hier ist kein Code zu reparieren, bevor
nicht empirisch feststeht, welcher Schalter fehlt. Das sind drei Nachschau-Aktionen,
keine Bau-Aktionen. **Jeder Codeeingriff vor dieser Klärung ist Blindflug** — und genau
das ist das Muster, das deine letzten Läufe gekostet hat.

**Gruppe B — echte Codefehler (B1, B2, B3 Fall 1).**
B1 ist der schwerwiegendste und der einzige, der auch bei perfekt gesetzten Schaltern
bleibt. Er ist nicht mit einem Handgriff zu heilen, weil er eine Datenlücke ist:
Der Katalog liefert keine Merkmale. Drei Wege, in aufsteigender Ehrlichkeit:

1. **`jahrzehnt` in `PROFIL_ATTRIBUT_ARTEN` aufnehmen** (oder auf `epoche` mappen).
   Zwei Zeilen, sofort wirksam — aber es macht aus dem Jahrzehnt ein Geschmackssignal
   und liefert schwache Begründungen („Profil: 2000er“). Kosmetik, kein Produkt.
2. **Genres in die Katalogpipeline nachziehen.** Die richtige Lösung. Liegt aber im
   alten Pipeline-Repo (`build_streaming_ansicht.js`), nicht in dieser App, und ist ein
   eigener Auftrag mit eigenem Quellen-/Kosten-Blick (TMDB-Genres über die vorhandene
   `tmdb_id` wären der naheliegende Weg).
3. **Ehrlich benennen, statt leer bleiben.** Solange 1 und 2 offen sind, sollte die
   Ansicht sagen, warum sie leer ist. Der Trichter dafür existiert bereits fertig:
   `createEntdeckenRecommendationFunnel` liefert `catalogCount / serviceAvailableCount /
   hardEligibleCount / reasonedCount / personalCount` — rein aggregierte Zahlen, keine
   Nutzerdaten. Er ist exportiert und **wird im Produktivcode nirgends aufgerufen.**
   Ihn in die Owner-Diagnose zu hängen, kostet fast nichts und macht diese Klasse von
   Fehlern in Zukunft in fünf Sekunden sichtbar statt in einer Analysesitzung.

B2 ist reine Bedienführung: entweder rollenübergreifend suchen und die Rolle im Treffer
anzeigen, oder wenigstens bei `role_mismatch` die Rolle nennen, in der der Name gefunden
wurde („Alfred Hitchcock ist als Regie hinterlegt“). B3 Fall 1: Ein-Treffer-Fall
automatisch vorauswählen, statt den Knopf tot zu lassen.

---

## 4. Next Steps

**Sofort, ohne Code, in dieser Reihenfolge:**

1. **GitHub → Repo `Soppagata/kinodreieck-app` → Settings → Variables**: Wert von
   `STAGING_RADAR_PILOT_CLIENT_ENABLED` ablesen. Ist er nicht `true`, ist B4 (und die
   fehlende Serverspeicherung) erklärt, und ein Re-Deploy mit gesetzter Variable ist der
   ganze „Fix“.
2. **Supabase-Projekt**: prüfen, ob Function `entdecken-daily-task` deployt ist und
   Migration `20260820200000_entdecken_daily_feed.sql` remote angewandt wurde. Ohne das
   ist B5 kein Defekt.
3. **Staging-Konto**: bestätigte `owner`-Rolle, `personalAi` und `radar_review` am
   Testkonto belegen. Ohne `personalAi` sind B3 Fall 2 und B5 erklärt, ohne `radar_review`
   B4.

**Danach, am echten angemeldeten Konto, der eine Weg aus deinem Handoff:**
`Treffer auswählen → sichtbare Vormerkung → bestätigen → Speicherung am Server →
Seite neu laden → aktiver Radar-Eintrag` — aber **mit einem Filmtitel, nicht mit einer
Person**, weil der Werkpfad weniger Gates hat und damit sauberer zeigt, ob die
Server-Speicherung an sich trägt. Erst wenn der steht, dieselbe Strecke mit Cage
(Rolle „Schauspiel“) und Hitchcock (Rolle vorher auf „Regie“ stellen).

**Erst danach Code:** B1 nach Weg 1 + 3 (klein, sofort), B2/B3 als Bedienkorrektur.
Weg 2 (Genres in der Pipeline) ist ein eigener Auftrag und gehört nicht in denselben Lauf.

**Nicht als Erfolgsnachweis zulassen:** grüne Suite, Bundle-Marker, Mock-Läufe. Die Suite
ist bei B1 nachweislich grün gegen eine Datenform, die es im Produktivkatalog nicht gibt.
Ein Test, der diese Klasse fängt, muss gegen `dist-single-beta/streaming_entdecken.json`
laufen — nicht gegen Fixtures.

---

## 5. Was ich nicht geklärt habe

- Die drei Punkte aus „Next Steps“ 1–3 — dafür braucht es GitHub-, Supabase- und
  Konto-Zugriff, den ich hier nicht habe.
- Ob der Live-Katalog auf Staging dieselbe Merkmalslücke hat wie
  `dist-single-beta/streaming_entdecken.json` (Juli-Stand). Die Pipeline hat sich seither
  nicht geändert und der Etappe-7-Handoff nennt denselben Befund, deshalb halte ich es für
  sehr wahrscheinlich — belegt ist es nicht.
- Der Mobile-Suchleisten-Fix. Nicht angesehen, weil außerhalb dieses Auftrags.
