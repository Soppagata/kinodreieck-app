# Blog: einfacher Editor, klare Karten und anonyme Veröffentlichung

Stand: 18.09.2026 · Status: lokaler Bau beauftragt; Fortschritt im Bauebenenplan.

Die parallele Umsetzung ist im [Bauebenenplan](BLOG_BAUEBENEN_2026-09-18.md)
mit Paketownern, Schnittstellen und dem einzigen Meilensteinregister gegliedert.

Max' Auftrag: Den Pseudonym-/User-Name-Plan vorerst verwerfen und einen
bedienbaren Veröffentlichungsweg nach **Entdecken → Blog → Veröffentlicht**
planen. Beiträge sollen dort für andere Nutzer ohne sichtbaren Nutzernamen
erscheinen. Eine Aliasvergabe in den Settings und eine Namens-Masterliste
entfallen.

Ergänzung aus Max' anschließendem Auftrag: **Anonym veröffentlichen** wird
eine Checkbox im Abschlussbereich. Eingabe, Referenzabgleich, Karten und
Buttonanordnung werden gemeinsam vereinfacht. Der bisherige separate
Freigabebildschirm entfällt; sein fachlicher Referenzcheck bleibt erhalten.

Korrektur nach Max' Klarstellung: **Titellisten mit echten Verknüpfungen und
Rotlinks sind das Herzstück des Blogbereichs.** Beispielsweise soll eine eigene
Star-Wars-Rangliste oder Watch-Order auf die passenden Titel in Mediathek und
Streaming führen. Die Referenzen werden deshalb weder zur versteckten
Zusatzfunktion noch zu bloßen Textetiketten. Die frühere Idee eines standardmäßig
eingeklappten optionalen Referenzbereichs ist verworfen.

Max' Architekturentscheidung vom 18.09.: Beim Veröffentlichen gleicht das
Backend die Referenztitel mit Streamingquellen und Kinoprogramm ab und speichert
die bestätigten Quellenzuordnungen. Beim Öffnen von **Veröffentlicht** werden
diese vorbereiteten Tags nur nach den ausgewählten Streamingquellen gefiltert
und um den Abgleich mit der accountspezifischen Mediathek ergänzt. Der aufwendige
Quellenabgleich liegt vor dem Lesen; der Bereich wartet nicht auf einen
Katalogdownload oder neue Anbieterabfragen.

## Verbindlicher Kern: Titelliste, Reihenfolge, Verknüpfung und Rotlink

- Die Titelliste ist im Editor und in der Leseansicht ein gleichrangiger,
  unmittelbar sichtbarer Bestandteil neben dem Blogtext. Reine Textartikel
  bleiben möglich, ohne die Listenfunktion aus der Oberfläche zu verstecken.
- Sammlungen, Ranglisten und nummerierte Watch-Orders bleiben erhalten. Die
  Reihenfolge ist veränderbar; zugängliche Auf-/Ab-Aktionen funktionieren auch
  ohne Drag-and-drop. Umordnen darf keine Titelidentität oder Verknüpfung ändern.
- Ein bestätigter Titel öffnet den richtigen Eintrag in der eigenen Mediathek,
  im Streamingbereich oder im aktuellen Kinoprogramm. Ist ein Mediathekziel
  vorhanden, bleibt es das Hauptziel; Streaming und Kino sind zusätzliche,
  eindeutig beschriftete Ziele, soweit für den Leser verfügbar.
  Must-Watch-Verknüpfungen und bestehende Rückverweise bleiben nutzbar.
- Fehlt ein bestätigtes aufrufbares Ziel, bleibt der Titel als **klickbarer
  Rotlink** erhalten. Er wird weder entfernt noch durch einen ähnlichen Titel
  ersetzt. Ein Rotlink verhindert die Veröffentlichung nicht.
- Ein Rotlink kann weiterhin direkt aus dem Blog heraus geklärt oder ergänzt
  werden. Nach bestätigtem Anlegen/Zuordnen wird er verknüpft. Das bisherige
  automatische Heilen durch eindeutige Treffer und „Kommt vor in“ bleiben.
- Diese Bedienung gilt auch im gemeinsamen Bereich. Die vorbereiteten
  Streamingtags werden auf die gewählten Quellen **des jeweiligen Lesers**
  eingeschränkt; nur seine persönliche Mediathek wird beim Lesen noch
  abgeglichen. Gültige Kinotags werden direkt verwendet. Fremde private
  Mediathek-IDs und Besitzinformationen werden nicht geteilt. Das Lesen oder
  Auflösen importiert nichts in seine Mediathek.
- Eine unvollständig geladene Quelle oder ein Lesefehler beweist keine
  Nichtverfügbarkeit. Solange das Ziel nicht zuverlässig geprüft ist, erscheint
  ein Prüf-/Fehlerzustand statt eines fälschlichen Rotlinks.

## Geprüfter Bestandsstand vom 17.09.2026

Der Tab **Veröffentlicht** existiert und liest vorhandene gemeinsame Beiträge.
Der Schritt von einem eigenen Artikel in diese Liste fehlt jedoch in der
Oberfläche. Ein Nutzer kann ihn derzeit nicht über eine andere Kombination
vorhandener Schaltflächen erreichen:

