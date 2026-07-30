# Kinodreieck: Zwischenprojekt-Leitfaden für KI-Funktionen

Stand: 24. Juli 2026

## Zweck dieses Dokuments

Dieser Leitfaden hält das gemeinsame Zielbild für die KI-Funktionen fest. Er ist
bewusst kein starrer Implementierungsplan. Die einzelnen Funktionen sollen in
eigenen Chats genauer konzipiert, gebaut und getestet werden können, ohne dass
dabei die übergreifenden Produkt-, Daten- und Sicherheitsentscheidungen verloren
gehen.

Das Dokument beschreibt:

- welche KI-Funktionen vorgesehen sind,
- wie sie zur neuen Domain-, Download- und Account-Architektur passen,
- welche Teile gemeinsames Filmwissen und welche persönliche Daten sind,
- welche Grenzen für Datenschutz, Kosten und Zuverlässigkeit gelten,
- welche Entscheidungen beim Bau einer Einzelfunktion noch offen sind,
- wann eine einzelne Funktion als sinnvoll fertig gelten kann.

Bei neuen Erkenntnissen wird dieser Leitfaden angepasst. Er ist eine gemeinsame
Orientierung, keine unveränderliche Spezifikation.

## Aktuelles Produktziel

Kinodreieck wird vorübergehend über die eigene Domain und Cloudflare Pages
bereitgestellt. Dort liegt eine statische Start- beziehungsweise Downloadseite.
Sie liefert eine feste App-Hülle oder eine einzelne HTML-Datei mit der
Grundstruktur der Anwendung.

Die App-Hülle kann enthalten:

- die vollständige Benutzeroberfläche,
- Bewertungslogik, Kategorien und lokale Suchfunktionen,
- Datenmodell, Konfiguration und Cache-Logik,
- Import, Export und lokale Backups,
- einen rechtlich unproblematischen Grundbestand,
- die Verbindungen zu Account, Datenbank und KI-Schnittstelle.

Persönliche Daten werden nach Anmeldung aus der Datenbank geladen und dorthin
synchronisiert. Der öffentliche Film- und Programmkatalog bleibt technisch von
persönlichen Daten getrennt. Aktuelle Programmdaten gehören nur dann in das
Download-Paket, wenn das jeweilige Weitergaberecht ausdrücklich geklärt ist.
Andernfalls lädt die App sie zur Laufzeit.

Die bisherige GitHub- oder loginfreie Sync-Lösung ist als Übergang zu verstehen.
Das Zielbild verwendet richtige Accounts, serverseitige Zugriffsregeln und
eindeutige Account-IDs. Ein lokaler Modus ohne Account kann trotzdem erhalten
bleiben, sofern er zum Produkt passt.

## Flexibles Architektur-Zielbild

```text
Eigene Domain / Cloudflare Pages
    |
    +-- Start- und Downloadseite
    |
    +-- Web-App oder feste HTML-App-Hülle
            |
            +-- lokaler Cache / möglicher Gastmodus
            +-- Login und persönlicher DB-Speicher
            +-- öffentlicher, read-only Filmkatalog
            +-- geschützte KI-Schnittstelle
                    |
                    +-- Claude API
                    +-- persönliches Geschmacksprofil
                    +-- gemeinsamer Filmwissens-Cache
                    +-- Nutzungs- und Kostenkontrolle
```

Cloudflare Pages verteilt öffentlichen Code. Deshalb darf sich dort und im
herunterladbaren HTML niemals ein geheimer Claude-, Supabase-Service-Role- oder
vergleichbarer Schlüssel befinden.

Claude wird ausschließlich über eine geschützte serverseitige Schnittstelle
aufgerufen. Dafür kommen beispielsweise ein Cloudflare Worker oder eine
Supabase-Funktion infrage. Diese Wahl soll zunächst austauschbar bleiben. Die App
kennt nur einen internen KI-Endpunkt und muss nicht direkt an einen bestimmten
Anbieter oder eine bestimmte Serverplattform gekoppelt werden.

Die KI-Schnittstelle übernimmt mindestens:

- Prüfung der Account-Sitzung,
- Ermittlung der freigegebenen Accountdaten,
- Zusammensetzung des jeweils kleinen Aufgaben-Prompts,
- Modellauswahl,
- Rate-Limits und Monatsbudgets,
- strukturierte Antwortvalidierung,
- Kosten- und Fehlerprotokollierung,
- Laden und Speichern erlaubter KI-Ergebnisse.

## Leitprinzipien

### Daten-App mit KI-Schicht

Kinodreieck bleibt eine Daten-App. Claude interpretiert einen gezielt
ausgewählten Ausschnitt der echten Daten. Das Modell ist nicht selbst der
Filmkatalog, die Suchmaschine oder die Datenbank.

### Gemeinsames Filmwissen und persönliche Intelligenz trennen

Filmdaten, Quellen und kulturhistorische Einordnung werden möglichst einmal
erstellt und accountübergreifend wiederverwendet. Geschmack, persönliche
Prognosen, Blogsignale und Korrekturen gehören dagegen ausschließlich zum
jeweiligen Account.

### KI schlägt vor, der Nutzer entscheidet

KI-Ergebnisse überschreiben keine echten Bewertungen oder bestätigten
Metadaten. Geschätzte Werte werden sichtbar als Schätzung geführt und können
angenommen, korrigiert oder verworfen werden.

### Deterministische Datenarbeit zuerst

