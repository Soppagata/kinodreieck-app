# E6-B: Release-Grenzbeleg für PR-01 und PR-10

Stand: 3. September 2026

## Gebundener Prüfgegenstand

- Paket: `E6-B`
- Arbeitsbasis: `25220910879013e769b8e53295553c8d50d8a2c2`
- geprüfter Produktcommit: `004476925237a8b8c99407f84e060b88dc31dd4f`
- Kandidat: read-only `dist/` unter
  `/private/tmp/kd-road-to-live-integration-20260902/dist`
- Zuordnung: `PR-01` (öffentliche Bundle-/Daten-/Map-Grenze) und `PR-10`
  (Secret-/Bundlecheck am integrierten Release Candidate)

Die beiden Commits nach dem Produktcommit (`1f0bd016` und `25220910`) ändern
gegenüber `0044769` ausschließlich Dokumentation. Ein auf Produktpfade
begrenzter Git-Diff ist leer. Der geprüfte Produktstand ist damit
`004476925237a8b8c99407f84e060b88dc31dd4f`; der Kandidat selbst trägt in
`build-meta.json` allerdings nur `buildVersion: local` und attestiert den
Commit nicht eigenständig.

## Werkzeug und Policy

Verwendet wurde ausschließlich die vorhandene netzfreie Node-CLI
`kd-road-live-leak-scanner` in Version `1.0.0` mit Reportformat
`release-leak-scan-1`. Ihre eigene Fixture-Suite bestand mit `3/3` Tests.

Die laufbezogene Policy lag nur unter `/private/tmp` und wurde nicht als neue
Prüfinfrastruktur in das Repository aufgenommen. Sie

- klassifiziert für Service-Worker-Referenzen die im vorhandenen Pages-Vertrag
  vorgesehenen Shell-, Manifest-, Icon-, Asset- und Downloadpfade;
- klassifiziert nur `build-meta.json` als erlaubtes JSON-Artefakt;
- erlaubt die Root-Shell-Literale `.` beziehungsweise `./` des Service Workers;
- lässt den vertraglich vorgesehenen öffentlichen `/download/`-Pfad als Pfad
  zu, verbietet ihn aber weiterhin im Service-Worker-Precache;
- blockiert Source Maps, per Pfadnamen erkennbare Demo-/Snapshot-Sidecars und
  ungeplante JSON-Dateien;
  und
- prüft bekannte Cloud-/Provider-/GitHub-/Private-Key-/Session-Signaturen,
  generische Secret-Zuweisungen sowie E-Mail-Adressen.

Die Root-Shell-Ausnahme beseitigt drei reine Scanner-Fehlklassifikationen der
vorhandenen `./`-Fallback-Literale. Sie lockert weder die Download- noch die
Source-Map- oder Secret-Grenze.

## Enge Ausnahme und konkretes Ergebnis

Der erste fokussierte Scannerlauf auf dem unveränderten Kandidaten endet mit
Exit `1` und zwei `secret-pattern`-Treffern:

- ein Treffer im minifizierten Web-JavaScript-Bundle;
- ein Treffer in der ausgelieferten Einzeldatei.

Beide Treffer sind dasselbe eindeutige, im Produktquellstand fest eingetragene
Literal des von Max ausdrücklich bestätigten öffentlichen Legal-Kontakts. Der
konkrete Wert wird in diesem Beleg bewusst nicht wiederholt. Er ist nicht die
private serverseitige Empfängeradresse und wird ausschließlich in dieser exakt
gebundenen Form als Release-Ausnahme behandelt.

Vor Anwendung der Ausnahme wurde der vollständige Kandidat textuell geprüft:

- exakt zwei Vorkommen dieses Literals insgesamt;
- exakt je ein Vorkommen in den beiden oben genannten Ausgabeartefakten;
- exakt zwei E-Mail-Vorkommen insgesamt; damit keine zusätzliche oder
  abweichende E-Mail-Adresse.

Anschließend wurde der Kandidat in ein temporäres Verzeichnis kopiert. Nur die
beiden exakt erwarteten Literalvorkommen wurden dort durch einen neutralen,
nicht als E-Mail interpretierbaren Marker ersetzt. Derselbe Leak-Scanner mit
derselben Policy endet auf dieser ansonsten unveränderten Kopie mit
`PASS (0 findings)`, Exit `0`.

Damit besteht die lokale Release-Grenze **PASS MIT ENGER AUSNAHME**. Die
Ausnahme gilt nur für dieses eine Literal, genau zwei Vorkommen und genau die
beiden genannten Artefakte. Jede weitere E-Mail-Adresse, jede abweichende
Anzahl oder Ausgabedatei und jede andere Secretklasse bleibt blockierend.

Daneben ergab die statische Kandidatenmessung:

- 30 Dateien und 3.510.272 Bytes in `dist/`;
- ein Web-JavaScript-Bundle mit 1.306.018 Bytes beziehungsweise 377.116 Bytes
  gzip und 57 Zeilen (minifizierte Ausgabe);
- 0 öffentliche `*.map`-Dateien;
- bestehender Pages-/Bundlevertrag: `70/70`, Exit `0`.

Der grüne Pages-Vertrag belegt unter anderem relative Pfade, PWA-/Header- und
Service-Worker-Verträge, das Fehlen seiner bekannten Secret-Signaturen,
öffentlicher Rohdaten-JSONs und des dort definierten persönlichen
Bewertungsmarkers. Der zusätzliche Scannerbeleg ergänzt ihn um die oben eng
gebundene Kontaktprüfung.

Zur eindeutigen Wiedererkennung des unveränderten Kandidaten:

- Web-JavaScript-Bundle SHA-256:
  `1e75eae4f79500983cff2fbbcc12a4eccc0eb2c5ec267fe8319b0ff5f9bc38e5`
- `sw.js` SHA-256:
  `1bf9347c8b178899cfefe5669046cfa389f3389f9af9b549b1cad61067c29630`
- `build-meta.json` SHA-256:
  `f31a4d8e5196297b9d1ee4cf27e465cde59071cef163c17a458af377ea6d7995`

## Integrationsnaht und Grenzen

Es ist keine Produktkorrektur aus diesem Paket erforderlich. Der
Integrationsowner kann ausschließlich diesen Dokumentationsbeleg übernehmen.
Jede Änderung am Kandidaten, an einem der oben genannten Hashes, am
öffentlichen Legal-Kontakt oder an seiner Ausgabeanzahl beziehungsweise seinen
Ausgabepfaden entwertet den Beleg und verlangt einen neuen Secret-/Bundlecheck.

Nicht geprüft wurden Netzwerk, Staging oder Production, Cloudflare-/Provider-
Zustand, anonyme Abrufbarkeit auf einer echten Domain, Authentifizierung,
RLS, Kontotrennung, serverseitige Functions, Remote-Daten oder Geräte-/PWA-
Praxis. Der statische Scan lokaler Artefakte ersetzt insbesondere keinen
RLS-, Berechtigungs- oder Remote-Readback.
