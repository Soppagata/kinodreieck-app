# Minimaler Freitext-Radarpfad

Freitext ist ein Suchwert, keine Werkidentität. Das providerfreie eigene Abo
bleibt unter „Meine Ziele“. Ein Fund benötigt einen Werktitel, einen expliziten
Werk-Starttag und eine Kategorie. Plattform, Katalog-ID, Werkjahr und separate
Relationsbelege sind keine Pflicht. Eine tatsächlich im Search-Toolresult
enthaltene HTTPS-Quelle genügt. Quellen bleiben intern nachvollziehbar;
News-Karten verlangen keine Links. Artikeldaten ersetzen niemals Startdaten.
Im Textpfad ist nur die exakte, tatsächlich zurückgegebene Search-URL Pflicht
im Beleg. Die Domain wird daraus abgeleitet, nicht aus einer zweiten
Modellangabe (etwa mit abweichendem `www`). Fehlender Quellentitel wird intern
durch die Domain ersetzt, fehlender Claim durch eine neutrale
Herkunftskennzeichnung, niemals durch ein erfundenes Quellenzitat.
Ungültiges optionales Publikationsdatum oder eine unbrauchbare optionale
Plattform wird weggelassen, ohne einen vollständigen Fund zu verwerfen.

Der TEXT-Prompt verlangt `evidence` ausdrücklich als nichtleere Liste von
Objekten mit `url`. Die eigene JSON-Normalisierung unterstützt außerdem ein
einzelnes Belegobjekt oder eine direkte HTTPS-URL als Kurzform und überführt
beides in dieselbe Liste. Keine Feldaliases; Listen enthalten weiterhin
Objekte. Auch eine Kurzform muss exakt in den tatsächlichen Search-Toolresults
stehen. Strukturierte Work-/Personen-/Titelgruppenpfade bleiben list-only.
Begrenzte `text-evidence-*`-Codes unterscheiden `missing`, `empty`,
`shape-invalid`, `item-shape-invalid`, `url-missing`, `url-invalid` und
`url-not-in-search`; `object-normalized`/`url-normalized` kennzeichnen die
beiden unterstützten Kurzformen. Die Codes enthalten keine Rohwerte.

## Suche und Kosten

Nur `kind=text` nutzt offene Domains: wenige komplementäre Discoveryanfragen,
englische Ergänzung bei dünnen Ergebnissen, danach gezielte Datumsnachsuche
nur für Funde ohne brauchbaren Termin, auch bei bisher reinem US-Datum.
Die Anfrage enthält die aktuelle serverseitige UTC-Zeit als `asOf`, damit
„kommend“ nicht relativ zum Modellwissensstand ausgelegt wird.
Vollständige Einzelquellen brauchen keine
Zusatzrunde. Kein Neuheitsfilter auf Artikel, kein erzwungenes AT-Suchwort.
AT wird beim Datum bevorzugt; US-only wird verworfen. `global` und
`unspecified` erzeugen ausdrücklich keine Österreich-Beschriftung.

Unverändertes Haiku-4.5-Modell, genau ein Messages-Request, maximal vier
Websearch-Toolaufrufe, maximal 2400 Ausgabetokens, maximal sechs Funde.
Vorabreservierung aus hinterlegten Preisen und konservativem Inputansatz,
höchstens 20 US-Cent Taskcap. Der unveränderte globale 500-Cent-Requestzaun
sowie Live-Lock, 1500-Cent-Laufzaun und Zeitlimits gelten weiterhin.
Keine automatischen Retries oder Fortsetzungsrequests.
Strukturierte Altpfade behalten ihre Domains, einen Toolaufruf,
1200 Ausgabetokens und den engeren 5-Cent-Adapter-/Persistenz-Kosteneingang.

## Speicherung und Berechtigungen

Additive Migration: `20260830140000_radar_text_findings.sql`.
`kd_radar_text_findings` ist kontogebunden und per FK an das eigene Abo
gebunden. Der Service-only-Upsert prüft Account, AI-Freigabe, Capabilities,
aktives Textabo und den unveränderten Suchwert erneut. Kein Fundwrite legt
Werkabos an. Der Check-Kontext erstellt oder reaktiviert ebenfalls keine Abos.
Browser-Create/Pause/Remove bleiben unverändert und kontingentiert.

Eigene Funde kommen über den bisherigen Feed; RLS verhindert Fremdlesen.
Pause verbirgt sie im Feed, Abo- oder Accountlöschung kaskadiert die Funde.
Der private Export enthält ausschließlich eigene Funde. Ungültige Kandidaten
oder einzelne Schreibfehler halten gültige Geschwister nicht auf.
Der gemeinsame bestehende Scheduler bleibt bei 144h; auch ein fehlgeschlagener
Versuch ist für dieses Ziel verbraucht, andere Ziele bleiben claimbar.

## Lokaler Beleg / Lieferung

- `node radar_freetext_contract_test.mjs`: generische Personen-, Franchise-,
  Staffel-/Specialfälle, offene Domains, mehrstufige Toolresults, Minimalfund,
  echte Quell-URL, Teilerfolg, Kostenreservierung und Vorabautorisierung.
- `node radar_text_findings_pg17_test.mjs`: isolierter PG17-Cluster mit echter
  Radar-Migrationskette, Write/Feed/RLS/Export/Delete sowie 144h/kein Retry.
- `node radar_websearch_package_b_test.mjs`: strukturierte Altpfade und der
  angepasste vorhandene Radar-Once-Runner ausschließlich mit Mocks.

Deployment benötigt nur die additive Migration und `radar-websearch-task`,
plus den Frontendbuild für Kategorie-/Regionsanzeige. Keine Scheduler- oder
JWT-Konfigänderung: `verify_jwt=false`, JWT intern validiert; Scheduler nur
mit passendem modernem Secret im `apikey`, ohne Authorization-Header.

