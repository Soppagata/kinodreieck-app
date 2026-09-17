# KD-REV-E05-001 · Fehlgeschlagener Known-Nachzug mischt entfernte Angebote in lokale Consumer

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — Bei einem begrenzten, aber realistischen Teilfehler kann ein nicht mehr verfügbares, ausgewähltes Angebot als aktuell erscheinen. Betroffen sind Suche, Badges und der Legacy-Fallback; weder Datenverlust noch Berechtigungen sind betroffen.
- Finding: E05-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E05

## Fehler und Auswirkung

Nach einem Katalogwechsel kann die App einen alten `streamingBekannt`-Stand A mit einem neuen vollständigen `streamingEntdecken`-Stand B zusammenführen, obwohl der einmalige Nachzug von Known fehlschlägt oder wieder A aus dem Browsercache liefert. Wurde ein ausgewählter Dienst zwischen A und B entfernt, kann dieser Dienst samt Angebotslink danach weiterhin in folgenden lokalen Consumern auftauchen:

- Finder und globale Suche,
- Streaming-Badges in Mediathek und Kino,
- `Mein Programm` im Legacy-Fallback, der nur bei fehlender Seiten-RPC aktiviert wird.

Dies ist keine Aussage über einen aktuellen Livevorfall, eine Netzfehlerrate, reale Providerdaten oder eine ausgerollte Datenbankmigration. Der moderne progressive Seitenpfad sowie `Alles` und `Neu` werden nicht pauschal als betroffen behauptet: Bei unterschiedlichen Generationen bleiben deren Vollständigkeitsguards gesperrt.

## Auslöser, Soll und Ist

**Reproduzierbarer Auslöser.** Ein fachlich freigeschaltetes Konto lädt beim Boot Known aus Generation A. Anschließend liegt Discover in Generation B vor, in der für ein Werk Netflix entfernt wurde und nur Disney+ bleibt. Eine globale Suche fordert den Vollabruf an. Der dadurch ausgelöste Known-Nachzug liefert wegen eines Netzfehlers den Cache A oder wirft ohne Cache; für das Werk existiert keine passende MotN-Korrektur. Netflix ist ausgewählt.

**Soll.** Zwei unterschiedliche Generationen dürfen nicht zu einem als aktuelle Verfügbarkeit verwendbaren Titelbestand vereinigt werden. Ist der Reparatur-Read nicht passend, muss der Zustand erkennbar unvollständig bzw. veraltet bleiben und ein späterer erlaubter Refresh muss den Abgleich erneut versuchen können. Zwei Lanes derselben Generation dürfen weiterhin ihre legitimen Angebote vereinigen.

**Ist.** Der globale Suchpfad ruft den Vollabruf auf und verwendet dessen Rückgabe direkt ([eingefrorene `App.jsx`:1362-1375](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1362); repository-relativ `src/App.jsx`, Prüfcommit). Erkennt der Abruf A/B, versucht er genau einmal Known nachzuziehen. Ein Fehler wird zwar gemeldet, danach werden aber das möglicherweise alte Known und Discover B als `entdeckenUmfang: "voll"` übernommen und `entdeckenGeladen` gesetzt ([`App.jsx`:1541-1559](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1541); `src/App.jsx` am Prüfcommit).

Der anschließende Merge vereinigt unabhängig vom festgestellten Generationenmismatch Dienste und Links ([eingefrorene `katalog.js`:468-477 und 496-541](/private/tmp/kd-vollreview-20260916/source/src/lib/katalog.js:468); `src/lib/katalog.js` am Prüfcommit). Damit erreicht der alte Netflix-Dienst samt Link den gematchten Known-Titel, die Badges ([`App.jsx`:1632-1647](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1632); `src/App.jsx` am Prüfcommit) und die Finder-Herkunft ([eingefrorene `finder.js`:470-485](/private/tmp/kd-vollreview-20260916/source/src/lib/finder.js:470); `src/lib/finder.js` am Prüfcommit). Ein weiterer Vollabruf versucht den Known-Nachzug nicht erneut, weil der Zustand als geladen verriegelt ist.

## Ursache und Fundstellen

