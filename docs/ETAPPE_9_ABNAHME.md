# Etappe 9: Abnahmeprotokoll

Stand: 31. Juli 2026

Dieses Protokoll trennt fertige Belege von den Schritten, die reale Geräte,
Personen, Material oder eine ausdrückliche externe Freigabe brauchen. Ein
vorbereiteter Schritt gilt nicht als praktisch abgenommen.

## Versionierter Stand

- Arbeitszweig: `codex/etappe-9a-distribution`
- 9a Distribution: Commit `1fb608f`
- 9b/9c Betrieb und Beta-Paket: Commit `ef8d278`
- Free-Plan-Recovery: Commit `1986161`
- Supabase-Projekt: Produktion, EU-West
- Cloudflare-Projekt: bestehendes Pages-Projekt `kinodreieck`

## Erledigte Belege

| Bereich | Ergebnis | Beleg |
|---|---|---|
| Öffentliche Distribution | grün | Demo- und Leereinstieg, bestehende PWA-Installation, iOS-Hinweis und Einzeldatei-Download; 11/11 Distribution-Checks |
| Öffentlicher Demo-Katalog | grün gegen Produktion | anonym sichtbar sind genau `manifest`, `programm_demo` und `streaming_demo`; drei alte Programmfilme sowie fünf Streaming-Beispieltitel, ohne Bewertungen, Beschreibungen, Notizen oder Kontodaten |
| Datenschutz im Paket | grün | keine persönlichen Rohdaten, Sitzungswerte oder bekannte Secret-Signaturen im Build; 48/48 Pages-Checks |
| App-Backup/Restore | grün im vollständigen technischen Roundtrip | 63/63 Restore-Checks einschließlich Snapshot, Rückgängig, Konto-Treiber, Alt-Backup und Profil |
| Kontentrennung | grün gegen Produktion | 54/54 RLS-Negativtests mit zwei getrennten Testkonten |
| KI-Not-Aus | grün gegen Produktion | Schalter kurz deaktiviert; Auftrag serverseitig vor Log und Anbieter abgewiesen; im selben Lauf wieder freigegeben |
| Beta-Kostenlimit | aktiv | Tageslimit 10, Monatsdeckel unverändert 1000 US-Cent |
| Antwortlimit | aktiv | `intelligent-search` auf 4096 Ausgabetokens begrenzt |
| Function-Vertrag | grün | 276/276 kostenfreie Tests; kein echter Anbieteraufruf |
| Accountlöschung | grün gegen Produktion | technisches Wegwerfkonto samt persönlicher Testzeile angelegt, gelöscht und das Fehlen beider Ebenen direkt geprüft |
| GitHub-Produktion | gehärtet | Required Reviewer aktiv; ausschließlich `main` darf die Produktionsumgebung deployen |
| Supabase-Registrierung | geschlossen | neue Sign-ups aus; Confirm email für manuell angelegte Beta-Konten aus |
| Datenbank-Disaster-Recovery | grün im Free-Plan | Produktionsdump mit getrennten Rollen-, Schema- und Datendateien; vollständiger lokaler Restore in PostgreSQL 17, 16 Tabellen, 38 Funktionen, 17 Policies, zwei Konten und direkte RLS-Kontentrennung geprüft |
| GitHub-Release | grün | `codex/etappe-9a-distribution`, `staging` und `main` stehen auf `341d76b`; Staging-Workflow 71 und geschützter Produktionsworkflow 72 erfolgreich |
| Cloudflare-Release | grün | Staging-Deploy `d2ed4568`, Produktionsdeploy `0e277ed6`; feste Staging- und Produktionsdomain melden Build `341d76b` |
| Cloudflare-Rollback | grün gegen Produktion | Produktion von `341d76b` auf das geprüfte Ziel `db8199c` (`8aa0e505`) zurückgerollt, vollständiger Domain-Smoke grün, danach `341d76b` (`0e277ed6`) wiederhergestellt und erneut grün |
| Function-Version | unverändert grün | `ai-task` stammt aus Commit `c91c2b0`; Etappe 9 änderte die Function nicht, 276/276 kostenfreie Vertragschecks |
| Betriebsrunbook | grün | Not-Aus, Ausfälle, Rollback, Schlüsselrotation, Löschung sowie Rückweg und Beleg dokumentiert |
| Beta-Paket | fertig vorbereitet | Rollen, 11 Szenarien, Testerhinweis, Ergebnisbogen, Stopkriterien und Abschlussauswertung |
| Gesamtprüfung | grün | vollständiges `npm test`; 23/23 Etappe-9-Betriebschecks |

