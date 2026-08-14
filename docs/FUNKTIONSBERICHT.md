# Kinodreieck – Funktionsbericht und Bedienungsanleitung

Stand: 8. August 2026
Geltungsbereich: konsolidierter, noch nicht veröffentlichter Arbeitsstand auf
`audit/fixbatch1`

Dieser Bericht beschreibt die Funktionen, die in der aktuellen Anwendung
tatsächlich erreichbar sind. Er ist zugleich Bedienungsanleitung und grobe
technische Erklärung: Wo wird eine Funktion ausgelöst, was tut sie und welche
Daten verwendet oder verändert sie?

Wichtig: Der Bericht beschreibt den lokalen Auditstand. Er behauptet weder den
Frontend-Deploy noch die noch ausstehende Betriebsabnahme von Stapelimport- und
Budgetmigrationen. Erreichbare Funktionen werden von bloß gebautem, aber noch
nicht live belegtem Servercode getrennt.

## 1. Was Kinodreieck ist

Kinodreieck verbindet sieben Bereiche:

1. **Start** – persönliches Abend-Dashboard.
2. **Kino** – aktuelles Wiener Kinoprogramm und Abgleich mit der eigenen
   Mediathek.
3. **Streaming** – bereits bewertete eigene Titel, die gerade verfügbar sind,
   und ein großer Entdecken-Katalog.
4. **Mediathek** – Filme, Serien, Musik, Personen und andere Medien,
   ergänzt um Besitz und Must-Watch.
5. **Suche** – nachvollziehbare, normalerweise vollständig lokale Suche über
   Mediathek, Kino und Streaming.
6. **Blog** – eigene Artikel mit Verweisen auf Mediathek-Einträge sowie ein
   gemeinsamer öffentlicher Blogbereich.
7. **Settings** – Darstellung, Konto, KI, Profil, Import, Export, Backup,
   Katalog und Wartung.

Die App ist kein automatisches Empfehlungsnetzwerk. Sie verbindet den eigenen
Bestand mit vorbereiteten Kino- und Streamingdaten. Persönliche Bewertungen
und Listen bleiben ohne Konto im Browser. Mit einem Konto können sie
kontogebunden zwischen Geräten abgeglichen werden.

## 2. Betriebs- und Auslieferungsformen

### 2.1 Gastbetrieb

**Auslösen:** App öffnen und ohne Anmeldung verwenden.

**Wirkung:**

- Mediathek, Blog, Listen, Profil und Settings werden lokal im
  Browserprofil gespeichert.
- Die Kernfunktionen funktionieren ohne Konto und ohne KI.
- Eine bestehende lokale Datenbasis bleibt auch offline verwendbar.
- Ein Browser ist kein verlässliches Dauerbackup. Deshalb regelmäßig ein
  Gesamt-Backup herunterladen.

### 2.2 Kontobetrieb

**Auslösen:** `Settings → Konto & Geräte-Sync → Anmelden`.

**Wirkung:**

- Die persönlichen Datenbereiche werden einem Konto zugeordnet und mit
  Supabase abgeglichen.
- Row Level Security trennt die Konten voneinander.
- Persönliche Schreibvorgänge werden pro Datenbereich serialisiert und erst
  nach bestätigtem lokalem Speichern sichtbar abgeschlossen. Ist der Server
  vorübergehend nicht erreichbar, bleiben bestätigte Änderungen lokal und
  werden später übertragen.
- Vor dem Abmelden werden ausstehende Änderungen gesendet. Anschließend wird
  der lokale Kontocache entfernt; ein Gaststand von vor der Anmeldung wird
  wiederhergestellt. Der Datenbankstand des Kontos bleibt erhalten.
- Kann der Kontocache nicht sicher getrennt werden, zeigt die App keine
  persönlichen Töpfe als Gast. Sie maskiert den Stand und verlangt eine
  erneute Anmeldung mit demselben Konto.

Es gibt derzeit keine Selbstregistrierung. Konten werden von Max angelegt.
Passwortänderungen sind in der App möglich; Passwort-Reset und serverseitige
Kontolöschung laufen derzeit noch über Max.

### 2.3 Browser und installierte PWA

**Auslösen:** Die Webadresse normal im Browser öffnen. Für die Installation auf
Android den Installationsknopf beziehungsweise `App installieren` verwenden;
auf iPhone/iPad in Safari `Teilen → Zum Home-Bildschirm → Als Web-App öffnen`.

**Wirkung:**

- Nicht installiert läuft Kinodreieck wie eine normale Webseite.
- Installiert erhält es ein App-Symbol und startet ohne Browserrahmen.
- Die App-Hülle wird für den Offline-Start zwischengespeichert.
- Neue Deployments werden beim nächsten Online-Laden übernommen.
- Konto, aktuelle gemeinsame Daten und KI brauchen weiterhin eine Verbindung.

Eine PWA-Installation funktioniert aus Sicherheitsgründen nur über HTTPS oder
`localhost`, nicht aus einer `file://`-Adresse.

### 2.4 Einzeldatei

**Auslösen:** `Kinodreieck.html` per Doppelklick öffnen.

**Wirkung:**

- Die App läuft ohne Webserver als einzelne lokale Datei.
- Eine geprüfte Demo-Basis ist in der Datei eingebettet.
- Die eingebauten Kino- und Streamingdaten sind ausdrücklich synthetische,
  archivierte Beispiele. Aktuelles Programm braucht eine Online-Verbindung zum
  getrennt konfigurierten Katalogdienst.
- Eigene Änderungen liegen weiterhin im Browserprofil und nicht in der
  HTML-Datei selbst.
- Die Datei ist transportabel; die persönlichen Änderungen werden über das
  Gesamt-Backup transportiert.
- Automatische App-Updates gibt es nur bei der PWA, nicht bei einer kopierten
  Einzeldatei.

Die Installationsanleitung steht zusätzlich in
[`DEMO_INSTALLIEREN.md`](DEMO_INSTALLIEREN.md).

## 3. Erster Start

### 3.1 Leer starten

**Auslösen:** Im ersten Dialog `Leer starten` wählen.

**Wirkung:** Es werden keine persönlichen Beispiele angelegt. Kino- und
Streamingkatalog können trotzdem verbunden und verwendet werden. Diese Option
ist für den Aufbau einer echten eigenen Mediathek gedacht.

### 3.2 Demo ansehen

**Auslösen:** Im ersten Dialog `Demo ansehen` wählen.

**Wirkung:** Die App legt eine kleine persönliche Demo-Basis an und verwendet
den öffentlichen Demo-Katalog. Damit lassen sich Mediathek, Dashboard, Blog,
Kino und Streaming ohne eigene Daten ausprobieren.

### 3.3 Demo-Daten entfernen

**Auslösen:** `Settings → Datenmodus & Verbindung → Demo-Daten entfernen`.

**Wirkung:** Es werden nur die beim Demo-Start protokollierten persönlichen
Beispiele entfernt. Eigene spätere Einträge sowie der gemeinsame Kino- und
Streamingkatalog bleiben erhalten. Die Funktion ist nur ohne aktives Konto
verfügbar.

### 3.4 Startmodus wechseln

**Auslösen:** Bei leerem lokalen Bestand unter
`Settings → Datenmodus & Verbindung → Startmodus wählen`.

**Wirkung:** Wechselt zwischen leerer und Demo-Basis. Liegen bereits
persönliche Daten vor, warnt die App vor deren Verwerfen. Vorher sollte ein
Gesamt-Backup erstellt werden. Im Kontobetrieb ist der Wechsel gesperrt.

### 3.5 Willkommen und Tutorial

**Auslösen:** Beim ersten Start automatisch. Die dauerhafte Bereichsanleitung
bleibt später über
`Settings → Über & Rechtliches → Über Kinodreieck & Anleitung`
erreichbar.

