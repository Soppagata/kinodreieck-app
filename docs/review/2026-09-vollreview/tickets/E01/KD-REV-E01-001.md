# KD-REV-E01-001 · Gespeicherter Titel-Pin bleibt nach frischem Start unsichtbar

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 – Ein bestätigter, kontogebundener Titel-Pin kann auf der Startseite vollständig wie ein leerer Bestand wirken. Der Pin bleibt zwar gespeichert, ist ohne weiteren Fachbereichsschritt aber nicht erreichbar.
- Finding: E01-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E01

## Fehler und Auswirkung

Betroffen sind gültige Format-1-Titel-Pins aus Streaming oder Entdecken, wenn ihr Ziel weder im leichten Known-Rohkatalog noch im aktuellen Kinoprogramm vorkommt und in diesem App-Lauf noch kein passender Vollkatalog oder Empfehlungsfeed geladen wurde. Hat das Konto keine weiteren auflösbaren Pins, erscheint auf Start irreführend **„Noch leer“**. Bei weiteren Pins fehlt nur der unaufgelöste Titel.

Dies ist ein Anzeige- und Erreichbarkeitsfehler, kein belegter Datenverlust: Der Resolver behält den Pin als `pending`; `discardedPinIds` bleibt leer. Format-2-Must-Watch-Pins mit vorhandenem persönlichen Eintrag sind von dieser Kataloglücke nicht generell betroffen. Kein Kontoübergriff und keine Providerwirkung wurden belegt.

## Auslöser, Soll und Ist

**Auslöser:** Ein aktives, berechtigtes Konto startet nach abgeschlossenem Boot im Tab Start. Es besitzt genau einen gültigen, bestätigten Format-1-Titel-Pin. Dessen Titel fehlt im Known-Rohkatalog und im Kinoprogramm; weder Vollkatalog noch passender Empfehlungsfeed wurden in diesem Lauf zuvor geladen.

**Soll:** Der gespeicherte Pin wird auf Start gezielt aufgelöst und sichtbar, oder die Oberfläche hält ihn mit einem ehrlichen ausstehenden beziehungsweise nicht verfügbaren Status sichtbar. Ein vorhandener gespeicherter Pin darf nicht als komplett leeres Pinboard erscheinen.

**Ist:** Der Pin wird durch `useEntdeckenPins` geladen. Der normale Boot lädt jedoch nur Known; ohne angeforderten Vollkatalog baut App für Entdecken einen leeren Titelbestand. Der Web-Feed ist im Start-Tab idle. Die Startansicht projiziert vorhandene Katalogdaten, fordert für Titel-Pins aber keine fehlenden Daten an. `resolveEntdeckenPins` ordnet den Pin `pending` zu, während das Pinboard ausschließlich `resolved` berücksichtigt und „Noch leer“ ausgibt. Fokus und erneutes Rendern ändern diesen Zustand nicht. Sobald ein passender Vollkatalog bereitsteht, wird derselbe unveränderte gespeicherte Pin sichtbar.

## Ursache und Fundstellen

Die bedarfsgesteuerte Katalogladung ist für Titel-Pins nicht bis zum Start-Pinboard verdrahtet:

- Der Feed wird nur aktiviert, wenn `tab === "blog"`: [eingefrorene `src/App.jsx:321`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:321) (repository-relativ `src/App.jsx:321`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`).
- `ladeStreamingDateien` lädt den Discover-Bestand nur bei `vollKatalog`; ansonsten setzt die Anzeigedatenquelle für Entdecken einen leeren Titelbestand. Siehe [eingefrorene `src/App.jsx:1432`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1432), [`:1532`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1532) und [`:1568`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1568). Der Boot-Effekt ruft ohne Vollflag auf: [`:1663`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1663). `StartTab` erhält den Callback lediglich als Prop: [`:1901`](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1901).
- `brauchtSerienKatalog` schaltet nur die `useMemo`-Projektion des bereits vorhandenen Katalogs ein; es löst keine Ladung aus. Der vorhandene Callback wird durch `ladeWochenKatalog` weitergereicht: [eingefrorene `src/tabs/StartTab.jsx:212`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:212) und [`:216`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:216). Im Wochenplan ruft ihn ausschließlich ein geöffneter Folgen-/Staffel-Entwurf mit Vollflag auf: [eingefrorene `src/components/Wochenplan.jsx:109`](/private/tmp/kd-vollreview-20260916/source/src/components/Wochenplan.jsx:109).
- Der Resolver bewahrt nicht eindeutig auflösbare Pins als `pendingPinIds`: [eingefrorene `src/lib/entdeckenPins.js:340`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenPins.js:340) und [`:388`](/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenPins.js:388). Start übernimmt nur `resolved`: [eingefrorene `src/tabs/StartTab.jsx:234`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:234) und [`:246`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:246); der Leerzustand prüft nur sichtbare Titel- oder Kino-Pins: [`:293`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:293) und [`:328`](/private/tmp/kd-vollreview-20260916/source/src/tabs/StartTab.jsx:328).

## Belege und Gegenproben

**Statische Beweiskette.** Der Validator hat den Startpfad, die Loader-Gates, die Datenübergabe, Persistenz/Normalisierung und spätere Guards geprüft. Er belegt keinen vollständigen App-Mount, aber den fehlenden Abrufpfad im echten Start-Unterbaum. Details: [Validator JSON](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E01-F001.json) und ursprünglicher, inzwischen präzisierter [Master-Verdacht](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E01-F001.json).

**Tatsächlich ausgeführte lokale Reproduktion.** `node /private/tmp/kd-vollreview-20260916/tests/E01-F001/validator/repro.mjs` endete mit Exit 0. Der isolierte React/JSDOM-Aufbau verwendete unveränderten Produktcode für StartTab, Wochenplan, `useEntdeckenPins`, den inaktiven Feed und die Streaming-Projektion sowie einen Mock-Kontotreiber und beobachteten Katalogcallback. Nach Speichern, Unmount und frischem Mount meldete er `loaded=true`, einen gespeicherten, aber null sichtbare Pins, „Noch leer“, `loaderCalls=[]` und Feed `idle`; Fokus/Render änderten nichts. Nach Bereitstellung des Vollkatalogs war derselbe Pin sichtbar, der Speicher bytegleich. Maschinenlesbares Resultat: [result.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E01-F001/validator/result.json); gerenderter Leerzustand: [fresh-start.html](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E01-F001/validator/fresh-start.html). Dieser erfolgreiche Reproduktionslauf belegt den Fehler, keine bestandene Produktabnahme.

**Gegenproben und Grenzen.**

- Der Pin wird nicht gelöscht; eine passende, schon geladene Known-/Discover-/Kino-Identität wird wieder aufgelöst und angezeigt.
- Der Wochenplan kann den Vollkatalog nur nach Öffnen eines Folgen-/Staffel-Editors laden. Ein frischer Start mit allein einem Titel-Pin passiert diesen Guard nicht.
- Der spezielle `file://`-Einzeldatei-Fallback kann einen eingebetteten oder beigeladenen Katalog bereitstellen. Der Befund gilt deshalb nicht pauschal für jeden Einzeldateistart.
- Ein Entdecken-Besuch kann den Feed starten und einen darin vorhandenen Pin auflösen; er ist kein garantierter Fix für jeden Streaming-Pin. Auch Streaming/Alles kann Seitenmodus statt globalen Vollkatalog verwenden.
- Vorhandene Pin-Sync-Tests prüfen erfolgreiche Wiederherstellung im Hook und widerlegen den Dashboardfehler nicht.

## Korrekturziel und Abnahme

Den Start-Pinboard-Datenpfad und seine Leer-/Pendingdarstellung gezielt schließen: Eine vorhandene gespeicherte Identität bleibt sichtbar, während passende Zieldaten begrenzt nachgeladen oder der fehlende Abgleich ausdrücklich angezeigt wird. Owner-, Identitäts- und Mehrdeutigkeitsguards bleiben unverändert. Kein pauschaler Vollkatalogabruf bei jedem Appstart.

Abnahme:

1. Ein frischer Online-Start mit gültigem bestätigtem Format-1-Pin außerhalb Known/Kino zeigt entweder den Pin oder einen zutreffenden ausstehenden Zustand – nie „Noch leer“ für diesen vorhandenen Bestand.
2. Nach erfolgreicher gezielter Auflösung ist der Pin ohne vorherigen Fachbereichsbesuch sichtbar und navigiert zum korrekten Werk.
3. Fehlende, fehlerhafte oder mehrdeutige Katalogantworten löschen keinen Pin und behaupten keine erfolgreiche Auflösung.
4. Ein leerer Pinbestand löst keinen unnötigen Vollkatalogabruf aus; vorhandene Katalogtreffer sowie Must-Watch- und Kinopins behalten ihr Verhalten.
5. Ein fokussierter gemounteter Regressionstest deckt Speichern, frischen Start und verzögerte Katalogdaten mit Mock-Konto ab.

## Abhängigkeiten und offene Punkte

- Kein verwandtes Finding als Duplikat bestätigt.
- Nicht ausgeführt und daher **nicht belegt**: vollständiger App-Mount, Live-Katalogabfrage, reale Kontosynchronisation, konkrete aktuelle betroffene Titel, physische iPhone-/PWA-Abnahme und Auftretenshäufigkeit.
- Der Validator führte Mount, ausstehende Effekte, Fokus und erneutes Rendern aus, aber keinen zeitlich unbegrenzten Lauf. Das Fortbestehen ohne Daten-/Navigationsänderung folgt aus dem fehlenden Abrufpfad.

## Herkunft und Master-Abnahme

Validatorergebnis: [E01-F001.json](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E01-F001.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E01/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E01/KD-REV-E01-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