Filterung, DB-Abfragen, Dublettenerkennung, Programmsuche und Rechteprüfung
bleiben deterministisch. Claude wird dort eingesetzt, wo Sprache, Bildinhalt,
unscharfe Absichten oder geschmackliche Interpretation verstanden werden
müssen.

### Kleine, aufgabenspezifische Prompts

Es wird nie vorsorglich der gesamte Account, Blogbestand oder Filmkatalog an
Claude geschickt. Jede Funktion bekommt nur die dafür notwendigen Regeln,
Profilsignale, Beispiele und Kandidatendaten.

### Nachvollziehbarkeit

Eine persönliche Empfehlung oder Prognose sollte erklären können, auf welchen
bestätigten Signalen sie beruht. Objektive Behauptungen brauchen einen
nachvollziehbaren Ursprung. Unsicherheit wird nicht als Gewissheit formuliert.

## Datenbereiche

### Öffentlicher Katalog

Beispiele:

- Filme und Serien,
- normalisierte Titel und Erscheinungsjahre,
- erlaubte Genres, Tags und Basis-Metadaten,
- Kinos und Vorführungen,
- Streaming-Informationen aus erlaubten Quellen.

Der App-Zugriff ist grundsätzlich lesend. Schreibzugriff erfolgt nur über
kontrollierte Import- oder Administrationsprozesse.

### Gemeinsames Filmwissen

Beispiele:

- geprüfte alternative Titel,
- Personen, Studios und Werkzusammenhänge,
- filmhistorische oder popkulturelle Relevanz,
- Werkidentität und Beziehungen zwischen Serie, Staffel, Special und Film,
- Belege, Quellen und Prüfzeitpunkt,
- Unsicherheiten und offene Zuordnungen,
- technische Metadaten einer KI-Verarbeitung.

Dieses Wissen wird pro Film beziehungsweise Filmversion gecacht und nicht für
jeden Account neu recherchiert.

### Persönlicher Accountbereich

Beispiele:

- echte Bewertungen,
- Merkliste, Must-Watch und Status,
- persönliche Notizen,
- eigene Blogartikel,
- Geschmacks- und Stilprofil,
- KI-Prognosen und deren Annahme oder Ablehnung,
- persönliche Empfehlungen,
- individuelle Nutzungslimits und KI-Einstellungen.

Der Server leitet den Account aus der gültigen Sitzung ab. Eine vom Client frei
mitgeschickte Account-ID darf nicht als Zugriffsberechtigung genügen.

### Temporäre Verarbeitungsdaten

Beispiele:

- ein Scanbild,
- OCR-Rohtext,
- unbearbeitete Importliste,
- Kandidaten einer Titelerkennung,
- unvalidierte Modellantwort.

Diese Daten werden nur so lange gespeichert, wie es für die konkrete Aufgabe
nötig ist. Scanbilder und vollständige Blogtexte gehören nicht dauerhaft in
allgemeine KI-Logs.

## Das persönliche Geschmacksmodell

Das sogenannte „Geschmacks-Prompt“ soll nicht als wachsender Fließtext
gespeichert werden. Im Account liegt stattdessen ein strukturiertes,
versioniertes Profil. Aus ihm wird für einzelne KI-Aufgaben eine kurze
Prompt-Fassung erzeugt.

Mögliche Bestandteile:

- bevorzugte und gemiedene Genres, Themen und Erzählweisen,
- Muster hinter hohen und niedrigen WIE- und WAS-Werten,
- bevorzugte Inszenierungs-, Tempo- und Tonmerkmale,
- wiederkehrende positive und negative Kritikpunkte,
- besondere Regisseure, Länder, Epochen oder Studios,
- Verhältnis von persönlichem Gefallen und kultureller Bedeutung,
- Sicherheit jedes erkannten Musters,
- Quellen des Musters,
- bewusste Korrekturen des Nutzers,
- Datum und Version der letzten Aktualisierung.

Zusätzlich gibt es ein separates Stilprofil. Es beschreibt den eigenen Ton und
die Art der Formulierung, beeinflusst aber nicht die inhaltliche Bewertung eines
Films.

### Lernquellen

Geeignete Signale:

- ausdrücklich abgegebene Bewertungen,
- selbst verfasste Blogartikel,
- persönliche Notizen, wenn der Nutzer ihre Verwendung erlaubt,
- angenommene, korrigierte und verworfene KI-Vorschläge,
- ausdrücklich im Profil vorgenommene Änderungen.

Keine Lernquelle:

- noch unbestätigte KI-Schätzungen,
- KI-generierte Blogtexte,
- bloße Worthäufigkeit ohne erkennbare Haltung,
- fremde Artikel,
- Daten anderer Accounts.

### Aktualisierung

Neue Signale können zunächst gesammelt werden. Eine Profilaktualisierung erfolgt
ereignis- oder schwellenbasiert, nicht zwangsläufig nach jedem einzelnen Klick.
Die KI erzeugt einen nachvollziehbaren Änderungsvorschlag, beispielsweise:

> Stärkere Abneigung gegen nostalgische Biopics erkannt; Grundlage sind vier
> neue Bewertungen.

Größere Profiländerungen sollten sichtbar bestätigt oder zumindest im
Änderungsverlauf rückgängig gemacht werden können.

### Zielgröße für Prompts

Als Planungswert gilt:

- kompakte Profilfassung: ungefähr 800 bis 1.500 Tokens,
- gewöhnliche Aufgabe ohne Recherche: insgesamt ungefähr 3.000 bis 5.000
  Input-Tokens,
