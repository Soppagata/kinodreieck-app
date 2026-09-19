# Blog: Bauebenen und parallele Baumeister

Stand: 19.09.2026 · Status: Folgekorrektur in Produktcommit `3a55fea` integriert; 41 vollständige Nutzerwegprüfungen und Build grün. v3-Backend aktiv und per Datenbank sowie HTTP bestätigt. Frontend-Ziel ist `staging`; abschließende CI-/Domainbelege werden an den Liefercommit gebunden. Physische PWA-Abnahme offen.
Aktueller Folgeauftrag: Privates Speichern und Veröffentlichen trennen; bewusst unter dem angemeldeten Benutzernamen oder anonym veröffentlichen können; KI-Scan im Editor auffindbar machen. Die historischen Liefer-/Freigabegrenzen unten beschreiben ihre damaligen Aufträge; der aktuelle Nachweis steht am Dokumentende.
Freigabe: „Passt, merke dir deinen Plan und achte, dass kein baumeister falsch
abbiegt! Viel Spaß beim bauen!“ Autorisiert sind lokale Umsetzung, Mock-/lokale
Datenbanktests, Commits und Integration. Push, Deployment, gemeinsame
Backendmutation und zahlende Providerläufe sind nicht Teil dieses Bauauftrags.
Folgeauftrag vom 18.09.: „Kannst du das mal bitte auf STaging pushen, ohne das
prod davon betroffen ist?“ Damit sind Staging-Push, CI, Frontend-Deployment und
Readback autorisiert. Die frisch gelesenen GitHub-Environment-Variablen belegen
dieselbe Supabase-Instanz für Staging und Production. Die neue SQL-Migration
blieb bei dieser ersten Lieferung unappliziert; ihre Aktivierung würde das gemeinsame Backend
und damit Production betreffen. Privates Schreiben und die neue Oberfläche
konnten auf Staging geprüft werden; die neue Veröffentlichung blieb damals bis
zur Bereitstellung ihres Backendvertrags deaktiviert. Der nächste Folgeauftrag
autorisierte ausdrücklich den gemeinsamen veröffentlichten Blogbereich;
Umfang und Belege stehen unter „Folgekorrektur“ und „Ebene 3“. Anschließend
wurde auch die unveränderte Production-Übernahme ausdrücklich beauftragt und
abgeschlossen; ihr Beleg steht am Ende dieses Dokuments.

Maßgeblicher Registerstand ist dieses Dokument im Integrationsworktree
/private/tmp/kd-blog-integration-20260918, Zielbranch
codex/blog-integration-20260918. Die Kopie im Primärcheckout bleibt die
Planungsreferenz. Startcode nach frischem Fetch: origin/staging und origin/main
3725c33afaad58a711f94dffb511288f8237d31f. Die gemeinsame eingefrorene
Nicht-main-Basis B0 ist bcfe7c7021778463e226d8382495e39c01672383.

Produktvertrag: [Blogplan](BLOG_VEROEFFENTLICHUNG_OHNE_NAMEN_PLAN_2026-09-17.md).
Arbeitsablauf: [Kinodreieck-Etappen-Orchestrierung](/Users/max/.agents/skills/kinodreieck-etappen-orchestrierung/SKILL.md).
Dieses Dokument enthält das einzige Meilenstein- und Paketregister des Vorhabens.

## Nutzerweg und Gestaltungsgrenze

**Schreiben → Titelliste ordnen → privat speichern oder per Checkbox anonym
veröffentlichen → gemeinsam lesen → eigenes Mediathek-/Streaming-/Kinoziel öffnen.**

Die Referenzliste ist zentral, aber optisch zurückhaltend: Rang, Titel und
dezenter Quellenhinweis; keine Karten innerhalb von Karten, keine Poster und
keine permanenten Aktionsleisten. Maximal drei Referenzen in der Kartenvorschau,
vollständige Liste beim Lesen. Im Editor liegen Umordnen und Entfernen im
kleinen Zeilenmenü. Rotlinks bleiben sichtbar und direkt ergänzbar.

Der Backendabgleich erfolgt beim Veröffentlichen gegen vorhandene zentrale
Streaming-/Kinodaten. Der Leser bekommt vorbereitete Quellentags, filtert sie
nach seiner Auswahl und ergänzt seine persönliche Mediathek. Quellenpflege
läuft nach Katalogänderungen im Hintergrund; Öffnen startet keinen Vollabgleich.

## Baufolge

**FOUNDATION → PARALLEL_WAVE mit drei Baumeistern → Integration durch den Meister.**

| Ebene | Zuständigkeit | Fertiges Ergebnis |
|---|---|---|
| 0 · Grundlage F0 | Ein Baumeister, danach Integration | Gemeinsame Daten-/Aktionsverträge, Testbeispiele und eindeutige Ownership sind eingefroren. |
| 1A · Backend A | Parallel zu B und C | Anonyme Veröffentlichung, vorbereitete Quellenzuordnungen, schlanker Lesepfad und Hintergrundpflege. |
| 1B · Anwendung B | Parallel zu A und C | Zuverlässiges Speichern/Publizieren, Kontotrennung und persönliche Verweise samt Zielnavigation. |
| 1C · Oberfläche C | Parallel zu A und B | Einfacher Editor, Checkbox-Abschluss, kompakte Karten und Referenzlisten. |
| 2 · Integration | Meister | Die drei gelieferten Commits ergeben einen geprüften gemeinsamen Nutzerweg. |
| 3 · Auslieferung | Meister im später benannten Lieferumfang | Backend vor Client bereitgestellt und am Ziel zurückgelesen. |

Die kleine Grundlage ist nötig, weil Backendantwort, Publikationszustand und
UI-Aktionen dieselben Verträge verwenden. Ohne sie müssten die Baumeister
während des Baus aufeinander warten oder dieselben Dateien verändern.

## Ein Meilensteinregister

Alle Einträge sind Produktziele. GEBAUT setzt einen fokussiert belegten
Paketcommit voraus; DONE bindet das Ergebnis an den finalen Kandidaten und den
gemeinsamen lokalen Abschlusslauf. Ein Mockup allein erfüllt keines davon.

| ID | Nutzerergebnis | Pakete | Status | Kandidat / Beleg |
|---|---|---|---|---|
| M1 | Artikel und Ranglisten in einem einfachen Editor schreiben; kompakte Referenzen sicher umordnen. | B, C | DONE (Staging + Production) | 77c5603 (Code 4170dcb); Gesamttest 25/25, Chromium 34/34, vollständiger Abschlusslauf |
| M2 | Privat speichern und getrennt bewusst mit angemeldetem Benutzernamen oder anonym veröffentlichen, aktualisieren und zurückziehen; nur die gewählte Autorenanzeige teilen. | Solo-Folgekorrektur B | DONE im Integrationskandidaten; Backend aktiv | Produktcommit 3a55fea, 41 Nutzerwegprüfungen mit echter privater PG-Persistenz; fokussierte PG-, Client-, Chromium-/WebKit-Belege und Build grün. Lieferziel staging, CI-/Domainbeleg an finalen Commit gebunden. |
| M3 | Beim Lesen den passenden eigenen Mediathek-, Streaming- oder Kinotitel öffnen; fehlende Titel als Rotlink ergänzen. | A, B, C | DONE (Staging + Production) | 77c5603 (Code 4170dcb); Projektion 25/25 und echter SQL/Service/Client-Weg einschließlich Identitätskonflikt und Rotlink-Reload |
| M4 | Veröffentlicht zügig öffnen; Quellenwechsel und eigener Bestand personalisieren vorbereitete Verweise ohne Katalogvollabruf. | A, B, C | DONE (Staging + Production) | 77c5603 (Code 4170dcb); persönlicher Abgleich, bestätigter Leerbestand, keine Katalog-/Provideraufrufe im Gesamttest |
| M5 | Quellenziele bleiben nach Katalogänderungen aktuell; Fehler und abgelaufene Angebote erzeugen keine falschen Verfügbarkeiten. | A, B, C | DONE (Staging + Production) | 77c5603 (Code 4170dcb); Paket-Refresh 13/13, registriertes Schedulerkommando und natürlicher erfolgreicher Lauf nach Aktivierung |
| M6 | Bis zu 50 Referenzen sicher speichern und veröffentlichen; manipulierte oder zu häufige Aufrufe gefährden bestehende Blogs nicht. | R50, ein Baumeister durchgängig | DONE auf Staging | M6 in a3a0086; Migration, lokales Gate, CI und Domain-/Service-Worker-Readback bestätigt; Production-Frontend bleibt 77c5603 |
| M7 | Erwähnte Filme, Serien, Musik und Sonstiges optional erkennen lassen; Textfunde und Werke bewusst auswählen, atomar übernehmen und regulär speichern/veröffentlichen. | A Backend, B Editor/Client, C Settings/DS; Solo-Folgekorrektur B | INTEGRIERT; Staging-Nachweis im Lieferbeleg | Auswahlhinweise und Streaming-/Kinoabgleich als 233ad55 und 8a3eacc integriert. Gesamtcheck über reguläre CI; finaler Commit und Domainstand unter `/private/tmp/kd-blog-selection-release-20260919/`. Physische PWA-Abnahme bleibt bei Max. |

## Ebene 0: gemeinsame Grundlage F0

F0 prüft vor dem Bau den dann aktuellen Code, die lokalen Schema-/Testwege
und die tatsächlich vorhandenen Navigationsziele. Die gelesene Referenz
origin/main 3725c33 vom 18.09. ist Orientierung, kein künftiger Startbefehl.
Der ältere, veränderte Primärcheckout bleibt unangetastet. Es entsteht ein
isolierter codex-Branch; der integrierte F0-Commit wird die exakte gemeinsame
Nicht-main-Basis B0 der Parallelwelle.

F0 liefert einen kleinen, versionierten Vertrag mit neutralen Testdaten:

| Grenze | Vor der Welle festzulegen |
|---|---|
| Backend ↔ Service | Publish/Update/Withdraw, Eigentümer-Readback bei unsicherem Ausgang, paginierte Liste, Claim-Kompatibilität und Vertragserkennung für ältere Server. |
| Referenzdaten | Stabile Zeilen-/Werkidentität, Rangfolge, bestätigte Streaming-/Kinoziele, Quellenrevision/Gültigkeit; getrennte Zustände für Treffer, kein Treffer, Mehrdeutigkeit und ungeprüft. Keine privaten Verfasser-IDs. |
| Anwendung ↔ UI | Speichern mit explizitem Anonym-Flag, Rücknahme, Löschen, gezielte Wiederholung, Referenzentscheidung und Zielnavigation; Promise-Ergebnisse für privaten und öffentlichen Teilerfolg. |
| Anzeigezustand | Privat / Veröffentlicht / Änderungen privat, laufend / Fehler, leserspezifische Referenzprojektion, kontoabhängiger Entwurf und Abowahl. |

Geplante gemeinsame Dateien: `src/lib/blogContract.js`,
`tests/fixtures/blog-contract-v1.json` und `docs/contracts/blog-v1.md`.
F0 legt nötige schmale Props-/Adapteranschlüsse fest; keine neue allgemeine
Frameworkschicht, kein kompletter Blogumbau. Existierende Schutzregeln für
bestätigte Writes, Artikelstatus und Rotlink-Heilung bleiben erhalten.

Die Beispieldaten decken eine nummerierte Star-Wars-Liste mit Mediathek-,
Streaming-, Kino- und Rotlinkziel sowie zwei Konten mit verschiedener
Quellenwahl ab. Ergänzt werden Namensdoublette, ungeprüfte Quelle und
abgelaufener Kinotermin. Reale Kontodaten sind dafür nicht nötig.

F0 beendet die Vertragsarbeit mit einem Commit. Danach sind gemeinsame
Exporte, Props, RPC-Signaturen, Fixtures, Dependencies und Testkonfigurationen
für die Welle read-only. Das Interface darf vollständig gegen diese Fixtures
gebaut werden; kein Paket benötigt den Arbeitsstand eines anderen Pakets.

## Ebene 1: exklusive Paketflächen

Die Pfade sind die geplante Ownership. F0 bestätigt bzw. präzisiert sie am
aktuellen Stand vor dem Dispatch. Während der Welle sind zusätzliche Dateien
erst nach gezielter Neuzuordnung durch den Meister schreibbar.

### A · Backend und vorbereitete Quellen

**Ergebnis:** Ein aktives Konto kann eine anonyme Projektion veröffentlichen.
Der Server ordnet Referenzen den vorhandenen Streaming-/Kinodaten zu; Lesen
liefert schon aufbereitete, begrenzte Daten. Globale Tags hängen nicht von den
Abos des Verfassers ab. Private Originale und Kontorechte bleiben geschützt.

**Write-Ownership:** neue additive Migrationen
`supabase/migrations/*_blog_publication_*.sql`, nötige Schemaabbilder
`supabase/current_schema.sql` und `supabase/katalog_schema.sql`,
neue `blog_backend_pg_test.mjs`, `blog_reference_refresh_pg_test.mjs` und
`tools/blog-publication-pg-harness.mjs` als wiederverwendbare lokale Testumgebung
für Pakettests und den späteren Gesamttest des Meisters.
Bestehende Streaming- oder Shared-Migrationen werden nicht rückwirkend editiert.

**Lieferumfang:** serverseitige Anonymisierung in Write/List/Claim,
bestätigte Werk-/Quellenzuordnung, konfliktgeschützte Veröffentlichung,
Eigentümer-Readback, paginierte Leseprojektion, Wiederverwendung gleicher Werke,
Invalidierung bei Quellenänderung, begrenzte Nachbearbeitung bestehender Blogs
und Wiederaufnahme nur fehlgeschlagener Teilmengen. Diese Datenpflege ändert
keinen Artikeltext und stellt keine zurückgezogene Veröffentlichung wieder her.

**Fokussierte Belege:** lokale PostgreSQL-Prüfung mit zwei Konten sowie
abgemeldeter/inaktiver Rolle; manipulierte Payloads; eindeutige/mehrdeutige
Zuordnung; Warm-/Kalt-Lesepfad ohne Provider; Quellenwechsel, Ablauf und
Teilfehler. Kein Migrationswrite gegen ein gemeinsames Backend.

### B · Anwendung, Zustand und persönliche Verweise