Die Generationserkennung schützt nur Quellenmetadaten; sie steuert nicht den Titelmerge. Der Browsercache kann bei einem fehlgeschlagenen Direktread den älteren Payload mitsamt dessen Metadaten zurückgeben ([eingefrorene `katalog.js`:334-359](/private/tmp/kd-vollreview-20260916/source/src/lib/katalog.js:334); `src/lib/katalog.js` am Prüfcommit). `loadArea` gibt diesen Stand weiter ([eingefrorene `catalog.js`:311-319 und 369-378](/private/tmp/kd-vollreview-20260916/source/src/services/catalog.js:311); `src/services/catalog.js` am Prüfcommit).

`App.jsx` prüft nach dem Nachzug weder dessen `katalog_stand` noch das endgültige Known/Discover-Paar. Der Catch meldet den Known-Fehler, setzt aber keine fehlerhafte Vollabrufmarke zurück ([eingefrorene `App.jsx`:1545-1559](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1545); `src/App.jsx` am Prüfcommit). `baueStreamingAnsichten` erkennt den Mismatch nur bei Metadaten, vereinigt aber Titel-Dienste und `web_urls` ([eingefrorene `katalog.js`:468-477 und 491-541](/private/tmp/kd-vollreview-20260916/source/src/lib/katalog.js:491); `src/lib/katalog.js` am Prüfcommit).

Die Consumergrenzen sind absichtlich verschieden:

- `projiziereStreamingAnsichten` berechnet `vollstaendig` generationstreu, bildet `meinProgramm` aber aus Known ([eingefrorene `streamingProjection.js`:73-96](/private/tmp/kd-vollreview-20260916/source/src/lib/streamingProjection.js:73); `src/lib/streamingProjection.js` am Prüfcommit).
- Der Legacy-Pfad wird nur bei fehlender Seiten-RPC aktiviert ([eingefrorene `useStreamingPageController.js`:192-201 und 293-300](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingPageController.js:192); `src/controllers/useStreamingPageController.js` am Prüfcommit).
- Der reguläre progressive Seitenpfad ist nicht als fehlerhaft belegt.

## Belege und Gegenproben

**Ausgeführte lokale Reproduktion (kein Netz, kein React-DOM- oder Live-Test).**

`node /private/tmp/kd-vollreview-20260916/tests/E05-F001/validator/reproduce.mjs` lief mit Exit 0. Der Test extrahiert den unveränderten `ladeStreamingDateien`-Callback aus der eingefrorenen `App.jsx`, nutzt die echten Katalog-, Merge-, Projektion- und Finder-Module und mockt React-State, Accountgrenzen, `fetch` und CacheStorage vollständig lokal.

- Fehlerfall Cache A und Fehlerfall ohne Cache: Dienste `[Disney+, Netflix]`, entfernter Netflix-Link vorhanden, Netflix in Legacy-`Mein Programm` und Finder vorhanden; finale Info `datenbank/B/ausCache:false`; kein erneuter Known-Request beim weiteren Vollabruf.
- Kontrollfall erfolgreicher Nachzug B: nur Disney+, kein Netflix-Link, Netflix-Projektion leer und vollständiger Katalog.
- Kontrollfall gleicher Katalogstand: die erlaubte Union zweier Lanes bleibt erhalten.

Das maschinenlesbare Resultat mit Requests, Herkunft, Generationen und Kontrollen liegt unter [`result.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/tests/E05-F001/validator/result.json). Ein dortiges `PASS` belegt nachgewiesenes Fehler- oder Kontrollverhalten, keine Produktabnahme.

**Statische Beweiskette.** Known wird beim Boot auch außerhalb des Streaming-Tabs geladen ([eingefrorene `App.jsx`:1660-1665](/private/tmp/kd-vollreview-20260916/source/src/App.jsx:1660); `src/App.jsx` am Prüfcommit). Der Suchpfad, der Ergebnismerge, Badges und Finder sind oben verlinkt. Die Validator-Identitätsprüfung stimmt die gelesenen Hauptdateien bytegleich mit dem Prüfcommit ab; der vollständige Bericht liegt unter [`E05-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E05-F001.json).