- Aufgabe mit Recherche oder umfangreicheren Kandidaten: ungefähr 6.000 bis
  12.000 Input-Tokens.

Das sind Leitwerte, keine harten technischen Grenzen. Vor allem sollen nicht
regelmäßig ganze Blogs oder vollständige Kataloge mitgeschickt werden.

## KI-Funktion 1: Automatische Vorbewertung

### Produktidee

Die App prognostiziert, wie ein noch nicht bewerteter Film zum persönlichen
Geschmack passen könnte. Das Ergebnis heißt sichtbar „KI-Prognose“,
„Vorschlag“ oder „Match-Prognose“ und nicht „deine Bewertung“.

### Sinnvolle Ausgabe

- prognostizierter WIE-Wert,
- prognostizierter WAS-Wert,
- persönliche Passung,
- mögliche Kategorie,
- Sicherheit der Prognose,
- kurze Begründung,
- verwendete Profilsignale,
- Modell- und Profilversion,
- angenommen, korrigiert oder verworfen.

Eine echte Nutzerbewertung bleibt ein eigenes Feld. Sie wird durch spätere
Profilupdates oder Neuberechnungen niemals überschrieben.

### WARUM und kulturelle Relevanz

WARUM steht projektweit für filmhistorische oder popkulturelle Relevanz.
Veröffentlichtes gemeinsames WARUM wird aus freigegebenem, versioniertem
Filmwissen abgeleitet und nicht aus persönlichem Geschmack. Eine ausdrückliche
institutionelle Einordnung kann dabei allein stark genug sein; entscheidend
ist ihr Inhalt, nicht eine bloße Quellenanzahl.

Eine persönliche KI-Prognose darf WARUM bei fehlendem Cache vorsichtig aus
Filmkontext und Geschmack schätzen. Diese Schätzung bleibt sichtbar und
technisch von belegtem gemeinsamen Filmwissen sowie von einer echten
Nutzerbewertung getrennt. Liegt belegtes Filmwissen vor, übernimmt die
Prognose dessen Wert und Versions-ID unverändert.

### Im Bau-Chat entschieden

Der Bau-Chat hat verbindlich festgelegt:

- genaues Ausgabeformat,
- Darstellung von Sicherheit,
- Verhältnis von WIE, WAS, WARUM und Kategorie,
- minimale Profilmenge für eine brauchbare Prognose,
- Verhalten bei neuen Accounts,
- Annahme-, Korrektur- und Feedbackablauf,
- Speicherung und Neuberechnung,
- Tests mit bekannten Gegenbeispielen.

Der ausführliche Vertrag und die Abnahme stehen in
`docs/STECKBRIEF_VORBEWERTUNG.md`,
`docs/ETAPPE_8_VORBEWERTUNG_PLAN.md` und `docs/ETAPPE_8_ABNAHME.md`.

### Fertig, wenn

- echte und geschätzte Werte technisch eindeutig getrennt sind,
- nichts ungefragt überschrieben wird,
- eine Prognose nachvollziehbar und verwerfbar ist,
- unzureichende Daten zu sichtbarer Unsicherheit führen,
- Kosten und Modellversion protokolliert werden.

## KI-Funktion 2: Gemeinsame Filmrecherche und Relevanz

### Produktidee

Fehlendes Filmwissen wird einmal recherchiert, geprüft und anschließend für alle
zulässigen Funktionen wiederverwendet. Das reduziert Kosten und vermeidet
widersprüchliche Einzelrecherchen.

### Mögliche Ergebnisse

- Jahr und Werktyp,
- alternative Titel,
- Genres und sachliche Tags,
- beteiligte Personen und Studios,
- Werk- und Reihenbeziehungen,
- konkrete kulturelle oder filmhistorische Relevanz,
- Quellen und Abrufzeitpunkt,
- Unsicherheits- und Prüfstatus.

Aktuelle Streaming- und Kinodaten kommen weiterhin aus strukturierten und
rechtlich erlaubten Datenquellen, nicht aus dem Sprachmodell.

### Im Bau-Chat entschieden

Der Bau-Chat hat für den ersten MVP festgelegt:

- gemeinsames Datenmodell,
- Quellen- und Belegregeln,
- Recherche-Rubrik für WARUM,
- Statusfolge von „unbestätigt“ bis „geprüft“,
- Caching und Aktualisierung,
- Zusammenführung widersprüchlicher Ergebnisse,
- redaktionelle Administration bleibt eine spätere Erweiterung.

Der implementierte Pfad verwendet feste Wikidata- und LOC-Adapter, einen
gemeinsamen relationalen und unveränderlich versionierten Cache sowie eine
enge Konto-Lese-RPC. Eine institutionelle Einordnung darf WARUM allein tragen;
ansonsten sind zwei unabhängige verantwortete Quellen nötig. Details und
Abnahme stehen in `docs/STECKBRIEF_FILMWISSENS_CACHE.md` und
`docs/ETAPPE_8_ABNAHME.md`.

### Fertig, wenn

- derselbe Film nicht pro Account erneut recherchiert wird,
- Quellen und Unsicherheit sichtbar erhalten bleiben,
- Modellantworten vor dem Schreiben validiert werden,
- aktuelle Verfügbarkeit nicht aus Modellwissen erfunden wird.

## KI-Funktion 3: Intelligente Suche

### Produktidee

