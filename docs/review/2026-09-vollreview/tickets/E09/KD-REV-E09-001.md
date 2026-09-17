# KD-REV-E09-001 · Weitere Angaben ersetzt bestätigte Profilfilme ohne Löschhinweis

- Status: unabhängig validiert; Master-Abnahme bestätigt
- Priorität: P2 — ein normal bestätigter Ergänzungsdurchlauf kann persönliche Filmangaben dauerhaft aus dem gespeicherten Geschmacksprofil entfernen. Die Sammlung und echte Bewertungen bleiben außerhalb dieses Befunds.
- Finding: E09-F001
- Prüfstand: `14804ce389d69114feed27b92fb11ac78423cc0e`
- Zuständige Etappe: E09

## Fehler und Auswirkung

Bei **Geschmacksprofil → Ändern → Weitere Angaben machen** wird ein vorhandener bestätigter Film nicht als Bestand in die neue Auswahl übernommen. Bestätigt die Person ausschließlich einen weiteren Film, ersetzt dessen Liste die vorherige komplette Filmliste. Die Vorschau zeigt lediglich den Zugang und nicht den Verlust. Nach Speichern und erneutem Laden fehlt der alte Film auch im gültigen gespeicherten Profil.

Der Fall ist lokal für Gast-/localStorage-Persistenz reproduziert. Anzeige und spätere `promptFassung` lesen die dann verkürzte Liste. Für Account-Sync, bereits betroffene Konten und eine Live-Häufigkeit gibt es keinen Beleg.

## Auslöser, Soll und Ist

1. Ein gültiges Profil enthält einen bestätigten Film A, etwa *Alien*; Einwilligung ist erteilt und kein Rahmenvorschlag ist offen.
2. Die Person öffnet **Weitere Angaben machen**, wählt dort nur Film B, etwa *Heat*, und bestätigt **Ins Profil übernehmen**.

Soll: Der Ergänzungsweg bewahrt A und ergänzt B. Falls eine vollständige Ersetzung fachlich gewollt sein sollte, muss die Vorschau den Bestand und die Entfernung sichtbar machen und die Person diese Ersetzung ausdrücklich bestätigen.

Ist: Die Filmauswahl startet leer; A ist nicht gewählt. Die Vorschau nennt nur `Filme: + Heat`, ohne Verlusthinweis. Der tatsächliche Speicherwert `kd:geschmacksprofil` enthält anschließend nur B; der Wert besteht trotzdem `pruefeProfil`.

## Ursache und Fundstellen

Die Ursache liegt im gemeinsamen Rahmen-Übernahmepfad, nicht im Speichern selbst:

- [`src/components/GeschmackOnboarding.jsx:82-113`](/private/tmp/kd-vollreview-20260916/source/src/components/GeschmackOnboarding.jsx:82) initialisiert `filmwahl` mit `{}` und bildet `onboardingErgebnis` nur aus dieser aktuellen Auswahl. Die Vorschau rendert nur `ergebnis.rahmen.filme` ([`…:253-303`](/private/tmp/kd-vollreview-20260916/source/src/components/GeschmackOnboarding.jsx:253)).
- [`src/components/GeschmackBereich.jsx:140-199`](/private/tmp/kd-vollreview-20260916/source/src/components/GeschmackBereich.jsx:140) reicht den Teilvorschlag an `vorschlagRahmen` und `uebernimmRahmen`; beim erneuten Onboarding werden nur bestehende Achsen, aber keine bestehenden Filme übergeben ([`…:378-384`](/private/tmp/kd-vollreview-20260916/source/src/components/GeschmackBereich.jsx:378)).
- [`src/lib/profil.js:711-725`](/private/tmp/kd-vollreview-20260916/source/src/lib/profil.js:711) übernimmt `r.filme` unverändert. [`…:732-743`](/private/tmp/kd-vollreview-20260916/source/src/lib/profil.js:732) spreadet diesen Wert über den Bestand und ersetzt damit `basis.filme` vollständig. [`…:906-910`](/private/tmp/kd-vollreview-20260916/source/src/lib/profil.js:906) validiert und serialisiert den bereits verkürzten Zustand ohne Zusammenführung.
- Der erreichbare Auslöser ist als **Weitere Angaben machen** beschriftet ([`src/components/ProfilAnsicht.jsx:112`](/private/tmp/kd-vollreview-20260916/source/src/components/ProfilAnsicht.jsx:112)); der deterministische Weg bleibt auch ohne KI erreichbar ([`src/tabs/DatenTab.jsx:279-289`](/private/tmp/kd-vollreview-20260916/source/src/tabs/DatenTab.jsx:279)).

Alle Fundstellen beziehen sich auf die eingefrorene Quelle unter `/private/tmp/kd-vollreview-20260916/source/` für Commit `14804ce389d69114feed27b92fb11ac78423cc0e`; die genannten `src/...`-Pfade sind repository-relativ.

Der gleiche Übernahmepfad ist für KI-Verfeinerung statisch nachvollzogen: Die Extraktion erzeugt eine neue Teil-Filmliste ([`src/lib/extraktion.js:242-266`](/private/tmp/kd-vollreview-20260916/source/src/lib/extraktion.js:242)); die Drei-Fragen-Auswahl übernimmt nur die dort bestätigten Filme ([`src/components/DreiFragen.jsx:72-98`](/private/tmp/kd-vollreview-20260916/source/src/components/DreiFragen.jsx:72)). Dieser KI-Pfad wurde nicht ausgeführt und löste keinen Provideraufruf aus.

