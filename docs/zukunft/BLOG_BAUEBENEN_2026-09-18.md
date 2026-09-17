# Blog: Bauebenen und parallele Baumeister

Stand: 18.09.2026 · Status: lokaler Bau durch Max beauftragt.
Freigabe: „Passt, merke dir deinen Plan und achte, dass kein baumeister falsch
abbiegt! Viel Spaß beim bauen!“ Autorisiert sind lokale Umsetzung, Mock-/lokale
Datenbanktests, Commits und Integration. Push, Deployment, gemeinsame
Backendmutation und zahlende Providerläufe sind nicht Teil dieses Bauauftrags.

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
| M1 | Artikel und Ranglisten in einem einfachen Editor schreiben; kompakte Referenzen sicher umordnen. | B, C | GEBAUT | 23e430c bis 513ce6f; integrierter Nutzerweg grün |
| M2 | Bewusst anonym veröffentlichen, privat weiterarbeiten, aktualisieren und zurückziehen; andere Konten sehen keine Autorenmetadaten. | A, B, C | GEBAUT | 5369a03 bis 513ce6f; anonyme Zwei-Konten-Projektion und Antwortverlust geprüft |
| M3 | Beim Lesen den passenden eigenen Mediathek-, Streaming- oder Kinotitel öffnen; fehlende Titel als Rotlink ergänzen. | A, B, C | GEBAUT | Gesamtweg grün; Identitätsdelta 105c0d2, Projektion 25/25, SQL/Service/Client-Gegenprobe grün |
| M4 | Veröffentlicht zügig öffnen; Quellenwechsel und eigener Bestand personalisieren vorbereitete Verweise ohne Katalogvollabruf. | A, B, C | GEBAUT | Kein Katalogvollabruf im Gesamtweg; Leerbestand-Delta 6aeb732, Transaktionen 60/60 |
| M5 | Quellenziele bleiben nach Katalogänderungen aktuell; Fehler und abgelaufene Angebote erzeugen keine falschen Verfügbarkeiten. | A, B, C | GEBAUT | 4b5caef; PG-Refresh 12/12 und integrierter Schedulerpfad grün |

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
| C | codex/blog-ui-20260918 | /private/tmp/kd-blog-ui-20260918 | INTEGRATED / 3b1c787 + 873f7cb + 642328c + 513ce6f, UI 4/4 + Chromium 34/34 |

Gemeinsamer Zielbranch: `codex/blog-integration-20260918`.
Meister-Worktree: `/private/tmp/kd-blog-integration-20260918`.
Meister- und Paket-Worktrees sind aus demselben B0 angelegt. Alle drei Pakete
sind ohne gegenseitiges Warten gestartet. Alle drei Lieferungen sind in der
Reihenfolge A → B → C konfliktfrei integriert. 22 Prüfungen des echten
UI-/Controller-/Service-/SQL-Nutzerwegs mit zwei lokalen Konten sind grün.
Finaler Kandidat folgt nach den konkreten unten benannten Integrationsdeltas.
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
Gesamttest ergänzt. Alle Produktpakete sind damit integriert.

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

## Ebene 3: spätere Lieferung

Der konkrete Push-/Deploymentumfang ist noch nicht beauftragt. Die spätere
Lieferreihenfolge lautet: Backend-Anonymisierung und Referenzvertrag,
gezielter Readback, vorbereitete Alt-Referenzen bzw. ehrlicher Übergangszustand,
danach Client. Der Einstieg bleibt bei unbekanntem Backendvertrag geschlossen.
Kein Baumeister der Parallelwelle schreibt in ein gemeinsames Backend oder
startet einen Providerlauf. Lokale Umsetzung, Tests, Commits und Integration
brauchen bei erteiltem Bauauftrag keine Zwischenfreigaben.

Gebaut, getestet, committed, gepusht, CI-grün, deployed und praktisch auf der
PWA abgenommen werden beim Abschluss getrennt berichtet. Das Register bindet
nur tatsächlich erreichte Lieferstände.