Claude übersetzt eine natürliche Suchanfrage in strukturierte Suchkriterien. Die
eigentliche Kandidatensuche erfolgt in der echten Datenbank. Danach kann Claude
eine kleine Ergebnismenge persönlich sortieren und erklären.

Beispiel:

> Etwas melancholisches, aber nicht völlig deprimierend, unter zwei Stunden und
> möglichst kein Liebesfilm.

Möglicher Ablauf:

1. Anfrage in Filter und weiche Wünsche übersetzen.
2. Filter gegen ein erlaubtes Schema validieren.
3. Datenbank deterministisch abfragen.
4. Nur eine kleine Kandidatenliste an die persönliche Sortierung geben.
5. Treffer mit kurzen, datenbasierten Erklärungen anzeigen.

Die klassische Suche bleibt ohne KI verwendbar. Bei KI-Ausfall kann die App die
erkannten Filter anzeigen oder auf die normale Suche zurückfallen.

### Separater Bau-Chat

Der Einzelchat sollte mindestens klären:

- erlaubtes Filterschema,
- harte Filter im Gegensatz zu weichen Wünschen,
- zeitliche, emotionale und ausschließende Formulierungen,
- Kandidatenlimit,
- Nutzung des Geschmacksprofils,
- Darstellung der Suchinterpretation,
- Fallback ohne KI,
- Bedarf für spätere semantische Suche oder Embeddings.

### Fertig, wenn

- Claude nicht den gesamten Katalog erhält,
- Treffer tatsächlich aus der Datenbank stammen,
- die übersetzten Filter sichtbar und änderbar sind,
- erfundene Titel nicht als echte Treffer erscheinen,
- die normale Suche unabhängig davon funktioniert.

## KI-Funktion 4: Filmscan

### Produktidee

Poster, Ticket, Programmheft oder Streaming-Bildschirm können fotografiert
werden. Die App erkennt mögliche Titel und gleicht sie mit dem echten Katalog
ab. Der Nutzer bestätigt das Ergebnis.

Möglicher Ablauf:

1. Bild lokal vorbereiten und wenn möglich lokal OCR ausführen.
2. Nur bei Bedarf Bild oder OCR-Text an die geschützte KI-Schnittstelle senden.
3. Titel, Jahr, Kino, Datum oder Uhrzeit als Kandidaten erkennen.
4. Kandidaten mit Katalog und Programmdaten abgleichen.
5. Zwei oder drei plausible Treffer anzeigen.
6. Erst nach Bestätigung in persönliche Daten übernehmen.
7. Bild anschließend verwerfen, sofern kein ausdrücklicher Speicherwunsch
   besteht.

### Separater Bau-Chat

Der Einzelchat sollte mindestens klären:

- erste unterstützte Scanarten,
- lokale OCR-Möglichkeiten,
- Bildgrößen und Komprimierung,
- Datenschutztext und Löschverhalten,
- Kandidatenabgleich,
- Korrektur bei falschen Treffern,
- Kamera- und Dateiupload im Web- und Download-Betrieb,
- Kostenlimit pro Account.

### Fertig, wenn

- ein Scan nie ohne Bestätigung einen Filmeintrag erzeugt,
- das Originalbild standardmäßig nicht dauerhaft gespeichert wird,
- Kandidaten gegen echte Daten geprüft werden,
- unlesbare Bilder eine verständliche Korrekturmöglichkeit bieten.

## KI-Funktion 5: Masterlisten-Import

### Produktidee

Eine rohe Liste wird in prüfbare Kinodreieck-Einträge verwandelt. Der vorhandene
Ingestion-Prompt in `src/lib/paket.js` ist dafür ein funktionierender
Ausgangspunkt, wird langfristig aber durch einen integrierten, strukturierten
Workflow ersetzt.

Möglicher Ablauf:

1. Liste einfügen oder Datei hochladen.
2. Titel und Werktypen erkennen.
3. bestehende Katalogeinträge und Dubletten finden.
4. nur fehlende Filmfakten recherchieren.
5. einige Beispielbewertungen des Nutzers einholen, falls das Profil noch nicht
   ausreicht.
6. persönliche Prognosen gesondert erzeugen.
7. Vorschau mit Konflikten und Unsicherheiten anzeigen.
8. erst bestätigte Einträge in den Account übernehmen.

Für einen lokalen Nutzer kann der Import alternativ ein portables
Kinodreieck-Paket erzeugen, ohne es sofort in einen Account zu schreiben.

### Separater Bau-Chat

Der Einzelchat sollte mindestens klären:

- erlaubte Eingabeformate,
- Batchgröße und Fortschritt,
- Titelauflösung und Dublettenlogik,
- Wiederverwendung des Filmwissens-Caches,
- Vorschau und Konfliktentscheidung,
- Teilabbruch und Wiederaufnahme,
- Kostenanzeige vor großer Recherche,
- Export ohne Account.

### Fertig, wenn

- keine bestehenden echten Bewertungen überschrieben werden,
- jeder geschätzte Wert erkennbar bleibt,
- unsichere Jahre und Zuordnungen bestätigt werden müssen,
- große Importe fortsetzbar und kostenbegrenzt sind,
- der Import vor dem Schreiben vollständig prüfbar ist.

## KI-Funktion 6: Bloganalyse für Geschmack und Stil

### Produktidee

Eigene Artikel liefern zusätzliche Signale über Geschmack und Ausdrucksweise.
Die Analyse sucht nach wertenden Haltungen und Zusammenhängen, nicht nur nach
häufigen Wörtern.

