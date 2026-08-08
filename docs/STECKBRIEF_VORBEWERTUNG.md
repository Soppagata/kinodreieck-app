# Steckbrief: Vorbewertung / KI-Prognose (Etappe 8, erster Block)

Status: Produktentscheidungen von Max und technischer MVP einschließlich
Filmwissensübergabe umgesetzt, Abnahme 30.07.2026. Grundlage: KI-Leitfaden Funktion 1
(„Automatische Vorbewertung"). Baut auf dem Geschmacksprofil (Etappe 7) auf
— deshalb erster Block der Etappe 8, nach dem Profil.

## Zweck

Die App prognostiziert, wie ein unbewerteter Film zum persönlichen Geschmack
passt. Sichtbar als „KI-Prognose", nie als „deine Bewertung". Echte
Bewertungen und Prognosen bleiben technisch getrennte Felder (Festlegung
seit Etappe 3); nichts wird ungefragt überschrieben.

## MVP — entschieden

| Punkt | Entscheidung |
|---|---|
| Auslöser | **On-demand**: Knopf am unbewerteten Film und direkte Aktion beim Erstellen eines neuen Eintrags („Anlegen & KI-Prognose erstellen"). Der unbewertete Eintrag wird zuerst sicher gespeichert, erst danach beginnt genau ein kostenpflichtiger Aufruf. **Kein Import-Batch im MVP** |
| Rubrik | **Volle Rubrik**: WIE-Prognose, WAS-Prognose, persönliche Passung, Kategorie-Vorschlag, Sicherheit, Kurzbegründung, verwendete Profilsignale, Modell- und Profilversion, Status (angenommen/korrigiert/verworfen) |
| WARUM | **WARUM = kulturelle Relevanz.** Vorhandenes belegtes Filmwissen wird mit seiner Versions-ID unverändert übernommen. Bei Cache-Miss darf Sonnet eine ausdrücklich vorläufige persönliche Schätzung aus Filmkontext und Geschmacksprofil liefern. Beides bleibt von einer echten Bewertung getrennt. |
| KI-Schalter | Vorbewertung ist ein **Kern-KI-Task** (Max: „Tasks, die Sonnet macht"): bei KI=aus ehrlich gekennzeichnet und ausgeblendet — kein deterministischer Ersatz |

## Konsequenz der WARUM-Entscheidung für den MVP

Der gemeinsame Filmwissens-Cache (Leitfaden Funktion 2) ist implementiert.
Liegt eine veröffentlichte Fassung vor, bindet der Server deren WARUM-Wert und
Versions-ID in die Prognose ein; das Modell kann diesen Wert nicht verändern.
Bei Cache-Miss darf Sonnet WARUM im persönlichen Prognosefeld als `0..5`
schätzen oder bei zu dünner Grundlage `null` liefern. Oberfläche und
Speichervertrag unterscheiden `filmwissen` und `persoenlich_geschaetzt`. Eine
echte Nutzerbewertung bleibt weiterhin ausschließlich im Feld `bewertung`.

Der MVP verwendet im Vorbewertungs-Aufruf keine Websuche. Eine Domain-
Beschränkung würde den festen Suchpreis nicht senken und ersetzt keine
Lizenz zur automatisierten Nutzung von IMDb, Rotten Tomatoes oder film.at.
Gemeinsames Filmwissen wird nur über die festen serverseitigen Adapter für
Wikidata und Library of Congress einmalig aus erlaubten, belegbaren Quellen in
den Cache aufgenommen.

## Geparkt

- **Import-Batch-Prognosen** (automatisch bei Import) → nach stabilem
  On-demand-MVP, mit Kostenvorschau und Limits.
- **Neuberechnung aller Prognosen bei Profil-Update** → Bau-Chat entscheidet
  Minimum (z. B. nur auf Anforderung).

## Abnahme (Leitfaden „Fertig, wenn" + heute)

- echte und geschätzte Werte technisch eindeutig getrennt, nichts
  ungefragt überschrieben,
- Prognose nachvollziehbar (Signale sichtbar) und verwerfbar,
- unzureichende Daten (leeres/junges Profil) führen zu sichtbarer
  Unsicherheit statt erfundener Präzision,
- Kosten und Modellversion protokolliert (Etappe-5-Protokoll),
- bei KI=aus verschwindet die Funktion sauber, ohne Löcher in der UI.

## Ergänzende Entscheidungen vom 29.07.2026

- Gültige Typen im MVP: Film und Serie. Alte `filmreihe`-Werte aus Backups
  werden beim Laden kompatibel als `film` normalisiert.
- Es gelten die sieben tatsächlichen persönlichen Kategorien:
  `immer_gut`, `kult`, `kult_klassiker`, `daemlich_aber_herrlich`, `trash`,
  `sehenswert`, `echter_schrott`.
- Ohne bestätigtes Profilsignal startet kein Anbieteraufruf. Bei ein bis zwei
  Signalen ist höchstens `sehr_niedrig`, bei drei bis vier höchstens
  `niedrig` zulässig. Ab fünf Signalen aus mindestens zwei Arten darf die
  Sicherheit höher liegen.
- `Nur Prognose bestätigen` ändert ausschließlich den Prognosestatus.
  `Als Bewertung übernehmen` öffnet dagegen eine vorausgefüllte Vorschau:
  Alle drei Achsen und die Kategorie müssen geprüft und ausdrücklich
  gespeichert werden. Erst dann wird eine echte Bewertung mit sichtbarer
  KI-Herkunft angelegt. Korrigieren bleibt der freie Bewertungsweg;
  Verwerfen erhält die Prognose mit Status.
- Reaktionen fließen im MVP nicht automatisch ins Geschmacksprofil zurück.
- Profiländerungen lösen keine automatische Neuberechnung aus.
- Die anzuzeigende Passung wird gerundet beziehungsweise als Band formuliert,
  nicht als scheinpräzise persönliche Prozentmessung verkauft.
- Es gibt keinen erfundenen oder separat eingefrorenen Demofilm. Im
  anonymen Demo-Modus können neue Einträge angelegt werden; ein echter
  Anbieteraufruf verlangt die Anmeldung. Nach der Anmeldung gilt
  ausschließlich der aktuelle Kontostand — Demo-Töpfe bleiben nicht stehen.
- Alte über den KI-Ingestion-Prompt geschätzte Bewertungen werden bei neuen
  Imports von echten Bewertungen getrennt und quarantänisiert.

## Abhängigkeiten

Geschmacksprofil (Etappe 7) zwingend. Etappe-5-Unterbau. Belegtes gemeinsames
WARUM über den versionierten Filmwissens-Cache.
