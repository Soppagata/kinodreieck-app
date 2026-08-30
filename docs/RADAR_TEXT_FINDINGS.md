# Minimaler Freitext-Radarpfad

Freitext ist ein Suchwert, keine Werkidentität. Das providerfreie eigene Abo
bleibt unter „Meine Ziele“. Ein Fund benötigt einen Werktitel, einen expliziten
Werk-Starttag und eine Kategorie. Plattform, Katalog-ID, Werkjahr und separate
Relationsbelege sind keine Pflicht. Eine tatsächlich im Search-Toolresult
enthaltene HTTPS-Quelle genügt. Quellen bleiben intern nachvollziehbar;
News-Karten verlangen keine Links. Artikeldaten ersetzen niemals Startdaten.

## Suche und Kosten

Nur `kind=text` nutzt offene Domains: wenige komplementäre Discoveryanfragen,
englische Ergänzung bei dünnen Ergebnissen, danach gezielte Datumsnachsuche
nur für unvollständige Funde. Vollständige Einzelquellen brauchen keine
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