Zu unterscheiden sind:

- inhaltliches Geschmacksprofil,
- persönliches Stilprofil,
- sachlich erwähnte Merkmale ohne Wertung,
- filmbezogene Aussagen und allgemeine Schreibgewohnheiten.

Später kann die App außerdem erwähnte Filme erkennen und Artikel mit
Katalogeinträgen verknüpfen. Ein allgemeiner Generator für komplette Artikel ist
keine Voraussetzung dieser Funktion.

### Separater Bau-Chat

Der Einzelchat sollte mindestens klären:

- Opt-in und auswählbare Artikel,
- Art der extrahierten Signale,
- Trennung von Geschmack und Schreibstil,
- inkrementelle Analyse statt Vollanalyse,
- Profiländerungsvorschau,
- Ausschluss fremder oder KI-generierter Texte,
- Löschung abgeleiteter Signale.

### Fertig, wenn

- Bloganalyse freiwillig und widerrufbar ist,
- Stil und Geschmack nicht vermischt werden,
- nicht jeder Artikel bei jeder Anfrage erneut übertragen wird,
- neue Erkenntnisse mit ihrer Grundlage erklärt werden können.

## KI-Funktion 7: Merkliste, Streaming und kleine Empfehlungen

### Produktidee

Die App unterstützt konkrete Entscheidungen innerhalb der bereits vorhandenen
persönlichen Daten:

- Was davon soll ich heute schauen?
- Welcher ungesehene Film passt in 90 Minuten?
- Welche Kandidaten auf meiner Liste passen zur aktuellen Stimmung?
- Welche dieser verfügbaren Optionen passt am besten zu meinem Profil?
- Was läuft diese Woche und könnte für mich relevant sein?

Zuerst erzeugt die Datenbank eine zulässige Kandidatenliste. Claude erhält nur
diese Liste und sortiert oder erklärt sie.

Wöchentliche Empfehlungen und Benachrichtigungen sind optional. Sie sollen
vorberechnet, gecacht und ausdrücklich aktiviert werden, nicht bei jedem
App-Start ungefragt neue KI-Kosten erzeugen.

### Separater Bau-Chat

Der Einzelchat sollte mindestens klären:

- erste konkrete Empfehlungssituation,
- verwendete persönliche Daten,
- Umgang mit aktueller Verfügbarkeit,
- Caching und Ablaufzeit,
- Benachrichtigungs-Opt-in,
- Feedback auf Vorschläge,
- Wiederholungsvermeidung.

### Fertig, wenn

- nur tatsächlich vorhandene Kandidaten empfohlen werden,
- aktuelle Verfügbarkeit aus der Datenquelle stammt,
- Nutzer den Grund einer Empfehlung versteht,
- Hintergrundkosten begrenzt und abschaltbar sind.

## KI-Funktion 8: Streaming-Neuzugänge und Staffelprüfung

### Produktidee

Wenn beim Streaming-Import ein neuer Inhalt denselben oder einen fast gleichen
Titel wie ein vorhandener Eintrag trägt, prüft das System kurz, worum es sich
tatsächlich handelt. Besonders bei Serien soll verhindert werden, dass eine neue
Staffel fälschlich als eigener Film oder als vollständig neues Werk erscheint.

Die KI ist hier eine gezielte Qualitätskontrolle hinter der Importpipeline und
keine allgemeine Recherche für jeden Neuzugang.

Mögliche Ergebnisse der Prüfung:

- dasselbe Werk ist nur bei einem weiteren Streamingdienst verfügbar,
- eine neue Staffel einer bereits bekannten Serie,
- ein Special, eine Miniserie, ein Spin-off oder ein Abschlussfilm,
- ein eigenständiger Film oder eine andere Serie mit demselben Titel,
- ein Duplikat oder fehlerhaftes Metadaten-Update des Datenlieferanten,
- weiterhin uneindeutig und deshalb manuell zu prüfen.

### Kostenarmer Ablauf

1. Der normale Import vergleicht IDs, normalisierte Titel, Jahr, Typ,
   vorhandene Serienzuordnung und Streamingdienst.
2. Eindeutige Fälle werden ohne KI verarbeitet.
3. Nur verdächtige neue oder veränderte Einträge landen in einer Prüfwarteschlange.
4. Zuerst werden zusätzliche strukturierte Felder des Datenlieferanten abgefragt,
   beispielsweise Werktyp, Serien-ID, Staffelzahl, Episodenzahl, Originaltitel
   und Erscheinungsdatum.
5. Nur wenn diese Angaben widersprüchlich oder unvollständig bleiben, erhält
   Claude den kleinen Konfliktfall.
6. Das Ergebnis wird mit Beziehung, Sicherheit, Belegen und Prüfzeitpunkt
   gespeichert.
7. Eine unsichere KI-Zuordnung wird nicht automatisch veröffentlicht, sondern
   bleibt in der manuellen Prüfung.

Sinnvolle automatische Auslöser:

- gleicher normalisierter Titel, aber neue Anbieter-ID,
- bekannter Serientitel, der plötzlich als `movie` oder mit unbekanntem Typ
  geliefert wird,
- gleiche Anbieter-ID mit geändertem Jahr oder Werktyp,
- neuer Titel ohne Staffelhinweis, obwohl eine bekannte Serie exakt so heißt,
- mehrere gleichnamige Kandidaten, die nicht über Jahr oder externe IDs getrennt
  werden können,