**Wirkung:**

- erklärt das Bewertungsdreieck,
- fragt die gerätelokale Entscheidung `Mit KI` oder `Ohne KI` ab,
- bietet bei einer KI-Wahl die Anmeldung an, macht sie aber nicht verpflichtend,
- zeigt später kontextbezogene Hinweise direkt an den betreffenden Funktionen.

Die frühere automatisch durchlaufende Tour wurde bewusst entfernt. Die
dauerhafte Anleitung und die kontextbezogenen Hinweise bleiben erreichbar; es
gibt deshalb keinen Knopf zum Neustart einer Tour.

## 4. Navigation und Bedienprinzipien

**Desktop:** Die sieben Bereiche stehen in der oberen Navigationsleiste.

**Mobil:** Der Menüknopf rechts in der globalen Suchleiste öffnet das
Bereichsmenü. Eine gesonderte Links-/Rechtshänder-Spiegelung wird im aktuellen
UI nicht angeboten.

Weitere allgemeine Regeln:

- Karten werden durch Antippen oder mit `Enter`/Leertaste aufgeklappt.
- Goldene oder farbige Chips zeigen aktive Filter beziehungsweise Zustände.
- Ein erneuter Klick auf einen aktiven Chip hebt ihn meistens wieder auf.
- Der Pfeil unten rechts springt bei langen Seiten zurück nach oben.
- Ein roter Punkt bei `Settings` meldet Änderungen, die seit dem letzten
  passenden Export noch nicht als Datei gesichert wurden.

## 5. Das Bewertungsdreieck

Filme und Serien können auf drei Achsen von 0 bis 5 bewertet
werden:

- **WIE:** Inszenierung, Regie, Kamera, Schnitt, Schauspiel und Ton.
- **WAS:** Stoff, Handlung, Themen und inhaltliche Substanz.
- **WARUM:** filmhistorische oder popkulturelle Bedeutung und Wirkung.

Die drei Werte bilden gemeinsam das sichtbare Dreieck. Für die Standardsortierung
werden sie summiert und um den Wert der separaten Bewertungskategorie ergänzt;
eine weitere Kategorie wird nicht aus dem Verhältnis der Achsen abgeleitet.

### 5.1 Kategorie

Zusätzlich zum Dreieck besitzt ein bewerteter Film eine Kategorie aus der
vorgegebenen Kategorienliste. Sie dient als eigener Filter und ist nicht mit
dem rechnerischen Score identisch.

### 5.2 Unbewertet

Ein Film kann ausdrücklich ohne Dreieck gespeichert werden. `0/0/0` ist
dagegen eine echte Bewertung. Im Bearbeitungsformular bedeuten nur drei
vollständig leere Achsen `unbewertet`.

## 6. Start – persönliches Dashboard

**Auslösen:** Navigation `Start`.

Das Dashboard führt vorhandene Daten zusammen, ohne selbst neue Server- oder
KI-Aufrufe zu starten.

### 6.1 Vertrauenszeile

Zeigt:

- den Stand des Gerätesyncs,
- Datum und Herkunft des Kinoprogramms,
- Zahl beziehungsweise Zustand des Streamingkatalogs,
- Warnungen bei Cache-, Anmelde- oder Ablaufzuständen.

### 6.2 Kino für dich

Zeigt bis zu drei Filme aus der eigenen Mediathek, die aktuell im Kino laufen.
Die bereits berechnete Match-Reihenfolge entscheidet, welche drei erscheinen;
auf jeder Karte steht zusätzlich der jeweils nächste Termin.

**Auslösen:** Auf eine Karte tippen.

**Wirkung:** Öffnet den konkreten Mediathek-Eintrag.

### 6.3 Must-Watch

Zeigt bis zu fünf Einträge aus der eigenen Must-Watch-Liste.

**Auslösen:** Auf einen Titel tippen.

**Wirkung:** Springt zum betreffenden Must-Watch-Eintrag in der Mediathek.

### 6.4 Jetzt streambar

Zeigt gemerkte Entdecken-Titel, die gerade bei einem der ausgewählten Dienste
verfügbar sind.

**Auslösen:** Auf das Modul tippen.

**Wirkung:** Öffnet den Streaming-Bereich.

### 6.5 Pinboard

Zeigt die nächsten angepinnten Kinotermine. Pins bleiben bei einem täglichen
Programmwechsel erhalten; vergangene Termine werden beim Start bereinigt.

**Auslösen:** Auf das Modul tippen.

**Wirkung:** Öffnet den Kino-Bereich.

### 6.6 Zuletzt hinzugefügt

Zeigt neue Must-Watch- und Merkliste-Einträge, sofern sie einen belegbaren
Zeitstempel besitzen. Die Reihenfolge der Masterliste wird bewusst nicht als
Entstehungsdatum interpretiert.

Leere Module werden ausgeblendet. Ist noch gar nichts vorhanden, erklärt das
Dashboard, mit welchen Aktionen es gefüllt wird.

## 7. Kino

**Auslösen:** Navigation `Kino`.

Der Bereich liest einen vorbereiteten Programmsnapshot aus dem gemeinsamen
Katalog. Die App ruft film.at oder Nonstop nicht während der Bedienung live
ab.

### 7.1 Programm laden

Der zuletzt erfolgreich bereitgestellte Datenbankstand wird beim Start
automatisch geladen. Im Kino-Bereich gibt es dafür keinen eigenen Knopf und
keinen externen Nonstop-Link. Der Notfallweg liegt unter
`Settings → Erweitert → Katalog jetzt neu laden`; auch dort wird keine externe
Kinoquelle live ausgelesen.

### 7.2 Programm durchsuchen

**Auslösen:** Text in `Programm durchsuchen …` eingeben.

**Wirkung:** Filtert sowohl eigene Programmtreffer als auch Filme, die noch
nicht in der Mediathek stehen. Titel und vorhandene Originaltitel werden
berücksichtigt.

### 7.3 Programmfilter

**Auslösen:** `Filter` aufklappen.

Verfügbar sind:

- einzelnes Kino,
- Tag,
- alle / nur NonStop / kein NonStop,
- Fassung wie OmU, OV oder DF,
- Zeitgrenze für den Rest des Tagesprogramms,
- vollständiges Tagesprogramm statt Zeitfilter.

`Filter zurücksetzen` setzt die fachlichen Filter zurück. Ob die Filterleiste
offen ist, wird als persönliche Einstellung gespeichert.

### 7.4 Angepinnte Termine

**Auslösen:** Das leere `◇` vor einer Uhrzeit anklicken.

**Wirkung:** Der Termin wird zu `◆`, erscheint oben im Kino-Tab und im
Dashboard. Erneutes Anklicken oder das Löschsymbol im Pinblock entfernt ihn.

Ein Klick auf den Titel eines Pins setzt die Programmsuche auf diesen Film.

### 7.5 Läuft & passt zu dir

Hier erscheinen aktuelle Programmfilme, die über eine stabile Kennung oder
einen Titel-/Jahr-Abgleich mit der eigenen Mediathek verbunden werden konnten.

**Auslösen:** Filmkarte aufklappen.

**Wirkung:** Zeigt Begründung, Notiz, Kino, Termine, Streaminghinweis und – je
nach Eintrag und Freischaltung – Bewertung, KI-Prognose oder Filmwissen. Die
Bewertung kann direkt bearbeitet werden.

### 7.6 Events und Demnächst

Ohne aktive Filter zeigt die App zusätzlich Sonderveranstaltungen und
angekündigte kommende Filme. Ein Stern kennzeichnet angekündigte Titel, die
bereits in der Mediathek vorhanden sind.

