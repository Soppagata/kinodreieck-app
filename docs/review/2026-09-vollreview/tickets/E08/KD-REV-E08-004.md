# KD-REV-E08-004 · Zulässiger ID-artiger Freitext blockiert den eigenen Radarfeed und die Entfernung

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — ein regulär gespeichertes eigenes Textabo kann die vollständige Feed-Reconciliation und nachfolgende Outboxverarbeitung dieses Kontos blockieren; Daten sind nicht als gelöscht belegt.
- Finding: E08-F004
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E08

## Fehler und Auswirkung

Ein angemeldetes, für Radar freigeschaltetes Konto kann den zulässigen Freitext `IMDb:tt0068646` unterhalb der Aboquote speichern. Der lokale Queuepfad und der `auth.uid()`-gebundene SQL-Setter akzeptieren ihn. Der danach gelieferte echte SQL-Feed scheitert im Browser jedoch ausschließlich an `feed-subscription-title-invalid`.

Der Pilotservice bleibt dadurch `pending` mit `pilot-feed-invalid`, bevor er Daten reconciled oder die Outbox abarbeitet. Ein frischer Cache übernimmt weder die drei vorhandenen Abos noch den gültigen Fund eines anderen Abos. Eine nachfolgende Entfernen-Operation erreicht den Setter nicht, weil der anfängliche Feed bereits scheitert. Bereits gecachte Inhalte werden nicht nachweislich gelöscht, bleiben aber unsynchronisiert.

Betroffen ist ein eigener Kontosync mit mindestens einem aktiven oder pausierten Freitextabo, dessen Titel mit einem für allgemeine Werktitel gesperrten ID-Präfix beginnt. Ein anderes synthetisches Konto blieb in der ausgeführten Gegenprobe unbeeinträchtigt. Der Gastbetrieb liegt außerhalb des betroffenen Kontosyncpfads; ein separater Gastlauf wurde in dieser Validierung nicht ausgeführt. Kein Livevorfall ist belegt.

## Auslöser, Soll und Ist

**Auslöser.** Ein eingeloggtes Konto mit aktivem Kontosync fügt im Freitextformular etwa `IMDb:tt0068646` hinzu. Dieser Ablauf benötigt keine Provideranfrage.

**Soll.** Ein zugelassener Freitext bleibt unverändert lesbar. Der Kontofeed synchronisiert alle eigenen Abos und Funde, und das Abo kann regulär pausiert oder entfernt werden.

**Ist.** Ein `targetType: text`-Abo durchläuft bei der Feedvalidierung trotzdem `validTitle`. Dessen case-insensitive Präfixsperre für `work`, `watchmode`, `fixture`, `catalog`, `tmdb`, `imdb` und `wikidata` mit Doppelpunkt lehnt den Titel ab. Weil die Feedvalidierung alle Subscriptions streng prüft, verwirft ein Eintrag den gesamten Feed. Der Service prüft diesen Feed vor Reconciliation und vor dem ersten Outboxwrite.

## Ursache und Fundstellen

Der Freitextvertrag beim Anlegen ist bewusst breiter als die allgemeine Werk-/Titelvalidierung. `validateSubscription` erkennt zwar Textziele, verwendet für deren `title` aber ohne Ausnahme den restriktiven `validTitle`-Guard. Die SQL-Projektion gibt genau den gespeicherten Freitext als `subscription.title` zurück; der Service fail-closed vor jeder weiteren Verarbeitung.

- `validTitle` sperrt technische Werk-ID-Präfixe: [`radarPilotContracts.js:102`](/private/tmp/kd-vollreview-20260916/source/src/lib/radarPilotContracts.js:102) — Prüfcommit `14804ce389d69114feed27b92fb11ac78423cc0e`.
- Die Feed-Subscriptionvalidierung ruft für Textziele trotzdem `validTitle(value.title)` auf: [`radarPilotContracts.js:217`](/private/tmp/kd-vollreview-20260916/source/src/lib/radarPilotContracts.js:217), [`:230`](/private/tmp/kd-vollreview-20260916/source/src/lib/radarPilotContracts.js:230).
- Die vollständige Feedvalidierung akkumuliert jeden Subscriptionfehler: [`radarPilotContracts.js:434`](/private/tmp/kd-vollreview-20260916/source/src/lib/radarPilotContracts.js:434), [`:438`](/private/tmp/kd-vollreview-20260916/source/src/lib/radarPilotContracts.js:438).
- Der Pilotservice beendet die Verarbeitung bei ungültigem Feed vor Reconciliation und Outboxwrites: [`radarPilot.js:327`](/private/tmp/kd-vollreview-20260916/source/src/services/radarPilot.js:327), [`:345`](/private/tmp/kd-vollreview-20260916/source/src/services/radarPilot.js:345), [`:356`](/private/tmp/kd-vollreview-20260916/source/src/services/radarPilot.js:356).
- Die Konto-Outbox akzeptiert nichtleeren Freitext bis zur Längengrenze ohne Präfixsperre: [`localEventRadar.js:121`](/private/tmp/kd-vollreview-20260916/source/src/lib/localEventRadar.js:121), [`:930`](/private/tmp/kd-vollreview-20260916/source/src/lib/localEventRadar.js:930).
- Der Controller queue’t den Freitext und startet den Kontosync: [`useEntdeckenRadarController.js:278`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useEntdeckenRadarController.js:278), [`:298`](/private/tmp/kd-vollreview-20260916/source/src/controllers/useEntdeckenRadarController.js:298).
- Der SQL-Textsetter verlangt nur nichtleeren Text bis 160 Zeichen; die Feedprojektion liefert `canonical_title` als `title`: [`20260830130000_radar_freetext_subscription.sql:43`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260830130000_radar_freetext_subscription.sql:43), [`20260814120000_radar_max_manual_pilot.sql:576`](/private/tmp/kd-vollreview-20260916/source/supabase/migrations/20260814120000_radar_max_manual_pilot.sql:576).

