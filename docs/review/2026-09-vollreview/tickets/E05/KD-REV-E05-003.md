# KD-REV-E05-003 · `ensureIds` bewahrt leere Alt-IDs und koppelt dadurch Einträge

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — Eine aktuell erreichbare Musik-/Sonstiges-Anlage kann einen nicht auswählbaren Eintrag mit leerer ID speichern und weitere Satzzeichen-Titel fälschlich blockieren. Existierende falsy-ID-Dubletten können Einzeledits koppeln. Keine reale Altdatenhäufigkeit, Remote-Synchronisation oder Datenverlust ist belegt.
- Finding: E05-F003
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E05

## Fehler und Auswirkung

Die zentrale Selbstheilung `ensureIds` erzeugt für `id: null` oder `id: ""` zwar eine neue eindeutige ID, überschreibt sie im Rückgabewert aber unmittelbar wieder mit dem falsy Originalfeld. So bleiben explizit leere bzw. null IDs beim Boot, Remote-Pull, Backup-/Restore-Bibliothekspfad und in der aktuellen Anlage erhalten.

Aktuell erreichbar ist die Anlage eines Musik- oder Sonstiges-Eintrags mit einem nichtleeren reinen Satzzeichen-Titel wie `!!!` und leerem, zulässigem Jahr: Der Slug ist leer, der Eintrag wird mit `id: ""` gespeichert, nach Normalisierung nicht repariert und von der Mehrfachauswahl ausgeschlossen. Ein zweiter unterschiedlicher Satzzeichen-Titel (`???`) wird dann wegen derselben leeren Roh-ID als Dublette verworfen. Bei zwei bereits vorhandenen `null`-/Leerstring-IDs ändert ein Einzeledit beide gleich adressierten Einträge und persistiert beide Änderungen.

Die Mehrfach-Edit-Folge beruht auf synthetisch wiederhergestellten Bestandsdaten; reale Altbestände, ihr Ursprung und ihre Häufigkeit wurden nicht untersucht. Der aktuelle direkte Anlagepfad ist unabhängig davon nachgewiesen.

## Auslöser, Soll und Ist

**Soll.** Jeder gespeicherte Eintrag hat eine nichtleere, eindeutige, stabile ID. Ein weiterer Titel wird nicht allein wegen eines leeren Slugs als Dublette abgelehnt. Ein Edit adressiert nur den ausgewählten Eintrag.

**Ist und Ursache.** In `ensureIds` werden nur truthy IDs als bereits vorhanden behandelt. Für falsy `f.id` erzeugt `eindeutig()` eine ID, registriert sie in `vergeben`, gibt dann aber `{ id, ...f }` zurück — das in `f` enthaltene leere oder null `id` gewinnt ([eingefrorene `match.js`:160-179](/private/tmp/kd-vollreview-20260916/source/src/lib/match.js:160); repository-relativ `src/lib/match.js`, Prüfcommit). `vergeben` enthält damit eine ungenutzte ID, während der Record seine ungültige ID behält.

Die aktuelle Anlage erzeugt diesen Zustand selbst: `MedienForm` verlangt nur einen nichtleeren Titel und akzeptiert ein leeres Jahr ([eingefrorene `MedienForm.jsx`:28-60](/private/tmp/kd-vollreview-20260916/source/src/components/MedienForm.jsx:28); `src/components/MedienForm.jsx` am Prüfcommit). `addFilm` bildet zuerst `film.id || slugId(...)`, prüft die Dublette gegen diesen eventuell leeren Wert, setzt ihn explizit in das Objekt und reicht es an `ensureIds` weiter ([eingefrorene `App.jsx`:1232-1260](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1232); `src/App.jsx` am Prüfcommit). Es gibt den ursprünglichen `id`-Wert zurück, nicht zwingend die normalisierte ID.

Beim Edit mappt `updateFilm` strikt nach `film.id === id`; zwei falsy ID-Paare werden daher gemeinsam verändert ([eingefrorene `App.jsx`:1197-1205](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1197); `src/App.jsx` am Prüfcommit). Der Master-Controller serialisiert `plan.master` ohne nachträglichen ID-Guard ([eingefrorene `useArticleController.js`:293-316](/private/tmp/kd-vollreview-20260916/source/src/controllers/useArticleController.js:293); `src/controllers/useArticleController.js` am Prüfcommit).

## Belege und Gegenproben

**Ausgeführte lokale Reproduktion (kein Browser-Mount, kein Remote-Aufruf).**

`node /private/tmp/kd-vollreview-20260916/tests/E05-F003/validator/repro.mjs` lief erfolgreich mit eingefrorenen Produktmodulen und unveränderten extrahierten `App`- sowie Controller-Funktionskörpern. React-Hooks und Storage sind lokal gemockt.

- Direkte Fälle mit `id: null` und `id: ""` bleiben falsy; vollständig fehlende IDs und truthy Dubletten werden korrekt repariert.
- `restoreBackup` liefert in der isolierten Map-LocalStorage-Umgebung `ok=true` und persistiert falsy IDs. Dies ist ein Bibliotheks-, kein UI-Restore-Test.
- Der unveränderte `updateFilm`-Callback plus Persistenzcontroller verändert und speichert beide Elemente eines synthetischen falsy-ID-Paars.
- Der unveränderte aktuelle Anlagepfad speichert Musik `!!!` ohne Jahr mit leerer ID; Reload-Normalisierung behält sie, Auswahl schließt sie aus, und `???` wird fälschlich als Dublette abgewiesen.