- Neue Artikel werden mit `geteilt: false` angelegt.
- **Freigeben** beendet den privaten Referenzabgleich und ruft ausdrücklich
  `onFreigeben(id, { synchronisierePublikation: false })` auf.
- Der gemeinsame Tab ruft nur `sharedArticlesService.list()` auf.
- Publish/Unpublish und die interne Kontozuordnung existieren technisch;
  das ist noch kein nutzbarer Veröffentlichungsweg.

Geprüfte Referenz: lokal vorliegendes `origin/main`
`3725c33afaad58a711f94dffb511288f8237d31f`. Der ältere Hauptcheckout wurde
nicht als aktueller Produktstand verwendet. Dies ist kein Live-Readback.
Belege: `src/tabs/EntdeckenTab.jsx`, `src/tabs/BlogTab.jsx`, `src/App.jsx`,
`src/services/sharedArticles.js` sowie die Shared-Article-Migrationen.
Am selben Stand bestand der vorhandene
`private_release_blog_surface_test.mjs` am 17.09.2026 mit 22/22 Mockchecks.

Gezielte Nachprüfung zur Referenzfrage: blog_test.mjs 24/24 und
private_release_blog_surface_test.mjs 22/22 bestanden. Ausgeführt im bestehenden
Integrationscheckout bei 604b7ff0e1b6c0ea654f260f7c63922c4fddb0a7; die für
diesen Befund gelesenen Blog-/Referenzdateien und diese Tests sind gegenüber
der obigen Referenz unverändert. Es wurde kein Produktcode geändert.
Eine zusätzliche Star-Wars-Probe bestätigt die Rangfolge, stabile Referenzen
beim Umordnen, Mediathek-/Must-Watch-Ziele, Rotlink-Heilung und Rückverweise.

Der bestehende Code enthält bereits Mediathek-/Must-Watch-Abgleich, stabile
Referenzen, nummerierte Listen, Rotlinks und Rotlink-Ergänzung. Das
Referenzuniversum ist derzeit „Master ∪ Must-Watch“, nicht der gesamte
Streamingkatalog. Streaming kann über die Zielverknüpfung eines passenden
Must-Watch-Eintrags erreicht werden. Außerdem zeigt die gemeinsame Leseansicht
derzeit Referenzen nur als Text (nurLesen, master={[]}). Ein unmittelbarer
Streamingabgleich und aktive Verweise in gemeinsamen Blogs sind deshalb
ausdrücklich einzuplanende Lücken; sie werden hier nicht als bereits
vollständig funktionierende Bestandsleistung ausgegeben.

## Quellen beim Veröffentlichen vorbereiten, beim Lesen nur personalisieren

### Veröffentlichen und Aktualisieren

Nach bestätigtem privatem Speichern verarbeitet das Backend die maximal
15 Referenzen der zu veröffentlichenden Fassung. Es gleicht sie gebündelt mit
den vorhandenen zentralen Streaming- und Programmdaten ab. Dafür gelten alle
im bestehenden Katalog geführten Quellen, unabhängig von der Abowahl des
Verfassers. Ein Blog wird damit nicht auf dessen persönliche Quellen begrenzt.
Es werden weder pro Referenz Live-Anbieterabfragen noch neue KI-Aufrufe
ausgelöst; die bestehenden Quellen und deren Aktualisierung bleiben maßgeblich.

Das Backend bestätigt Werkidentität und Quellenzuordnung. Eine gemeinsame
starke Werk-ID hat Vorrang; andernfalls ist nur ein eindeutiger Treffer mit
normalisiertem Titel bzw. bestätigtem Alias, passendem Jahr und Medientyp
zulässig. Widersprüchliche IDs, gleichnamige Remakes und mehrere Kandidaten
werden nicht automatisch verknüpft. Kandidaten zur Klärung erscheinen im
Editor; der Nutzer kann eine Zuordnung bestätigen oder bewusst einen Rotlink
beibehalten. Rein namensgleiche oder unscharfe Treffer reichen nicht.

Gespeichert werden stabile Werk-/Zielkennungen und Quell-IDs, kein bloßes
Freitextetikett wie „bei Netflix“. Zur Zuordnung gehören Quellenstand,
Prüfzeitpunkt und Gültigkeit; Kinoziele verweisen auf das bestätigte Werk und
das zugehörige aktuelle Programm. Der Server übernimmt vom Client keine
ungeprüften Verfügbarkeitsbehauptungen. Veröffentlichungsantwort und Lesepfad
verwenden dieselben vorbereiteten Referenzzustände.

Gleiche bestätigte Werke teilen sich die zentrale Quellenzuordnung. Bereits
aufgelöste Referenzen werden wiederverwendet. Ein unveränderter Titel wird bei
einer reinen Textänderung oder Umordnung nicht erneut gesucht; geändert werden
nur die betroffenen Referenzen. Nicht gefundene und mehrdeutige Eingaben werden
mit Titel/Jahr/Typ und Quellenrevision zwischengespeichert, bis eine neue
Eingabe, eine bewusste Klärung oder ein neuer relevanter Quellenstand vorliegt.
Ein technischer Fehler ist ein eigener Zustand und kein negativer Treffer.