Der echte Beleg bleibt ausschließlich hinter
`npm run test:ai:live -- --radar-websearch-once`. Ohne explizite Ziel-ID wählt
der Runner ein aktives eigenes Textziel aus dem authentifizierten Feed und
liest den Feed danach erneut. Mit `--owner-approved-server-budget` nutzt
dieser Modus die bereits vorhandene Owner-Credentiallane, sonst TestA.
Kein Konto-/Capability-Umbau, keine fremden KI-Proben, kein Batch.
Ein ehrlicher Leerfund ist kein unbekannter Kostenstand und kein belegter
nutzbarer Fund. Diese Dokumentation autorisiert keinen Remote-/Paid-Lauf.

Die Once-Ausgabe enthält nur begrenzte Warn-/Ablehnungscodes und Zahlen:
`normalizedCandidates` nach Parsernormalisierung, `acceptedCandidates` nach
Vertragsprüfung, und `usableFindings` als tatsächlich erneut im Feed
bestätigte Kandidaten. Der Abgleich nutzt Release-ID, Titel, Werkdatum und
Kategorie/Startart; Titel, URLs und Rohtexte werden nicht geloggt. Ein
unveränderter bestehender Fund kann somit bei `no_change` und null Writes
nutzbar sein. Die Metadatengrenzen sind lokal reproduzierte Robustheitsfehler,
keine nachträglich behauptete Live-Diagnose. Ein späterer Livebefund belegt
mit `evidence-list-dropped` die Verwerfung einer Nicht-Array-Belegform vor dem
Fachvalidator. Ob dies ein Objekt, String oder eine andere Form war, bleibt
ohne Rohantwort unbekannt. Der Einzelobjekt-Defekt wurde gezielt rot
reproduziert und zusammen mit der URL-Kurzform durch Adapter, Fachvertrag,
echten lokalen SQL-Upsert und Feedreadback geprüft.

Für diese Robustheitskorrektur ist nur ein erneutes Function-Deployment
erforderlich; Migration und Frontend aus `ebb9d33` bleiben unverändert.

Schmale Integrationsnaht im lokalen Kino-Test: Die vollständigen Linktupel
werden beim Verschieben in die Profil-Lane als Multiset verglichen. Damit
bleiben Text, Ziel, target, rel, Anzahl und Duplikate exakt geprüft, ohne eine
uhrzeitabhängige globale DOM-Reihenfolge vorauszusetzen. Kein Kino-Produktcode
und keine Uhrzeitmanipulation wurden dafür geändert.

## Explizite Erstsuche nach Speichern

Neue Freitexteingaben starten nach bestätigter eigener Server-Subscription
genau einen `checkNow(targetId, targetText, { initial: true })`. Doppelsubmit,
bereits aktiver Text, Gastmodus, fehlende Capability oder Speicherbestätigung
starten keinen Anbieter. Boot/Hydration synchronisieren weiterhin nur Daten.
Kontowechsel und Entfernen während des Auftrags verhindern eine verspätete
Übernahme. Der bestehende gefencete Pilot-Sync liest und persistiert den Feed;
Modellkandidaten werden niemals direkt als UI-Funde installiert. Leerfund oder
Suchfehler lassen das gespeicherte Ziel bestehen. Die Anzeige unterscheidet
Speichern, Suche, Leerfund und Fehler ohne Intervall-Techniktext.

Additive Migration `20260830150000_radar_initial_text_claim.sql` ergänzt nur
die service-role-only RPC `kd_radar_initial_claim`. Sie bindet den intern
validierten JWT-Account an das eigene aktive TEXT-Abo und prüft Capabilities,
Radar-/Providerflags und Providerfreigabe vor dem Claim. Ein höchstens
15 Minuten altes, noch unbearbeitetes Abo ist initial berechtigt. Wiederanlage
kann den vorhandenen Konto/Ziel/Tag-Zaun nicht umgehen. Subscription-Lock,
180-Sekunden-Lease, Reserve-/Write-Fencing und `kd_radar_daily_finish` sind
dieselben wie beim Scheduler; Abschluss und Lease-Expiry verschieben die
nächste Fälligkeit um exakt 144h. Historische RPCs und Migrationen bleiben
unverändert. Weder neue Queue noch Retry noch Browser-Scheduler.

Der Browser akzeptiert die bereits vorhandene TEXT-Antwort inklusive
`textResult`/`textDiagnostics`, maximal vier Suchtools und 20 Cent nur bei
exakter Text-/Zielbindung; Feed und aktive Textsubscription werden validiert.
Strukturierte Altpfade behalten 1/5-Grenzen. Auth-/Account-Fences gelten auch
nach dem asynchronen JSON-Read.

Zusätzliche lokale Belege: `node radar_initial_search_test.mjs` verwendet
den echten Controller, Browserdienst, Pilot-Sync und Function-Handler mit
ausschließlich synthetischen Mocks. Der normale Freitext-npm-Test umfasst
diesen Test. `radar_text_findings_pg17_test.mjs` prüft auch Initialclaim,
Auth-/Capability-Negatives vor Claim, echten Adapter/SQL/Feed-Roundtrip,
Tageszaun und Absturzabschluss. Schmale bestehende UI-/Controller-Tests wurden
an Erstsuche und kontogefencete Commits angepasst; keine Fremdproduktänderung.

Diese Etappe benötigt genau die neue Migration, den aktualisierten
`radar-websearch-task` und Frontendbuild. Keine Änderungen an Modell, Prompt,
Budget, Provideradapter, JWT-Konfiguration oder Schedulerworkflow. Die lokale
Mock-/PG-Abnahme ist kein bezahlter oder praktischer PWA-Livebeleg.