**Ergebnis:** Speichern bestätigt erst die private Fassung und publiziert nur
auf ausdrücklichen Wunsch. Private Änderungen, öffentliche Kopie, Fehler und
Rücknahme sind zuverlässig getrennt. Jeder Leser erreicht seine eigenen Ziele.

**Write-Ownership:** `src/App.jsx`, `src/controllers/useArticleController.js`,
neue `src/controllers/useBlogPublicationController.js`,
`src/services/sharedArticles.js`, `src/lib/sharedPublication.js`,
`src/lib/artikel.js`, `src/lib/libraryProjection.js`,
neue `src/lib/blogReferenceProjection.js`;
`article_transaction_test.mjs`, `sharedarticles_test.mjs`, `blog_test.mjs`
und neue `blog_reference_projection_test.mjs`. Der frühere Kandidat
review49_p03_blog_execution_test.mjs gehört zur separaten Profilanalyse und
ist keine neue Schreibfläche oder Pflichtprüfung dieses Pakets.

**Lieferumfang:** Vertrag aus F0 im Service umsetzen; bestehende persistierte
Publikationslogik ergänzen, nicht ersetzen; konto- und fassungsgebundene
Operationen/Entwürfe, Readback vor Wiederholung bei unsicherem Ausgang,
eigener Mediathekindex, reiner Streaming-Quellenfilter und gültige Kinoziele.
Die Navigationscallbacks öffnen echte Ziele ohne vorausgesetzten Vollkatalog
im Browser. Bestätigtes Rotlink-Ergänzen, Must-Watch und Rückverweise bleiben.
App-Anbindung ist vollständig B's Verantwortung, kein nachträglicher
Implementierungsauftrag an den Meister.

**Fokussierte Belege:** die genannten bestehenden Tests, ergänzt um
Speichern mit/ohne Checkboxabsicht, Teilerfolg, verspätete Antworten,
Kontowechsel, Reload, zwei Quellenwahlen, stabile Reihenfolge, direkte
Zielnavigation und fehlende/abgelaufene Daten. Serviceantworten und UI-Grenze
werden aus dem eingefrorenen Vertrag simuliert; A und C müssen nicht fertig sein.

### C · Editor, Karten und kompakte Referenzlisten

**Ergebnis:** Ein Editor ersetzt die verschachtelten Freigabe-/Vorschauschritte.
Checkbox und Speicheraktion sind eindeutig. Die Referenzliste bleibt sichtbar,
kompakt und auch bei fremden veröffentlichten Artikeln bedienbar.

**Write-Ownership:** `src/tabs/BlogTab.jsx`, neue `src/components/blog/**`,
neue lokal begrenzte `src/styles/blog.css`,
`private_release_blog_surface_test.mjs` und neue `blog_compact_ui_test.mjs`.
Keine Änderungen an App, Controllern, Service, globalen Designvariablen oder
den Film-/Medienformularen außerhalb des Blogbereichs.

**Lieferumfang:** kompakte Karte mit maximal drei Referenzen, gemeinsamer
Leser, ein Editor, Inline-Klärung von Referenzen, kleines Zeilenmenü,
gezielte Ergänzungsansicht mit Rückkehr, Checkbox standardmäßig aus,
passende Speichertexte und nachvollziehbare Teilerfolge. Text, Reihenfolge
und Checkbox bleiben im offenen Entwurf erhalten. Autorenfeld und separate
Freigabe verschwinden; Anonymität darf nicht nur optisch vorgetäuscht werden.
Die UI konsumiert ausschließlich die F0-Props und den injizierten Service;
sie implementiert keine zweite Publikations- oder Matchinglogik.

**Fokussierte Belege:** bestehender Blog-Oberflächentest mit aktualisiertem
Vertrag und gezielte Browserchecks bei 320/393/736 px, hell/dunkel,
langen Titeln, Nummerierung, Tastatur und Touch. Lesen/Navigation,
Umordnen/Entfernen, Rotlink-Rückkehr, Checkbox und private/public Teilerfolge
werden mit den gemeinsamen Antwortbeispielen geprüft. Keine separate
vollständige Produktsuite pro Baumeister.

## Parallelmatrix und gemeinsame Basis

| Paar | Entscheidung nach F0 | Warum unabhängig |
|---|---|---|
| A × B | PARALLEL_OK | A besitzt SQL/Schema, B Service/Anwendung; RPC-Vertrag und Antwortbeispiele sind eingefroren. |
| A × C | PARALLEL_OK | C arbeitet mit neutralen Beispielen und injizierten Aktionen; keine Datenbankschreibfläche. |
| B × C | PARALLEL_OK | B besitzt App/State/Projektion, C Blog-UI/CSS; Props und Serviceoberfläche sind fest. |

Die Freigabe zum tatsächlichen Dispatch setzt den belegten F0-Commit B0 voraus.
Die drei PARALLEL_OK-Pakete starten dann zusammen, jeweils in eigenem Worktree.
Es gibt keine Abhängigkeit von einem Ergebnis derselben Welle und keine
gegenseitigen Cherry-picks. Ein später nötig werdender Vertragswechsel hält
nur die betroffenen Pakete an und wird über den Meister geklärt.

| Paket | Geplanter Branch | Geplanter Worktree | Status / Commit |
|---|---|---|---|
| F0 | codex/blog-foundation-20260918 | /private/tmp/kd-blog-foundation-20260918 | INTEGRATED / 0574426 + 93411b7 + 74ecad4, 27 Vertragstests grün |
| A | codex/blog-backend-20260918 | /private/tmp/kd-blog-backend-20260918 | INTEGRATED / 5369a03 + 4b5caef + 0ad7d89, PG 38/38 + 12/12 |
| B | codex/blog-client-20260918, Folge codex/blog-client-identity-20260918 | /private/tmp/kd-blog-client-20260918, Folge /private/tmp/kd-blog-client-identity-20260918 | INTEGRATED / 23e430c + f6144c8 + 6aeb732 + 105c0d2, Transaktionen 60/60, Projektion 25/25, Service 47/47, Blog 27/27 |
| C | codex/blog-ui-20260918, Folge codex/blog-ui-regression-20260918 | /private/tmp/kd-blog-ui-20260918, Folge /private/tmp/kd-blog-ui-regression-20260918 | INTEGRATED / 3b1c787 + 873f7cb + 642328c + 513ce6f + 63084a1, UI 4/4 + Chromium 34/34, Bestandsregressionen 266 + Designvertrag |

Gemeinsamer Zielbranch: `codex/blog-integration-20260918`.
Meister-Worktree: `/private/tmp/kd-blog-integration-20260918`.
Meister- und Paket-Worktrees sind aus demselben B0 angelegt. Alle drei Pakete
sind ohne gegenseitiges Warten gestartet. Alle drei Lieferungen sind in der
Reihenfolge A → B → C konfliktfrei integriert. Nach den unten dokumentierten
Integrationsdeltas ist der geprüfte Produkt-/Testkandidat
`5d706e3e30072c98e5a2935fbf25670a9bb4f535`; die abschließende Dokumentation
ist ein eigener, nachfolgender Commit ohne weitere Produktänderung.
A: /root/blog_foundation, gpt-5.6-sol/high wegen Auth/RLS/Migration/Privacy.
B: /root/blog_client, gpt-5.6-sol/high wegen kontogebundener Shared-State-Grenze.
C: /root/blog_ui, gpt-5.6-sol/medium. Keine Bauchats.

C-Erstlieferung a66c886f82834d0747da57cdac97d2aee24a56fc liegt in der
vereinbarten Ownership. Fokussiert belegt: Oberfläche 4/4, Chromium 21/21
bei 320/393/736 px hell/dunkel. Delta zurück an C: sekundäre Ziele bedienbar,
Leser ohne Sortiermenüs, explizite Nummerierung, eindeutiger privater
Speichertext bei bestehender Publikation, direkte Karten-Rotlinks und
ehrliche Titelsuche in den geladenen Karten. Keine Änderung der RPC-Verträge.
Delta 314be77 schließt die funktionalen UI-Nähte und bestätigt 30/30
Chromiumprüfungen. Sichtkontrolle führte zu einem letzten engen Delta:
Quellenlinks bei genügend Platz in derselben Zeile, lesbare Quellennamen
und stärkerer Kontrast im hellen Modus.
552710f4c3f9a59b61d123aec8c1206c2880e5a6 schließt das visuelle Delta;
32/32 Chromiumchecks und gelieferte 320-/736-px-Screenshots belegen die
kompakte Inlinezeile, Umbruch, Kontrast und Touchziele. C ist integriert.
Die abschließende Eingabenaht 9da32c70b5868f99cf725c8db34f2e1b5f067eec
ergänzt Jahr und Typ am einzigen Hinzufügen-Feld, damit Serien und sichere
Jahreszuordnungen über denselben bestehenden Vertrag erfasst werden können.
Chromium 34/34 belegt Serie/Jahr sowie ungültige Jahre und schmale Darstellung.

B-Erstlieferung 10bf9fafe17e25a4bb026238c172f27815b3aa53 liegt vollständig
in der Ownership; fokussiert grün: Transaktionen 35/35, Service 45/45,
Projektion 13/13, Blog 27/27. Die Zusammensteckprüfung verlangt ein Delta
für öffentliche/neue Rotlinks und Rückkehr, Editorprojektion und Status,
vollständige Kartendaten, sichere persönliche Werkzuordnung, laufende
Operationen und Account-Epochen, bestätigte Löschung nach unklarem Publish
sowie Listeninvalidierung und Entwurfserhalt. Gemeinsame Verträge bleiben fest.

fc70a368527473873cab5749ed8cb3873df5df2a schließt diese B-Nähte; beide
B-Lieferungen sind als 23e430c und f6144c8 integriert. Der anschließende
Gesamtweg ist grün. Zwei konkrete Anschlussfehler bleiben als enges Delta:
bestätigt leere Mediathek im App-Boot und Verwechslung gleichnamiger Werke
mit unterschiedlichen starken IDs zwischen SQL-Projektion und Leserindex.
F0/A erhält exklusiv die kleine additive Erweiterung um backendverifizierte
neutrale Identitäten. B korrigiert zunächst unabhängig den Leerbestand und
verwendet die neuen Identitäten erst nach Integration der Vertragsbasis.

Das Leerbestand-Delta 4734a3a ist als 6aeb732 integriert; bestätigtes Fehlen
und fehlgeschlagener Read sind getrennt, Transaktionen 60/60.
F0-Vertragsdelta 3ddaab6 und A-Delta fd41afa sind als 74ecad4 / 0ad7d89
integriert (Vertrag 27/27, Backend 38/38, Refresh 12/12). Der Server liefert
nur am bestätigten Werk verifizierte `resolution.identityHints`; der
Listenabruf bleibt resolverfrei. Für B liegt ein isolierter Folgeworktree
`/private/tmp/kd-blog-client-identity-20260918` auf exakter Basis
`0ad7d8921c60411faa234e7d2150c7d4edc1d08e` bereit; Owner bleibt derselbe
B-Baumeister. Nur Serviceparser, persönliche Projektion und deren Tests
sind für dieses abhängige Delta schreibbar.

B-Identitätsdelta 1d653e423369cd522b8636cb6f80911c475455b8 ist als
105c0d2 integriert.
Der Parser akzeptiert und prüft das optionale Feld strikt, gemeinsame starke
IDs schlagen Titel-/Jahrzuordnung; widersprüchliche IDs und mehrdeutige
Treffer werden nicht verknüpft. Der Medientyp trennt insbesondere gleiche
TMDB-Zahlen bei Film und Serie. Projektion 25/25, Service 47/47, Transaktionen
60/60 sowie die reale SQL/Service/Client-Gegenprobe sind grün. Der Meister
hat dieselbe negative und zwei positive Identitätsproben im dauerhaften
Gesamttest ergänzt. Der Gesamttest besteht nun 25 Prüfungen; auch ein
intern abgefangener unerlaubter Katalog-/Provideraufruf würde fehlschlagen.
Alle Produktpakete sind damit integriert.

Im gemeinsamen Abschlusslauf wurden zwei überholte Layoutbehauptungen und
die alte direkte Einbindung von ArtikelMaske/App-Callback-Grenzen gefunden.
Der Meister aktualisierte die schmale Layoutnaht in acf4f68. C erhielt für
die Bestandsregressionen den isolierten Folgeworktree auf genau diesem Commit.
Lieferung b95d7ba ist als 63084a1 integriert: review49_p04_personal 88,
async_persistence_ui 72, controllers 97, cleanup_d2 9 und design_secondary
grün. Die Tests prüfen den echten neuen Editor-/Controllerweg. Karten nutzen
weiter den gemeinsamen Datumsformatter, Checkboxen den bestehenden
Touchvertrag. Der Meister ergänzt ausschließlich die passende Hilfecopy und
die Testregistrierung; keine weitere Produktlogik.

A-Erstlieferung 0c3a28eb63de6dda642ecdc7e8d3245ff4946ffd liegt in der
Ownership; lokale PG17-Tests 27/27 und 12/12 bestanden. Delta zurück an A:
Leserechte strikt auf aktive Konten statt anon, tatsächlicher automatischer
Hintergrundanschluss der Quellenpflege und faire begrenzte Fortschritts-/Retry-
Auswahl über mehr als einen Batch. Bisherige Tests hatten den anonymen
Lesepfad irrtümlich erlaubt; diese Vertragsabweichung ist noch zu schließen.
Delta 73cfae4cd22ddc45afa082639050be3dc9363f15 schließt diese Lücken und
ergänzt getrennte ID-Kandidaten, bestätigte fehlende Jahreswerte und den
Ausschluss abgelaufener Kinotermine. PG17: 36 Backend- und 12 Refreshchecks
grün, einschließlich >Batchlimit, Teilfehler/Retry und registriertem
Schedulerpfad. Ownership bestätigt, sequenziell integriert als 5369a03 und
4b5caef. Die Migration bindet kd-blog-reference-refresh-v1 an den vorhandenen
pg_cron-Vertrag; die lokale Harness kann exakt dessen Jobkommando ausführen.