Privates Speichern allein startet diesen Veröffentlichungspfad nicht.
Zeitweise fehlende Quelldaten erhalten den Status **Verfügbarkeit ungeprüft**;
der Text bleibt nutzbar, und vorhandene bestätigte Werkidentitäten gehen nicht
verloren. Eine Veröffentlichung kann mit diesem expliziten Zustand erfolgen,
ohne eine falsche Verfügbarkeit oder einen falschen Rotlink zu behaupten.
Ein Fehler beim eigentlichen Publikationswrite bleibt dagegen ein Publish-Fehler.
Spätere Ergebnisse sind an die betreffende Veröffentlichung und Fassung
gebunden; sie dürfen weder neuere Referenzen überschreiben noch einen
zurückgezogenen Beitrag wiederherstellen.

### Veröffentlicht öffnen

Die Listenabfrage liefert die Beiträge mit der kompakten, vorbereiteten
Referenzprojektion. Erste Karten erscheinen seitenweise, ohne zuerst den
gesamten Streamingkatalog, das Kinoprogramm oder alle Blogs zu laden. Es gibt
keine Anfrage pro Titel und keinen Quellenresolver im Leseweg.

- **Streaming:** Schnittmenge der gespeicherten Quell-IDs mit den aktuell
  ausgewählten Streamingquellen des Lesers bilden. Kein erneutes Titelmatching
  gegen den Streamingkatalog. Ein Quellenwechsel berechnet nur diese Ansicht
  neu; die Veröffentlichung und ihre globalen Tags bleiben unverändert.
- **Mediathek:** Referenzen über Werk-IDs bzw. die abgesicherten Identitätsregeln
  gegen einen Index des eigenen Bestands auflösen. Private Ziel-IDs bleiben
  kontogebunden und werden nicht in die gemeinsame Veröffentlichung geschrieben.
- **Kino:** Bereits bestätigte und zeitlich gültige Programmziele anzeigen.
  Beim Öffnen erfolgt kein erneuter Abgleich mit dem gesamten Kinoprogramm.
  Die Details des gewählten Ziels dürfen beim bewussten Öffnen nachgeladen werden.
- **Rotlink:** Erst wenn der Quellenstatus geprüft und der persönliche Bestand
  geladen ist, führt das Fehlen aller nutzbaren Ziele zum Rotlink. Ein Werk,
  das nur bei nicht ausgewählten Streamingdiensten liegt, kann für diesen Leser
  ein Rotlink sein, bleibt aber zentral korrekt zugeordnet. Solange Daten fehlen,
  bleiben Karten lesbar und die betreffende Verfügbarkeit ausdrücklich ungeprüft.

Die abgeleitete Ansicht ist an Konto, Quellenwahl, Mediathekstand und
Referenzversion gebunden. Kontowechsel verwirft persönliche Zuordnungen;
Mediathekänderungen aktualisieren nur die persönliche Ansicht. Das Veröffentlichen
eines Artikels und das Lesen durch ein anderes Konto teilen keine privaten Daten.

### Aktualität ohne Wartezeit beim Öffnen

Werkidentität und wechselnde Verfügbarkeit werden getrennt gepflegt. Nach
einer regulären Katalog-/Programmaktualisierung werden betroffene zentrale
Quellenzuordnungen im Hintergrund erneuert, einschließlich früherer Rotlinks.
Eine identische Zuordnung wird nicht für jeden Blog separat neu ermittelt.
Gültigkeitsgrenzen verhindern, dass abgelaufene Kinovorstellungen oder veraltete
Streamingtags weiterhin als bestätigte aktuelle Ziele erscheinen. Ein alter
Stand bleibt als solcher erkennbar; bis zur Auffrischung lautet der Zustand
ungeprüft statt verfügbar oder nicht verfügbar.

Diese Hintergrundpflege nutzt die vorhandenen Katalogimporte, deren Revisionen
und Daten. Sie erzeugt keinen neuen Anbieterabruf je Blog und keinen separaten
Abrufzyklus beim Lesen. Erfolgreiche Zuordnungen bleiben gespeichert; ein
Teilfehler wird nur für die betroffenen Referenzen nachgearbeitet. Auch alte
Veröffentlichungen erhalten die Vorbereitung vorab in begrenzten Paketen;
fehlende Alt-Tags starten keinen stillen Gesamtabgleich beim ersten Leser.
Die Quellenpflege ändert weder den Blogtext noch dessen Reihenfolge oder den
Status „Änderungen privat“.

Technischer Anknüpfungspunkt, am 18.09. im lokal vorhandenen origin/main
3725c33 geprüft: Die Migrationen 20260913200000_streaming_pages_backend.sql
und 20260914100000_streaming_pages_latency.sql enthalten bereits einen
serverseitigen Streamingindex mit Identitäts-/Titelschlüsseln, Quellen und
source_revision. Die Programmdaten werden über den bestehenden Katalogbereich
programm geführt. Das sind Bausteine; der hier beschriebene Blog-Abgleich,
seine schmale Leseprojektion und seine Hintergrundpflege sind erst zu bauen.
Vor Baubeginn müssen der dann aktuelle Stand und der tatsächlich bereitgestellte
Backendvertrag geprüft werden. Deterministische IDs, Indexabfragen und
Quellenfilter erfüllen diesen Datenpfad; ein LLM ist dafür nicht erforderlich.

## Warum der zusätzliche Freigabeschritt entfällt