### 7.7 Läuft auch

Enthält Programmfilme, die noch nicht mit der eigenen Mediathek verbunden sind.

**Auslösen:** Kompakte Zeile aufklappen.

**Wirkung:** Zeigt Beschreibung, Genre, Kinos und alle Termine. Von dort kann
ein Termin gepinnt oder ein neuer Mediathek-Eintrag mit vorbefüllten Daten
angelegt werden.

### 7.8 Bestehenden Eintrag verknüpfen

**Auslösen:** In einem aufgeklappten `Läuft auch`-Titel
`Schon in deiner Liste? Eintrag verknüpfen …` öffnen, suchen und den passenden
Eintrag anklicken.

**Wirkung:** Speichert die film.at-Kennung im bestehenden Eintrag. Optional
wird der Programm-Titel zum Anzeigetitel, während der bisherige Titel als
Originaltitel erhalten bleibt. Künftige Abgleiche sind dadurch eindeutig.

### 7.9 Notfall-Import

Der Link `Nonstop-Seite` öffnet die externe Programmseite. Eine dort lokal
gespeicherte HTML-Datei kann unter
`Settings → Erweitert → Programm manuell importieren` eingespielt werden.

## 8. Streaming

**Auslösen:** Navigation `Streaming`.

Der vollständige Entdecken-Katalog wird erst beim Öffnen dieses Bereichs
geladen. Die App führt keine Watchmode-Anfrage aus; sie liest vorbereitete
Katalogdaten.

### 8.1 Mein Programm

Enthält Titel, die sowohl in der eigenen Mediathek als auch im aktuellen
Streamingkatalog vorkommen.

**Bedienung:**

- Titel suchen,
- vorübergehend auf einen Dienst filtern,
- auf Must-Watch begrenzen,
- nach Bewertungskategorie filtern,
- Karten aufklappen und die eigene Bewertung bearbeiten,
- über einen Dienst-Badge die Anbieterseite öffnen, wenn ein Link vorhanden
  ist.

Der Dienst-Schnellfilter verändert nicht die dauerhafte Abo-Auswahl.

### 8.2 Entdecken

Enthält noch nicht bewertete Titel aus dem vorbereiteten Streamingkatalog.
Die Relevanz ist eine Heuristik zur Vorsortierung, keine Kinodreieck-Bewertung.

**Bedienung:**

- nach Titel suchen,
- nach Relevanz, Jahr, User-Score oder Alphabet sortieren,
- nach Dienst, Film/Serie, häufigem Genre und Jahrzehnt filtern,
- mit `Könnte dir gefallen` auf den oberen Relevanzbereich begrenzen,
- mit `Weitere 100 laden` schrittweise mehr Ergebnisse rendern.

### 8.3 Merkliste

**Auslösen:** `☆` an einem Entdecken-Titel anklicken.

**Wirkung:** Der Titel wird mit `★` in die Merkliste aufgenommen. Er kann im
Dashboard als `Jetzt streambar` erscheinen. Erneutes Anklicken entfernt ihn.

`Merkliste exportieren` erzeugt eine eigene JSON-Datei als Übergabepunkt für
weitere Sichtung oder Datenarbeit.

### 8.4 Gesehen und Erledigte

**Auslösen:** Häkchen `✓` an einem Entdecken-Titel anklicken.

**Wirkung:** Der Titel gilt als gesehen und verschwindet aus der normalen
Entdecken-Liste. `Erledigte zeigen` blendet solche Titel wieder ein. Ein
erneuter Klick hebt den Status auf.

Wird aus einem Entdecken-Titel ein Mediathek-Eintrag erstellt, erhält er den
Status `in deiner Mediathek` und wird ebenfalls als erledigt behandelt.

### 8.5 Neue Staffeln

Bei ausdrücklich als gesehen markierten Serien merkt sich die App den
bekannten Staffelstand. Meldet ein neuer Katalog eine höhere Staffel, erscheint
ein Hinweis.

**Auslösen:** `Als neuen Stand bestätigen`.

**Wirkung:** Die gemeldete Staffel wird zum neuen persönlichen Stand. Es gibt
keinen rückwirkenden Alarm für alte Markierungen ohne bekannten Ausgangsstand.

### 8.6 Eintrag aus Entdecken erstellen

**Auslösen:** Entdecken-Titel öffnen → `Eintrag erstellen`.

**Wirkung:** Öffnet das Mediathek-Formular mit Titel, Jahr, Genre und vorhandenen
externen IDs. Nach erfolgreichem Speichern verschwindet der Titel aus der
normalen Entdecken-Liste.

## 9. Mediathek

**Auslösen:** Navigation `Mediathek`.

Der Bereich besitzt drei Hauptansichten: `Einträge`, `Im Besitz` und
`Must-Watch`.

### 9.1 Einträge

Zeigt die vollständige eigene Masterliste. Untergruppen sind Filme, Serien,
Musik und Sonstiges. Alte Importe mit dem früheren Typ `filmreihe` bleiben
lesbar und werden beim Laden als Film normalisiert; neue Einträge erzeugen
diesen abgeschafften Typ nicht mehr.

**Bedienung:**

- Titel oder Originaltitel suchen,
- nach Dreieck-Score, Titel, Jahr oder einzelner Achse sortieren,
- Besitzquelle, Kategorie und Genre filtern,
- Karte aufklappen und bearbeiten,
- Streamingverfügbarkeit und Blog-Backlinks sehen.

### 9.2 Im Besitz

Zeigt nur Einträge mit einer physischen Quelle wie DVD, Blu-ray oder CD.
Prime- oder Apple-Käufe zählen in dieser Ansicht bewusst nicht als physischer
Besitz.

`nur unbewertete` grenzt auf physisch vorhandene Filme und Serien ohne Dreieck
ein.

### 9.3 Must-Watch

Must-Watch ist eine eigenständige Liste und kein Filterfeld der Masterliste.

**Neuen Eintrag anlegen:** `+ Eintrag` anklicken, mindestens den Titel
eintragen und optional Besitz, Beschreibung, Notiz und Verknüpfung ergänzen.

**Verknüpfen:** Der Picker sucht getrennt in Mediathek, Kinoprogramm und
Streaming. Eine Verknüpfung entsteht nur durch einen ausdrücklichen Klick; es
gibt kein automatisches Raten.

**Bearbeiten:** Eintrag aufklappen. Beschreibung und Notiz werden beim Verlassen
des Felds gespeichert. Besitz kann direkt umgeschaltet, eine Verknüpfung
gelöst oder neu gesetzt und der Must-Watch-Eintrag gelöscht werden.

Blogartikel, die auf den Must-Watch-Eintrag verweisen, erscheinen unter
`Kommt vor in`.

### 9.4 Neuen Mediathek-Eintrag anlegen

**Auslösen:** In der passenden Untergruppe `+ Eintrag hinzufügen`.

Für Filme und Serien stehen zur Verfügung:

- Titel und Originaltitel,
- Pflichtjahr,
- Typ,
- Kategorie,
- WIE/WAS/WARUM,
- Genres,
- eine oder mehrere Quellen,
- Begründung und Notiz,
- optional IMDb-, TMDB- oder Wikidata-Kennung,
- ausdrücklich `Ohne Bewertung speichern`.

Für Musik und Sonstiges verwendet die App eine reduzierte Maske ohne
Bewertungsdreieck, dafür mit Kategorie beziehungsweise Rolle, physischer
Quelle und Beschreibung.

Titel und Jahr bilden den Dublettenschutz. Ein ungültiges Jahr oder eine
ungültige externe Kennung wird vor dem Speichern abgewiesen.

### 9.5 Bewertung bearbeiten