DISPATCH F0: Agent /root/blog_foundation, gpt-5.6-sol/high wegen des tragenden
Privacy-/RPC-/Shared-State-Vertrags; exakte Startbasis
feba4ae1d26a3c1f9b084b5b50488758a48ca663. Exklusiv: blogContract.js,
blog-contract-v1.json, blog-v1.md und blog_contract_test.mjs. Keine Bauchats.

F0-Delta vor Freeze: öffentliche Kinoziele ohne private Mediathek-ID,
vollständiger Owner-Readback nach Reload, kontrollierter UI-/Ergänzungsweg,
ablaufende negative Quellenbelege und neutrale starke Identitätshinweise.
Die vier Dateien beider Lieferungen liegen innerhalb der Ownership. Delta
777edb337559334d9eba90b996b31855cda61d31 schließt die genannten Nähte;
26/26 fokussierte Vertragsprüfungen und diff --check sind grün. Der Vertrag
unter docs/contracts/blog-v1.md ist für die Parallelwelle eingefroren.

Kollisionsprüfung für die Welle: Gemeinsame Vertragsdateien/Fixtures sind
read-only; Pakettests haben verschiedene Owner; SQL/Schema ausschließlich A;
App/privater Zustand ausschließlich B; Blog-CSS ausschließlich C.
Package-Dateien, Lockfile, globale Styles, generierte Builds und CI-Konfiguration
bleiben während der Welle unverändert. Keine neuen Dependencies vorgesehen.
Falls nötig, gehört die abschließende Registrierung der gelieferten Tests im
bestehenden Testlauf ausschließlich dem Meister als kleine Integrationsnaht.

## Ebene 2: zusammensetzen und kontrollieren

1. Der Meister nimmt je Paket genau den DELIVERED-Beleg entgegen:
   Paket-ID, Basis B0, Commit, tatsächliche Dateien, fokussierte Tests,
   verbleibende Integrationsnaht. Keine laufenden Kontrollagenten oder
   wiederholten Paket-Audits.
2. Integration im eigenen Worktree in der Reihenfolge **A → B → C**.
   Verträge, Migrationsreihenfolge und Imports werden zusammengeführt.
   Die Featurelogik ist bereits in den Paketen fertig. Größere Korrekturen
   gehen als kurzer Delta-Auftrag an den zuständigen Baumeister zurück.
3. Ein gemeinsamer lokaler Abschlusslauf prüft den vollständigen Nutzerweg,
   die vollständige Mocksuite, Build und finalen Diff. Der Meister besitzt
   dafür den neuen Blog-Gesamttest `blog_full_flow_integration_test.mjs` und
   die Zuordnung der Meilensteine zum Kandidaten. Bestehende Buildanteile im
   Testlauf werden nicht doppelt ausgeführt.

Der Gesamttest verwendet die echten gelieferten Anwendungs-/SQL-Grenzen mit
lokalen Konten und kontrollierten Katalogdaten: ranglistenbasiert schreiben,
ohne Checkbox privat speichern, mit Checkbox veröffentlichen, als Konto B
mit anderer Quellenwahl lesen, Ziele öffnen, einen Rotlink ergänzen, privat
weiterbearbeiten, öffentlich aktualisieren und zurückziehen. Ein simulierter
Quellenwechsel prüft die Hintergrundpflege. Gemessen wird außerdem, dass
Öffnen keine Quellenresolver, Providerrequests oder Katalogvollabrufe auslöst.
Die kompakte Darstellung und der Rückweg nach Ergänzung werden mobil geprüft.

Der Abschlusslauf ist kein erneuter Start aller Paketprüfungen. Unveränderte
Paketbelege bleiben gültig; ein konkreter Integrationsfehler wird gezielt
korrigiert und am finalen Kandidaten abgeschlossen.

### Erreichter lokaler Abschluss

Kandidat: `5d706e3e30072c98e5a2935fbf25670a9bb4f535` auf
`codex/blog-integration-20260918`.

- `npm test`: Exit 0, einschließlich 25 Blog-Gesamtprüfungen mit echter
  UI/Controller/Service-Grenze und lokalem PostgreSQL, vollständiger Mocksuite,
  Single-File-Build, Web-Build und 72/72 Pages-Build-Prüfungen.
- `npm run test:blog:browser`: Exit 0, 34/34 Chromium-Prüfungen bei
  320/393/736 px, hell/dunkel. Die finalen Ansichten wurden zusätzlich gesichtet.
- `npm run test:function`: Exit 0, 349/349 gemockte Funktionstests.
  Funktionsquellen, Test und Lockfile sind seit diesem Lauf bytegleich.
- Backend-Paketbelege: 38/38 lokale PG17-Prüfungen, Quellenpflege 12/12;
  die tatsächliche neue SQL-Projektion und das registrierte Refreshkommando
  werden zusätzlich im gemeinsamen Gesamttest ausgeführt.
- Gesamtdiff gegen Startbasis ohne Whitespacefehler; keine neuen Dependencies.

Die bestehenden UI-Testanschlüsse wurden auf den neuen Editor umgestellt.
Ein nach erfolgreichen Assertions offen bleibender React-Testprozess wurde
im Test-Bootstrap korrigiert und die zu diesem Auftrag gehörenden alten
Testprozesse beendet. Der vollständige Abschlusslauf beendet sich mit Exit 0.

Lokale Logs: `/private/tmp/kd-blog-npm-test.log`,
`/private/tmp/kd-blog-browser-test.log`, `/private/tmp/kd-blog-function-test.log`.
Ansichten: `/private/tmp/kd-blog-ui-320-dark.png` und
`/private/tmp/kd-blog-reader-736-light.png`.

Damit sind M1–M5 lokal abgeschlossen und committed. Die praktische Abnahme
auf einem physischen iPhone sowie der externe Backend-Release sind weiter
**nicht belegt**. Die neue Migration setzt den bestehenden `pg_cron`-Vertrag
voraus; dessen echte Registrierung und Ausführung werden erst beim
Backend-Release am Ziel zurückgelesen.

### Staging-Lieferung vom 18.09.2026

Der Folgeauftrag autorisiert ausschließlich Staging ohne Auswirkung auf
Production. Geprüft und ohne Force nach `origin/staging` gepusht wurde
`622ce62b28722805f55ee7f5306f77350e8f3815` (Produktstand `5d706e3`, danach nur
Abschlussdokumentation). `main` blieb auf
`3725c33afaad58a711f94dffb511288f8237d31f`.

