# Runbook: Demo-Schnappschuss veröffentlichen

Wofür das da ist: Auf `kinodreieck.at` soll ein Besucher **ohne Anmeldung** die
App sehen können — aber nicht das laufende Wiener Kinoprogramm. Die
Programmdaten stammen aus nicht freigegebenen Quellen; sie öffentlich zu
servieren wäre Wiederveröffentlichung (`PROGRAMMDATEN_PLAN.md`). Deshalb liegt
im öffentlichen Bereich nur ein **datierter, stark gekürzter Schnappschuss**.

Seit Etappe 4 lädt die App für Gäste die Katalogzeilen `programm_demo` und
`streaming_demo` statt der Live-Zeilen. Solange diese Zeilen fehlen, meldet sie
ehrlich „noch keine Beispieldaten veröffentlicht". Dieses Runbook füllt sie.

## Grundregel

**Alles, was in `programm_demo` oder `streaming_demo` landet, ist ohne
Anmeldung öffentlich lesbar.** Nicht „für Tester sichtbar" — öffentlich. Deshalb
sieh dir die Vorschau jedes Mal an, auch beim zehnten Lauf.

## Schritt für Schritt

**1. Datenquelle wählen.** Nimm eine Programm-Payload, die schon ein paar Tage
alt ist. Ein Schnappschuss von gestern ist praktisch das aktuelle Programm; ein
Schnappschuss von vorletzter Woche zeigt dieselbe App und hat keinen
Gebrauchswert. Das ist der Kern der ganzen Konstruktion.

**2. Werkzeug laufen lassen** (schreibt nie in die Datenbank):

```
node tools/demo_snapshot.mjs --programm <pfad/zur/programm.json>
node tools/demo_snapshot.mjs --streaming-bekannt <a.json> --streaming-entdecken <b.json>
```

Beides zusammen in einem Lauf geht auch. Ohne Schalter gilt: 3 Programmtage,
5 Spielstätten, 12 Filme, 15 Streaming-Titel je Liste, 30 Tage Gültigkeit.
`--hilfe` zeigt alle Schalter.

**3. Vorschau lesen.** Das Werkzeug meldet, wie viele Filme, Vorstellungen und
Häuser übrig bleiben, welcher Zeitraum abgedeckt ist, welcher Datenstand und
welche Herkunft eingetragen werden — und **welche Felder es entfernt hat**.

Prüfe drei Dinge:

- Steht in der Entfernt-Liste alles, was nicht raus soll? Beschreibungstexte,
  Plakate, persönliche Bewertungen und interne Betriebsdaten müssen dort
  auftauchen. Fehlt eines, hat es die Positivliste durchgelassen — dann nicht
  veröffentlichen, sondern melden.
- Ist der Umfang wirklich klein? Wenn das Ergebnis nach einem brauchbaren
  Kinoprogramm aussieht, ist es zu groß. Kürze mit `--tage`, `--kinos`,
  `--filme` nach.
- Stimmt der Datenstand? Er muss die Herkunft der Daten benennen, nicht den
  Zeitpunkt des Skriptlaufs.

**4. Erzeugtes SQL ansehen.** `demo-schnappschuss/publish_demo.sql`. Wenn du nur
eine der beiden Zeilen veröffentlichen willst, lösche den anderen Block.

**5. Im Supabase-SQL-Editor ausführen.** Dashboard → SQL Editor → Datei einfügen
→ Run. Der Datenbank-Guard weist ab, wenn Herkunft, Stand oder Gültigkeit
fehlen — das ist die zweite Sicherung hinter deinem Blick auf die Vorschau.

**6. Gegenprobe.** Im SQL-Editor:

```sql
begin;
  set local role anon;
  select name from public.kd_catalog order by name;
rollback;
```

Erwartet: `manifest`, `programm_demo`, `streaming_demo` — und **nicht**
`programm` oder `streaming`. Danach `kinodreieck.at` in einem privaten Fenster
öffnen: das Kinoprogramm muss sichtbar und als Beispieldaten gekennzeichnet
sein.

## Auffrischen und Ablaufen

Ein Schnappschuss ist befristet. Läuft er ab, kennzeichnet die App ihn als
abgelaufen statt ihn als aktuelles Programm auszugeben. Zum Auffrischen einfach
Schritt 2 bis 5 wiederholen — das SQL aktualisiert die vorhandene Zeile.

Abgelaufenes abräumen (bewusst von Hand, kein Automatismus):

```sql
select * from public.kd_catalog_abgelaufene();   -- erst ansehen
select public.kd_catalog_abraeumen();            -- dann löschen
```

## Persönliche Bewertungen

Standardmäßig **nicht** enthalten. `--mit-bewertungen` nimmt sie mit — das ist
eine bewusste Entscheidung, keine Bequemlichkeit: die Bewertungen sind
persönliche Urteile, und im öffentlichen Bereich sind sie für jeden lesbar und
von Suchmaschinen erfassbar. Notizen, Begründungstexte, Blogtexte und
Merklisten-Zustände gehen **nie** mit, auch mit diesem Schalter nicht.

## Wenn etwas nicht passt

- „Kein Datenstand bestimmbar" → `--stand <ISO-Zeitpunkt>` setzen. Der Stand ist
  Pflicht; ohne ihn wäre ein Schnappschuss von aktuellen Daten nicht zu
  unterscheiden.
- „Quelle X steht nicht im Register" → der Slug muss in `kd_quellen` stehen
  (`--quelle`). Für Programm ist es `film_at`, für Streaming `watchmode`.
- „Quelle X hat Status Y" → die Quelle ist pausiert, widerrufen oder abgelaufen.
  Das ist Absicht: aus einer gesperrten Quelle wird nichts veröffentlicht.
- „Nach der Kürzung bleibt kein Film übrig" → die Schalter sind zu eng, oder das
  Zeitfenster liegt neben den Daten.