- auffälliger Rückgang oder Sprung der gelieferten Staffelzahl.

Die gespeicherte Entscheidung sollte nicht bloß `ist_staffel: true|false`
enthalten, sondern die tatsächliche Beziehung beschreiben, beispielsweise:

```text
relation: same_work | new_season | special | spin_off | separate_work |
          provider_duplicate | unclear
parent_series_id: optional
season_number: optional
confidence: 0..1
evidence: [...]
verified_at: timestamp
```

### Bezug zum vorhandenen Code

`src/lib/staffeln.js` kann bereits deterministisch erkennen, dass bei einer
beobachteten Serie mehr Staffeln verfügbar sind als vom Nutzer bestätigt.
`tools/staffel_pipeline_entwurf.mjs` enthält außerdem einen noch nicht produktiv
verdrahteten Entwurf für Staffelstände aus Streamingquellen.

Die neue Prüfung ersetzt diese Logik nicht. Sie sitzt davor beziehungsweise
daneben und klärt die Werkidentität eines verdächtigen Streaming-Datensatzes.
Erst danach kann der bestehende Staffelhinweis zuverlässig melden, dass eine
neue Staffel verfügbar ist.

### Separater Bau-Chat

Der Einzelchat sollte mindestens klären:

- tatsächliche Felder des produktiven Streaming-Datenlieferanten,
- Definition der deterministischen Konfliktauslöser,
- Beziehungsschema zwischen Werk, Serie und Staffel,
- Prüfwarteschlange und manueller Freigabestatus,
- Einsatzgrenze für Claude,
- Cache und erneute Prüfung bei geänderten Quelldaten,
- Einbindung in die vorhandenen Staffelhinweise,
- Tests mit gleichnamigem Film, Serie, Staffel und Special.

### Fertig, wenn

- normale eindeutige Neuzugänge keinen KI-Aufruf verursachen,
- gleichnamige Inhalte nicht allein anhand des Titels zusammengeführt werden,
- eine neue Staffel nicht als eigenständiger Film in „Entdecken“ auftaucht,
- unsichere Zuordnungen vor Veröffentlichung zurückgehalten werden,
- jede automatische Entscheidung auf konkrete Quelldaten zurückgeführt werden
  kann,
- der vorhandene Staffelhinweis die bestätigte Zuordnung weiterverwenden kann.

## KI-Funktion 9: Filmassistent als gemeinsame Oberfläche

### Produktidee

Ein späterer Filmassistent verbindet die spezialisierten Funktionen:

- Katalog und persönliche Listen durchsuchen,
- Suchwünsche in Filter übersetzen,
- Prognosen erklären,
- Bewertungen vergleichen,
- erwähnte Filme in Artikeln finden,
- aus Merkliste oder Programm Kandidaten auswählen.

Der Assistent ist kein freier Chat mit vermeintlichem Vollwissen. Er arbeitet
über klar begrenzte Werkzeuge und echte App-Daten. Seine Antworten sollen
angeben können, welche Datenquelle oder Funktion verwendet wurde.

### Separater Bau-Chat

Der Einzelchat sollte mindestens klären:

- erlaubte Werkzeuge,
- Berechtigungen pro Werkzeug,
- Gesprächskontext und dessen Lebensdauer,
- Quellenhinweise,
- Bestätigungen vor schreibenden Aktionen,
- Fallback und Fehlerdarstellung,
- Schutz vor Prompt-Injection aus importierten Texten.

### Fertig, wenn

- der Assistent keine Schreibaktion unbemerkt ausführt,
- Programm- und Verfügbarkeitsdaten nicht erfindet,
- private Daten nur innerhalb des berechtigten Accounts verwendet werden,
- jede Funktion auch außerhalb des Chats erreichbar bleibt.

## KI und Kinoprogrammdaten

KI ist keine verlässliche Quelle für das aktuelle Kinoprogramm. Vorführungen,
Fassungen, Uhrzeiten und Ticketlinks kommen aus strukturierten, erlaubten
Datenquellen.

KI kann intern helfen bei:

- Titelzuordnung,
- Erkennung auffälliger Importfehler,
- Normalisierung ungewöhnlicher Schreibweisen,
- Vorschlägen für manuelle Konfliktlösung,
- Erklärung bereits vorhandener Programmtreffer.

Eine KI-Zuordnung wird nicht ungeprüft zu einer veröffentlichten Vorstellung.
Die Lizenz- und Quellenregeln aus `docs/PROGRAMMDATEN_PLAN.md` bleiben
maßgeblich.

## Prompt-Zusammensetzung

Ein normaler Aufgaben-Prompt kann aus folgenden Bausteinen bestehen:

1. feste System- und Sicherheitsregeln,
2. aufgabenspezifische Bewertungs- oder Extraktionsrubrik,
3. kompakte Fassung des persönlichen Profils,
4. wenige passende, bestätigte Beispiele,
5. konkrete Film-, Kandidaten- oder Eingabedaten,
6. ein enges strukturiertes Antwortschema.

Die Profile werden in der Datenbank strukturiert gespeichert. Der fertige
Fließtext-Prompt ist ein kurzlebiges Laufzeitprodukt und nicht die primäre
Wissensquelle.

Wo möglich, antwortet Claude in einem validierbaren JSON-Schema. Freitext wird
nur für Erklärungen verwendet. Ein technisch korrektes JSON ist trotzdem noch
kein fachlich bestätigtes Ergebnis.