## Belege und Gegenproben

**Ausgeführter Reproduktionsbeleg:** Der Validator führte mit unveränderten Produktmodulen aus der eingefrorenen Quelle einen React/JSDOM- und lokalen Speicherpfad aus:

`node /private/tmp/kd-vollreview-20260916/tests/E09-F001/validator/reproduce.mjs`

Ergebnis laut Validator: Exit 0, `REPRODUCED`, Profil `p1 [Alien] → p2 [Heat]`; im zweiten Lauf war Alien `aria-pressed=false`; Vorschau nur `+ Heat`; nach Remount nur Heat. Netzwerkversuche: 0. Maschinenlesbare Werte, Laufprotokoll und Quellfingerprints liegen unter `/private/tmp/kd-vollreview-20260916/tests/E09-F001/validator/` (insbesondere `result.json`, `run.log`, `source-sha256.json`). Der erfolgreiche Lauf bestätigt den Fehlerfingerprint, keine korrigierte Produktabnahme.

**Ausgeführte Gegenproben:** Im selben echten UI-/Speicherpfad bleibt Alien erhalten, wenn nur ein zusätzliches Schlagwort bestätigt wird; ein Abbruch einer Heat-Vorschau lässt das vollständige Ausgangsprofil unverändert.

**Statische Gegenbelege:** Ein bereits offener Rahmenvorschlag blockiert den hier verwendeten Vorschlagsweg. Der vorhandene Wiederholungstest prüft Signal-Akkumulation und fügt Alien erst im zweiten Lauf hinzu ([`geschmackui_test.mjs:1205-1229`](/private/tmp/kd-vollreview-20260916/source/geschmackui_test.mjs:1205)); er deckt A → nur zusätzliche Auswahl B nicht ab. Die Achsen-Schutzprüfung behandelt einen anderen Teilzustand ([`profil_test.mjs:1689-1703`](/private/tmp/kd-vollreview-20260916/source/profil_test.mjs:1689)). Bestehende Tests wurden für diese Validierung nicht ausgeführt.

**Einordnung:** Produktfehler ist die bestätigte stille Ersetzung. Kein Testwerkzeugfehler: Ein erster isolierter JSDOM-Lauf traf erwartbar auf nicht implementiertes `scrollTo`; nach explizitem Scroll-No-op im Test lief die Reproduktion mit Exit 0, ohne Produktänderung. Betriebsbeleglücke: kein Remote-/Live-/Browser-/iPhone-Lauf und keine Aussage zu Kontenzahl oder Inzidenz.

## Korrekturziel und Abnahme

Die Semantik von Film-Bestand, Ergänzungs-UI, Vorschau und gemeinsamer Rahmenübernahme konsistent halten. Bei **Weitere Angaben** vorhandene bestätigte Filme nach fachlicher Filmidentität erhalten und neu bestätigte Filme ergänzen oder eindeutig aktualisieren. Bei absichtlichem Entfernen/Ersatz muss die Oberfläche diese konkrete Änderung vor dem Speichern sichtbar und bestätigungspflichtig machen. Keine Änderung an Provider, Sync oder Datenbank ist für den lokalen Fehlernachweis erforderlich.

Abnahme:

- Profil mit A, weitere Angaben nur B, Bestätigung, Speichern und erneutes Laden ergeben A und B — oder ein separat getesteter, explizit sichtbarer Ersatz.
- Keine neue Filmauswahl und Abbruch bewahren bestätigte Filme.
- Die erneute Auswahl desselben Films erzeugt keine Dublette und verliert keinen anderen Film; eine geänderte Richtung wird eindeutig sichtbar behandelt.
- Ein vorhandener Film außerhalb des aktuellen Angebots bleibt bei einer Ergänzung erhalten.
- Ein gemockter KI-Verfeinerungsfall mit Teil-Filmliste folgt derselben Bestandserhaltungsregel; nur bestätigte Vorschläge dürfen ergänzt werden.
- Einwilligung, Vorschau-Gate, Rahmenvalidierung und der Versionsschritt pro bestätigtem Durchlauf bleiben wirksam.

## Abhängigkeiten und offene Punkte

Keine Duplikatbeziehung bekannt. Die Validatorgrenzen gelten: keine physische Browser-/iPhone-Abnahme, keine Remote-Persistenzprüfung und keine KI-Laufzeitausführung. Die konkrete Identitäts-/Richtungsregel für einen bereits bekannten Film ist vor der Implementierung fachlich festzulegen; sie darf nicht stillschweigend aus Index oder Titelgleichheit abgeleitet werden.

## Herkunft und Master-Abnahme

Validatorergebnis: [`/private/tmp/kd-vollreview-20260916/validations/E09-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/validations/E09-F001.json). Ursprünglicher Vorschlag: [`/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E09-F001.json`](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/validation-inputs/E09-F001.json). Autor: Terra/xhigh. Zuständiger Master: Astra/high. Die gesonderte Master-Abnahme liegt vor.


Master-Abnahme: [bestätigter Abgleich](/Users/max/Documents/GitHub/kinodreieck-app/docs/review/2026-09-vollreview/state/evidence/inbox/E09/TICKET_REVIEW.json). Der bytegenau geprüfte Autorentext ist unter `state/evidence/draft-tickets/E09/KD-REV-E09-001.md` archiviert. Diese Lesefassung aktualisiert nur Beleglinks und Abnahmestatus.