Heute folgt auf das Formular ein Abgleichbildschirm, danach eine Leseansicht.
In der Liste muss zuerst eine Vorschau geöffnet werden, bevor Lesen und
Bearbeiten erreichbar sind. Innerhalb von Referenzzeilen können weitere
vollständige Film-/Medienformulare aufklappen. Diese Ebenen erklären die
verschachtelte Bedienung; eine reine Umbenennung von „Freigeben“ reicht nicht.

Der fachliche Zweck des Freigabeschritts ist überschaubar: unklare Zuordnungen
entscheiden und den Artikel als `freigegeben` markieren. Auch „Kommt vor in“
nutzt diesen Status (`src/lib/artikel.js`). Dafür braucht es keinen eigenen
Bildschirm. Nach erfolgreichem Speichern setzt der Controller den passenden
Status; Referenzentscheidungen erfolgen direkt im Editor. Ein Artikel ohne
Referenzen braucht keinerlei zusätzliche Prüfung durch den Nutzer.

## Ein Editor und eine Abschlussaktion

Der Nutzerweg lautet **Meine Artikel → Schreiben/Bearbeiten → Speichern**.
Der bisherige Freigabeschritt wird zum Abschlussbereich derselben Seite.
Die angeforderte Checkbox steht dort unmittelbar vor der Speicheraktion,
nicht auf den Karten und nicht in den Settings.

Der Editor folgt einer festen Reihenfolge:

1. **Titel:** eigene volle Zeile mit dauerhaft sichtbarem Feldlabel.
2. **Text:** großzügige Schreibfläche mit sichtbarem Label und mindestens
   16 px Eingabeschrift. Kein Autorenfeld und keine Namenspflicht.
3. **Titelliste & Verknüpfungen:** immer sichtbarer Listenbereich mit
   **Titel hinzufügen**, Reihenfolge/Sammlung und sichtbarem Zielzustand je
   Titel: **Mediathek**, **Streaming**, **Kino**, **Rotlink** oder **Zuordnung prüfen**.
   Titel zuerst; Jahr und Medientyp helfen bei Bedarf bei der Auswahl.
   Die bestehende Grenze von 15 Verweisen bleibt zunächst unverändert.
4. **Abschluss:** Checkbox **Anonym veröffentlichen**, knapper
   Sichtbarkeitshinweis, eine eindeutige primäre Speicheraktion und **Zurück**.

Referenzen werden im selben Bereich deterministisch abgeglichen. Sichere
Werkidentitäten und bestehende bestätigte Links haben Vorrang; bei
Mehrfachtreffern wählt der Nutzer einen Vorschlag oder **Als Rotlink übernehmen**.
Unscharfe Ähnlichkeit erzeugt weiterhin nur Vorschläge, keinen automatischen
Link. Im Editor werden eigene Mediathekziele und bereits vorbereitete
Quellenzuordnungen angezeigt. Beim Veröffentlichen ergänzt bzw. bestätigt das
Backend den Streaming-/Kinoabgleich; nötige Entscheidungen erscheinen wieder
an der betroffenen Zeile. Die gerade sichtbare Seite einer Streamingliste ist
niemals die Abgleichgrundlage. Es entstehen keine neuen Datenquellen,
KI-Aufrufe oder externen Suchdienste.

**Rotlink ergänzen** bleibt direkt erreichbar. Dafür gibt es eine einzelne
fokussierte Ergänzungsansicht mit verlässlicher Rückkehr, statt vollständiger
Erstellformulare unter mehreren Listenzeilen. Blogtext, Reihenfolge, Entwurf
und Checkboxzustand bleiben erhalten. Erst eine bestätigte neue ID verknüpft
den Eintrag. Ein Abbruch erhält den Rotlink. Unveränderte, bereits bestätigte
Referenzen bleiben stabil.

### Checkbox und Buttontexte

Die Checkbox ist bei einem neu begonnenen Bearbeitungsvorgang standardmäßig
aus. Sie entscheidet ausschließlich, ob die **jetzt gespeicherte Fassung**
zusätzlich anonym veröffentlicht wird. Das Umschalten allein sendet nichts.
Ihre Auswahl bleibt beim Wechsel innerhalb desselben offenen Entwurfs erhalten.

| Ausgangslage | Checkbox aus | Checkbox an |
|---|---|---|
| Neuer oder bisher privater Artikel | **Privat speichern** | **Speichern & veröffentlichen** |
| Artikel besitzt bereits eine Veröffentlichung | **Änderungen privat speichern**; veröffentlichte Fassung bleibt unverändert | **Speichern & aktualisieren**; ersetzt die gemeinsame Fassung |

Bei einem neuen oder privaten Artikel steht am Häkchen:
„Für alle angemeldeten Nutzer sichtbar. Dein Kontoname wird nicht angezeigt.“
Bei einer bestehenden Veröffentlichung zusätzlich:
„Ohne Häkchen bleiben deine Änderungen privat. Die veröffentlichte Fassung
bleibt unverändert.“ Ein fehlendes Häkchen bedeutet niemals Veröffentlichung
unter einem sichtbaren Namen und zieht auch keine bestehende Kopie zurück.