Für keinen dieser Belege wurde ein kostenpflichtiger KI-Aufruf ausgeführt.

## Weitere praktische Belege

### GitHub, Staging und Produktion

Der Etappe-9-Zweig und derselbe Stand auf `staging` wurden am 30. Juli zu
`Soppagata/kinodreieck-app` übertragen. Nach dem Demo-Nachweis wurden
Arbeitszweig, `staging` und `main` am 31. Juli auf Commit `341d76b` gebracht.

Der erste Staging-Workflow stoppte wie vorgesehen, weil die beiden
öffentlichen Demo-Zeilen zu diesem Zeitpunkt noch fehlten. Nach ausdrücklicher
Freigabe wurden am 31. Juli ein stark gekürzter Programm-Schnappschuss vom
15.–18. Juli und fünf Streaming-Beispieltitel veröffentlicht. Der vollständige
Smoke ist seither sowohl gegen das atomare Deployment als auch gegen
`staging.kinodreieck.at` grün.

Staging-Workflow 71 lief danach vollständig grün. Produktionsworkflow 72
bestand dieselben Tests, wartete auf den Required Reviewer und wurde erst nach
der sichtbaren Freigabe deployt. Der Produktions-Smoke bestätigte `341d76b`.

Anschließend wurde Cloudflare praktisch auf den zuvor geprüften Produktionsstand
`db8199c` (`8aa0e505`) zurückgerollt. Der vollständige Domain-Smoke bestätigte
den alten Commit, CSP, Sicherheitsheader und Demo-Katalog. Über denselben
Rollbackmechanismus wurde danach der Etappe-9-Deploy `0e277ed6` wieder
aktiviert; Produktions- und Staging-Domain bestätigten abschließend erneut
`341d76b`.

### Datenbank-Disaster-Recovery

Die Entscheidung ist am 30. Juli 2026 für **Supabase Free** gefallen.
Verantwortlich ist Max; der logische Dump wird wöchentlich sowie zusätzlich vor
Migration, Löschung und Produktionsrelease erzeugt. Das akzeptierte
Wiederherstellungsziel beträgt höchstens sieben Tage.

Für die erste praktische Probe wurde der von der Supabase CLI erzeugte
Dumpauftrag mit einem offiziellen PostgreSQL-17-Client ausgeführt. Damit war
kein Docker Desktop und kein kostenpflichtiges Supabase-Projekt nötig. Die
unveränderten Produktionsdumps wurden nur temporär außerhalb des Repositories
mit Modus 600 abgelegt:

| Datei | Größe | SHA-256 |
|---|---:|---|
| Rollen | 297 Byte | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| Schema | 125.261 Byte | `504c8391a4fc7ab2459952970bdfc2d49fcbbee8ff19d07bde4c6c45416408bd` |
| Daten | 4.547.402 Byte | `ac17cbed01647e1e1932129b51249b163f6cd355d7f0614891f46805ab91255a` |

Der Restore lief in einer lokalen, nur über einen Unix-Socket erreichbaren
Wegwerfdatenbank. Supabase-eigene Plattform-Grundbausteine wurden minimal
nachgebildet; das Kinodreieck-Schema und die Anwendungsdaten kamen unverändert
aus dem Dump. Geprüft wurden 16 Tabellen, 38 Funktionen, 17 Policies, zwei
Konten, null verwaiste Auth-Verweise, Tageslimit 10, Antwortlimit 4096 sowie
eigene sichtbare und fremde unsichtbare Kontodaten. Der bereits zuvor direkt
gegen Produktion gelaufene RLS-Vertrag blieb zusätzlich 54/54 grün.

Die temporären Dumps und die lokale Wegwerfdatenbank wurden nach Abschluss des
Nachweises gelöscht. Dauerhafte Wochensicherungen gehören in einen
verschlüsselten Speicherort außerhalb dieses Repositories.

## Noch nicht als praktisch abgenommen

### Reale Geräte und geschlossene Kohorte

Diese Nachweise können nicht synthetisch ersetzt werden:

- Android-Installation auf einem echten Gerät,
- iOS-Installation auf einem echten Gerät,
- ein freigegebenes Scanfoto und ein freigegebener Blogtext,
- ein bestehender privater Feedbackkanal,
- vier bis fünf konkret benannte Personen,
- deren ausgefüllte Szenarien und die gemeinsame Abschlussauswertung.

Bis diese Punkte vorliegen, ist das Beta-Paket fertig, die geschlossene Beta
selbst aber noch nicht gestartet oder abgenommen.