**Gegenproben und Grenzen.** `Alles` wird bei einem Mismatch nicht als vollständig behandelt ([eingefrorene `streamingProjection.js`:79-96](/private/tmp/kd-vollreview-20260916/source/src/lib/streamingProjection.js:79)); die UI zeigt dann statt Katalogkarten den Ladehinweis ([eingefrorene `StreamingTab.jsx`:565-567 und 838-847](/private/tmp/kd-vollreview-20260916/source/src/tabs/StreamingTab.jsx:565); `src/tabs/StreamingTab.jsx` am Prüfcommit). Der Neu-Controller verwirft ebenfalls den Vollkatalogbeleg ([eingefrorene `useStreamingNeuController.js`:121-131](/private/tmp/kd-vollreview-20260916/source/src/controllers/useStreamingNeuController.js:121); `src/controllers/useStreamingNeuController.js` am Prüfcommit). MotN kann einzelne Angebote mit gültigem AT-Beleg entfernen, ist aber kein vollständiger Schutz; die Reproduktion nutzt eine zulässige Payload ohne solchen Beleg. Die separate Known-Fehlermeldung wird gesendet — der Fehler ist daher nicht vollständig lautlos.

Die serverseitige Seitenprojektion und ihre Migrationskonsistenz wurden nicht als Ursache behauptet: Der Validator fand lediglich getrennte mögliche Reads vor/nach einer Publikation. Das ist ein lokaler Browser-Merge-Befund, keine Betriebsbeleglücke oder Aussage über den ausgerollten Datenbankstand.

## Korrekturziel und Abnahme

Die Korrektur auf den browserseitigen Generationenvertrag in `App.jsx` und `katalog.js` begrenzen:

1. Nach dem Known-Nachzug die Generation des Ergebnisses und des endgültigen Paares prüfen.
2. Unterschiedliche Lanes nicht als gemeinsamen aktuellen Angebotsbestand an Finder, Badges oder Legacy-`Mein Programm` weiterreichen.
3. Einen nutzbaren letzten konsistenten Stand oder einen ehrlich eingeschränkten Zustand behalten; den Konflikt nicht durch `entdeckenGeladen` dauerhaft verriegeln, damit ein späterer erlaubter Refresh den Abgleich wiederholen kann.
4. Discover nicht pauschal als alleinige Wahrheit behandeln: Known kann legitime exklusive Lane-Angebote enthalten. Same-Generation-Union, Konto-/Betriebsart-Guards, Quellenmetadaten und MotN-Korrekturen bleiben erhalten.

Abnahmekriterien:

- Mocktest für Boot Known A, Discover B mit entferntem ausgewähltem Dienst und Known-Refresh aus Cache A: Finder, Badges und Legacy-`Mein Programm` geben keinen alten Dienst oder Link als aktuelle Verfügbarkeit aus.
- Derselbe Schutz gilt für geworfenen Refresh ohne Cache sowie für einen erfolgreichen Read, dessen Generation weiterhin nicht zu Discover passt.
- Der Konflikt bleibt für Wiederherstellung erkennbar; ein späterer erlaubter Refresh kann ein passendes Paar übernehmen.
- Die sichtbare Herkunft behauptet keinen frischen Gesamtkatalog, wenn verwendete Angebote aus einem alten Teil stammen.
- Kontrolle: Passender Known-Nachzug B entfernt das Angebot; zwei Lanes derselben Generation behalten ihre legitime Union.
- `Alles`/`Neu` bleiben bei Mismatch geschützt; der normale progressive Seitenpfad bleibt unverändert.

## Abhängigkeiten und offene Punkte

Keine Abhängigkeit zu einem Backend-Umbau oder neuen Providerpfad ist aus diesem Befund abgeleitet. Ein React-DOM-/Browser-Rendering wurde nicht ausgeführt; die sichtbaren Verbindungen und Guards sind statisch verfolgt, der Laufzeitbeleg nutzt den echten extrahierten Callback und echte Datenmodule mit lokalen Mocks. Livehäufigkeit, reale MotN-Abdeckung, aktuelle Kataloggenerationen und tatsächliche Netzfehler bleiben offen.

Der bestehende Test `katalog_test.mjs` deckt die Generationen nur mit leeren Titellisten ab; er widerlegt die Reproduktion nicht. Der Fix muss daher die entfernte Angebots-/Link-Konstellation und die genannte Same-Generation-Kontrolle gezielt abdecken.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E05-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E05-F001.json) (`confirmed`). Ursprüngliches, eingefrorenes Master-Proposal: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E05-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E05-F001.json).

Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E05/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E05/KD-REV-E05-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