Der Nutzer kann einen privaten Entwurf auch mit unklaren Referenzen speichern.
Dann bleibt intern `wartet`; der Hinweis **Verknüpfungen prüfen** führt direkt
zur betroffenen Stelle im Editor. Der Text ist trotzdem les- und bearbeitbar.
Mit gewählter Veröffentlichung blockieren offene Mehrfachtreffer die primäre
Aktion mit einem konkreten Hinweis bei den betreffenden Verweisen. Zum privaten
Zwischenspeichern genügt es, die Checkbox auszuschalten. Rotlinks blockieren
weiterhin nicht. Sind die Zuordnungen geklärt, wird beim Speichern automatisch
`freigegeben` gesetzt. Ein zusätzlicher Button „Freigeben“ oder „Fertigstellen“
entfällt vollständig.

Die Speicheraktion persistiert zuerst die private Fassung und veröffentlicht
nur nach erfolgreicher Bestätigung. Bei Publish-Fehler bleibt der private Text
erhalten; **Privat gespeichert, Veröffentlichung fehlgeschlagen** ist der
sichtbare Zustand. Eine gezielte Wiederholung sendet den bereits gespeicherten
Inhalt. Änderungen danach verlangen wieder eine bewusste Speicheraktion.
Während des Vorgangs sind doppelte oder widersprüchliche Aktionen gesperrt.

Die Buttons stehen immer im selben Abschlussbereich: primäre Aktion gut
sichtbar, **Zurück** nachgeordnet. Auf schmalen Displays darf die primäre
Aktion die volle Breite nutzen. Es gibt dort kein **Abbrechen & löschen**.
Eine gezielte Rückfrage ist nur beim tatsächlichen Verwerfen ungespeicherter
Änderungen nötig. Tabwechsel bewahren den Entwurf im aktuellen Konto.

## Blogkarten und Lesen ohne zusätzliche Klappe

**Gestaltungsentscheidung vom 18.09.: Referenzlisten bleiben kompakt und schlicht.**
Ein Eintrag besteht aus Rang (falls nummeriert), verlinktem Titel und einem
dezenten Quellenhinweis. Die Referenzen bleiben unmittelbar sichtbar, bekommen
aber keine eigenen Filmkarten, Poster, flächigen Quellenchips oder große
Abstände. Backend-Tags sind Daten für die Navigation, kein Anlass für eine
technische Detailanzeige.

- Titel und kurzer Quellenhinweis stehen möglichst in derselben Zeile.
  Lange Titel dürfen auf schmalen Geräten umbrechen; wesentliche Titelteile
  werden nicht abgeschnitten. Mehrere verfügbare Ziele bleiben über dezente,
  beschriftete Links erreichbar, ohne eine Buttonleiste pro Titel aufzubauen.
- Rotlinks werden durch roten Linktext und eine zugängliche Bezeichnung
  kenntlich. Ein wiederholter Erklärungssatz unter jedem Titel entfällt.
- Auf einer Blogkarte erscheinen höchstens drei kompakte Listeneinträge;
  weitere Titel werden mit einer kurzen Anzahl angekündigt. Die vollständige
  Liste erscheint direkt beim Lesen, ohne zusätzliche Vorschauklappe.
- Nur im Editor bekommt jede Zeile eine kleine Aktion **⋯** für
  **Nach oben**, **Nach unten** und **Entfernen**. Die normale Leseansicht
  enthält keine Sortier-/Löschbuttons. Tastaturbedienung und ausreichende
  Touchflächen bleiben trotz der kompakten Darstellung erhalten.
- Quellenstand, interne IDs und Prüftechnik bleiben im Backend. Ein noch
  ungeprüftes Ziel erhält nur den nötigen knappen Hinweis. Die Nummerierung
  und das Feld zum Hinzufügen bleiben einfache Controls für die ganze Liste.

- **Meine Artikel** und **Veröffentlicht** bleiben die beiden Blogbereiche.
  **Neuer Artikel** steht einheitlich rechts am Bereichskopf bzw. darunter,
  wenn die Bildschirmbreite es erfordert.
- Jede eigene Karte zeigt direkt Titel, einen kurzen Textauszug, Datum und
  den verständlichen Zustand **Privat**, **Veröffentlicht** oder
  **Änderungen privat**. Ein Referenzproblem ist ein ergänzender Hinweis,
  kein ausgegrauter, unlesbarer „WARTET“-Artikel.
- Bei Listenartikeln sind die ersten Titel samt Reihenfolge und
  Verknüpfungs-/Rotlinkzustand direkt erkennbar. Die vollständige Liste ist
  über **Lesen** erreichbar. Die Anzeige wird nicht auf einen pauschalen
  Referenzzähler reduziert; in gemeinsamen Blogs gelten die Ziele des Lesers.
- **Lesen** und **Bearbeiten** sind ohne vorheriges **Vorschau öffnen**
  sichtbar. Die separate Vorschauklappe entfällt; die Karte selbst wird nicht
  zum verschachtelten Button. Ein Klick auf Titel oder **Lesen** führt direkt
  zum vollständigen Text.
- **Weitere Aktionen** bündelt nachgeordnete Eingriffe wie
  **Veröffentlichung zurückziehen** und **Artikel löschen**. Löschaktionen
  stehen nicht mehr gleichrangig neben der primären Lese-/Speicheraktion.