## Modellwahl

Die Modellauswahl soll aufgabenbezogen erfolgen und austauschbar bleiben.

Typische günstige Aufgaben:

- Suchanfrage in Filter übersetzen,
- Profiländerungen aus wenigen neuen Signalen extrahieren,
- einfache Titel- und Metadatenzuordnung,
- Kandidaten kurz erklären.

Typische anspruchsvollere Aufgaben:

- schwierige Filmrecherche,
- widersprüchliche kulturelle Einordnung,
- komplexe Geschmacksanalyse,
- uneindeutiger Bildscan,
- größere Profilkonsolidierung.

Als heutige Arbeitshypothese kann Claude Haiku für kleine Extraktions- und
Interpretationsaufgaben und Claude Sonnet für schwierigere Aufgaben dienen.
Modellnamen und Preise müssen vor dem Produktivstart erneut geprüft werden.

## Kostenrahmen und Kontrollen

Die bisherigen groben Planungswerte:

- normale persönliche Nutzung: ungefähr 2 bis 10 US-Dollar pro Monat,
- bei sinnvoller Wiederverwendung voraussichtlich eher in der unteren Hälfte,
- vier bis fünf Testnutzer: meist nur wenige US-Dollar zusammen,
- erstmalige Verarbeitung von rund 300 Filmen: je nach Rechercheumfang ungefähr
  3 bis 30 US-Dollar.

Webrecherche ist oft teurer als die reine Textverarbeitung. Deshalb werden
gemeinsame Rechercheergebnisse gecacht und nur fehlende oder veraltete Fakten
erneut gesucht.

Jeder KI-Vorgang sollte mindestens protokollieren:

- Account oder administrativer Auftrag,
- Funktion und Vorgangs-ID,
- verwendetes Modell,
- Input- und Output-Tokens,
- Zahl zusätzlicher Websuchen,
- geschätzte Kosten,
- Dauer, Erfolg und Fehlerklasse,
- verwendete Profil- und Promptversion.

Nicht in allgemeine Nutzungslogs gehören vollständige Blogtexte, Scanbilder,
private Notizen oder geheime Schlüssel.

Sinnvolle Schutzmechanismen:

- Monatsbudget pro Account,
- Tages- oder Minutenlimit je Funktion,
- Vorschau der geschätzten Kosten bei großen Importen,
- harte Obergrenze für Kandidaten und Promptgröße,
- Caching identischer gemeinsamer Aufgaben,
- Abbruch und verständliche Meldung statt unkontrollierter Mehrfachversuche,
- administrativer Kostenüberblick.

## Datenschutz und Sicherheit

- Der Claude-API-Key liegt nur serverseitig.
- Der Supabase-Service-Role-Key liegt weder in der App noch im Download-Paket.
- Persönliche Daten werden über Account und serverseitige Regeln getrennt.
- Die KI erhält nur die für eine Aufgabe notwendigen Daten.
- Bloganalyse, regelmäßige Empfehlungen und Bildverarbeitung sind transparent
  und abschaltbar.
- Export und Löschung umfassen auch Geschmacksprofil, KI-Prognosen und
  abgeleitete Signale.
- Scanbilder werden standardmäßig nicht dauerhaft gespeichert.
- KI-Antworten werden vor DB-Schreibvorgängen strukturell validiert.
- Importierter Text gilt als nicht vertrauenswürdig und darf Systemregeln oder
  Werkzeugberechtigungen nicht verändern.
- Schreibende oder kostenintensive Aktionen benötigen je nach Tragweite eine
  sichtbare Bestätigung.

## Flexible Abhängigkeiten statt starrer Phasen

Die Funktionen dürfen einzeln ausgearbeitet werden. Einige Grundlagen lohnen
sich aber gemeinsam:

```text
Account + geschützte KI-Schnittstelle + Kostenprotokoll
    |
    +-- strukturiertes Geschmacks- und Stilprofil
    |       |
    |       +-- Vorbewertung
    |       +-- persönliche Sortierung
    |       +-- Merkliste und Empfehlungen
    |
    +-- gemeinsamer Filmwissens-Cache
    |       |
    |       +-- Relevanzrecherche
    |       +-- Masterlisten-Import
    |       +-- Filmscan-Abgleich
    |       +-- Werkidentität bei Streaming-Neuzugängen
    |
    +-- strukturierte Werkzeuge
            |
            +-- intelligente Suche
            +-- späterer Filmassistent
```

Das ist keine vorgeschriebene Veröffentlichungsreihenfolge. Ein Filmscan kann
beispielsweise früh als kleiner Prototyp entstehen. Für die produktive Version
sollte er jedoch dieselbe Account-, Kosten- und Validierungsgrundlage benutzen
wie die anderen KI-Funktionen.

Ein sinnvoller erster gemeinsamer Unterbau wäre:

- serverseitiger KI-Endpunkt mit einem einfachen Testauftrag,
- Accountprüfung,
- einheitliche Fehlerantwort,
- strukturiertes Antwortschema,
- Kostenprotokoll,
- konfigurierbares Modellrouting,
- Abbruch- und Rate-Limit,
- keine fachliche KI-Funktion im Endpunkt selbst.

Danach kann jede Produktfunktion diesen Unterbau verwenden.

## Offene Entscheidungen

Diese Punkte sind absichtlich nicht endgültig festgelegt:

