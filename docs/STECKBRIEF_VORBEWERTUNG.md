# Steckbrief: Vorbewertung / KI-Prognose (Etappe 8, erster Block)

Status: Produktentscheidungen von Max und technischer MVP umgesetzt,
Backend-Abnahme 29.07.2026. Grundlage: KI-Leitfaden Funktion 1
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
| WARUM | **Projektweit entschieden 26.07.2026: WARUM = kulturelle Relevanz** (wie der Ingestion-Code heute). WARUM kommt aus gemeinsamem, möglichst belegtem Filmwissen, nicht aus dem Profil; persönliche Verbindung darf die Erklärung ergänzen, nicht ersetzen. Folgearbeit: README/Doku-Angleichung (Restpunkt) |
| KI-Schalter | Vorbewertung ist ein **Kern-KI-Task** (Max: „Tasks, die Sonnet macht"): bei KI=aus ehrlich gekennzeichnet und ausgeblendet — kein deterministischer Ersatz |

## Konsequenz der WARUM-Entscheidung für den MVP

Der gemeinsame Filmwissens-Cache (Leitfaden Funktion 2) existiert noch nicht.
Die Prognose kann daher im MVP keinen belegten WARUM-Anteil liefern — der
Kategorie-Vorschlag (der im Kinodreieck am WARUM hängt) wird als Vorschlag
mit sichtbarer Unsicherheit geführt, nicht als belegte Einordnung. WARUM
bleibt im Ergebnis `null`; die Oberfläche erklärt, dass kulturelle Relevanz
erst mit dem gemeinsamen Filmwissens-Cache belegbar wird.

Der MVP verwendet im Vorbewertungs-Aufruf keine Websuche. Eine Domain-
Beschränkung würde den festen Suchpreis nicht senken und ersetzt keine
Lizenz zur automatisierten Nutzung von IMDb, Rotten Tomatoes oder film.at.
Gemeinsames Filmwissen wird in einem späteren Block einmalig aus erlaubten,
belegbaren Quellen in den Cache aufgenommen.

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

- Gültige Typen im MVP: Film, Filmreihe und Serie.
- Es gelten die sieben tatsächlichen persönlichen Kategorien:
  `immer_gut`, `kult`, `kult_klassiker`, `daemlich_aber_herrlich`, `trash`,
  `sehenswert`, `echter_schrott`.
- Ohne bestätigtes Profilsignal startet kein Anbieteraufruf. Bei ein bis zwei
  Signalen ist höchstens `sehr_niedrig`, bei drei bis vier höchstens
  `niedrig` zulässig. Ab fünf Signalen aus mindestens zwei Arten darf die
  Sicherheit höher liegen.
- Annehmen macht aus der Prognose keine Bewertung. Korrigieren öffnet den
  echten Bewertungsweg; Verwerfen erhält die Prognose mit Status.
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

Geschmacksprofil (Etappe 7) zwingend. Etappe-5-Unterbau. WARUM-Belegbarkeit
später über Filmwissens-Cache (nicht Beta-Tor).