**Auslösen:** Karte öffnen → `Bewertung bearbeiten` beziehungsweise bei einem
unbewerteten Eintrag `Jetzt bewerten`.

**Wirkung:** Ändert Achsen, Kategorie, Begründung und freie Notiz. Werden alle
drei Achsen geleert, bleibt der Eintrag als `unbewertet` bestehen.

Musik- und sonstige Einträge bieten stattdessen `Beschreibung bearbeiten`.

### 9.6 Blog-Backlinks

Freigegebene Artikel erzeugen zur Laufzeit `Kommt vor in`-Links an den
referenzierten Mediathek- und Must-Watch-Einträgen. Diese Rückverweise werden
nicht doppelt in der Masterliste gespeichert.

### 9.7 Offene Blog-Referenzen

Rotlinks aus Blogartikeln werden unter der passenden Mediathek-Untergruppe
gesammelt.

**Auslösen:** `Anlegen` bei einer offenen Referenz.

**Wirkung:** Öffnet ein vorbefülltes Eintragsformular. Nach erfolgreichem
Anlegen heilt der Rotlink automatisch.

### 9.8 Unbewerteter Besitz

Ein separater Nachtrag kann Titel aus älteren DVD- oder Prime-Listen enthalten,
die noch nicht in der Masterliste stehen.

**Auslösen:** Abschnitt `Unbewerteter Besitz` öffnen → `Bewerten`.

**Wirkung:** Legt einen vorbefüllten regulären Eintrag an. Nach der Aufnahme
verschwindet der Titel automatisch aus dem Nachtrag.

### 9.9 Mediathek-Eintrag löschen

**Auslösen:** Regulären Mediathek-Eintrag öffnen → `Eintrag löschen` →
Sicherheitsfrage bestätigen.

**Wirkung:** Entfernt den gewählten Eintrag aus der Masterliste. Verweise aus
Blogartikeln und Must-Watch bleiben als Inhalte erhalten, werden aber von dem
gelöschten Eintrag gelöst. Ein eventuell zugehöriger `Gesehen`-Status in
Entdecken bleibt erhalten; nur seine Mediathek-Verknüpfung wird entfernt.

## 10. Suche

**Auslösen:** Navigation `Suche`.

Die normale Suche ist deterministisch: Der Satz wird lokal in sichtbare
Signale zerlegt, anschließend werden vorhandene Daten gefiltert und sortiert.
Es wird nicht automatisch eine KI befragt.

Beispiele:

- `Star Wars`
- `was Melancholisches aus den 80ern im Kino`
- `traurige Komödie auf Netflix`
- `was Neues, das ich nicht kenne`

### 10.1 Erkannte Signale

Nach `Suchen` zeigt die App, was sie verstanden hat:

- harte Filter wie Titel, Genre, Kategorie, Jahrzehnt, Quelle oder Zeitraum,
- weiche Wünsche wie Stimmung,
- Ausschlüsse,
- Reihe, Franchise oder Regie,
- einen ausdrücklichen Entdecken-Wunsch.

**Auslösen:** Ein Signal-Chip anklicken.

**Wirkung:** Entfernt genau dieses Signal und berechnet die Antwort sofort neu.
Nicht zuordenbare Wörter werden sichtbar genannt.

### 10.2 Einzelner Titel

Wird genau ein Titel erkannt, zeigt die Suche eine ausführliche Metakarte mit
Bewertung, Genres, Tags, Reihe/Franchise/Regie, Kinozeiten,
Besitz und Streamingdiensten.

`Zum Eintrag` springt in die Mediathek.

### 10.3 Mehrere gleichnamige Titel

Bei mehreren Treffern fragt die App nach. Erst der Klick auf den gemeinten
Film führt eine eindeutige Titelsuche aus.

### 10.4 Trefferlisten

Normale Treffer stammen aus der eigenen Mediathek und zeigen transparent, aus
welchen Gründen sie oben stehen. Zusätzlich können passende, noch nicht
aufgenommene Kinofilme oder Streamingtitel erscheinen. Für beide lässt sich
direkt ein vorbefüllter Mediathek-Eintrag anlegen.

Entdecken-Ergebnisse werden nur bei einer entsprechenden Anfrage wie
`etwas Neues` zugeschaltet.

### 10.5 Eigene Suchwörter

**Auslösen:** Nach einer KI-Deutung einen angebotenen Wort-Chip `merken`
anklicken oder manuell unter `Settings → Suche-Vokabular` eintragen.

**Wirkung:** Verknüpft ein eigenes Wort mit Genres oder Tags. Künftige normale
Suchen verstehen es ohne erneuten KI-Aufruf.

### 10.6 Verlauf und Neue Suche

Der Suchverlauf bleibt beim Wechsel in einen anderen Tab während der laufenden
App-Sitzung erhalten. `Neue Suche` leert ihn. Enthält er eine kostenpflichtige
KI-Deutung, verlangt die App einen zweiten Bestätigungsklick.

## 11. Blog

**Auslösen:** Navigation `Blog`.

### 11.1 Artikel erstellen

**Auslösen:** `+ Neuer Artikel`.

Pflichtfelder sind Titel, Autor und Text. Zusätzlich können bis zur
vorgegebenen Höchstzahl Referenzen erfasst werden. Typ und Jahr einer Referenz
sind optional. Eine Referenzliste kann als nummerierte Reihenfolge markiert
werden.

`Shared` bedeutet: Nach der Freigabe soll eine öffentliche Kopie in den
gemeinsamen Blogbereich geschrieben werden.

### 11.2 Abgleich

Nach `Erstellen` oder `Speichern & neu abgleichen` erhält der Artikel zunächst
den Zustand `wartet`. Die App gleicht jede Referenz gegen Mediathek und
Must-Watch ab.

Mögliche Ergebnisse:

- **verlinkt:** genau ein passender Eintrag wurde gefunden,
- **Mehrfachtreffer:** der Benutzer muss einen Kandidaten wählen,
- **Rotlink:** kein passender Eintrag vorhanden.

Mehrfachtreffer blockieren die Freigabe. Rotlinks blockieren sie nicht.
Statt eines vorhandenen Kandidaten kann direkt ein neuer Mediathek-Eintrag
angelegt werden.

### 11.3 Freigeben

**Auslösen:** Im Abgleich `Freigeben`.

**Wirkung:** Der lokale Artikel wird lesbar und seine verknüpften Einträge
erhalten `Kommt vor in`-Backlinks. Ist `Shared` gesetzt und ein Konto aktiv,
wird zusätzlich eine öffentliche Projektion in `Blogs für alle` geschrieben.

Schlägt die Veröffentlichung fehl, bleibt der Fehlerzustand am Artikel
sichtbar und kann mit `Erneut versuchen` fortgesetzt werden.

### 11.4 Lesen und Rotlinks heilen

In der Leseansicht öffnen verlinkte Referenzen den betreffenden Eintrag.
Rotlinks sind rot markiert.

**Auslösen:** Rotlink anklicken.

**Wirkung:** Öffnet ein vorbefülltes Formular. Nach erfolgreichem Anlegen wird
die Referenz sofort gesetzt. Rotlinks können außerdem automatisch heilen,
sobald später ein passender Eintrag entsteht.

### 11.5 Artikel bearbeiten

**Auslösen:** Artikelkarte öffnen → `Bearbeiten`.

**Wirkung:** Speichert den Artikel wieder als `wartet` und führt einen neuen
Abgleich aus. Bereits stabile Referenzen bleiben erhalten, soweit sie weiter
passen.

### 11.6 Artikel löschen

**Auslösen:** Artikelkarte öffnen → `Löschen …` → Autorennamen exakt eingeben →
`Endgültig löschen`.

**Wirkung:**