- [CI-Lauf 35312813373](https://github.com/Soppagata/kinodreieck-app/actions/runs/35312813373):
  erfolgreich; Testsuite, 349 Funktionstests, 50 Chromium- und 50 WebKit-Tests,
  Gesamtschranke und Staging-Deployment grün. Production-Deploy übersprungen.
- [Staging](https://staging.kinodreieck.at) meldet den Kandidaten `622ce62`
  mit `appEnvironment=staging`; der Service Worker ist an denselben Build
  gebunden. Die automatische Staging-Domainprüfung ist ebenfalls grün.
- Production meldet unverändert `3725c33` mit `appEnvironment=production`.
  Build-Metadaten sind inhaltsgleich und der Service Worker bytegleich mit
  dem vor dem Push gesicherten Stand. Kein Production-Push/-Deploy.
- Die GitHub-Environment-Variablen belegen dieselbe Supabase-Instanz für beide
  Umgebungen. Deshalb wurde `20260918120000_blog_publication_v1.sql` nicht
  ausgeführt; ebenso keine Functions, Scheduler oder gemeinsamen Daten geändert.
  Die neue Oberfläche und privates Schreiben sind auf Staging verfügbar.
  Die neue anonyme Veröffentlichung und ihre Quellenaufbereitung sind dort
  noch nicht aktiviert; bei fehlendem Backendvertrag bleibt die Checkbox
  deaktiviert und privates Speichern möglich.
- Lokaler Liefernachweis: `/private/tmp/kd-blog-staging-release-20260918/`
  mit Environment-Grenze, CI-Status/-Logs und öffentlichem Vorher-/Nachher-
  Readback. Keine Zugangsdaten im Nachweis. Diese nachträgliche Protokollierung
  ist ein lokaler Dokumentationscommit und startet keinen weiteren Deploy.

### Folgekorrektur: Veröffentlicht-Tab und Aktivierungsgrenze

Der Nutzer meldet am 18.09. den stummen Veröffentlicht-Tab und die deaktivierte
Anonym-Checkbox. Die Checkbox entspricht dem noch fehlenden Backendvertrag.
Der Tab hatte zusätzlich einen Clientfehler: Die Ansicht wechselte erst nach
erfolgreichem Listenabruf, sodass fehlende Capability oder Netzwerkfehler den
Klick ohne sichtbare Rückmeldung ließen. B-Delta `3df480d` auf Basis `9534ac9`
öffnet den Bereich sofort, zeigt Lade-/Fehlerzustände und lässt eine späte
Antwort keine neue Navigation erzwingen. Fokussiert grün: 65 Transaktions-
und 34 Chromiumprüfungen. Die Capability wird nicht umgangen.

Frischer lesender Backendbeleg vom 18.09., 06:30 UTC:
`/private/tmp/kd-blog-staging-activation-20260918/backend-before.json`.
Der Migrationsledger endet weiterhin bei `20260917130000`; die neuen Blog-RPCs
fehlen. Die bestehende Shared-Tabelle, deren RLS/Rechte und Legacy-RPCs bleiben
unverändert. Entgegen der lokalen Harness-Annahme ist im echten Backend
`cron.schedule(text,text,text)` nicht eingerichtet. Die volle neue Migration
würde außerdem Legacy-RPCs ersetzen und direkte Rechte auf der bisherigen
Shared-Tabelle entziehen, also Production betreffen.

Die zunächst vorgeschlagene Staging-Isolation entfällt nach ausdrücklicher
Klarstellung des Nutzers: „Stagig und prod dürfen sich den gleichen
Veröffentlicht-Bereich teilen. ich werde auch auf Staging später Blogs
schreiben, die auf prod sichtbar werden sollen“. Autorisiert ist damit die
gemeinsame Blog-Aktivierung einschließlich nötiger Blog-Migration,
Quellenpflege, Sicherung und Readback. Der neue Editor bleibt im
Staging-Frontend; `main` und der Production-Frontendbuild bleiben unverändert.

A-Folgedelta im isolierten Worktree
`/private/tmp/kd-blog-shared-activation-build-20260918`, Basis `c8b4c7e`:
die fehlende Cron-Voraussetzung deklarieren und den tatsächlichen alten
Production-Lese-/Claim-/Owner-Löschweg kompatibel halten. Direkte unsichere
Publikationswrites dürfen die neue serverseitige Anonymisierung nicht umgehen.
Keine getrennten Blogtabellen/-Feeds und kein separater Plattformaufbau.
Der Meister besitzt die anschließende gemeinsame Backend-Aktivierung und
Staging-Auslieferung. Der Tab-Fix einschließlich vollständiger lokaler
Mocksuite und Build ist bereits grün (Exit 0).
A ist als `5cb050b` integriert (Paketcommit `86038ec`): Backend 42/42,
Quellenpflege 13/13, minimale Legacy-Owner-Löschrechte, beide anonymisierten
Leseverträge und deklarative Cron-Voraussetzung. Die Tabellen waren im
gezielten Backup leer; Definitionen/Rechte und der 94-zeilige Migrationsledger
sind lokal geschützt gesichert und wieder eingelesen.

## Ebene 3: gemeinsame Backend-Aktivierung und Staging-Korrektur

Autorisiert sind die beiden Blog-Migrationen in Reihenfolge
`20260918115900_blog_publication_pg_cron.sql` und
`20260918120000_blog_publication_v1.sql`, ihr gezielter Readback sowie die
Staging-Auslieferung des Tab-Fixes. Die Aktivierung wird gegen den gesicherten
Vorher-Stand transaktional ausgeführt. Ein synthetischer Zwei-Konten-Test
mit echtem Katalogabgleich, gemeinsamem v1-/Legacy-Lesen, Owner-Löschung und
Rollennegativen wird vollständig zurückgerollt. Keine Testblogs bleiben
öffentlich stehen. Der Einstieg bleibt bei unbekanntem Backendvertrag geschlossen.
Kein Baumeister der Parallelwelle schreibt in ein gemeinsames Backend oder
startet einen Providerlauf. Lokale Umsetzung, Tests, Commits und Integration
brauchen bei erteiltem Bauauftrag keine Zwischenfreigaben.

Gebaut, getestet, committed, gepusht, CI-grün, deployed und praktisch auf der
PWA abgenommen werden beim Abschluss getrennt berichtet. Das Register bindet
nur tatsächlich erreichte Lieferstände.

### Aktivierung und reales Katalogdelta

Die beiden Migrationen wurden auf Kandidat `4314060` nach grünem vollständigem
lokalem Abschlusslauf zusammen atomar angewandt. Der Readback bestätigt die
exakten Quelldateien im nun 96-zeiligen Ledger, `pg_cron` 1.6.4, sechs neue
Client-RPCs, den begrenzten Fünf-Minuten-Job sowie positive und negative Rechte.
Der Nutzerauftrag zum gemeinsamen Blogbereich deckt diese Wirkung ab;
Production-Frontend und `main` blieben unberührt.

Die anschließende synthetische Gegenprobe zeigte einen echten Skalierungsfehler:
`kd_blog_catalog_works()` überschreitet schon für eine begrenzte Auswahl das
Zeitlimit. Ein isolierter lesender Aufruf mit acht Sekunden Zeitgrenze bestätigt
SQLSTATE 57014. Der reale Bestand umfasst 24.678 Basis- und 1.115 MotN-Zeilen;
die kleinen lokalen Fixtures hatten diese Skalierung nicht abgedeckt.
Readback nach dem Abbruch: keine laufende Testquery und keine Testpublikationen.

A erhält daher das enge additive Delta
`20260918130000_blog_catalog_setwise.sql` im Worktree
`/private/tmp/kd-blog-catalog-performance-20260918`, Basis `4314060`.
Bereits angewandte Migrationen bleiben unverändert. Gefordert sind unveränderte
Identitäts-/Quellenverträge, eine Abfrage ohne quadratische Einzelscans und ein
lokaler 25.000-Zeilen-Nachweis einschließlich Veröffentlichung und Quellenpflege.
Der Meister wiederholt anschließend gezielt die reale Gegenprobe und schließt
die Staging-Auslieferung am korrigierten Kandidaten ab.

Das additive Delta ist als `4191987` integriert (Paketcommit `a89bdc3`). Die
Katalogprojektion aggregiert die Werke gemeinsam und verwendet innerhalb eines
RPCs einen privaten temporären Snapshot, der mit Transaktionsende entfällt.
Der Paketbeleg umfasst 42 Backend-, 13 Refresh- und neun Skalierungsprüfungen
mit 24.678 Basis- und 1.115 MotN-Zeilen. Eine Veröffentlichung mit 15 Referenzen
dauerte lokal 1,07 Sekunden. Der Skalierungstest ist jetzt Teil von `npm test`
und damit auch der bestehenden CI. Der zehnsekündige Clientabbruch bleibt
unverändert. Die reale Gegenprobe und Staging-Auslieferung stehen noch aus.

Der vollständige lokale Abschlusslauf einschließlich Build ist mit Exit 0
abgeschlossen (`npm-test-catalog-final.log` im oben genannten Belegordner).
Auch das für den echten Backendtest vorbereitete Rollback-Skript wurde lokal
mit 15 Referenzen geprüft: anonyme v1- und Legacy-Ausgabe, zweites Konto,
Owner-Löschung, Rollensperren und privat bleibender Snapshot sind belegt;
der Veröffentlichungsteil dauerte 1,05 Sekunden.

Der reale Readback der additiven Migration `20260918130000` ist auf Kandidat
`1a1575f` bestätigt: Ledger 97, exakte Funktionsquellen und Browserrechte.
Die echte 15-Referenzen-Veröffentlichung löst alle Titel auf, überschreitet
aber den tatsächlichen Acht-Sekunden-Serverdeckel. Der Test wurde vollständig
zurückgerollt; es bestehen weder Testpublikationen noch laufende Testqueries.
Der lokale Skalierungsbeleg allein reicht deshalb nicht zur Auslieferung.

Gezielte reale Profilierung: 25.304 aggregierte Werke, kalter Snapshot
7.070 ms, warmer Funktionslookup 53 ms, direkter Indexlookup 0,3 ms. Mit nur
transaktionslokal deaktiviertem JIT sinkt der Aufbau auf 5.342 ms. Es wurden
keine globalen Datenbankeinstellungen geändert. A erhält auf Basis `1a1575f`
das additive Delta `20260918133000_blog_catalog_lookup.sql` für den kalten
Aufbau und tatsächliche Indexnutzung. Referenz-, Quellen- und Rollenverträge,
bereits angewandte Migrationen und das Clientzeitlimit bleiben erhalten.

Das Lookup-Delta ist als `4170dcb` integriert (Paketcommit `816e13b`). Es
berechnet Quellenkürzel je unterschiedlicher Bezeichnung nur einmal, begrenzt
JIT/Sortieraufwand funktionslokal und nutzt für Einzelreferenzen direkt die
Snapshot-Indizes. Die Paketprüfungen sind grün: 42 Backend-, 13 Refresh- und
elf Skalierungschecks. Die erweiterte Fixture bildet 25.304 Werke, 11.181
Streamingziele und ein Werk mit 128 Quellenzielen ab. Veröffentlichung von
15 Referenzen: lokal 426 ms bei aktivem Acht-Sekunden-Statement-Limit.
Die neue additive Migration wird erst nach dem integrierten Abschlusslauf
aktiviert; der reale Gegenbeleg bleibt bis dahin offen.

### Abschlussbeleg der Backendkorrektur

Codekandidat `4170dcb71955279aa6ae07472df95a57ccb1cc31`: vollständiger lokaler
Abschlusslauf einschließlich Build grün, Exit 0; integrierter Blog-Nutzerweg
25/25, Skalierung 11/11, Pages-Build 72/72. Der Beleg liegt unter
`/private/tmp/kd-blog-staging-activation-20260918/npm-test-lookup-final.log`.
M1–M5 sind damit auch am Korrekturkandidaten lokal DONE; Ziel der anschließenden
Client-Auslieferung ist ausschließlich `staging`.

Die additive Migration `20260918133000` wurde anschließend atomar aktiviert.
Lesender Nachweis: 98 Ledgerzeilen, alle vier Blog-Migrationsquellen exakt,
32 Blog-Funktionskörper/Volatilitäten und die erwarteten Rollenrechte korrekt.
Neue interne Helfer sind auch für `service_role` direkt gesperrt. JIT und
Sortierbudget gelten nur innerhalb der Katalogfunktion.

Realer Zwei-Konten-Test vom 18.09., 07:34 UTC: 15 von 15 Referenzen korrekt
zugeordnet, Veröffentlichung einschließlich kaltem Snapshot in 4.424 ms;
der reale Serverdeckel bleibt acht Sekunden. Anonyme v1- und Legacy-Leseausgabe,
Claim, idempotente Wiederholung, Owner-Löschung, Fremdkonten-/Gast-/Inaktivsperre
und privater Snapshot sind geprüft. Die gesamte Transaktion wurde verworfen;
Nachlese bestätigt null Testkonten, Testpublikationen und Testoperationen.
Belege: `backend-lookup-postflight.json` und `live-blog-smoke.json` im selben
Belegordner. Zahlende Anbieterrequests: null.

Noch offen sind Staging-Push, CI, Deployment und Domain-/Service-Worker-Readback.
`main` und der Production-Frontendbuild werden für diese Korrektur nicht
ausgeliefert. Die gemeinsame Blog-Backendwirkung ist ausdrücklich autorisiert.


### Ausgeliefert: Staging-Korrektur 77c5603

Der Liefercommit `77c5603876b4823df37582914acaed00ddf97f8b` wurde force-frei
auf `staging` gepusht und dort zurückgelesen. CI-Lauf
[35320186013](https://github.com/Soppagata/kinodreieck-app/actions/runs/35320186013)
ist erfolgreich: vollständige Testsuite, 349 Function-Mocks, 50 Chromium-
und 50 WebKit-Tests; `deploy-staging` erfolgreich, `deploy-production`
ausdrücklich übersprungen. Keine neue Produktänderung folgte dem lokalen
Abschlusslauf auf Codekandidat `4170dcb`.

Cloudflare-Deployment `9a673925`: HTTPS-, Login-, Header- und Build-/SW-Smokes
sind sowohl auf der Deployment-URL als auch `https://staging.kinodreieck.at`
grün. Eigener Domain-Readback vom 18.09., 07:45 UTC bestätigt Build `77c5603`
und den dazugehörigen Service Worker. Production liefert weiterhin exakt
Build `3725c33` und dieselben Service-Worker-Bytes wie vor diesem Auftrag;
`main` blieb auf `3725c33afaad58a711f94dffb511288f8237d31f`.

Die reale Hintergrundpflege ist nach der letzten Migration ebenfalls belegt:
planmäßiger Lauf um 07:35 UTC erfolgreich. Beide Umgebungen teilen den
veröffentlichten Blogbestand wie ausdrücklich gewünscht. Der Veröffentlicht-Tab
reagiert auf Staging sofort, und die Anonym-Checkbox erhält jetzt die echte
Backend-Capability. Nutzer müssen die Staging-App auf die neue Version laden.
Praktische Abnahme auf Max' physischem iPhone/PWA: NICHT BELEGT.

Die kompakte maschinenlesbare Lieferquittung liegt unter
`/private/tmp/kd-blog-staging-activation-20260918/release-final.json`.
Dieser abschließende Dokumentationsbeleg entsteht nach dem Deployment lokal;
der verifizierte Staging-Liefercommit bleibt `77c5603`.

### Production-Übernahme desselben Stands

Folgeauftrag vom 18.09.: „Passt so, übernehmen wir genau so auf prod! Achte
darauf, dass alle funktionen auch funktionieren und für alle nutzer freigegeben
sind“. Autorisiert sind die unveränderte Übernahme des geprüften Staging-
Commits auf `main`, Production-CI/Deployment und Readback. Neue Blog-Migrationen
oder Produktänderungen sind dafür nicht nötig.

Frischer Readback vor dem Push: gemeinsames Backend weiterhin exakt passend
zu allen vier Blog-Migrationen und 32 Funktionsdefinitionen; Rollenrechte und
Quellenpflege aktiv. Der Blog-Einstieg und die Capability hängen ausschließlich
an einem aktiven Konto, ohne Staging-/Owner-/KI-Beschränkung. Eine rein lesende
Prüfung der Capability für sämtliche aktiven Konten bestätigt 18/18 Zugriffe,
darunter 17/17 normale Mitglieder. Keine Kontofreigaben wurden verändert.

Commit `77c5603876b4823df37582914acaed00ddf97f8b` wurde force-frei auf `main`
gepusht; Remote-Readback bestätigt exakt denselben Commit auf `main` und
`staging`. Der Primärcheckout bleibt unverändert. CI-Lauf
[35321910408](https://github.com/Soppagata/kinodreieck-app/actions/runs/35321910408)
ist erfolgreich: vollständige Testsuite mit PostgreSQL 17, 349 Function-Mocks
und 50 Chromium-Tests. WebKit: 48 unmittelbar bestanden, zwei allgemeine
Classix-/Showa-Navigationstests bestanden beim automatischen Retry; keine
endgültig fehlgeschlagenen Tests. Diese Flakes betreffen keinen Blogtest und
werden nicht als 50 unmittelbar grüne Prüfungen ausgegeben.

Die reguläre GitHub-Production-Freigabe wurde auf Grundlage des ausdrücklichen
Nutzerauftrags erteilt. `deploy-production` ist erfolgreich, `deploy-staging`
wurde in diesem Main-Lauf übersprungen. Cloudflare-Deployment
`f69c9e96.kinodreieck.pages.dev`: HTTPS-, Login-, Header- und Build-/SW-Smokes
auf Deployment-URL und `https://kinodreieck.at` bestanden. Eigener Readback
vom 18.09., 08:13 UTC bestätigt auf beiden Domains exakt Build `77c5603` mit
passendem Service Worker und korrekter Umgebungskennung. Die Staging-Build-
und Service-Worker-Bytes sind gegenüber dem Vorherstand unverändert.

Alle aktiven Konten erhalten denselben Blogvertrag, ohne Owner-, Staging- oder
KI-Freigabegate. Die erneut belegte Capability gilt für 18/18 aktive Konten,
darunter 17/17 normale Mitglieder; die Prüfung war rein lesend. Der bestehende
reale Zwei-Konten-/15-Referenzen-Nachweis gilt für den unveränderten gemeinsamen
Backendstand. Für diese Production-Übernahme wurden keine Migrationen erneut
angewandt und keine zahlenden Anbieterrequests gestartet.

Die praktische Abnahme auf einem physischen iPhone als Production-PWA bleibt
NICHT BELEGT. Der Lieferstand ist technisch ausgeliefert und zurückgelesen.
Belege für diesen Abschnitt liegen unter
`/private/tmp/kd-blog-production-20260918`, die kompakte Quittung in
`release-final.json`. Dieser Dokumentationsabschluss wird nur lokal committed;
beide ausgelieferten Branches bleiben auf dem geprüften Commit `77c5603`.

### Geplante Erweiterung: 50 Referenzen und freiwillige KI-Extraktion

Nutzerpräzisierung vom 18.09.: normalerweise höchstens 30 Referenzen, 50 sollen
möglich sein. Gewünscht ist Schutz gegen manipulierte Listen mit etwa 1.945
Einträgen sowie eine optionale Sonnet-Extraktion erwähnter Titel aus dem
Blogtext mit anschließender Mehrfachauswahl. Der anschließende Nutzerauftrag
autorisiert den lokalen Bau der 50er-Grenze, verlangt aber für die KI-Funktion
zunächst die gründliche Planung einschließlich DS-Texten und Settings.
Kein neues Deployment und kein zahlender Anbieterrequest in diesem Folgeauftrag.

Die vorher untersuchte Auslegung für 500 bis 1.000 Referenzen wird für diesen
Umfang zurückgestellt. Der isolierte Versuch auf Produktcode `77c5603` zeigte
lokal 100 Referenzen in 445 ms und 1.000 in 1.047 ms, beweist aber keine
Production-/iPhone-Latenz. Messbeleg:
`/private/tmp/kd-blog-ref-scale-spike-20260918.json`.

**M6: begrenzter, serverseitig abgesicherter Ausbau.**

- 50 als harte fachliche Obergrenze pro Artikel; 30 ist ein Normalfall und
  keine zusätzliche Sperre. Gemäß jüngster Nutzerpräzisierung kein dauerhafter
  Zähler oder Limittext. Ein kontextbezogener Hinweis erscheint beim Speichern/
  Hinzufügen der 50. Referenz; ein weiterer Versuch erklärt die erreichte Grenze.
- Alle Schreibpfade beachten denselben Vertrag: privat, Veröffentlichen,
  Aktualisieren, Import/Wiederherstellung, KI-Übernahme und direkte API-Writes.
  Entscheidend sind Backend-/Datenbankprüfungen; ein entfernter Browser-Check
  darf keine Wirkung haben. Öffentliche Referenzen bleiben auch über Rang-
  und Eindeutigkeitsbedingungen auf 50 begrenzt.
- Mengen-, Feldlängen- und Byteprüfungen erfolgen vor Katalogabgleich und
  anderen teuren Schritten. Übergrößen werden vollständig abgewiesen, nicht
  still auf 50 gekürzt. Bestehende Daten bleiben unverändert. Als noch zu
  prüfender Startwert für einen Publikationsrequest sind 128 KiB vorgesehen;
  vorgelagerte Body-Grenzen müssen auch ohne vertrauenswürdigen Content-Length-
  Header greifen. Ein SQL-Check allein verhindert kein beliebig großes
  Einlesen am HTTP-Eingang.
- Atomare Aufrufbegrenzung pro Konto und ein gemeinsamer Parallelitätsdeckel
  schützen auch gegen viele jeweils gültige Listen. Vorschlag: höchstens ein
  laufender Publikationsabgleich pro Konto, fünf neue Veröffentlichungs- oder
  Aktualisierungsversuche pro Minute. Globale Kapazität im Bau am vorhandenen
  Backend binden; Überlast schnell ablehnen statt unbegrenzt in Locks warten.
  Identische Vorgangs-IDs liefern den vorhandenen Ausgang zurück. Schutz gilt
  ebenso bei direktem RPC-Aufruf; eine reine Browser- oder IP-Sperre genügt nicht.
- Der private Sammelspeicher `kd:artikel` hat laut Schema weiterhin 1 MiB.
  Diese Grenze bleibt zunächst bestehen; die vollständige serialisierte
  Fassung einschließlich Publikationsmetadaten wird vor jedem Schreibschritt
  geprüft. Eine Überschreitung wird erklärt und erhält den Entwurf und den
  letzten bestätigten Stand. Viele lange Blogs können diese Grenze weiterhin
  erreichen; artikelweiser Speicher ist dafür eine spätere gezielte Erweiterung.
- Karten behalten drei Vorschautitel. Für 50 Referenzen zunächst keine neue
  Hintergrund-Publikationsmaschine oder virtuelle Endlosliste. Fokussiert
  prüfen: voller Feed mit 20 Blogs zu je 50 Referenzen, schwächeres Mobilgerät,
  persönliche Mediathek und Quellen mit vielen Zielen. Werden die bestehenden
  Zeit-/Nutzbarkeitsgrenzen überschritten, nur den betroffenen Pfad verkleinern.
- Die Capability prüft momentan exakt `maxReferences=15`. Deshalb einen
  kompatiblen Übergang vorsehen; ältere PWAs dürfen größere private Listen
  weder beim Öffnen noch beim Speichern/Import auf 15 abschneiden. Kein
  rückwirkliches Editieren bereits angewandter Migrationen.

**R50-Ownership und Übergabe.** SOLO-Baumeister `/root/blog_ref50`, Sol/high
wegen direkter API-, Datenbank- und Kontogrenzen. Basis
`664413e4ffe0d396b49379ffc3d598d38fa9e654`, Worktree
`/private/tmp/kd-blog-ref50-20260918`, Branch `codex/blog-ref50-20260918`.
Paket umfasst den Mengenvertrag, Editor/Controller/Storage, private und
öffentliche Schreibwege, additive SQL-Migration, Schema-/Testanbindung und
`docs/contracts/blog-v1.md`. Kein KI-, Settings- oder DS-Produktcode.
Meister bleibt auf diesen Produktflächen währenddessen lesend und besitzt
dieses Register sowie den KI-Entwurf. Der SOLO-Baumeister führt den einen
angemessenen lokalen Abschlusslauf aus; grüne Läufe werden bei unveränderter
Integration nicht nochmals vollständig wiederholt. Kein Push, Deployment,
gemeinsamer Backendwrite oder zahlender Providerrequest im Paket.

**Integrationsbefund nach erster R50-Lieferung.** Paketcommit
`5bb18b190061687b3eeb0270a732042ab490c364` besteht den vollständigen lokalen
Abschlusslauf. Vor Integration wurde dennoch eine konkrete Vertragsnaht
lokal reproduziert: `kd_publish_blog_v1` nahm einen v2-Request mit 50 Referenzen
an und lieferte `published`, `contractVersion=blog-publication-v1`, 50
Referenzergebnisse und null neue Aufrufzähler. Der gemeinsam erweiterte
Validator allein bindet die alten öffentlichen Endpunkte nicht an v1.
Ein Delta-Restauftrag bindet deshalb jede RPC an ihre Vertragsversion und
führt die Mengen-/Rate-/Parallelitätsgrenzen über beide öffentlichen
Publikationswege. Außerdem erhält der private `kd:artikel`-Topf die noch
fehlende serverseitige 50er-Prüfung für Liste und Schattenfeld; bisher
begrenzte die Datenbank dort nur die Gesamtbytes. Es werden nur die
betroffenen Prüfungen wiederholt, kein pauschaler zweiter Gesamtlauf.
Dieses Delta wurde vor dem M6-Abschluss integriert; sein Beleg folgt unten.

Die zusätzliche vorgelagerte HTTP-Body-Grenze ist getrennt vom SQL-Deckel zu
prüfen und am realen Eingang nachzuweisen. Ein im Hosting tatsächlich
konfigurierbarer Eingangszaun ist hier noch nicht belegt; keine freie
Supabase-Einstellmöglichkeit unterstellen. `PGRST_DB_MAX_ROWS` begrenzt laut
[PostgREST-Konfiguration](https://postgrest.org/en/stable/references/configuration.html#db-max-rows)
die gelesenen Ergebniszeilen und ersetzt diesen Nachweis nicht.

**R50-Abschluss, lokal.** Der finale Produktkandidat ist `4521984` auf
`codex/blog-integration-20260918`. Integriert wurden `5bb18b1` als `ddd7e5e`
und die Schutzkorrektur `9323312` als `9d298f7`. Die kleine Integrationsnaht
`4521984` prüft den Publikationsvertrag eines v1-Updates erst unter dem
gemeinsamen Account-Lock. So kann ein inzwischen abgeschlossenes v2-Update
keinen veralteten Vorabentscheid und eine Kürzung seiner längeren Liste
hinterlassen. Keine andere Produktfläche wurde bei der Integration geändert.

Geliefert: 50 Referenzen ohne dauerhaften Zähler; situativer Hinweis an der
50. Zeile; vollständige private und öffentliche Listen; bytebegrenzter
Privatspeicher einschließlich ausstehender Publikationsdaten; direkte private
Schreibgrenze für Liste und Schattenfeld; strikt getrennte v1/v2-Aufrufe mit
gemeinsamer 128-KiB-, Rate- und Parallelitätsgrenze. Vorhandene Artikel werden
durch die neue Migration weder gescannt noch gekürzt. Altclients behalten
ihren v1/15-Vertrag; sie sehen v2-Publikationen erst nach einem App-Update.
Die privaten Schattenreferenzen schützen längere Listen bei alten Saves.

Der SOLO-Baumeister meldet auf `5bb18b1` den einen vollständigen grünen Lauf
`npm run test:blog-ref50:final`: `npm test`, 349/349 Function-Mocktests, Build
und Diff-Prüfung. Ausgabe war in seiner Task-PTY, kein persistierter Logpfad.
Seine fokussierten Belege umfassen zusätzlich 36 Browser-/Mobile-, 27 Vertrags-,
25 Projektions-, 11 Import-, 65 Artikeltransaktions-, 48 Shared-Service- und
11 Katalogskalierungsprüfungen. Das Delta änderte SQL, Harness, Tests und
Vertragsdokumentation; Anwendung und Build blieben unverändert.

Nach der letzten Integrationsnaht hat der Meister nur die betroffenen Wege
nochmals geprüft: R50/Abuse 39, bestehendes v1-Backend 42 und echter
UI-/Controller-/Service-/PostgreSQL-Zwei-Konten-Weg 25, alle grün. Der
synthetische lokale 20×50-Fall benötigte dabei 529 ms; keine Aussage über
Production-Hardware oder ein physisches iPhone. Persistierter Beleg:
`/private/tmp/kd-blog-ref50-integration-20260918.log`. Diff-Prüfung grün.

Kein neuer Push, kein Deployment und keine Anwendung von
`20260918140000_blog_reference_limit_v2.sql` im gemeinsamen Backend.
Staging und Production bleiben auf dem zuvor ausgelieferten Blogstand.
Beim späteren Rollout zuerst den additiven Backendvertrag, danach die Clients
bereitstellen und den tatsächlichen Eingangsschutz gesondert nachweisen.
M7 bleibt der reine [KI-/Settings-/DS-Entwurf](BLOG_REFERENZEN_KI_PLAN_2026-09-18.md);
kein entsprechender Produktcode und keine Live-KI-Tests.

**M7: Titelvorschläge mit Sonnet, bewusste Übernahme durch den Nutzer.**

Der [ausgearbeitete KI-Plan](BLOG_REFERENZEN_KI_PLAN_2026-09-18.md) konkretisiert
und ergänzt diese Skizze: neue standardmäßig ausgeschaltete Geräteoption
`blogReferenzen`, genauer Textfluss und DS-Entwürfe, reale Codeanschlüsse,
kompatible Health-Verhandlung, kurze direkte Textbelege statt ungeprüfter
Wiederverwendung der Geschmacksanker, Modell-/Kostenvergleich und Prüffälle.
Die Preise wurden am 18.09. offiziell neu geprüft: Sonnet 5 $2/$10, Haiku 4.5
$1/$5 pro Million Eingabe-/Ausgabetokens. Sonnet zunächst ohne Thinking;
keine automatische Websuche oder zweistufige Haiku-/Sonnet-Kaskade.
Die folgenden Absätze bleiben die kurze Produktübersicht; bei Detailfragen
gilt der konkrete Entwurf. Die Funktion ist weiterhin nur geplant.

Nutzerweg: Im Speicherbereich optional „Titel im Text erkennen (KI)“ anklicken
→ Hinweis, dass Titel und Artikeltext an Anthropic gehen → kompakte Vorschau
mit Checkboxen, gefundenem Titel und zugehöriger Textfundstelle → „Ausgewählte
übernehmen“ → regulär privat speichern oder bewusst anonym veröffentlichen.
Keine neue Pflichtstufe. Keine Titel sind anfangs ausgewählt. Vorhandene
Referenzen zählen mit: bei 30 bestehenden sind höchstens 20 neue auswählbar.
Eine volle Liste startet keinen bezahlten Auftrag, solange kein Platz frei ist.

- Neuer eigener Task `blog-reference-extract` auf dem bestehenden `ai-task`-
  Unterbau, serverseitig verbindlich Sonnet/`gross`. `blog-profile-extract`
  bleibt unverändert: dieser bestehende Task analysiert Geschmack und nutzt
  ein anderes Modell. Nicht als Ersatz für die neue Funktion umdeuten.
  KI-Capability/Health versioniert ergänzen: alte Clients prüfen dessen
  Schlüsselmengen exakt; ein unkoordiniert ergänztes Feld darf bestehende
  Profilanalyse oder Veröffentlichung nicht deaktivieren.
- Sonnet übernimmt die Interpretation des Freitexts. Code übernimmt
  Belegprüfung, konservative Dublettenerkennung, Mengen-/Rechteprüfung und
  Werkverknüpfung. Der bestehende Streaming-/Kinoabgleich bleibt beim
  Veröffentlichen; die KI ermittelt keine Verfügbarkeit und erfindet keine IDs.
- Nur Artikelüberschrift und Text an den Anbieter, keine Konto-ID, E-Mail,
  private Mediathek oder sonstigen Profilbestände. API-Key bleibt im Backend.
  Expliziter Einzelklick; kein Auftrag bei jedem Speichern oder Tastendruck.
  Kontospezifische KI-Freigabe und bestehende Budget-/Not-Aus-Regeln gelten;
  normale Blogfunktionen bleiben unabhängig davon verfügbar.
- Begrenzt strukturiertes Ergebnis, maximal 50 Titelvorschläge. Jeder Vorschlag
  benötigt eine serverseitig überprüfbare Fundstelle im unveränderten Text.
  Jahr nur bei belegter Nennung, unklare Werktitel/Seriennamen als unklar
  kennzeichnen; „Star Wars“ darf keine erfundene Liste sämtlicher Episoden
  auslösen. Ein im Text kritisierter Titel darf ebenfalls vorgeschlagen werden.
- Artikelinhalt ist untrusted Datenmaterial. Kein Websearch, keine Werkzeuge,
  keine Schreibrechte und keine vom Modell festgelegten Links. Format, Anzahl,
  Längen, Fundstellen und Felder werden nach der Modellantwort geprüft. Ein
  strukturierter JSON-Output allein beweist weder korrekte Titel noch sichere
  Mengen. Überlange, unbelegte oder fehlerhafte Ergebnisse werden nicht blind
  übernommen; keine HTML-Ausführung aus Artikel oder Antwort.
- Vorschlag für den ersten Eingabevertrag: höchstens 18.000 UTF-8-Bytes Text
  wie beim bestehenden Blog-KI-Pfad und dessen begrenzter Request-Umschlag;
  längere Artikel bleiben normal speicherbar, die Analyse erklärt ihr Limit.
  Eigene feste Ausgabe-, Zeit- und Kostenobergrenzen vor Anbieterstart
  serverseitig prüfen und atomar im vorhandenen Budget reservieren. Konkrete
  Token-/Centwerte beim Vertragsbau anhand des vollständigen Prompts festlegen;
  der alte Haiku-Deckel darf nicht ungeprüft für Sonnet übernommen werden.
- Pro Konto nur eine laufende Extraktion; als Betriebsstart drei Starts pro
  Minute und zehn pro Tag vorschlagen, zusätzlich zu den bestehenden globalen
  KI-Budgets. Kontogebundener Text-/Modell-/Promptversionsschlüssel verhindert
  bezahlte Doppelläufe für denselben unveränderten Text. Cache auch für einen
  bestätigten Leerfund, zeitlich begrenzt; keine Blogtexte in Betriebslogs.
  Unsicherer Ausgang löst keinen automatischen neuen Anbieterrequest aus.
- Vorschläge bleiben an Konto, Entwurf und Textfassung gebunden. Ändert sich
  der Text oder das Konto während des Aufrufs, darf die alte Antwort keine
  neue Liste überschreiben. Übernahme ergänzt ausschließlich die ausgewählten
  fehlenden Referenzen, erhält vorhandene Reihenfolge und überprüft unmittelbar
  vor dem Schreiben erneut die 50er-Grenze. Dubletten/Remakes nicht nur anhand
  des Titels zusammenlegen; unklare Zuordnung dem Nutzer überlassen.
- Keine Treffer, Abbruch, KI aus, Budget erschöpft oder Anbieterfehler lassen
  Text, bestehende Referenzen und normales Speichern nutzbar. Die Anonym-
  Checkbox wird durch die Extraktion weder gesetzt noch ausgelöst.

**Nachweise und Baufolge.** Erst M6 samt kompatiblem Übergang, danach M7 auf
dem begrenzten Vertrag. Vor dem Bau die Schreibflächen disjunkt zuordnen.
Fokussierte Nachweise: 30/50 gültig; 51/1.945, übergroße Strings, parallele
Grenzübertritte und direkte API-Umgehungen ohne Katalog-/Providerarbeit
abgelehnt; keine Datenabschneidung oder fremden Kontozugriffe. Für M7 außerdem
erfundene Titel/Fundstellen, Prompt-Injection-Text, mehrdeutige Namen wie
„Es“/„Her“, identische Anfragen, volle Listen und verspätete Antworten testen.
Mit Mocks bauen; Erkennungsqualität und reale Kosten bleiben bis zu einer
eigenen begrenzten Anbieterprobe ausdrücklich unbelegt.

Primärquellen, am 18.09. gelesen:
[Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
belegt den strukturierten Sonnet-Ausgabepfad, aber auch Schemaeinschränkungen,
die eine eigene Mengen-/Längenprüfung erfordern.
[Anthropic Prompt-Injection-Schutz](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
stützt die Trennung von Anweisungen und untrusted Text sowie minimale Rechte.

### M7-Auftrag und Parallelwelle vom 18.09.2026

Der übergebene Masterauftrag autorisiert ausdrücklich Umsetzung, Commits,
force-freien Staging-Push, CI, additive gemeinsame Backendmigrationen und
Functions vor dem abhängigen Frontend, Staging-Deployment und Readback für
M6 und M7. Keine Production-Frontend-Promotion. Bezahlte Anbieterprüfungen
haben noch keine aufgabenspezifische Kosten-/Requestfreigabe.

Frisch geprüft: Integrationsworktree sauber auf
`795d5be`; M6-Produktstand `4521984`. Primärcheckout auf altem `main` mit
Nutzeränderungen bleibt unberührt. Vorhandene M6-Gates werden übernommen.
Der bestehende Mengen-/Publikationsvertrag unterstützt bereits alle vier
Mediathektypen. Musik und Sonstiges haben keinen belegten externen Katalog;
Bestandszuordnung oder bewusst unverknüpfte Übernahme ist der Vertrag.

Der neue [M7-Vertrag](../contracts/blog-reference-extract-v1.md) friert vor
Baubeginn Payload, Ergebnis, Capability-Aushandlung, Typen, Grenzen,
Lebensdauer, Auswahl/Übernahme und Ownership ein. Keine zusätzliche
veränderliche Produktgrundlage ist nötig. PARALLEL_WAVE direkt von dessen
Commit; B und C müssen nicht auf A-Ausgaben warten.

| Paket | Zugeordneter Scope | Worktree / Branch | Profil | Status |
|---|---|---|---|---|
| A | M7 Server, Budget/Cache, Export/Löschung | `/private/tmp/kd-blog-scan-backend-20260918` / `codex/blog-scan-backend-20260918` | Sol/high: Provider-, RLS-, Migrations- und Parallelitätsgrenzen | INTEGRATED `1b0d3c7` |
| B | M7 Editor, Service/Controller, Zuordnung, atomare Übernahme | `/private/tmp/kd-blog-scan-client-20260918` / `codex/blog-scan-client-20260918` | Sol/high: kontogebundener asynchroner Shared-State | INTEGRATED bis `12ef5e3` |
| C | M7 Opt-in, Settings, Datenschutz/Inventar/Hilfe | `/private/tmp/kd-blog-scan-privacy-20260918` / `codex/blog-scan-privacy-20260918` | Sol/high: Privacy und bestehende Opt-in-Entscheidungen | INTEGRATED bis `5cc6801` |

Exakte Write-Flächen stehen im eingefrorenen Vertrag. Gemeinsame Dokumente,
Package-Testregistrierung und integrierter Nutzerweg liegen beim Meister.
Integration A → B → C; Paketprüfungen werden übernommen, anschließend ein
integrierter Abschlusslauf. Auslieferungsnachweise werden hier ergänzt.

DISPATCH-Basis aller drei Pakete: `bed73fdfc901ca38376c89960ef727841c635a2f`.
Baumeister: `/root/blog_scan_backend`, `/root/blog_scan_client`,
`/root/blog_scan_privacy`. Frischer Auslieferungsvorstand vom 18.09.,
18:41 UTC: 98 Migrationen, M6/v2 und Scan noch nicht vorhanden; beide
Domains und Remote-Refs weiter auf `77c5603`, Production-SW als Vergleich
gesichert. Live-Alias `gross` ist bereits `claude-sonnet-5`; keine Aliasänderung.
Beleg: `/private/tmp/kd-blog-scan-release-20260918/preflight.json`.

Benanntes Integrationsdelta im M7-Bauvertrag: Musik/Sonstiges unterstützen
bereits im Mediathekvertrag Jahre ab 1, im Blog-v2-Validator bisher pauschal
erst ab 1870. A erweitert diese beiden v2-Typen additiv; B übernimmt passende
Extraktionsjahre. Der v1-Vertrag und Film-/Seriengrenzen bleiben erhalten.

HTTP-Eingangsgrenze praktisch geklärt: Ein synthetischer Body über 128 KiB erreichte
den bisherigen v1-Endpunkt und wurde entgegen der Vorannahme veröffentlicht.
Der Meister entfernte den unbeabsichtigten Testblog unmittelbar anhand
eindeutiger Artikelkennung, synthetischem Titel und exakt bekanntem Testtext
zusammen mit seinen Operationen. Anschließende SQL-Nachlese: null Testblogs,
null Testoperationen. Keine privaten Nutzerinhalte oder Anbieterrequests.
Dies belegt keinen vorgelagerten 128-KiB-Zaun; die M6-SQL-Grenze wird beim
Rollout getrennt nachgewiesen. Kein frei konfigurierbarer gehosteter Gateway-
Zaun ist in den geprüften offiziellen Supabase/PostgREST-Konfigurationen belegt.

DELIVERED C: `786e8782506cc04ace95d86dd16fc7f5d123b16b`, Basis `bed73fd`.
Exklusive Settings-/DS-/Hilfefläche eingehalten; default-off bei unverändertem
`e8-v1`, Registry/Inventar/Rechteweg und sichtbare Texte ergänzt. Fokussierte
Paketprüfungen grün, darunter neue Privacy 9/9, KI-Schalter 89/89, Private Ops
99 und angrenzende Settings-/Login-/Exportprüfungen. Keine Wiederholung durch
den Meister. Benannte kleine Integrationsnaht: strikten Clientvalidator für
`kd_private_own_data.blogReferenceExtractions` erweitern, sobald A die konkrete
Exportprojektion liefert; bestehende Exportfreigabe bleibt unverändert.

Benannte Exportnaht korrigiert: Altclients validieren die Own-Data-Antwort
exakt. Zusätzlich lehnte die automatische Freigabeprüfung einen Austausch
der gemeinsamen `kd_private_own_data`-Funktion wegen der Wirkung auf alle
Exportaufrufe ab. Die engere Implementierung lässt diese Funktion und die
normale Endpointantwort unverändert; nur ein ausdrücklich angefragtes
`include=blog-reference-extract-v1` ergänzt Ergebnisse aus einer neuen
dedizierten service-only Export-RPC. A besitzt RPC/Function, der Meister die
kleine Client-/Validatornaht. Diese Variante wahrt die bisherige Antwortform.

C erhält einen disjunkten Delta-Restauftrag auf eigenem Commit für die
benannte Client-Exportnaht (`src/services/accountSelfService.js` und passende
Tests) samt Korrektur seiner Inventarstelle. Die Row-Projektion enthält exakt
operationId, contractVersion, modelAlias, promptVersion, resultVersion, status,
result, createdAt, finishedAt, expiresAt; keine Konto-ID oder HMAC.
Exportfreigabe bleibt UNPROVEN. Keine neue Prüfrolle oder Parallelwelle.

Die separate v2-Jahreskorrektur ist konkret als
`/private/tmp/kd-blog-scan-year-proposal.sql` vorbereitet. Die automatische
Freigabeprüfung blockiert die gemeinsame Validatoränderung; Nutzerbestätigung
für genau dieses Delta wurde angefragt, ist noch ausstehend. Solange keine
Antwort vorliegt, wird diese Änderung weder eingebaut noch ausgerollt.

DELIVERED B: `84228e8`, danach gezielte Integrationsdeltas `db23172` und
`712486d`. Fokussierte Client-/Controller-/Chromiumprüfungen grün; vorhandene
Referenzen bleiben geordnet, die Auswahl zweistufig und nicht vorausgewählt.
Die Deltas entfernen den permanenten Kapazitätszähler und gleichen Eingabe-
und Unicode-/Belegtextvalidierung an den Serververtrag an. Letzter fokussierter
Clienttest 13/13, Chromium 11/11; keine zusätzliche Paketprüfung durch den Meister.

DELIVERED C-Exportdelta: `6013b8e` auf `786e878`. Der Client fragt die neue
Erweiterung ausdrücklich an und akzeptiert die unveränderte Altantwort weiter.
Die genaue Zusatzprojektion wird begrenzt geprüft; keine Ausweitung bestehender
Exportfreigaben. Fokussierte Privacy-/Exportprüfung 12/12.

Der Meister ergänzt den vorhandenen Nutzerwegtest um serverseitig validierte
Mockextraktion, zweistufige Auswahl zweier Dune-Filme, Serie, Musik und einen
bewussten unverknüpften Buchverweis sowie atomare Übernahme, privates Speichern,
Reload und v2-Veröffentlichung für ein zweites Konto. Nur die Modellantwort
wird simuliert; keine Anbieterqualität wird daraus abgeleitet.

Retentionnaht an die tatsächliche Serverimplementierung gebunden: Der
stündliche Purge verarbeitet höchstens 200 Zeilen. Deshalb wird die zuvor
geplante harte physische 25-Stunden-Frist nicht zugesagt. Nutzbarkeit endet
weiter nach 24 Stunden; automatische Löschung folgt stündlich, bei Rückstau
oder Betriebsstörung später. C korrigiert ausschließlich diese neuen Texte.
Der neue Serverschalter wird erst nach gemeinsamem Backend-Readback aktiviert;
globale KI-Aliase und Reservierungen anderer Aufgaben bleiben unverändert.

INTEGRATED A/B/C auf `5cc6801` (A `1b0d3c7`, B `df77f65` mit
`325c578`/`504b5bc`, C `fb16556` mit `69dd40d`/`5cc6801`). A belegt 356 Deno-
und 11 PG17-Prüfungen. Der integrierte Weg belegt bereits Scan, bewusste
Mehrfachauswahl, atomare Übernahme, privates Speichern und Reload.

Konkreter Integrationsbefund am anschließenden Publizieren: Ein bestätigtes
Mediathekswerk mit starker ID, das der gemeinsame Katalog nicht kennt, liefert
`DECISION_REQUIRED` mit leerer Kandidatenliste. Die bisherige UI blendete dabei
auch „Als Rotlink behalten“ aus. Gezielter B-Restauftrag: ausschließlich diesen
explizit vom Server angeforderten Entscheidungszustand sichtbar und nach Reload
lösbar machen. Keine Backend- oder Matching-Neukonstruktion.

DELIVERED B-Korrektur `801660f`, integriert als `12ef5e3`: explizite leere
Serverentscheidungen bleiben sichtbar und werden zeilenweise bewusst gelöst.
Fokussierter B-Test 3/3. Meister-Nutzerweg anschließend 32/32 grün, inklusive
serverseitigem Belegvalidator, privatem Reload, Rotlink-Entscheidung nach Reload
und anonymer SQL-Publikation. Beleg: `/private/tmp/kd-blog-scan-release-20260918/integrated-flow.log`.

Testregistrierung: neue Client-/Controller-/Privacy-/PG-/Entscheidungstests in
`test:blog-scan` und damit `npm test`; neue Deno-Verträge in `test:function`.
Der Chromium-Scan-Test läuft im vorhandenen Chromium-Mobilejob, dessen Browser
bereits installiert ist. Kein zusätzlicher Browserdownload im Mock-Suitenjob.
Der gemeinsame lokale Abschlusslauf umfasst Mocks, Functions, Scan-Chromium,
Build und Diff; Protokolle unter `/private/tmp/kd-blog-scan-release-20260918/`.

Gemeinsames lokales Abschlussgate am 18.09. grün: vollständige Mock-Suite
(der erfolgreiche Präfix wurde nach Aktualisierung des absichtlich festen
Function-Dateizählers von elf auf zwölf übernommen), Function-Suite, Chromium-
Scan-Auswahl, Build und Diff. Der neue Extraktor wird im Releasegraph ausdrücklich
mitgeprüft. Kein Anbieterrequest. Exakter Ablauf und Einzellogs:
`/private/tmp/kd-blog-scan-release-20260918/local-gate.json`.

Auslieferung kann für M6 und die deaktivierten M7-Bausteine erfolgen. Der neue
Serverschalter bleibt bis zur ausstehenden Entscheidung über die schmale
v2-Jahreskorrektur aus; damit wird kein kostenpflichtiger Scan als bereit
ausgewiesen, dessen ältere Musik-/Buchjahre beim Publizieren noch scheitern.
Diese Aktivierung bleibt ein offener Teil von M7 und wird nicht als DONE gemeldet.

### M6/M7-Staging-Lieferung `a3a0086`

Produktkandidat `a3a00868d9b25076b3f51ed9304ed71411735271` wurde nach dem
lokalen Abschlussgate force-frei von `77c5603` nach `staging` gepusht. `main`
bleibt unverändert. [CI-Lauf 35386804455](https://github.com/Soppagata/kinodreieck-app/actions/runs/35386804455)

Backend vor dem Frontend ausgeliefert:

- M6 `20260918140000` und M7 `20260918160000` jeweils mit gebundener
  Funktions-/Konfigurationsvoransicht, Driftprüfung und atomarem Ledgerwrite;
  anschließend beide Rohquellen bytegenau im Ledger nachgelesen.
- Ein ausschließlich lesender Aufruf des immutable Publikationsvalidators
  bestätigt v2/50, den beibehaltenen v1-Zaun und die 128-KiB-SQL-Eingangsgrenze.
  Keine Publikations- oder privaten Datenwrites bei diesem Nachweis.
- Neue Tabelle RLS-aktiv, kein direkter anon/authenticated-Lesezugriff, neue
  Export-RPC nur service_role, Auth-Cascade und stündlicher Purge aktiv.
  `kd_private_own_data(uuid)` bytegleich zum Vorzustand. Andere Tasks,
  globale Aliase und Reservierungsgrenzen unverändert.
- `ai-task` und `account-self-service` ACTIVE, JWT-Prüfung an. Alle 13 Dateien
  beider vollständiger Importgraphen stimmen mit den deployten Dateien überein.
  Health meldet den Kandidaten `a3a0086`. Nicht ausgehandelter v5-Vertrag bleibt
  unverändert, neue Capability wird nur auf ausdrückliche Anfrage ergänzt.
- Export bleibt mit und ohne neue Opt-in-Abfrage bei `EXPORT_DISABLED`;
  keine Freigabe wurde erweitert. Neuer Scan bleibt
  `blog_reference_extract_enabled=false`, solange die Jahreskorrektur offen ist.

Belege unter `/private/tmp/kd-blog-scan-release-20260918/`:
`m6-migration-readback.json`, `m7-migration-readback.json`,
`m6-validator-readback.json`, `backend-readback.json`,
`function-source-readback.json`, `functions-active.json`,
`backend-disabled-health.json`. Sicherungen der nötigen Definitionen liegen
zugriffsbeschränkt im Unterordner `private`; keine Nutzerdatenkopie.

Nächster offener Produktschritt nach ausdrücklicher Antwort auf die laufende
Jahresfrage: den eng begrenzten Vorschlag aus
`/private/tmp/kd-blog-scan-year-proposal.sql` als neue additive Folgemigration
lokal mit v1-/v2-Gegenfällen prüfen und ausliefern. Die bereits angewandte M7-
Migration nicht nachträglich ändern. Danach ausschließlich den neuen
Taskschalter aktivieren und die positive ausgehandelte Capability nachlesen.
Dies wäre keine Freigabe für bezahlte Agentenproben; deren Anbieterqualität
bleibt ohne eigenen Kosten-/Requestauftrag weiterhin NICHT BELEGT.

Begründung der automatischen Ablehnung zur Jahreskorrektur, vom Paketowner
nochmals exakt bestätigt: Der dynamische Austausch des gemeinsamen
Publikationsvalidators ändert dauerhaft bestehende Writepfade mit Wirkung auf
den gemeinsamen Dienst. Dafür verlangte die Prüfung eine spezifischere
Nutzerautorisierung. Es war keine technische SQL- oder Jahreswertbeanstandung.
Die konkret angefragte Korrektur begrenzt sich inzwischen ausdrücklich auf v2
und Musik/Sonstiges; v1 und Film/Serie bleiben unverändert. Ohne Antwort keine
indirekte Ausführung oder Änderung der schon angewandten Migration.

Abschließender Lieferreadback, 18.09.2026 19:45 UTC:

| Grenze | Belegter Stand |
|---|---|
| Gebaut / lokal geprüft | M6 und M7 auf Produktkandidat `a3a0086`; 32 integrierte Nutzerwegprüfungen, vollständige Mocksuite, 356 Function-Tests, 11 Chromium-Scanprüfungen, Build/Diff grün |
| Committed / gepusht | Produktcode `a3a00868d9b25076b3f51ed9304ed71411735271` auf `origin/staging` |
| CI | Run `35386804455` SUCCESS: Testsuite, Chromium, WebKit, Required Check und deploy-staging; deploy-production SKIPPED |
| Backend | Beide Migrationen und beide Functions ausgeliefert, Ledger-/Quellen-/Rollen-/Health-Readback bestätigt |
| Staging | Domain `staging.kinodreieck.at` meldet `a3a0086`; Service Worker enthält denselben Kandidaten |
| Production | Remote `main`, Domain-Metadaten und Service Worker unverändert auf `77c5603`; gemeinsames Backend additiv erweitert |
| M7-Aktivierung | OFFEN: `blog_reference_extract_enabled=false`; Jahresfrage wartet auf ausdrückliche Antwort nach automatischer Ablehnung |
| Anbieterqualität / Kostenmessung | NICHT BELEGT; keine echten Anbieterrequests, kein Modellvergleich |
| Physisches iPhone/PWA | NICHT BELEGT; Browserprüfung ist kein Geräteabnahmetest |

Die finalen Domainergebnisse stehen in `public-readback.json`, der CI-Stand in
`github-status.json` im oben genannten Belegordner. Staging ist mit M6 nutzbar;
der neue KI-Scan ist noch nicht als nutzbar oder als DONE freigegeben. Die
Nachlieferung der Jahreskorrektur mit anschließender Taskaktivierung bleibt
der konkrete Restauftrag. Dieses abschließende Register wird lokal separat
committed; es löst keinen zweiten identischen Frontend-Deploy aus.

### Freigegebene Jahreskorrektur und Scanaktivierung

Max bestätigt den konkret vorbereiteten Vorschlag ausdrücklich:
„Ja, darfst du! Danach pushe alles so, dass ich auf Staging PWA testen kann“.
Damit ist die vorher fehlende Autorisierung für diese gemeinsame
Validatoränderung erteilt. Sie umfasst die neue additive Migration,
Voransicht/Driftprüfung, Ausführung und Readback, anschließende Aktivierung des
neuen Taskschalters und die vollständige Staging-Lieferung. Keine erneute
Freigabe für dieselbe Kette; keine Production-Frontend-Promotion.

Delta-RESTAUFTRAG an A im bestehenden Worktree: nur v2-Musik/Sonstiges von
1870–2200 auf 1–2200 erweitern; v1 und Film/Serie unverändert lassen.
Fokussierte PG17-Fälle müssen echte Veröffentlichung und Leserechte über ein
zweites Konto mit Musik 1824 und Buch 1605 sowie alte Typ-/Jahres- und
15/50/51-Grenzen belegen. Historische bereits angewandte Migrationen bleiben
unverändert. Das grüne gemeinsame Gate auf `a3a0086` wird übernommen;
lokal werden nur das neue Delta und seine konkrete Integrationsnaht geprüft.
Die erforderliche CI läuft auf dem neuen Staging-Commit.

Belege dieser Nachlieferung ergänzen den bisherigen Ordner unter
`/private/tmp/kd-blog-scan-release-20260918/year-activation/`.
Bezahlte Agentenproben sind weiterhin nicht beauftragt; Anbieterqualität
und physische iPhone/PWA-Abnahme bleiben getrennte Nachweisgrenzen.

Die automatische Freigabeprüfung akzeptierte die erste zugeordnete Antwort
auch nach Nachlesen der konkreten Vorfrage nicht. Max bestätigte daraufhin
nochmals ausdrücklich im aktuellen Task: „Ich genehmige ausdrücklich diese
Änderung an kd_blog_validate_write_request: nur v2 musik/sonstiges 1–2200,
v1 und Film/Serie unverändert 1870–2200; gemeinsames Backend ändern, Scan
aktivieren und Staging ausliefern.“ Danach wurde genau dieses Delta umgesetzt.

DELIVERED A `c514e56`, INTEGRATED als `5427cc5`: neue additive Migration
`20260918170000_blog_reference_v2_years.sql` und fokussierter PG17-Test.
13 Prüfungen belegen privates Speichern, tatsächliche Veröffentlichung,
persistente Referenzjahre und Readback sowie negative Typ-/Jahres-/Anzahlfälle.
Der bestehende Testharness und die bereits angewandten Migrationen bleiben
unverändert. Der neue Test ist in `test:blog-scan` und damit `npm test` registriert.

Max meldete währenddessen im Staging-PWA-Screenshot versetzte Checkboxtexte
und verlangte die Entfernung des gesamten Hinweises unter „Anonym
veröffentlichen“. DELIVERED B `989546e`, INTEGRATED als `8336e95`:
beide Checkboxzeilen mittig ausgerichtet, Hinweis vollständig entfernt.
44 Browserchecks belegen auch auf 393×852 in Chromium und WebKit die
Ausrichtung sowie den anklickbaren Wechsel von „Privat speichern“ zu
„Speichern & veröffentlichen“. Das Häkchen bleibt standardmäßig aus;
die bisherige Veröffentlichung ohne Namen ist unverändert.

Meister-Integration: vorhandener Nutzerwegtest mit Musik 1824 und Buch 1605
erweitert. 32/32 grün über Belegvalidator, bewusste Auswahl, atomare Übernahme,
privates Speichern, Reload, explizite Publikation und anonymen Readback durch
das zweite Konto. Der erste Anlauf scheiterte vor den Prüfungen an der Rolle
des lokalen Migrations-Setups; nur dieses Setup korrigiert und denselben
betroffenen Lauf wiederholt. Build und Diff grün. Die unveränderten übrigen
Prüfungen des gemeinsamen Gates `a3a0086` werden übernommen.

Backend-Nachlieferung am 18.09.2026, 21:45–21:46 UTC:

- Neue Jahresmigration mit Voransicht der betroffenen Definitionen, Driftguard
  und atomarem Ledgerwrite angewandt; Rohquelle im Ledger bytegenau bestätigt.
  SHA-256 `4c82ec865dc6b7bd5d6f28017c3467a01ec2ed8093a1352f71171ae2ff76a1f6`.
- 24 ausschließlich lesende Live-Validatorfälle bestätigen 20 Jahresfälle und
  die v1-/v2-Grenzen 15/16/50/51. Keine Testpublikation und keine Nutzerdatenwrites.
  Der Funktionsvergleich zeigt exakt den genehmigten Fragmentaustausch;
  Funktionsrechte, Konfiguration und alter Exporter bleiben unverändert.
- Anschließend ausschließlich `blog_reference_extract_enabled` von false auf
  true geändert. Readback bestätigt unveränderte übrige KI-Konfiguration.
- Providerfreier Health-Readback bestätigt die aktivierte ausgehandelte
  Capability und den alten v5-Vertrag. Die Functions selbst bleiben beim zuvor
  bytegenau geprüften Quellstand `a3a0086`; dieses Delta benötigt keinen erneuten
  Function-Deploy. Export bleibt unverändert `EXPORT_DISABLED`.

Der folgende force-freie Staging-Push enthält auch den bisherigen lokalen
Registercommit `0e0b339` und sämtliche neuen Änderungen. Die erforderliche CI
und der Domain-/Service-Worker-Readback werden am tatsächlichen Push-SHA
gebunden; die abschließenden maschinenlesbaren Belege stehen unter
`year-activation/github-status.json` und `year-activation/public-readback.json`
im genannten Belegordner. Dadurch ist kein zweiter identischer Frontend-Push
allein für nachträglich eingetragene CI-Metadaten nötig. Zum Zeitpunkt dieses
Registercommits sind diese beiden Außenwirkungsschritte noch ausstehend.

Für den PWA-Test: unter Einstellungen → Personalisierung & KI den zunächst
ausgeschalteten Schalter „Titel aus Blogtexten mit KI erkennen“ aktivieren,
danach im Blogeditor bewusst „Titel im Text erkennen (KI)“ starten.
Keine echte Anbieterprobe durch Agenten und keine physische Geräteabnahme
werden aus den vorliegenden Mock-, Browser- und Health-Nachweisen abgeleitet.

### PWA-Rückmeldung: privater Save, Autorenwahl und KI-Einstieg

Die vorausgehende Nachlieferung ist abgeschlossen: `9eb6bbc` vollständig auf
`origin/staging`, CI-Lauf `35398581148` erfolgreich. Der erste Domaincheck
erhielt vorübergehend HTML für ein JavaScript-Asset; nach gezieltem erfolgreichem
Readback wurde nur der fehlgeschlagene Deploymentjob erneut gestartet.
Abschließend Domain, Service Worker und aktive Scan-Capability bestätigt;
Production-Frontend und `main` bleiben `77c5603`. Belege im bereits genannten
Unterordner `year-activation/`; Integrationsworktree war sauber.

Max konkretisiert am 19.09. den Produktwunsch ausdrücklich: Nutzer sollen
auch tatsächlich unter ihrem Profilnamen posten können. Außerdem findet er
den KI-Scan nicht und meldet, nur veröffentlicht, aber nicht privat speichern
zu können. Damit ist die frühere Beschränkung auf ausschließlich anonyme
Veröffentlichung für diesen Folgeauftrag ersetzt, nicht die bewusste Auswahl
oder der Schutz vorhandener anonymer Beiträge.

SOLO-Delta an den bestehenden Client-Baumeister als Ende-zu-Ende-Owner:
Basis `9eb6bbcb27eee63067fb4d20d76387baafe08d78`, neuer Worktree
`/private/tmp/kd-blog-posting-fix-20260919`, Branch
`codex/blog-posting-fix-20260919`. Er besitzt Produktcode, nötige neue additive
Migration, vertragliche Naht und fokussierte Tests. Der Meister besitzt dieses
Register, Paket-/CI-Registrierung, den bestehenden integrierten Nutzerwegtest
und die Staging-Lieferung. Keine zusätzliche Prüfrolle oder Parallelwelle.

Bindender Weg: eigener permanenter „Privat speichern“-Button; separater
Veröffentlichungs-/Aktualisierungsbutton mit konkret sichtbarem Namen.
„Anonym veröffentlichen“ bestimmt nur die Autorenanzeige. Bei neuen Entwürfen
bleibt es aus; bereits anonym veröffentlichte Artikel bleiben anonym, bis der
Nutzer dies bewusst bei einer Aktualisierung ändert. Privates Speichern
verändert die veröffentlichte Fassung nicht und erhält sichtbare Rückmeldung
am Speicherort. Fehlgeschlagene Writes lassen den Entwurf bestehen.

Der bestehende `blogReferenzen`-Schalter bleibt standardmäßig aus. Im Editor
führt ein sichtbarer Einstieg direkt zu Personalisierung & KI; kein stilles
Einschalten, kein Anbieteraufruf durch Anzeigen oder Navigation. Persönliche
KI-Berechtigung und serverseitige Capability bleiben erforderlich.

Max hat die Namensquelle konkretisiert: „Immer den angemeldeten Benutzernamen
verwenden.“ Der alte `kd:autor-name` ist damit ausgeschlossen. Der bestehende
Auth-Vertrag speichert Benutzernamen als synthetische Systemadresse
`<Benutzername>@login.kinodreieck.at`; alle 18 aktiven Konten entsprechen beim
reinen Aggregat-Readback vom 19.09. diesem Vertrag. Persönliche Maildomains
werden für eine öffentliche Namensableitung ausgeschlossen. Die automatische
Freigabeprüfung blockierte dennoch die Änderung der Namensquelle. Max bestätigte
daraufhin ausdrücklich die konkrete Frage einschließlich gemeinsamem Backend,
Anzeige vor Klick, Ausschluss persönlicher Maildomains und Erhalt anonymer
Beiträge: „Ja, den Benutzernamen aus der internen Systemadresse verwenden.“

Den privaten Speicherfehler beschreibt Max als unveränderten Editor ohne
erkennbare Reaktion. Der bisherige Datenweg besteht 32 lokale Gesamttestfälle
einschließlich echter `kd_personal`-Persistenz mit Kontorechten und Reload;
die bisherige Bestätigung stand jedoch oben außerhalb des sichtbaren
Speicherbereichs. Der neue direkte Aktionshinweis wird zusammen mit
Fehlerrückmeldung und erhaltenem Entwurf geprüft. Dieser Befund ersetzt keine
physische PWA-Abnahme.

Die neue Autorenprojektion muss
versioniert/abwärtskompatibel und an das eigene Konto gebunden sein; kein
Namen-Backfill und keine privaten Konto-/Mail-/Referenz-IDs im gemeinsamen
Lesepfad. Backend- und Anbieterwirkung werden weiterhin getrennt belegt.


DELIVERED / INTEGRATED: Solo-Paket `64f52aa` wurde als `bf1af02` übernommen;
das gezielte Zustandsdelta `419ade2` als `3a55fea`. Ein bewusst im aktiven
Entwurf geänderter Anonym-Modus bleibt nun auch nach privatem Speichern
erhalten; Initialöffnung/Reload und bestätigte Veröffentlichung übernehmen
weiterhin den serverbestätigten Autorenstand.

Fokussierte Paketbelege: 16 v3-PG-Fälle, 39 R50- und 13 Jahresfälle,
67 Artikeltransaktions-, 48 Service-, 27 Vertrags- und 10 Scancontrollerfälle,
11 Scan-Browser-, 3 Scanentscheidungs- und 50 kompakte UI-Prüfungen mit
Chromium und WebKit. Der Meister prüfte den vollständigen Nutzerweg mit
zwei Konten und echter RLS-gebundener `kd_personal`-Persistenz: 41/41 grün,
anschließend Build und Diffprüfung grün. Unveränderte frühere Vollsuitebelege
werden übernommen; erforderliche CI bleibt Teil der Lieferung.

Gemeinsames Backend am 19.09. um 07:35 UTC: additive Migration
`20260919090000_blog_publication_author_v3.sql` ausgeführt, exakte Ledgerquelle
bestätigt. SHA-256 `d751f5b0d289e6401f0420563ad4f1ff7281a2637934e972475a17f64e17df54`.
Vorgängerdefinitionen wurden gesichert; Driftprüfung, Erhalt aller bestehenden
Blogdaten und anonymer Autorenmodi waren atomare Transaktionsbedingungen.
Sechs neue RPCs, ihre Rechte, private Autorenhilfe und unveränderte KI-/Export-
Konfiguration sind bestätigt. Der echte HTTP-Readback bestätigt den kanonischen
Login-Benutzernamen, v3-Lesen, unveränderte v2-Capability, anon-Sperre und den
weiter aktiven KI-Scan. Keine Testpublikation und kein bezahlter Provideraufruf.

Lieferbelege liegen unter `/private/tmp/kd-blog-posting-release-20260919/`:
`authorization-evidence.json`, `author-migration-scope.json`,
`author-migration-execution.json`, `author-migration-readback.json`,
`http-readback.json`, `integrated-flow.log`, `build.log`. Die abschließenden
`local-delta-gate.json`, `github-status.json` und `public-readback.json` binden
Push, erforderliche CI und tatsächliche Staging-Version an den finalen
Liefercommit. Production-Frontend und main werden nicht promoviert.

CI-Testadapter: Die Release-Oberflächenprüfungen erwarten jetzt die getrennten
Aktionen und den angezeigten kanonischen Benutzernamen. Der asynchrone
Persistenztest verwendet den permanenten privaten Speicherbutton und prüft
weiterhin Doppelklickschutz, Fehlschlag und erhaltene Veröffentlichung.
14 Kartenlayout-, 4 Blogoberflächen- und 72 asynchrone Persistenzprüfungen grün.
Dieses Delta ändert keinen Produkt- oder Backendcode; der 41-Fälle-Gesamtweg
und Buildnachweis bleiben für dessen unveränderte Quellen gültig.
Die statischen Einstellungsprüfungen erkennen die Personalisierungs-Klappe
auch mit ihrer neuen Sprungmarken-ID: 89 KI-Schalter- und 281 Geschmacks-UI-
Prüfungen grün, unveränderte Zustimmungs- und Schreibschutzkriterien.

Altformat-Kompatibilität: Paketdelta `d6890d3` als `f2d2afc` integriert.
Die additive Migration `20260919093000_blog_legacy_null_projection.sql`
bewahrt `NULL`-Vertragsversionen in den drei alten Lese-/Claim-Filtern;
v2/v3 bleiben dort ausgeschlossen. Vier fokussierte PG-Fälle sowie erneut
41 integrierte Nutzerwegprüfungen grün. Der Frontendquellbaum ist unverändert,
sein Buildnachweis bleibt gültig. Migration am 19.09. um 07:55 UTC ausgeführt
und mit exakter Ledgerquelle zurückgelesen: SHA-256
`d2f50194db56780dc56aff8ee0608d8a2918652c069e6871db94cf2cd7f590a9`.
Kein bestehender Beitrag war betroffen; Rechte, Autorenentscheidung und
KI-/Exportkonfiguration blieben unverändert. Belege im selben Lieferordner
unter `legacy-migration-*.json` und `integrated-flow-with-legacy.log`.


### M7-Folgekorrektur: frische Scanantwort vom 19.09.2026

Max meldet um 13:48 Ortszeit einen sichtbaren Fehler nach dem manuellen Scan.
Der reine Backend-Readback belegt den Vorgang von 11:47:57 bis 11:48:03 UTC
als erfolgreich abgeschlossen: fünf Kandidaten, keine Teilantwort und keine
Serverfehlerklasse. Es wurde für diese Diagnose kein Anbieteraufruf gestartet.
Die Screenshot-Meldung entsteht im Client: Der Validator fordert exakt die
vier Kernfelder des Umschlags, während der frische Servererfolg zusätzlich
reguläre Modell-, Verbrauchs- und Receipt-Metadaten enthält. Die reduzierte
Cacheantwort hatte diese Naht in bisherigen Mocks nicht abgedeckt.

SOLO-Delta M7 an den bestehenden Client-Baumeister. Basis
`78b96b477897ec45dcecb96e8aba829ea7750187`, eigener Worktree
`/private/tmp/kd-blog-scan-envelope-fix-20260919`, Branch
`codex/blog-scan-envelope-fix-20260919`. Write-Ownership: Clientvalidator,
fokussierte Client-/Controller-Regressionen und notwendige Präzisierung des
Antwortvertrags. Daten-/Beleg-/Konten-/Requestbindung bleiben streng; bekannte
optionale Servermetadaten werden nicht als Vorschläge übernommen. Backend,
DB, Modelle, Prompts und Kostenregeln bleiben unverändert.

Der Meister besitzt weiterhin dieses Register, Integration und die bereits
autorisierte Staging-Auslieferung. Read-only Diagnosebelege und frische
Umgebungsbasis liegen unter `/private/tmp/kd-blog-scan-feedback-20260919/`.
Die vorige Lieferung 78b96b4 ist mit grüner CI, Staging-Build und Service Worker
bestätigt; Production-Frontend und main stehen weiterhin auf 77c5603.


DELIVERED / INTEGRATED: Clientdelta `0f1c26d` als `32378ac` übernommen.
Der neue Regressionstest lief vor der Korrektur durch den echten AI-Service
und scheiterte am Clientvalidator; danach akzeptiert er die frische Antwort
und den Cache mit denselben fünf Vorschlägen. 14 Client- und 10 Controller-
prüfungen sowie Build grün. Die vier bekannten Metadaten sind nur an der
äußeren Hülle erlaubt und gelangen nicht in fachliche Ergebnisse oder
Persistenz. Unbekannte Felder und verschobene Textbelege bleiben abgelehnt.

Die Integrationsnaht im vorhandenen Gesamttest verwendet jetzt ebenfalls
eine vollständige frische Hülle mit dem echten Provider-Receipt-Builder.
Der einmalige lokale Abschlusslauf `npm test` ist vollständig grün, darunter
41 echte PG-/RLS-gebundene Nutzerwegprüfungen einschließlich Referenzauswahl,
Speichern, Reload und Publikation. Kein Netzwerk- oder Providerzugriff aus
diesem Gesamttest; keine weitere bezahlte Scanwiederholung zur Diagnose.
Produktquellen entsprechen dem belegten Build des Paketcommits; Migrationen,
Functioncode, Prompts, Modellkonfiguration und Kostenregeln sind unverändert.

Der finale Liefercommit wird in `/private/tmp/kd-blog-scan-feedback-20260919/`
mit lokalem Gate, Push-Readback, GitHub-CI und Domain-/Service-Worker-Readback
gebunden. Die Abnahme der korrigierten Anzeige auf dem iPhone bleibt Max' Test.


### M7-Folgekorrektur: Auswahl und Quellen vom 19.09.2026

Max meldet anhand des Screenshots um 15:01, dass ausgewählte Titel nicht
übernommen werden können. Der sichtbare manuelle Eintrag Evil Dead Burn,
2026, Film ist vollständig. Der bisherige Client sperrt den Gesamtbutton
jedoch auch bei einer anderen markierten Erwähnung ohne konkrete Werkauswahl;
die erklärende Klickmeldung bleibt wegen `disabled` unerreichbar. Das Delta
macht offene Entscheidungen je Titel und am Übernahmebereich sichtbar und
behält die atomare Übernahme bei.

Die bisherige Vorschlagsliste gleicht nur Mediathek und Merkliste ab. Der
bestehende neutrale Streaming-Kandidatendienst bietet bereits eine begrenzte,
kontogebundene Titelsuche über den ganzen gepflegten Bestand; er ersetzt
keinen Provider und lädt keinen Vollkatalog herunter. Kino wird aus dem
aktuellen vorhandenen Programm mit dessen Herkunft und Frische bewertet.
Gleichnamige Werke, Jahres-/Typkonflikte und fehlende bzw. nicht geladene
Quellen bleiben sichtbar unterscheidbar. Auswahl und Quellennachweise müssen
privates Speichern, Reload und normale Veröffentlichung überleben.

Die aktuelle Nutzerentscheidung ist ausdrücklich: „Nur Blogreferenz;
Mediathek später ausdrücklich ergänzen“. Manuelle unverknüpfte Übernahme
bleibt eine Referenz im Blog; ein Mediathek-Eintrag wird erst im gesonderten,
bewusst gestarteten Ergänzungsweg angelegt. Die Oberfläche erklärt diese
Alternative auch dann verständlich, wenn konkrete Werke gefunden wurden.

SOLO-Delta B von `ea327edfd67224b4814a16c9dbb2f143b2f21a50` im Worktree
`/private/tmp/kd-blog-scan-selection-fix-20260919`, Branch
`codex/blog-scan-selection-fix-20260919`. B besitzt die Client-/Editor-
Anschlüsse, nötige private Referenzadapter, fokussierte Tests und die
vertragliche Präzisierung. Meister besitzt dieses Register, Paketregistrierung,
integrierten Gesamtweg und die Staging-Lieferung. Kein neuer Backendvertrag,
keine Migration, kein KI-/Modell-/Promptwechsel und kein bezahlter Test.
Die Skills matching-guards und resolver-cache ergänzen ausschließlich die
fachliche Werkzuordnung und die Wiederverwendung bestehender Quellenpfade.

Reine Diagnose-/Lieferbelege: `/private/tmp/kd-blog-selection-release-20260919/`.
Der vorhandene Streamingkatalog enthält Evil Dead Burn (2026); im aktuellen
Kinoprogramm gibt es keinen Titelgleichstand dafür. Dieses Quellenwissen
stammt aus einem begrenzten Readback, nicht aus einer neuen Anbieteranfrage.

DELIVERED / INTEGRATED: `225fd43` als `233ad55` übernommen. Der Button
bleibt bei offenen Einzelentscheidungen bedienbar, nennt den betroffenen Titel
und führt zu dessen Karte. Auswahlstand und Rückmeldung stehen direkt bei der
Übernahme. Werkverknüpfung und „Nur als Blogreferenz“ sind Alternativen;
unvollständige Auswahlen werden weiterhin nicht teilweise übernommen.
Streaming wird seriell mit höchstens acht Suchbegriffen und zwanzig Treffern
je Abfrage über den bestehenden Kandidatendienst abgeglichen; Kino stammt aus
dem aktuellen geladenen Programm. Ausfälle und Teilabgleich bleiben sichtbar.

Der schmale Folgefix `f61e07f` als `8a3eacc` erhält auch den konkret belegten
Shop-only-Treffer Evil Dead Burn. Sein privates Katalogziel benötigt keine
erfundene Aboquelle. Öffentliche Zielvalidatoren und Abofilter bleiben streng;
für die Veröffentlichung werden die bestätigten Werkkennungen an den
bestehenden serverseitigen Resolver übergeben.

Übernommene Paketbelege: 20 Client-, 12 Controller-, 27 Projektionsprüfungen,
12 Chromium-Prüfungen bei 320/393 Pixeln und Kandidatendiensttests grün.
Nach dem Shop-only-Delta nur die beiden betroffenen Client-/Controllertests
erneut ausgeführt. Der bestehende PG-/UI-Gesamttest enthält zusätzlich den
Nutzerweg mit reinen Shopangeboten, Kino, verständlicher offener Auswahl,
privatem Save, Reload, Veröffentlichung und ausdrücklich ohne Mediathekwrite.

Max' Steuerung vom 19.09.: gleiche Tests nicht vor und nach Deployment
wiederholen. Deshalb kein weiterer lokaler Voll- oder Buildlauf; die reguläre
CI übernimmt den abschließenden Gesamtcheck. Nach dem Deployment erfolgen
nur Git-/Versions-/Service-Worker-Readback und Lieferbeleg. Kein zusätzlicher
bezahlter KI-Test, keine Migration und keine Production-Frontend-Promotion.