- Gemeinsame Karten verwenden dieselbe Struktur mit **Ohne Namensangabe**
  als Autorenhinweis und **Lesen** als Hauptaktion. Private Zustände und fremde
  Bearbeitungsaktionen erscheinen dort nicht. Die Suche lautet
  **Nach Titel suchen**.
- Die vollständige Leseansicht zeigt Text und Referenzen in Ruhe. **Zurück**
  führt in den vorherigen Bereich mit erhaltener Such- und Scrollposition;
  **Bearbeiten** ist nur für den eigenen Artikel verfügbar. Die Titel der
  Referenzliste sind auch bei fremden Blogs echte Links oder Rotlinks.
  Die einzelne Ergänzungsansicht ersetzt nur die verschachtelte Anordnung,
  nicht die Fähigkeit, einen fehlenden Titel aus dem Blog heraus anzulegen.

Bestehende Kinodreieck-Typografie, Farben, Kartenradien und Controls werden
weiterverwendet. Ausreichende Touchflächen, sichtbare Feldlabels und Fokus,
320-px-Layout, Schriftvergrößerung, Tastatur und iPhone-Safe-Area gehören zur
Abnahme. Der Editor darf bei geöffneter Tastatur keine Felder oder Aktionen
verdecken. Ein neuer Modal- oder Seitenstapel ist nicht vorgesehen.

Der vorhandene Tab wird weiterverwendet. Beim Öffnen wird die Liste aktuell
geladen; nach eigener Veröffentlichung, Aktualisierung oder Rücknahme wird
ein eventuell offener Listenstand verworfen und neu gelesen. **Neu laden**
bleibt für andere bereits geöffnete Sitzungen verfügbar. Live-Push ist für
diesen Umfang nicht erforderlich.

## Änderungen, Zurückziehen und Löschen

- **Bearbeiten** ändert zunächst nur den privaten Artikel. Die letzte
  veröffentlichte Fassung bleibt sichtbar. Abweichungen werden als
  **Änderungen noch nicht veröffentlicht** angezeigt.
- Checkbox und **Speichern & aktualisieren** übernehmen bewusst die neue
  Fassung. Die vorhandene Veröffentlichung wird aktualisiert, ohne einen
  zweiten Beitrag anzulegen.
- **Veröffentlichung zurückziehen** entfernt die gemeinsame Kopie und erhält
  den privaten Artikel. Erst nach Serverbestätigung gilt er wieder als privat.
- **Artikel löschen** behält die vorhandene Reihenfolge: öffentliche Kopie
  bestätigt entfernen, danach den privaten Artikel löschen. Fehler dürfen
  die möglicherweise noch veröffentlichte Kopie nicht unsichtbar machen.
- Eigene Veröffentlichungen sind über das Konto verwaltbar. Fremde und bereits
  übernommene Artikel erhalten keine fremden Bearbeitungs- oder Löschrechte.

Private Autorenangaben aus Altartikeln können erhalten bleiben, fließen aber
nicht in die gemeinsame Kopie. Für neue Artikel entfällt die Pflicht zur
Autoreneingabe. Die Löschbestätigung darf keinen Autorennamen voraussetzen;
wo bisher ein Name einzutippen ist, wird der Artikeltitel verwendet.

## Was „ohne Namensangabe“ technisch bedeutet

Die Veröffentlichungen bleiben intern an das angemeldete Konto gebunden.
Diese Zuordnung ermöglicht Bearbeiten, Rücknahme und Kontolöschung und ist
für den Betreiber weiterhin nachvollziehbar. Andere Nutzer erhalten keinen
Login-, Konto- oder Autorennamen und keine kontoübergreifend wiedererkennbare
Autorenkennung. Sichtbarkeit bleibt auf aktive Konten beschränkt; es entsteht
kein frei im Internet zugänglicher Blog.

Die Namen müssen serverseitig aus der gemeinsamen Datenprojektion entfernt
werden. Ein im Browser ausgeblendetes Autorenfeld genügt nicht:

- Eine gemeinsame serverseitige Projektion erlaubt nur veröffentlichbaren
  Inhalt: Titel, Text, Reihenfolge, öffentliche Titelreferenzen und passende
  Zeitstempel sowie die undurchsichtige Veröffentlichungsidentität.
- Öffentliche Titelreferenzen enthalten Reihenfolge, Titel, Jahr, Medientyp,
  bestätigte öffentliche Werk-/Zielkennungen und die vom Backend vorbereiteten
  Quellentags samt Quellenstand und Gültigkeit. Bei ungeklärten Referenzen wird
  der Zustand statt einer erfundenen ID ausgegeben. Die Projektion enthält nur
  die zur Anzeige und Navigation nötigen Felder, keine vollständigen Kataloge
  oder Rohdaten der Quellen. Leser können damit ihre eigenen Ziele finden. Private
  ref-IDs des Verfassers werden durch dieses Werkformat ersetzt, nicht
  einfach mitsamt der Verknüpfungsfunktion gestrichen.
- `author` und `payload.autor` erhalten den neutralen Wert
  `Ohne Namensangabe`. Kontoname, E-Mail, `account_id`, private Metadaten und
  lokale Referenz-IDs werden nicht an andere Konten ausgegeben.
