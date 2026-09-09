# FlixPatrol-Fakten in Import und Katalog

Stand: 9. September 2026. Der Browser liest ausschließlich den gemeinsamen,
serverseitig gepflegten FlixPatrol-Cache. Dieser Produktweg startet keinen
FlixPatrol- oder KI-Anbieterrequest und speichert keinen persönlichen
FlixPatrol-Rohcache.

## Begrenzter Read

Ein bereites aktives Konto mit `remoteStorage === true` liest genau die fünf
festen Österreich-Charts für Prime (Filme/Serien), Disney+ (Filme/Serien) und
Apple TV (Filme). Aus den Chartantworten werden höchstens 50 explizite
`ttl_…`-IDs dedupliziert und in genau einem
`kd_flixpatrol_titles_read` aufgelöst. Der Medientyp des Title-Reads ist
maßgeblich; der Charttyp wird nicht als Titeltyp übernommen.

Token und Capability werden vor dem Read sowie nach jedem asynchronen Schritt
erneut an dieselbe Konto-ID gebunden. Abmeldung, Capability-Widerruf,
Kontowechsel, Projektwechsel, explizites Leeren, Offline- und Antwortfehler
liefern leer und entwerten auch laufende Reads über eine Generation. Der
In-Memory-Cache hält höchstens den Stand eines Konto-/Projektpaars, läuft nach
wenigen Minuten ab und hält erfolgreiche leere Resultate nur kurz. Er wird
weder in Local Storage noch in Cache Storage oder persönliche Backups
geschrieben.

## Sichtbarer Importweg

Sobald eine Stapelimport-Vorschau aus der internen oder externen Erkennung
vorliegt, gleicht die App deren Film- und Serieneinträge gegen die vorhandenen
Fakten ab. Das funktioniert auch bei ausgeschalteter App-KI über den bisherigen
externen JSON-Weg. Eine automatische Zuordnung verwendet ausschließlich den
gemeinsamen Identitätshelper:

- passende starke IDs zusammen mit Jahr und Typ; oder
- exakt Titel/Originaltitel plus Jahr plus Typ.

Remakes, fehlendes Jahr, fehlender Typ, Widersprüche und Mehrdeutigkeiten
bleiben ohne Vorschlag. Der externe API-Titel ersetzt nie den vom Nutzer
geprüften Titel. Bereits gelieferte, validierte externe Kennungen und der
Originaltitel bleiben durch Vorschau und Übernahme erhalten; eine
widersprechende Kennung sperrt die Zuordnung. Unbekannte Einträge bleiben
importierbar.

Die Vorschau zeigt verständliche Feldnamen und die konkreten Werte, formatiert
Premierendaten lesbar und lässt die Übernahme je Eintrag an- oder abwählen.
Bestätigt werden ausschließlich fehlende IMDb-, TMDB- und FlixPatrol-IDs sowie
fehlende Beschreibung, Laufzeit und Premiere. Titel,
Originaltitel, eigene IDs, Bewertung, Tags, Notiz, Besitz, Gesehen- und
Staffelstand bleiben führend. Genre- und Keyword-IDs werden ohne Codebook nicht
als Genres oder Tags ausgegeben. Chartplätze werden weder als Bewertung noch
als Geschmack oder österreichische Verfügbarkeit behandelt.

Der Weg ist in der Mediathek unter „Mehrere Titel erfassen“ aufklappbar. Der
interne KI-Knopf erscheint nur bei aktiver `personalAi`-Capability sowie
aktiviertem globalen und `stapelimport`-Einzelschalter. Ein Konto- oder
Datenkontextwechsel verwirft die Vorschau. Bei serieller Übernahme wird nach
jedem Await erneut geprüft, sodass ein alter Lauf weder nach einem Kontowechsel
noch nach Unmount weitere Titel speichern kann. Der Lifecycle bleibt auch beim
Effect-Replay in React StrictMode aktiv.

## Katalogprojektion

Der bestehende Katalog-Read wärmt denselben kontogebundenen Faktenstand. Die
synchrone Streamingprojektion ergänzt damit sicher zugeordnete eigene
Katalogeinträge, ohne die Reihenfolge der Finder-/Streamingquellen, Dienste,
URLs oder Filter zu ändern. Es gibt dafür keine Suche, Pagination,
nutzerbezogene API-Schleife oder neue Persistenz.
