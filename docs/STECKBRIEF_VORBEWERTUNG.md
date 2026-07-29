# Steckbrief: Vorbewertung / KI-Prognose (Etappe 8, erster Block)

Status: Produktentscheidungen von Max, 26.07.2026. Grundlage: KI-Leitfaden
Funktion 1 („Automatische Vorbewertung"). Baut auf dem Geschmacksprofil
(Etappe 7) auf — deshalb erster Block der Etappe 8, nach dem Profil.

## Zweck

Die App prognostiziert, wie ein unbewerteter Film zum persönlichen Geschmack
passt. Sichtbar als „KI-Prognose", nie als „deine Bewertung". Echte
Bewertungen und Prognosen bleiben technisch getrennte Felder (Festlegung
seit Etappe 3); nichts wird ungefragt überschrieben.

## MVP — entschieden

| Punkt | Entscheidung |
|---|---|
| Auslöser | **On-demand**: Knopf am unbewerteten Film („Prognose erstellen"). Bewusst ausgelöst, kostentransparent. **Kein Import-Batch im MVP** |
| Rubrik | **Volle Rubrik**: WIE-Prognose, WAS-Prognose, persönliche Passung, Kategorie-Vorschlag, Sicherheit, Kurzbegründung, verwendete Profilsignale, Modell- und Profilversion, Status (angenommen/korrigiert/verworfen) |
| WARUM | **Projektweit entschieden 26.07.2026: WARUM = kulturelle Relevanz** (wie der Ingestion-Code heute). WARUM kommt aus gemeinsamem, möglichst belegtem Filmwissen, nicht aus dem Profil; persönliche Verbindung darf die Erklärung ergänzen, nicht ersetzen. Folgearbeit: README/Doku-Angleichung (Restpunkt) |
| KI-Schalter | Vorbewertung ist ein **Kern-KI-Task** (Max: „Tasks, die Sonnet macht"): bei KI=aus ehrlich gekennzeichnet und ausgeblendet — kein deterministischer Ersatz |

## Konsequenz der WARUM-Entscheidung für den MVP

Der gemeinsame Filmwissens-Cache (Leitfaden Funktion 2) existiert noch nicht.
Die Prognose kann daher im MVP keinen belegten WARUM-Anteil liefern — der
Kategorie-Vorschlag (der im Kinodreieck am WARUM hängt) wird als Vorschlag
mit sichtbarer Unsicherheit geführt, nicht als belegte Einordnung. Im
Bau-Chat festzurren: Verhältnis WIE/WAS/WARUM/Kategorie in der Prognose,
und ob ein unbelegter WARUM-Hinweis überhaupt angezeigt wird.

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

## Offen für den Bau-Chat

Minimale Profilmenge für brauchbare Prognose · Verhalten bei ganz neuem
Konto (Prognose verweigern vs. „sehr unsicher") · Annahme-/Korrektur-Flow
und wie Korrekturen als Profil-Signal zurückfließen · Tests mit bekannten
Gegenbeispielen · Modellwahl · Demo: eingefrorene Beispiel-Prognose.

## Abhängigkeiten

Geschmacksprofil (Etappe 7) zwingend. Etappe-5-Unterbau. WARUM-Belegbarkeit
später über Filmwissens-Cache (nicht Beta-Tor).