- Bei einem öffentlichen Artikel wird zuerst die öffentliche Kopie entfernt.
- Erst nach bestätigter Entfernung wird der lokale Artikel gelöscht.
- Rotlinks und Backlinks des Artikels verschwinden.
- Bereits angelegte Mediathek-Einträge bleiben bestehen.

### 11.7 Blogs entdecken

**Auslösen:** `Blogs entdecken`.

**Wirkung:** Lädt die öffentlichen Blogprojektionen anderer Konten. Artikel
können gelesen und mit `In meine Mediathek ziehen` als lokale Momentaufnahme
übernommen werden.

Die Übernahme ist keine bloße Referenz auf den fremden Datensatz. Sie erzeugt
eine eigene lokale Kopie. Vorhandene Referenzen werden gegen den eigenen
Bestand abgeglichen; fehlende werden zu Rotlinks. Ein gezogener Artikel kann
nicht ohne Weiteres als eigener Shared-Artikel neu veröffentlicht werden.

### 11.8 Artikel exportieren und importieren

**Auslösen:** Unten `Daten (Artikel exportieren · importieren)` öffnen.

**Wirkung:**

- Export erzeugt eine Artikel-JSON-Datei.
- Import ersetzt nach Bestätigung den lokalen Artikelbestand durch die
  eingelesene, validierte Datei.

Für mehrere neue Medien auf einmal ist der getrennte `Stapelimport` unter
`Settings` vorgesehen. Er ergänzt nach einer kontrollierbaren Vorschau; der
Artikelimport hier bleibt dagegen ein vollständiger Ersatz des Artikelbestands.

## 12. Settings

### 12.1 Darstellung & Verhalten

**Erscheinung:** `Saal` ist dunkel, `Foyer` hell.

**Schriftgröße:** klein, normal oder groß. Die Einstellung ändert echte
Schriftgrößen auf den repräsentativen Kernflächen der App – unter anderem
Titel, Navigation, Bereichsköpfe, gewöhnliche Eingaben und Buttons, gemeinsame
Umschalter, mobile Suche und Hilfe. Einzelne spezialisierte oder dekorative
Flächen behalten vorerst ihre feste Gestaltung.

**Startbereich:** bestimmt, welcher Bereich nach einem normalen Start geöffnet
wird.

### 12.2 Datenmodus & Verbindung

Zeigt:

- Clean- oder Demo-Modus,
- Zustand des Katalogzugangs,
- Herkunft und Verfügbarkeit des Kinoprogramms.

`Datenbank verbinden` beziehungsweise `Datenbankzugang prüfen/ändern` öffnet
den Dialog für Supabase-URL und öffentlichen Leseschlüssel. `Verbinden & laden`
prüft beide Werte, speichert nur einen funktionierenden Zugang und lädt die App
danach neu.

Dieser Zugang erschließt den gemeinsamen Katalog. Er ist nicht das persönliche
Konto und berechtigt nicht zum Schreiben fremder Daten.

### 12.3 KI-Funktionen

`KI insgesamt` ist das Dach für alle optionalen KI-Funktionen. Darunter lassen
sich auf diesem Gerät einzeln schalten:

- Suche deuten,
- Profil aus Antworten lesen,
- KI-Prognosen,
- belegtes Filmwissen recherchieren,
- Titellisten ordnen,
- KI-Verbindung prüfen.

Die Wahl ist bewusst gerätelokal, reist nicht mit dem Konto und gehört nicht
zum Gesamt-Backup. Der serverseitige Not-Aus und die Kontofreischaltung wirken
zusätzlich. `Mit KI` ist daher keine Garantie, dass ein Aufruf gerade möglich
ist. Filmwissen-Recherche ist für bestehende und neue Geräte standardmäßig aus
und muss ausdrücklich separat eingeschaltet werden.

### 12.4 Geschmacksprofil ohne KI

**Auslösen:** `Settings → Geschmacksprofil → Profil anlegen`.

Der Ablauf besteht aus:

1. ausdrücklicher Einwilligung,
2. Schlagwörtern: einmal anklicken = zieht an, zweimal = stößt ab, dreimal =
   aus,
3. bekannten Filmen mit derselben Richtungswahl,
4. optional bewegten WIE/WAS/WARUM-Reglern,
5. einer Vorschau und `Ins Profil übernehmen`.

Nur tatsächlich gewählte beziehungsweise bewegte Angaben werden gespeichert.
Der Ablauf funktioniert vollständig ohne KI.

### 12.5 Geschmacksprofil mit drei Fragen

**Voraussetzungen:** aktives Konto mit KI-Freischaltung, globaler und
funktionsbezogener KI-Schalter an.

**Auslösen:** `Drei Fragen beantworten`.

**Wirkung:** Mindestens eine freie Antwort wird einmal an den KI-Dienst
übertragen. Die Antworten selbst werden nicht in das Geschmacksprofil
gespeichert. Die App zeigt zuerst jeden abgeleiteten Vorschlag samt Textbeleg,
Sicherheit und Richtung. Signale, Filme, Achsen und nicht deutbare Angaben
können einzeln abgewählt werden. Erst `Ausgewähltes übernehmen` schreibt sie
ins Profil.

### 12.6 Profil pflegen und Einwilligung widerrufen

Ein bestehendes Profil zeigt Signale, Herkunft, Richtung, Achsentendenzen,
Filme, nicht deutbare Angaben und wartende Vorschläge.

**Möglichkeiten:**

- Richtung eines Signals ändern,
- einzelne Signale entfernen,
- weitere Angaben machen,
- erneut drei Fragen beantworten,
- nicht deutbare Angaben entfernen,
- `Einwilligung widerrufen`.

Der Widerruf löscht das Geschmacksprofil einschließlich bestätigter und offener
Profildaten. Mediathek, Bewertungen, Blog und sonstige Daten bleiben erhalten.

### 12.7 Konto & Geräte-Sync

#### Anmelden

Benutzername und Passwort eingeben und `Anmelden` wählen. Nach der Anmeldung
ordnet die App einen vorhandenen lokalen Bestand nicht still dem Konto zu.
Zuerst erscheint gegebenenfalls der Übernahmeassistent.

Wird direkt aus dem Demo-Modus angemeldet, lädt die App stattdessen den
aktuellen Kontostand und entfernt die Demo-Beilagen, statt sie mit dem Konto zu
vermischen.

#### Bestand übernehmen

Der Assistent vergleicht die persönlichen Bereiche lokal und im Konto. Er
unterscheidet leere, einseitig gefüllte, identische, unterschiedliche und einem
anderen Konto zugeordnete Bestände.

Vor einer Überschreibung muss der Benutzer eine Richtung wählen. Die Übernahme
wird über Prüfsummen verifiziert; ein bloßer Vergleich von Stückzahlen genügt
nicht. Ein Backup wird vorher angeboten. Konto, Cache-Owner und Übergang werden
vor dem ersten Pull persistent gebunden; ein abgebrochener oder paralleler
Tab-Übergang darf deshalb keinen fremden Kontostand als Gast veröffentlichen.

#### Automatischer Abgleich

Änderungen werden lokal gespeichert und unmittelbar für das Konto übertragen.
Der Status zeigt `synchron`, `ausstehend`, `nicht aktuell`, `zu groß` oder echte
Konflikte. `Kontostand erneut laden` erscheint nur als Wiederherstellungsweg,
wenn der lokale Stand nachweislich nicht aktuell ist. Ein Konto- oder
Treiberwechsel entwertet laufende Schreib-, Pull- und Tokenvorgänge.

#### Konflikte

Bei gleichzeitigen Änderungen auf zwei Geräten wird pro Datenbereich gefragt:

- `Diesen Gerätestand behalten`, oder
- `Kontostand übernehmen`.