## Belege und Gegenproben

**Ausgeführte lokale PostgreSQL-/JS-Reproduktion des Validators.** `node /private/tmp/kd-vollreview-20260916/tests/E08-F004/validator/reproduce.mjs` endete mit Exit 0 und acht erfolgreichen Assertionsgruppen. Sie nutzte PostgreSQL 17, `current_schema.sql`, 25 einschlägige eingefrorene Migrationen und unveränderte JS-Module. Auth, Storage und HTTP-Transport waren injiziert; der RPC-Transport führte echte lokale SQL-Funktionen aus. Es gab keinen Remotezugriff, keinen Provider und keinen Netzwerklistener; PostgreSQL wurde danach gestoppt.

[`result.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E08-F004/validator/result.json) belegt: Der Textsetter speichert `IMDb:tt0068646`, der folgende Feed scheitert mit `pilot-feed-invalid`; ein frischer Cache hat bei drei Serverabos und einem Serverfund null lokale Abos, null lokale Funde und null Persistwrites. Eine Entfernung löst nur den Feed-RPC aus und lässt die Outbox pending. Erst das lokale SQL-Entfernen genau des störenden Abos macht den Service wieder `ready` mit zwei Abos und einem Fund.

**Kontrollen.** Normaler Freitext ist über denselben SQL-Feed und Service lesbar. Ein anderes synthetisches Konto blieb valide. Pausieren des problematischen Abos behebt die Feedvalidierung nicht; erst seine Entfernung stellt die Reconciliation wieder her. [`sql-feed.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E08-F004/validator/sql-feed.json) und [`source-hashes.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E08-F004/validator/source-hashes.json) enthalten die lokalen Belege.

`radar_local_test.mjs` erhält `IMDb:tt0068646` im Gast- und Account-Snapshotpfad, verwendet aber nicht den realen Pilotfeedvalidator; das ist kein Gegenbeleg. E08-F003 ist ein Personen-Katalogproblem und kein Duplikat.

Der Befund ist ein Produktvertragsfehler zwischen Freitextpersistenz und Feedvalidierung, kein Testwerkzeugfehler. Der finale Lauf hatte keine Remote-, Provider- oder Produktcodewirkung.

## Korrekturziel und Abnahme

Für `targetType: text` in `validateSubscription` den bestehenden Freitextvertrag anwenden und den Text unverändert erhalten. Die strenge ID-Präfixsperre für Werke und andere Nicht-Text-Titel bleibt bestehen. Keine Datenlöschung, globale Lockerung, Scheduler- oder Provideränderung ist erforderlich.

- `IMDb:tt0068646` und weitere bislang gesperrte Präfixe sind als Textabos über Queue → SQL-Setter → SQL-Feed → Pilotservice nach frischem Cache lesbar.
- Ein solches Abo blockiert weder weitere eigene Abos/Funde noch deren Reconciliation.
- Pausieren und Entfernen funktionieren über den regulären Service ohne direkte Datenbankreparatur.
- Leertext, Nichtstrings und überschrittene Freitextlänge bleiben ungültig; technische ID-Präfixe bleiben für Nicht-Text-Werktitel ungültig.
- Normale Texte, Feedvarianten und Kontotrennung behalten ihr bisheriges Verhalten.

## Abhängigkeiten und offene Punkte

- Keine abhängigen oder duplizierten Findings bekannt.
- Keine Live-/Staging-Daten, kein echter Browser-/React-Lauf und kein physisches Gerät untersucht.
- Die isolierte Datenbank nutzte 25 Radar-/Private-/Retry-Migrationen auf `current_schema.sql`, nicht sämtliche sachfremden Projektmigrationen.
- Keine Aussage zu Livehäufigkeit oder Deploymentparität.

## Herkunft und Master-Abnahme

Validatorergebnis: [`E08-F004.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E08-F004.json) (`confirmed`). Ursprüngliches Master-Proposal: [`E08-F004.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E08-F004.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die Master-Abnahme ist bestätigt.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E08/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E08/KD-REV-E08-004.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