- Auch `article_id` und `payload.id` dürfen im gemeinsamen Lesepfad keine
  private, möglicherweise sprechende Artikel-ID verraten. Wo die bestehenden
  Antwortfelder für Kompatibilität gebraucht werden, enthalten sie die
  öffentliche `publication_id`. Interne Zuordnung und Write-Schlüssel bleiben
  davon getrennt. Publikations-ID und Share-Token werden serverseitig erzeugt.
- Sowohl `kd_list_shared_articles()` als auch der vorhandene
  `kd_claim_shared_article()` liefern ausschließlich diese Projektion.
  Der Claim-Pfad bekommt dadurch keinen neuen sichtbaren Produkteinstieg.
- Inserts und Updates in `kd_shared_articles` erzwingen dieselbe Reduktion
  serverseitig. Manipulierte oder ältere Clients dürfen keinen Autorennamen
  durch freie Payload-Felder einschleusen. Die bestehende Kontotrennung durch
  `auth.uid()`, aktive Kontorechte und RLS bleibt bestehen.
- Bestehende gemeinsame Kopien werden bereits bei der serverseitigen Ausgabe
  neutralisiert. Private Originale werden nicht automatisch umgeschrieben.
  Die aktuelle Sitzung verwirft zuvor geladene gemeinsame Listen beim Update;
  früher heruntergeladene oder übernommene Kopien sind nicht rückrufbar.

Titel und Fließtext bleiben vom Nutzer verfasster Inhalt. Selbst hineingeschriebene
Namen werden nicht automatisch erkannt oder entfernt. Die Funktion verspricht
das Weglassen der Kontometadaten, keine vollständige Anonymität des Textes.

## Umsetzung in überschaubarem Umfang

Die folgende Liste beschreibt den fachlichen Umfang. Die tatsächliche
Baufolge ist **Grundlage → drei parallele Pakete → Integration** nach dem
[Bauebenenplan](BLOG_BAUEBENEN_2026-09-18.md); diese fünf Punkte sind keine
fünf seriell abzuarbeitenden Baumeisteraufträge.

1. **Servergrenze:** additive Migration für gemeinsame Projektion und
   Schreibprüfung; Listen- und Claim-RPC absichern. Bestehende Tabellen,
   Kontobindung und Publikationsidentitäten weiterverwenden. Die
   Veröffentlichung läuft über einen serverseitig kontrollierten Schreibpfad,
   der den Referenzabgleich aufruft; direkte/ältere Clients dürfen diese Grenze
   weder umgehen noch eigene Quellentags als bestätigt einschleusen.
2. **Service und Artikelzustand:** öffentliche Payload ohne privaten Autor,
   belastbare Erfolgsbestätigung und gezielte Wiederholung. Den bestehenden
   Publikationsautomaten weiterverwenden; eine kleine gespeicherte Referenz
   auf den veröffentlichten Inhalt unterscheidet private Änderungen von der
   bereits geteilten Fassung. Konto- und Artikelwechsel sowie verspätete
   Antworten dürfen keinen fremden oder überholten Zustand überschreiben.
3. **Referenzwege:** Mediathek-/Must-Watch-Bestand bewahren. Den
   Streaming-/Kinoabgleich beim Veröffentlichen aus vorhandenen Backenddaten
   ergänzen, bestätigte Werk-/Quellenzuordnungen persistent wiederverwenden und
   ihre Pflege an Katalog-/Programmänderungen anbinden. Die Listenantwort
   enthält bereits vorbereitete Verweise. Der gemeinsame Leser filtert nur
   Streamingtags, gleicht die eigene Mediathek ab und nutzt gültige Kinoziele;
   er lädt keine vollständigen Quellkataloge zur Auflösung. Passende Zielnavigation
   anbinden und alte Veröffentlichungen vorab nachbearbeiten.
   „nurLesen“ verbietet fremde Artikeländerungen, nicht Navigation oder
   bewusstes Ergänzen in der eigenen Mediathek. Bestehende Rotlink-Heilung,
   Rangfolge und Rückverweise bleiben Bestandteil dieses Pakets.
4. **Editor und Karten:** Eingabe, Inline-Referenzentscheidungen und
   Checkbox-Abschluss in `BlogTab` zusammenführen und über `App` anbinden.
   Separate Abgleichseite und Karten-Vorschauklappe entfernen; Karten,
   Leseansicht und nachgeordnete Aktionen konsistent anordnen. Den internen
   Artikelstatus kompatibel pflegen, insbesondere für „Kommt vor in“.
   Speichern ohne Checkbox löst keinen Publish-Nebeneffekt aus.
5. **Auslieferung:** Backend-Anonymisierung zuerst bereitstellen und prüfen,
   danach den Client mit dem neuen Veröffentlichungseinstieg ausliefern.
   Bei unbekanntem Backendstand bleibt der neue Einstieg gesperrt, damit der
   neue Client keine anonyme Veröffentlichung verspricht, während der Server
   noch Namen ausliefert. Vor dem späteren Bau den dann aktuellen Stand lesen.

Die Planung ist seit Max' Bauauftrag vom 18.09. lokal aktiviert. Die
Baureihenfolge und belegten Ergebnisse stehen im Bauebenenregister; ein
Deployment oder gemeinsamer Datenbankwrite ist damit nicht beauftragt.
Die frühere Aliasplanung bleibt zurückgestellt.

## Gezielte Abnahme