Es findet keine stille inhaltliche Zusammenführung zweier JSON-Stände statt.

#### Ausstehende Änderungen erneut senden

Der Knopf erscheint nur, wenn tatsächlich wartende lokale Schreibvorgänge
vorhanden sind, und versucht ausschließlich diese erneut zu übertragen.

#### Abmelden

Sendet zuerst ausstehende Kontoänderungen und beendet danach die Kontositzung.
Die geladenen Kontodaten werden aus dem Gastbetrieb entfernt. Existierte vor
der Anmeldung ein lokaler Gaststand, wird er wiederhergestellt. Bei offenen
Konflikten oder nicht sicherbaren Änderungen wird der Logout blockiert und ein
Backup beziehungsweise eine Konfliktentscheidung verlangt. Scheitert die
sichere Trennung technisch, bleiben Zugang und Kontocache gesperrt statt unter
einer Gastoberfläche sichtbar zu werden.

#### Passwort ändern

Öffnet ein Feld für ein neues Passwort mit mindestens acht Zeichen.

#### KI-Verbindung prüfen

Nur bei aktivierter KI-Diagnose sichtbar. Prüft Anmeldung, Endpunkt, Not-Aus
und Budgetzustand, ohne ein Modell aufzurufen und ohne KI-Kosten zu erzeugen.

### 12.8 Masterliste

Zeigt Zahl, Version und Herkunft der eigenen Mediathek.

**Masterliste exportieren:** lädt die Mediathek als JSON herunter und setzt den
zugehörigen Sicherungswächter genau bis zur tatsächlich exportierten Revision
zurück. Eine während des Exports bestätigte spätere Änderung bleibt daher als
ungesichert sichtbar.

**Masterliste importieren/ersetzen:** liest eine validierte Masterlisten-Datei
oder eingefügtes JSON. Der Import ist ein vollständiger Ersatz, keine
automatische Zusammenführung.

### 12.9 Stapelimport mit interner oder externer KI

**Auslösen:** Unter `Stapelimport` eine Titelliste eingeben oder den Abschnitt
`Regalfotos extern mit GPT, Claude oder einer anderen KI lesen` öffnen.

**Wirkung:** Bei freigeschalteter App-KI kann Kinodreieck eine eingegebene
Titelliste intern strukturieren. Der alternative Fotoweg erzeugt einen Workflow
für einen frei gewählten externen KI-Chat und verursacht im Kinodreieck keinen
Anbieteraufruf. Die zurückgelieferte JSON-Datei beziehungsweise eingefügtes
JSON wird zunächst als Vorschau analysiert. Erst `Auswahl übernehmen` legt neue
Einträge an; vorhandene Einträge werden nicht überschrieben.

Der aktive externe Stapelvertrag heißt `mediathek-v2`. Der ebenfalls im Code
vorhandene Vertrag `kinodreieck-paket` besitzt derzeit keine gemountete
Oberfläche `Teilen & Tauschen` und wird deshalb hier nicht als erreichbare
Produktfunktion ausgewiesen. Der sonstige Austausch läuft über Shared Blogs,
Masterlisten-Import/-Export und Gesamt-Backup.

### 12.10 Gesamt-Backup

**Auslösen:** `Gesamt-Backup herunterladen`.

**Wirkung:**

- versucht bei einem Konto zuerst einen frischen Abgleich,
- liest danach die registrierten persönlichen Datenbereiche aus dem aktiven
  Speicher,
- erzeugt eine lokale JSON-Datei,
- meldet im Backup, wenn ein frischer Kontostand wegen Verbindung oder
  Konflikt nicht garantiert werden konnte,
- bindet Pull und alle Reads an denselben Konto-/Gastkontext und bricht bei
  einem Kontextwechsel ab, statt eine gemischte Datei zu erzeugen,
- markiert Master und Artikel nur bis zu den Revisionen, die wirklich in der
  heruntergeladenen Datei enthalten sind.

Enthalten sind unter anderem Masterliste, Artikel, Pins, Merkliste,
Suchvokabular, Settings, Entdecken-Status, Autorname,
Streamingdienste, Must-Watch, Profil und persönliche Filterzustände.

Nicht enthalten sind Passwort, Sitzungstoken, gemeinsamer Kino-/Streaming-
Katalog, Katalog-Leseschlüssel und die gerätelokale KI-Grundentscheidung.

### 12.11 Backup wiederherstellen

**Auslösen:** Auf Desktop im Backup-Bereich eine Backup-Datei wählen.

**Wirkung:**

1. prüft das vollständige Backup vor dem ersten Schreibvorgang,
2. sichert den bisherigen lokalen Zustand als Rückholpunkt,
3. schreibt nur bekannte persönliche Datenbereiche,
4. nimmt bei einem Teilfehler alle bereits geschriebenen Bereiche zurück,
5. überträgt im Kontobetrieb die Änderungen und prüft sie bitgleich.

Nach Erfolg muss die App über `Neu laden & anwenden` neu aufgebaut werden.
`Rückgängig` stellt den vor dem letzten Restore gesicherten Zustand wieder her.
Der Rückholpunkt ist an den aktiven Konto-/Gast-Owner gebunden und wird nach
einem Kontextwechsel weder angeboten noch in einen anderen Datentopf gespielt.

Ältere Backups löschen keine neueren Datenbereiche, die in der alten Datei gar
nicht vorhanden waren.

### 12.12 Streaming-Quellen

**Auslösen:** In `Streaming-Quellen` nach einem Dienst suchen und einen Treffer
anklicken.

**Wirkung:** Fügt ihn der persönlichen Auswahl hinzu und filtert Streaming-
Ansichten und Dashboard. Ausgewählte Dienste sind immer sichtbar und über `×`
abwählbar. Eine leere Auswahl bedeutet: alle Dienste zeigen.

Die Funktion zeigt außerdem, wie viele ausdrücklich gesehene Serien für neue
Staffelstände beobachtet werden.

### 12.13 Suche-Vokabular

**Auslösen:** Wort sowie Genres oder Tags eintragen → `Merken`.

**Wirkung:** Erweitert den lokalen deterministischen Parser um den eigenen
Wortschatz. `×` entfernt einen Eintrag wieder.

### 12.14 Katalog-Status

Zeigt Stand, enthaltene Quellen, Zahl der bekannten und zu entdeckenden Titel,
Watchmode-Quotenstand und gemeldeten Resettermin. Ein mehr als 35 Tage alter
Katalog wird sichtbar gewarnt.

### 12.15 Erweitert – Wartung

`Katalog jetzt neu laden` lädt Kino und beide Streamingteile erneut aus der
Datenbank. Es entstehen keine Watchmode-Anfragen.

`Programm-Snapshot importieren` spielt einen lokalen JSON-Snapshot ein.

`Nonstop-Seite laden` verarbeitet lokal gespeichertes HTML als Notfallweg.

`alte Must-Watch-Flags migrieren` überführt gegebenenfalls alte Wunschlisten-
Flags einmalig in die eigenständige Must-Watch-Liste.

Ein alter Besitzimport kann vorhandene ältere Besitzdaten übernehmen und
meldet übernommene sowie übersprungene Einträge.

`Programm-Cache leeren` entfernt den lokalen Programmstand und den zugehörigen
Browsercache. Beim nächsten Laden wird wieder die Datenbank verwendet.

### 12.16 Über, Anleitung und Download

`Über Kinodreieck & Anleitung` zeigt Produkterklärung, Dreieck, Bereichshilfe,
Alltag, Automatik, Sicherung und Störungshilfe.

Im Web führt `Einzeldatei herunterladen` zur Downloadseite. In einer bereits
lokal geöffneten Einzeldatei wird dieser Link nicht gezeigt.