Die vollständige Laufzeitausgabe liegt unter [`result.txt`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E05-F003/validator/result.txt). Sie dokumentiert Beobachtungen, keine Browser-/Produktabnahme.

**Statische Erreichbarkeit und Persistenz.** Boot und Remote-Pull rufen `ensureIds` jeweils auf ([eingefrorene `App.jsx`:690-705 und 1142-1152](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:690); `src/App.jsx` am Prüfcommit). Die Backup-/Restore-Bibliothek führt denselben Normalisierer für `filme` aus ([eingefrorene `personalDataRegistry.js`:78-93](/private/tmp/kd-vollreview-20260916/source/src/lib/personalDataRegistry.js:78); `src/lib/personalDataRegistry.js` am Prüfcommit). Eine produktive UI ruft `restoreBackup` jedoch nicht auf; der aktuelle Backup-Hinweis schließt Restore/Reimport sogar aus ([eingefrorene `backup.js`:141-147](/private/tmp/kd-vollreview-20260916/source/src/lib/backup.js:141); `src/lib/backup.js` am Prüfcommit). Daraus folgt kein heute sichtbarer Restore-UI-Fehler.

Die Mediathek vergibt zwar flüchtige React-Keys für nicht auswählbare Problemrecords, nutzt diese nie als Auswahl-ID ([eingefrorene `MediathekTab.jsx`:571-582](/private/tmp/kd-vollreview-20260916/source/src/tabs/MediathekTab.jsx:571); `src/tabs/MediathekTab.jsx` am Prüfcommit). Leere IDs sind nach der Auswahlregel ausdrücklich ungültig ([eingefrorene `mediathekSelection.js`:14-50](/private/tmp/kd-vollreview-20260916/source/src/lib/mediathekSelection.js:14); `src/lib/mediathekSelection.js` am Prüfcommit). Das begrenzt den Befund: kein pauschaler React-Key- oder Batchlöschdefekt wird behauptet.

**Gegenproben.** Ein fehlendes `id`-Feld wird korrekt ergänzt; truthy Dubletten werden getrennt. Normale Titel mit nichtleerem Slug erhalten vor `ensureIds` eine brauchbare ID; paketweise Übernahmen generieren eigene IDs. Bewertbare Film-/Serienanlage verlangt ein Jahr und bildet dadurch auch bei Satzzeichen-Titeln einen nichtleeren Slug ([eingefrorene `EintragForm.jsx`:117-126](/private/tmp/kd-vollreview-20260916/source/src/components/EintragForm.jsx:117); `src/components/EintragForm.jsx` am Prüfcommit). Der aktuelle direkte Pfad belegt deshalb die falsche Dublettenablehnung, nicht zwei neu angelegte Leer-ID-Einträge.

## Korrekturziel und Abnahme

Die Korrektur klein halten:

1. Im zentralen falsy-Zweig von `ensureIds` die erzeugte ID nach den Originalfeldern setzen, damit sie `null`/`""` tatsächlich ersetzt.
2. An `addFilm` mit der tatsächlich normalisierten eindeutigen ID entscheiden und diese auch zurückgeben. Nur ein Spread-Fix in `ensureIds` reicht nicht, wenn der Callback weiterhin den alten leeren Wert für Dublettencheck und Rückgabe verwendet.
3. Gültige bestehende IDs und Kollisionsregeln erhalten. Keinen Restore-UI-Neubau, keine allgemeine Matching-Neugestaltung.

Abnahmekriterien:

- `ensureIds` liefert für `id: null`, `id: ""`, fehlendes `id` und andere falsy Altwerte nichtleere eindeutige IDs; ein erneuter Lauf erhält die IDs.
- Gültige IDs bleiben bestehen; Kollisionen mit existierenden sowie im gleichen Lauf neu vergebenen IDs bleiben verhindert.
- Der aktuelle Musikpfad mit `!!!` und leerem Jahr persistiert und gibt eine gültige ID zurück; der Eintrag bleibt nach Reload auswählbar.
- Ein zweiter Satzzeichen-Titel mit leerem Rohslug wird nicht als Dublette abgewiesen.
- Wiederhergestellte null-/Leerstring-ID-Paare sind vor Nutzung getrennt; ein Einzeledit verändert nur das gewählte Werk. Ein Bibliothekstest genügt; ein neuer UI-Restore ist nicht erforderlich.

## Abhängigkeiten und offene Punkte

Kein Browser- oder physischer Gerätetest wurde ausgeführt; Formularvalidierung und UI-Wiring sind statisch verfolgt, produktive Callback- und Controller-Körper im Node-Harness mit Hook-/Storage-Mocks ausgeführt. Reale Altdaten, historische Importwege, Remote-Persistenz und Konto-Synchronisation sind nicht geprüft.

Die Quelle des Restore-Bibliotheksvertrags bleibt relevant für eine Datenkorrektur, begründet aber keine UI-Funktion. Der Fix muss die bestehende lokale und kontoübergreifende Speicherung separat testen, falls deren Verhalten geändert wird.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E05-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E05-F003.json) (`confirmed`). Ursprüngliches, eingefrorenes Master-Proposal: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E05-F003.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E05-F003.json).

Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E05/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E05/KD-REV-E05-003.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