- Konto A speichert ohne Checkbox: Konto B sieht keinen neuen Beitrag.
  Mit Checkbox und **Speichern & veröffentlichen** sieht B genau eine Kopie.
  Das Anklicken der Checkbox allein schreibt nichts und veröffentlicht nichts.
- In den vollständigen List-/Claim-Antworten fehlen A's Name, Login, E-Mail,
  Konto-ID, private Artikel-ID und private Zusatzfelder. Auch alte Zeilen und
  absichtlich manipulierte Requests erfüllen diesen Vertrag.
- Nur A kann seine Veröffentlichung ändern oder zurückziehen. Konto B,
  abgemeldete und inaktive Konten können das nicht. Gäste erhalten auch
  keinen gemeinsamen Lesepfad.
- Private Änderungen erscheinen erst nach Checkbox und **Speichern & aktualisieren**.
  Rücknahme entfernt den Beitrag beim nächsten Lesen auch für B und erhält
  A's privaten Artikel. Die sichere Gesamtlöschung bleibt funktionsfähig.
- Doppelklick, Fehler, Timeout nach möglichem Servererfolg, Reload und
  Gerätewechsel erzeugen weder doppelte Veröffentlichungen noch einen falschen
  Erfolgsstatus. Offene Vorgänge werden durch gezieltes Lesen des eigenen
  Serverstands geklärt; konkurrierende Artikelaktionen werden verhindert.
- Kontowechsel während einer Anfrage, fremde/übernommene Artikel und verspätete
  Antworten verletzen keine Kontogrenze. Privater Entwurf und gemeinsamer
  Listenstand bleiben getrennt.
- Vorhandene Service-/Transaktions- und UI-Tests gezielt erweitern. Die bisherige
  pauschale Prüfung „keine Veröffentlichung aus der Blogoberfläche“ wird durch
  „nur nach Checkbox und ausdrücklicher Speicheraktion“ ersetzt. Neue
  Datenbankregeln lokal mit realen Rollen prüfen; keine echten KI-Aufrufe nötig.
- Ein Artikel ohne Referenzen lässt sich direkt speichern bzw. veröffentlichen.
  Mehrfachtreffer sind inline entscheidbar; private Entwürfe bleiben speicherbar.
  Eindeutige Referenzen, Rotlinks, Altartikel und „Kommt vor in“ bleiben korrekt.
- Eine nummerierte **Star-Wars-Liste** ist der maßgebliche durchgehende
  Abnahmefall: ein Titel in der Mediathek, einer nur in Streaming, einer im
  aktuellen Kinoprogramm, einer ohne bestätigtes Ziel als Rotlink. Reihenfolge
  ändern, speichern, veröffentlichen, lesen und zum richtigen Ziel springen
  müssen funktionieren; Verfügbarkeiten werden mit kontrollierten Testdaten belegt.
- Konto B liest dieselbe gemeinsame Liste mit anderem Bestand: seine eigenen
  Zielverknüpfungen/Rotlinks erscheinen, Reihenfolge und Bloginhalt bleiben
  gleich. Keine private ID oder Bestandsinformation von A wird übernommen.
- Der Veröffentlichungsabgleich nutzt alle zentral vorliegenden Quellen,
  auch wenn A nur eine davon ausgewählt hat. B sieht die Tags passend zu
  seiner Auswahl; ein Quellenwechsel benötigt weder Neuveröffentlichung
  noch Streaming-Titelmatching, Provideranfrage oder Katalogvollabruf.
- Ein kalter Aufruf von Veröffentlicht liefert schon vorbereitete Referenzen.
  Anfragezahl und erste sichtbare Karten werden getrennt vom Upload gemessen:
  keine Anfrage pro Titel, kein kompletter Streaming-/Programmdownload,
  keine Resolver-/Provider-/KI-Aufrufe im Leseweg. Nachladen der eigenen
  Mediathek blockiert weder Text noch bereits bestätigte Quellenziele.
- Wiederholte Werke über mehrere Blogs und reine Text-/Reihenfolgeänderungen
  verwenden vorhandene Zuordnungen. Nach Quellenänderung aktualisieren sich
  nur betroffene Tags; neue Treffer heilen frühere Rotlinks. Quellenfehler,
  unvollständige Daten und abgelaufene Kinotermine erzeugen keine falschen
  Verfügbarkeits- oder Rotlinkbehauptungen. Die Hintergrundpflege verändert
  weder Artikelinhalt noch Publikationsstatus.
- Ein Rotlink bleibt veröffentlichbar und ergänzbar; bestätigtes Ergänzen heilt
  ihn, Abbruch verliert keinen Text. Ähnlich benannte Episoden, Remakes und
  abweichende Jahre werden nicht still vertauscht. Ein noch nicht geladenes
  Streamingsegment wird nicht fälschlich als fehlender Titel behandelt.
- Karten benötigen keine Vorschauklappe für Lesen/Bearbeiten. Kein Rückweg
  löscht implizit einen Text. Checkbox, Tabwechsel und Rückkehr aus der
  Leseansicht erhalten den erwarteten privaten Entwurfszustand.
- Abschließend den beschriebenen Weg mit zwei Konten und auf schmalem
  Bildschirm prüfen. Ein späterer Live-Readback und die praktische PWA-Abnahme
  bleiben getrennte Nachweise.