Hinter dem Namen `Max` liegen zwei bewusst versteckte Präsentationsmodi: Im
dunklen Grundthema schaltet der erscheinende Knopf Neon Noir ein, im hellen
Grundthema Showa. Derselbe Knopf schaltet den Sondermodus wieder aus. Beide
Funktionen sind rein optisch und verändern keine Fachdaten.

Ist das unsichtbare Achievement `deep-space-horror` bereits freigeschaltet,
kann beim Eintritt in Neon Noir mit einer Chance von 1:10 stattdessen für die
laufende App-Sitzung ein industrieller Raumschiffkorridor erscheinen. Das
gesamte Interface wechselt dabei auf eine kantige Bordcomputer-Gestaltung mit
technischer Monospace-Schrift, kalten Metallplatten und bernsteinfarbenen
Kontrolllichtern. Kurze, deutlich wahrnehmbare Lichtaussetzer erfassen in
unregelmäßig wirkenden Abständen Kulisse, Schrift und Bedienelemente gemeinsam.
Ein fallender Funkenregen aus einem beschädigten Kabel wirft zusätzlich einen
kurzen warmen Lichtstoß über das Interface. Kalter Dampf und eine langsam
rotierende orange Warnleuchte beleben die räumliche Tiefe, ohne ein sichtbares
Wesen zu zeigen. Die Bedrohung bleibt dadurch rein atmosphärisch; Kreaturen- und
Bluteffekte sind bewusst nicht Bestandteil der Kulisse.

Auf kleinen Viewports wird der Korridor zu einem engen Wartungsschacht mit
eigenständiger Perspektive. Reduzierte Bewegung zeigt ein vollständig statisches
Bild. Reload, Schließen der App oder Ausschalten des versteckten Modus beendet
den Effekt. In den Einstellungen bleibt ausschließlich Neon Noir gespeichert.

Für die lokale visuelle Prüfung öffnet der Vite-Entwicklungsserver unter
`?deep-space-test=1` eine kleine Animationswerkstatt. Sie kann Dampf,
Lichtflackern, Funkenregen und Warnleuchte einzeln wiederholen, pausieren oder in
der normalen Zufallsfolge zeigen. Dieser Testmodus ist an
`import.meta.env.DEV` gebunden, verändert weder Einstellungen noch Rhythmus und
ist im Produktionsbuild nicht aktivierbar.

### 12.17 Achievements und Cage-Alphabet

Achievements werden lokal aus eindeutigen Titel-/Jahr-Treffern der Mediathek
berechnet und im persönlichen Datenbestand gespeichert. Ein einmal erreichtes
Achievement bleibt freigeschaltet.

Aktiv ist derzeit das `Cage-Alphabet`: Ab fünf passenden Nicolas-Cage-Filmen
ist es freigeschaltet. Höchstens einmal pro Tag kann mit einer kleinen
Zufallschance eine goldene Karte erscheinen. Sie wählt aus den qualifizierten
Filmen nur solche, die gerade im Kino, im physischen Besitz oder auf einem
ausgewählten Streamingdienst verfügbar sind, und kann zum betreffenden
Eintrag springen. Bei reduzierter Bewegung wird die Animation übersprungen.

Das ebenfalls unsichtbare Achievement `deep-space-horror` wird ab vier
verschiedenen Filmen aus der hinterlegten Liste von Alien-Filmen, *Prometheus*,
*Event Horizon* und *2001: A Space Odyssey* freigeschaltet. Deutsche und
originale Titel werden nur mit dem jeweils korrekten Erscheinungsjahr erkannt;
doppelte Mediathekseinträge zählen einmal. Eine neue Freischaltung meldet vier
Sekunden lang ausschließlich `Easteregg freigeschalten!`; bereits passende
Altbestände werden beim ersten Lauf still übernommen.

Nach der Freischaltung wird nur beim Start mit gespeichertem Neon Noir oder
beim bewussten Einschalten gewürfelt. Der erste Versuch ist sofort möglich,
ein Fehlwurf setzt den nächsten Termin drei lokale Kalendertage später, ein
Treffer fünf Tage später; anschließend gilt wieder der Dreitagesrhythmus. Am
31. Oktober ist trotz laufender Sperre ein einzelner zusätzlicher Versuch
möglich. Pro Tag und Profil beziehungsweise Gast gibt es höchstens einen Wurf.
Dieser Rhythmus bleibt gerätelokal und wird weder synchronisiert noch
exportiert; dauerhaft synchronisiert wird nur das Achievement.

Weitere vorbereitete Inszenierungen wie Teppich, Star-Wars-Crawl und
Necronomicon sind im aktuellen Produkt pausiert und daher keine erreichbaren
Funktionen.

## 13. Optionale KI-Funktionen

Alle KI-Funktionen sind Opt-in, kontogebunden und zusätzlich serverseitig
begrenzt. Die deterministischen Kernfunktionen bleiben bei ausgeschalteter oder
nicht erreichbarer KI bestehen.

### 13.1 Unklare Suche deuten

**Voraussetzung:** Die normale Suche hat unzugeordnete Wörter oder gar kein
Signal erkannt.

**Auslösen:** Unter dem betreffenden Suchergebnis `Mit KI deuten`.

**Wirkung:** Sendet nur den Suchsatz und Listen erlaubter Genres/Stimmungen an
den KI-Endpunkt, nicht die Mediathek oder Notizen. Die normale Antwort bleibt
erhalten. Die Deutung zeigt auch nicht umsetzbare Wünsche und Werte, die in den
Daten fehlen. Es gibt keinen automatischen Wiederholversuch und nur einen
gleichzeitigen Aufruf.

### 13.2 Profil aus drei Antworten lesen

Siehe Abschnitt 12.5. Die Vorschau verhindert, dass ein Modellvorschlag ohne
ausdrückliche Bestätigung ins Profil gelangt.

### 13.3 Persönliche KI-Prognose

**Voraussetzungen:**

- bereites KI-fähiges Konto,
- KI-Prognosen auf diesem Gerät aktiviert,
- gültiges Geschmacksprofil mit Einwilligung,
- mindestens ein bestätigtes Profilsignal.

**Auslösen:**

- bei einem bestehenden unbewerteten Film Karte öffnen →
  `KI-Prognose erstellen`, oder
- beim neuen Eintrag `Anlegen & KI-Prognose erstellen`.

**Wirkung:** Speichert zuerst einen unbewerteten Eintrag und startet danach
genau einen kostenpflichtigen KI-Aufruf ohne Websuche. Das Ergebnis enthält
persönliche Passung, vorgeschlagene Achsen, Begründung, Kategorie,
Sicherheit, verwendete Profilsignale, Modell, Profilversion und Kosten.

`Nur Prognose bestätigen` bestätigt ausschließlich den Status des
KI-Vorschlags. `Als Bewertung übernehmen` öffnet eine vorausgefüllte Vorschau;
erst nach Prüfung aller Achsen, Wahl der Kategorie und ausdrücklichem Speichern
entsteht eine echte Bewertung mit sichtbarer KI-Herkunft. `Echt bewerten /
korrigieren` öffnet die reguläre Bewertung. `Verwerfen` verwirft den Vorschlag.
`Prognose neu berechnen` erfordert eine Bestätigung und kann erneut Kosten
erzeugen.

### 13.4 Belegtes Filmwissen

Bei einem angemeldeten Konto lädt das Öffnen eines unbewerteten Filmeintrags
gegebenenfalls einen bereits vorhandenen gemeinsamen Werkbericht. Dieser kann
einen belegten WARUM-Wert, Kurztext, Sicherheit, Version und verlinkte
Fundstellen enthalten.

