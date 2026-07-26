# Etappe 4: Gemeinsamer Katalog, Programmdaten und Rechte

**Stand: 26. Juli 2026 — ABGESCHLOSSEN.** Code und Datenbankregeln fertig,
Testsuite grün (850 Checks), beide Migrationen in der Produktionsdatenbank
gelaufen, Demo-Mediathek veröffentlicht. Alle vier Abnahmekriterien der Roadmap
sind gegen die echte Datenbank belegt, nicht nur gegen einen Nachbau:

- Die Zugriffstrennung: `set local role anon` zeigt im Katalog nur `manifest`.
- Die Stilllegung einer Quelle: `kd_quelle_status_setzen('film_at','pausiert')`
  → der nächste Schreibversuch bricht mit „Veroeffentlichung gesperrt" ab, ohne
  dass eine neue App-Version nötig wäre.

Offen bleibt allein der Demo-Schnappschuss für den **Kino-Tab** — dafür fehlt
eine Programm-Payload als Eingabe (siehe „Was noch fehlt").

## Was diese Etappe leistet

Öffentliche Film-, Kino- und Streamingdaten sind jetzt technisch **und**
rechtlich von persönlichen Kontodaten getrennt. Die entscheidende Änderung ist
nicht sichtbar, sondern strukturell: es gibt keinen Weg mehr, Programmdaten zu
veröffentlichen, ohne dass die Datenbank nach ihrer Herkunft fragt.

## Entscheidungen

### Live-Programm nur für angemeldete Konten

Eine eigene öffentliche Domain ist Wiederveröffentlichung. `PROGRAMMDATEN_PLAN.md`
verbietet die produktive Wiederveröffentlichung nicht freigegebener
Programmdaten, und freigegeben ist bislang keine Quelle. Deshalb liest die Rolle
`anon` seit dieser Etappe nur noch `manifest` und die Demo-Zeilen; `programm`
und `streaming` verlangen eine gültige Sitzung.

**Folge, bewusst akzeptiert:** Ein Besucher ohne Konto sieht kein aktuelles
Kinoprogramm. Das ist kein Mangel, sondern der Zweck. Der öffentliche Auftritt
zeigt die App über einen datierten Schnappschuss.

Der technische Nebeneffekt ist wichtiger, als er wirkt: PostgREST filtert per
RLS **ohne** 403 — die Antwort ist HTTP 200 mit einem leeren Array. Eine
Zugriffsprüfung, die auf den Statuscode schaut, merkt davon nichts. Alle Proben
im Projekt prüfen deshalb Zeileninhalt statt Status.

### Quellenregister als Betriebsmittel, nicht als Dokumentation

`kd_quellen` führt je Quelle Betreiber, Kontakt, Status, erlaubte Felder,
Frequenz, Fristen und die belieferten Katalogbereiche. Das Register ist
**wirksam**, nicht beschreibend: der Status entscheidet, ob veröffentlicht
werden darf.

Die beiden real genutzten Quellen stehen als `intern_test` drin — `film_at` und
`watchmode`. Das ist das ehrliche Etikett für „wird abgerufen, ist aber nicht
lizenziert". Die Anfragekandidaten aus `KINOQUELLEN_WIEN.csv` stehen als `offen`
daneben.

### Durchsetzung in der Datenbank, nicht in der Pipeline

Die Prüfung sitzt als Trigger auf `kd_catalog` und wirkt damit für **jeden**
Schreiber — die Pipeline auf Max' Rechner, den SQL-Editor, künftige Werkzeuge,
auch für `service_role`. Der Alternativweg wäre ein Gate im Publish-Schritt der
Pipeline gewesen; das hätte nur für einen Schreiber gegolten und eine Kopplung
zwischen zwei getrennt ausgelieferten Codebasen erzeugt.

Damit die Herkunftspflicht die bestehende Pipeline nicht bricht, trägt der
Guard sie bei Aktualisierungen selbst nach: kommt ein UPDATE ohne `quelle`,
gewinnt der bisherige Wert. Das deckt beide Schreibweisen ab — die Spalte gar
nicht anzufassen und sie ausdrücklich als NULL mitzuschreiben. **Die Pipeline
musste für diese Etappe nicht angefasst werden.**

### Ehrliche Zustände statt eines Sammelfehlers

Vorher meldete die App bei jedem Problem denselben Satz. Jetzt unterscheidet
sie: Anmeldung nötig · Zugangsschlüssel wird abgelehnt · noch keine
Beispieldaten veröffentlicht · ungültige Antwort. Dazu kennzeichnet sie
Demo-Schnappschuss, Ablauf und Herkunft aus dem Browser-Speicher.

Der wichtigste Einzelfix: ein gespeicherter Stand kann nicht mehr als frischer
Datenbankstand erscheinen. Vorher zeigten Bestandsgeräte unbegrenzt lange altes
Kinoprogramm mit frischem Datum.

### Sitzungstoken nur ans eigene Projekt

Der Katalogpfad sendet bei bestehender Sitzung das Supabase-Token. Damit es
nicht an eine fremde Instanz gehen kann, prüft die App vorher, ob der
eingetragene Katalogzugang auf dasselbe Projekt zeigt wie die Anmeldung. Sonst
wird ohne Token gelesen — anon statt „gültiger Zugang an fremde Instanz, die ihn
gegen uns weiterspielt". Kein Abbruch, keine Abmeldung.

## Wie die Teile zusammenspielen

```text
Mac-Pipeline ──service_role──► kd_catalog ◄──anon: manifest + *_demo
                                   │        ◄──Sitzung: alles
                          Guard-Trigger
                                   │  fragt bei jedem Schreibvorgang:
                                   ▼  Herkunft? im Register? Status? Felder?
                               kd_quellen
```

## Runbook

### Status einer Quelle ändern (Widerruf ohne App-Release)

```sql
select public.kd_quelle_status_setzen('film_at', 'pausiert');    -- kein Import mehr, Bestand bleibt
select public.kd_quelle_status_setzen('film_at', 'widerrufen');  -- Status + zugehörige Zeilen weg
select public.kd_quelle_status_setzen('film_at', 'intern_test'); -- zurück
```

Erlaubt: `offen`, `angefragt`, `freigegeben`, `pausiert`, `widerrufen`,
`abgelaufen`, `intern_test`. Das ist das Roadmap-Abnahmekriterium „ein
Quellenwiderruf kann ohne App-Release umgesetzt werden" — es braucht keinen
Deploy, nur diese eine Zeile.

### Neue Quelle aufnehmen

```sql
insert into public.kd_quellen (slug, betreiber, url, status, importart, notizen)
values ('uncut', 'Uncut', 'https://www.uncut.at/', 'angefragt', 'Partner-Feed', '…');
```

### Feldfreigabe hinterlegen

Sobald ein Vertrag konkrete Felder benennt, wird die Prüfung durch den Eintrag
scharf — vorher ist sie inert:

```sql
update public.kd_quellen
   set erlaubte_felder = array['titel','kino','beginn','fassung']
 where slug = 'uncut';
```

Danach weist die Datenbank jede Payload ab, deren Einträge ein anderes Feld
tragen, und nennt das erste verbotene Feld.

### Demo-Schnappschuss veröffentlichen

Siehe `RUNBOOK_DEMO_SNAPSHOT.md`. Kurz: `node tools/demo_snapshot.mjs
--programm <datei>`, Vorschau lesen, erzeugtes SQL im Editor ausführen.

### Abgelaufenes abräumen

```sql
select * from public.kd_catalog_abgelaufene();   -- erst ansehen
select public.kd_catalog_abraeumen();            -- dann löschen
```

Bewusst kein Cron: automatisches Löschen auf Verdacht ist in einem System ohne
Backup-Automatik die falsche Wahl.

### Zugriffstrennung nachprüfen

```sql
begin; set local role anon; select name from public.kd_catalog order by name; rollback;
```

Erwartet: nur `manifest` und die `*_demo`-Zeilen. Zusätzlich der scharfe Lauf
`npm run test:rls` mit zwei Testkonten — er prüft dasselbe über die echte
REST-Schnittstelle und deckt zusätzlich `kd_quellen` und die Statusfunktion ab.

## Abnahmekriterien der Roadmap

| Kriterium | Stand |
|---|---|
| Jede veröffentlichte Programmdatenquelle hat einen dokumentierten Status | erfüllt — `kd_quellen`, inklusive der real genutzten Quellen als `intern_test` |
| Accounttabellen und öffentlicher Katalog besitzen getrennte Regeln | erfüllt und **gegen die Produktionsdatenbank belegt** (anon sieht nur `manifest`) |
| Ein Quellenwiderruf kann ohne App-Release umgesetzt werden | erfüllt und **in der Produktionsdatenbank durchgespielt** (Pause → Schreibversuch abgewiesen → Freigabe) |
| Die App zeigt keine KI-erfundene Verfügbarkeit | erfüllt — Programm und Streaming kommen ausschließlich aus dem Katalog, keine KI im Datenpfad |

## Was noch fehlt

1. **Demo-Schnappschuss für den Kino-Tab.** Die Demo-Mediathek steht
   (120 Filme mit Bewertung und Begründung, `tools/demo_mediathek.mjs`), der
   Kino-Tab bleibt in der Demo aber leer, bis `programm_demo` befüllt ist. Dafür
   braucht `tools/demo_snapshot.mjs` eine Programm-Payload als Eingabe.
2. ~~**`npm run test:rls` scharf laufen lassen.**~~ **Erledigt am 26.07.2026**
   im Zuge von Etappe 5: mit zwei frischen Testkonten lief der Test zum ersten
   Mal scharf gegen die Produktionsdatenbank — 33/33. Damit ist die
   Kontotrennung von `kd_personal`, `kd_catalog` und `kd_quellen` nicht mehr
   nur gegen einen Nachbau belegt.

## Bewusste Grenzen

- **Keine Normalisierung.** `cinemas`/`films`/`screenings` als eigene Tabellen
  wären Vorratsbau: ohne lizenzierte Quelle gibt es keine vereinbarten Felder,
  gegen die man das Schema schneiden könnte. Der Blob-Katalog trägt die reale
  Nutzung. Das ändert sich mit der ersten `freigegeben`-Quelle.
- **Kein Passwort-Reset ohne Max.** Unverändert aus Etappe 3.
- **Der Publishable-Key** kann bei manipulierter Konfiguration weiterhin an eine
  fremde Instanz gehen; geschlossen ist nur der Abfluss des Sitzungstokens. Der
  Key ist öffentlich, der Schaden wäre begrenzt — aber es ist keine saubere
  Grenze.
- **Zwei Definitionen von „Betriebsart"** im App-Code: der Wechsel-Effekt
  entscheidet an der Sitzungsart, alle Leser am Tokenbesitz. Bei degradierter
  Sitzung fallen sie auseinander. Im Code vermerkt, folgenlos, aber vor der
  nächsten Änderung an der Sitzungslogik zu prüfen.

## Geänderte und neue Dateien

**Neu:** `supabase/migrations/20260725220000_etappe4_quellenregister_zugriff.sql` ·
`supabase/migrations/20260726120000_etappe4_guard_ausbaustufe.sql` ·
`tools/demo_snapshot.mjs` · `docs/RUNBOOK_DEMO_SNAPSHOT.md` · dieses Dokument

**Geändert:** `src/lib/katalog.js` (Token-Naht, Demo-Assets, Herkunfts-Metadaten,
Cache verwerfen) · `src/services/catalog.js` (Auswahl live/demo, Projektbindung,
Fehlerübersetzung) · `src/services/errors.js` (zwei neue Codes) · `src/App.jsx` ·
`src/components/KatalogZugang.jsx` · die vier Tabs · `tools/rls_test_personal.mjs`
und `tools/smoke-deployment.mjs` (Zeileninhalt statt Statuscode) ·
`supabase/katalog_schema.sql` (Drift-Hinweis) · fünf Testdateien

**Bewusst nicht angefasst:** `kd_store` und `kd_personal` samt Policies,
`src/lib/supabaseDriver.js`, `src/lib/gitDriver.js`, `src/legacy/`,
`src/lib/supabasePublic.js`, die Mac-Pipeline.