- Bleibt ein vollständiger Gastmodus Teil des öffentlichen Produkts?
- Welche Daten enthält das feste Download-Paket tatsächlich?
- Erfolgt Account-Login vollständig über Supabase Auth?
- Läuft die KI-Schnittstelle zunächst als Cloudflare Worker oder
  Supabase-Funktion?
- Welche Profiländerungen benötigen eine ausdrückliche Bestätigung?
- Welche Bilddaten dürfen beim Filmscan an Claude geschickt werden?
- Welche Funktion erhält zuerst ein reales Monatsbudget?
- Wie lange werden KI-Protokolle und abgeleitete Signale aufbewahrt?

Ein Einzelchat darf diese Fragen für seinen Funktionsbereich konkretisieren. Er
sollte Entscheidungen in diesem Dokument oder einer verlinkten
Funktionsspezifikation festhalten.

## Vorlage für einen separaten Bau-Chat

Folgender Einstieg kann für jede Funktion angepasst werden:

```text
Wir arbeiten im Kinodreieck-Projekt an der KI-Funktion „[Name]“.

Lies zuerst:
- docs/KI_ZWISCHENPROJEKT_LEITFADEN.md
- die darin für diese Funktion genannten bestehenden Dateien
- relevante aktuelle Implementierung und Tests

Ziel dieses Chats:
[konkretes, begrenztes Ergebnis]

Bitte:
1. prüfe zuerst den Ist-Zustand im Code,
2. benenne offene Produktentscheidungen, die das Ergebnis wirklich verändern,
3. entwirf Datenfluss, UI-Verhalten und Fehlerfälle,
4. halte KI-Vorschläge von bestätigten Nutzerdaten getrennt,
5. berücksichtige Accountschutz, Promptlänge und Kosten,
6. implementiere und teste die vereinbarte kleinste brauchbare Version,
7. aktualisiere bei einer dauerhaften Entscheidung den Leitfaden oder eine
   verlinkte Funktionsdokumentation.

Nicht Teil dieses Chats:
[bewusst ausgeschlossene Nachbarfunktionen]
```

## Mögliche Einzelchats

Die Zuschnitte können je nach Arbeitsfortschritt kleiner oder größer werden:

1. Account-Zielmodell und Migration vom aktuellen Sync-Schlüssel
2. Geschützte Claude-Schnittstelle und Kostenprotokoll
3. Datenmodell für gemeinsames Filmwissen
4. Geschmacksprofil und Profilaktualisierung
5. Bloganalyse und separates Stilprofil
6. automatische Vorbewertung
7. intelligente Suche
8. Filmscan
9. integrierter Masterlisten-Import
10. Streaming-Neuzugänge und Staffelprüfung
11. Merkliste und persönliche Kurzempfehlungen
12. wöchentliche Empfehlungen und Benachrichtigungen
13. Filmassistent mit begrenzten Werkzeugen
14. Administrationsoberfläche für Recherche, Quellen und Konflikte
15. Datenschutz, Export, Löschung und KI-Einwilligungen
16. Kosten-Dashboard, Limits und Modellrouting

## Bestehende Anknüpfungspunkte im Projekt

- `README.md`: Grundbeschreibung der App mit der bindenden WARUM-Definition.
- `src/lib/paket.js`: vorhandenes Paketformat und bisheriger
  Masterlisten-Ingestion-Prompt.
- `src/lib/storage.js`: treiberunabhängige lokale Speicheroberfläche.
- `src/lib/supabaseDriver.js`: heutiger loginfreier Supabase-Sync als
  Übergangslösung.
- `src/lib/katalog.js`: read-only Zugriff und Cache für den zentralen Katalog.
- `src/lib/staffeln.js`: heutige deterministische Staffelhinweise für beobachtete
  Serien.
- `tools/staffel_pipeline_entwurf.mjs`: noch nicht produktiv verdrahteter
  Staffelstands-Entwurf für Streamingquellen.
- `supabase/katalog_schema.sql`: aktuelles Schema des öffentlichen Katalogs.
- `supabase/README.md`: Trennung von öffentlichem Leseschlüssel und geheimem
  Service-Role-Schlüssel.
- `docs/PROGRAMMDATEN_PLAN.md`: Lizenz-, Quellen-, Datenschutz- und
  Hosting-Rahmen für Programmdaten.

## Nicht-Ziele

- kein Claude-Key im Browser oder Download,
- keine KI als Quelle für aktuelle Kino- oder Streaming-Verfügbarkeit,
- keine Zusammenführung gleichnamiger Streaminginhalte nur aufgrund des Titels,
- keine automatisch überschriebenen Nutzerbewertungen,
- keine dauernd wachsenden Prompts aus vollständigen Artikeln,
- keine Profilbildung aus unbestätigten KI-Ergebnissen,
- keine stillen kostenpflichtigen Hintergrundschleifen,
- kein universeller Chat, der vor den spezialisierten Funktionen alles können
  soll,
- keine Veröffentlichung unbestätigter oder nicht lizenzierter Daten.

## Pflege dieses Leitfadens

Nach einem Einzelprojekt wird dieser Leitfaden nur dann geändert, wenn sich eine
übergreifende Entscheidung, Abhängigkeit oder Grenze verändert. Detaillierte
API-Schemata, UI-Abläufe und Testfälle gehören in eine eigene
Funktionsspezifikation oder direkt zum betreffenden Code.

So bleibt dieses Dokument kurz genug als Einstieg für neue Chats und stabil
genug als gemeinsames Gedächtnis des KI-Zwischenprojekts.