Fehlt ein Bericht, kann `Recherchebericht erstellen` angeboten werden. Dafür
braucht der Eintrag eine eindeutige IMDb-, TMDB- oder Wikidata-Kennung sowie
ein bereites Personal-AI-Konto, den globalen KI-Schalter und den ausdrücklich
aktivierten Filmwissen-Schalter. Ein Geschmacksprofil oder eingeschaltete
KI-Prognosen sind dafür nicht erforderlich.

**Wirkung:** Nach einer ausdrücklichen Kostenbestätigung startet genau ein
Sonnet-Aufruf mit festem Quellenweg. Die Oberfläche nennt eine Obergrenze von
6 US-Cent und wiederholt den Aufruf nicht automatisch. Ein nicht belegter
Bericht bedeutet nur, dass der feste Quellenweg keine ausreichenden Belege
gefunden hat – nicht, dass der Film bedeutungslos sei.

### 13.5 KI-Diagnose

Siehe Abschnitt 12.7. Die Diagnose ruft kein Modell auf und ist deshalb
kostenfrei.

## 14. Gemeinsame Daten, persönliche Daten und Offlineverhalten

### 14.1 Persönlich

Persönlich sind insbesondere:

- Mediathek und Bewertungen,
- Blogartikel,
- Pins und Merklisten,
- Must-Watch,
- Streamingdienste,
- Settings und Filterzustände,
- Suchvokabular,
- Geschmacksprofil.

Ohne Konto liegen diese Daten nur im Browser. Mit Konto werden sie zusätzlich
kontogebunden gespeichert.

### 14.2 Gemeinsam

Gemeinsam sind:

- Kino- und Streamingkatalog,
- öffentliche Projektionen ausdrücklich geteilter Blogartikel,
- gemeinsame Filmwissen-Berichte.

Der gemeinsame Katalog ist für den Client schreibgeschützt. Persönliche
Bewertungen werden nicht in ihn zurückgeschrieben.

### 14.3 Offline

Die installierte PWA speichert ihre App-Hülle im Browsercache. Bereits lokale
persönliche Daten bleiben bedienbar. Kontoabgleich, aktuelle Katalogdaten,
öffentliche Blogs, Filmwissen und KI benötigen eine Verbindung. Bei einem
Netzausfall zeigt die App nach Möglichkeit den letzten gültigen Katalogstand
mit Herkunftswarnung statt ihn als frisch auszugeben.

## 15. Fehler- und Sicherheitsverhalten

- Ungültige Importdateien werden vor der Übernahme abgewiesen.
- Konto-, Backup- und Restore-Übergänge prüfen Owner, Generation, Revisionen
  und Prüfsummen.
- Ein Kontowechsel entwertet noch laufende persönliche KI- und Speicherläufe.
- Mehrtopf-Aktionen für Master, Must-Watch und Blogartikel werden serialisiert;
  ein Teilfehler wird kompensiert oder sichtbar fail-closed beendet.
- Wochenplan- und Streamingstatus erscheinen erst nach bestätigtem
  Storage-Write als erfolgreich.
- Unabhängige Fehler stehen in einer auf fünf Einträge begrenzten Queue. Ein
  neuer Fehler überschreibt keinen anderen und jeder Eintrag ist einzeln
  schließbar.
- Kann die App persönliche Kontodaten nicht sicher vom Gast trennen, hängt sie
  den normalen App-Baum aus und zeigt nur die geschützte Konto-Wiederherstellung.
- Öffentliches Löschen eines Shared-Artikels wird bestätigt, bevor die lokale
  Kopie verschwindet.
- Bezahlte KI-Aktionen werden nicht automatisch wiederholt.
- Bei einem unerwarteten React-Fehler stoppt eine letzte Fehlergrenze die
  Ansicht, erzeugt nur eine technische Fehler-ID und bietet
  `Gesamt-Backup versuchen` sowie `App neu laden` an. Der eigentliche
  Fehlertext wird nicht automatisch übertragen.
- Die App besitzt keine eigene Telemetrie oder Sitzungsaufzeichnung.

## 16. Typische Abläufe

### Einen Film bewerten

1. `Mediathek` öffnen.
2. Passende Untergruppe wählen.
3. `+ Eintrag hinzufügen`.
4. Titel, Jahr und gewünschte Metadaten eintragen.
5. WIE, WAS und WARUM setzen.
6. `Hinzufügen`.

### Einen Kinoabend planen

1. `Kino` öffnen.
2. Nach Kino, Tag, Abo und Fassung filtern.
3. `◇` vor passenden Uhrzeiten anklicken.
4. Angepinnte Termine oben oder im Start-Dashboard vergleichen.

### Einen Streamingtitel vormerken

1. `Streaming → Entdecken`.
2. Dienste und Genre filtern.
3. `☆` anklicken.
4. Der Titel liegt in der Merkliste und kann im Dashboard erscheinen.

### Einen Artikel veröffentlichen

1. `Blog → Neuer Artikel`.
2. Text und Referenzen erfassen.
3. Für einen öffentlichen Artikel `Shared` markieren.
4. Erstellen und Mehrfachtreffer klären.
5. `Freigeben`.

### Auf einem zweiten Gerät arbeiten

1. Auf Gerät 1 Gesamt-Backup herunterladen.
2. Auf Gerät 2 anmelden.
3. Übernahmeassistent beziehungsweise `Daten aus dem Konto laden` verwenden.
4. Syncstatus prüfen.
5. Bei Konflikten bewusst Geräte- oder Kontostand wählen.

### Einen vollständigen Stand sichern

1. `Settings → Gesamt-Backup`.
2. Syncstatus beziehungsweise mögliche Warnungen prüfen.
3. `Gesamt-Backup herunterladen`.
4. Datei außerhalb des Browserprofils sicher aufbewahren.

## 17. Was vor dem öffentlichen Start noch zu tun ist

Die Architektur- und Vereinfachungsrunde ist abgeschlossen. Das Produkt ist
aber noch nicht vollständig öffentlich abgabefertig. Offen sind:

1. **Aktuellen Arbeitsstand versionieren und veröffentlichen:** Die neuen
   Frontendänderungen sind lokal, noch nicht committed und noch nicht
   ausgerollt.
2. **Reale Gerätetests:** Android- und iOS-Installation sowie die vorbereiteten
   Mehrgeräte-, Offline- und Beta-Szenarien praktisch durchführen.
3. **Geschlossene Beta abschließen:** vier bis fünf konkrete Tester,
   Feedbackkanal, freigegebene Testinhalte und Ergebnisbögen.
4. **Datenschutz, Impressum und KI-Transparenz:** reale Datenflüsse,
   Verantwortliche, Dienstleister, Rechtsgrundlagen, Aufbewahrungsfristen,
   Drittlandtransfers und Kontaktweg dokumentieren.
5. **Selbstbedienung:** vollständige serverseitige Accountlöschung und ein
   tragfähiger Passwort-Reset vor einer offenen Registrierung.
6. **Noch nicht live belegte Funktionsblöcke:** internen Stapelimport samt
   Migration/Function/Budget als Paket ausrollen; Filmscan, Bloganalyse,
   Serienradar und den ungemounteten Paketaustausch bewusst entscheiden.
7. **Betrieb:** Monitoring, Alarmgrenzen, Releasehinweise, Supportweg und
   regelmäßige RLS-/Abhängigkeitsprüfungen festziehen.
8. **Lokaler Cleanup:** die im Architektur-Audit als KD-A15 markierten
   ignorierten persönlichen Arbeitsartefakte erst nach ausdrücklicher Freigabe
   verschieben oder löschen.

Diese Punkte erfordern keinen weiteren Architekturumbau. Sie sind ein
überschaubarer Abschlussblock aus Produktlücke, Praxistest, Rechtstext,
Betriebsfreigabe und Repository-Hygiene.
