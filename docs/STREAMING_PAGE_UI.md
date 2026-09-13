# Progressive Streaminganzeige

`StreamingTab` unterstützt neben dem bisherigen Vollkatalogpfad den additiven
Seitenvertrag aus `PWA_PROGRESSIVE_CONTRACT.md`.

## Props

- `streamingPage`: Zustand der aktiven serverseitigen Ansicht. Der neue Pfad
  ist nur bei `streamingPage.enabled === true` aktiv.
- `onStreamingPageQuery({ view, filters })`: stabiler Controller-Callback. Die
  UI sendet `library`, `all` oder `new` und die primitiven Filterwerte. Sie lädt
  selbst keine Daten.

Ohne aktiviertes `streamingPage` bleiben Projektion, Filterung, Sortierung und
Kartenverhalten des bisherigen Vollkatalogs erhalten.

## Anzeigeverhalten

Die drei Ansichten erscheinen sofort. Ihre Badges verwenden `counts.library`,
`counts.all` und `counts.new`; `total` bezeichnet separat die Treffer der
aktiven Filter. Die UI rendert zunächst 20 Karten. Bereits vorgeladene Titel
werden über den Scroll-Sentinel automatisch in Portionen zu 20
in den DOM übernommen. Der Sentinel gibt pro echter Viewport-Begegnung nur
eine Portion frei. Nachrendern, Scroll-Anchoring und neu eintreffende
Vorladepakete starten innerhalb derselben Begegnung keinen Selbstlauf. Trifft
das erste Vorladepaket erst bei bereits sichtbarem Sentinel ein, gibt diese
Begegnung genau dieses eine Paket frei und bleibt danach bis zum Verlassen des
Viewports verbraucht.

Bei `refreshing` oder einem Fehler nach einer erfolgreichen Seite bleiben die
vorhandenen Karten und alle Kartenaktionen bedienbar. `library_id` wird nur als
vom Seitenvertrag bestätigte Mediathekzuordnung verwendet und vor der
Navigation gegen den lokalen ID-Index geprüft. Der progressive Pfad führt
weder die Vollkatalogprojektion noch den vollständigen Mediathekabgleich aus.

Ansicht, Filter, sichtbare Portion und Scrollposition werden als kleiner, an
`queryKey` gebundener Sitzungszustand gespeichert. Katalogtitel werden dabei
nicht in Web Storage geschrieben.

## Integrationsnaht

Der App-Controller besitzt Laden, Cache, serielle Vorladung und Pausierung. Er
muss `streamingPage` und den stabilen Callback an `StreamingTab` durchreichen.
Ein Filterwechsel ersetzt die aktive Query; weitere Seiten erweitern `items`
unter demselben gültigen `queryKey`.

Die Private-v1-Netzsperre mockt `kd_streaming_page`, damit Browserfälle nach
der Integration keine unbekannten Fremdrequests auslösen. Die fokussierten
DOM-Verträge liegen in `streaming_progressive_ui_test.mjs`; die
Produktionsdarstellung ohne technische Lieferanten- und Standangaben wird in
`streaming_progressive_ui_prod_test.mjs` geprüft.

## Entdecken-Projektionsindex

Der begrenzte Entdecken-Feed gleicht seine höchstens 50 Einträge gegen einen
neutralen Index der bereits geladenen Streaming-Snapshots ab. Der Index wird
je Paar von Snapshot-Objektidentitäten einmal aufgebaut und bleibt bei einem
Unmount der Entdecken-Ansicht wiederverwendbar. Er enthält keine Profil-,
Konto-, Seen- oder Auswahldaten; diese Werte werden bei jeder Projektion frisch
angewendet. Wird ein Snapshot inhaltlich ersetzt, muss der Controller deshalb
wie bisher auch seine Objektidentität ersetzen.

Starke IDs sowie der exakte Fallback aus normalisiertem Titel, Jahr und Typ
führen auf kleine Kandidaten-Buckets. Globale vergleichbare ID-Namespaces
bleiben dabei berücksichtigt, damit der Index keinen zuvor blockierten
Titel-Fallback freigibt. Der bestehende Matcher entscheidet innerhalb des
Buckets weiterhin über Match, Konflikt und Mehrdeutigkeit. Seen-Einträge werden
einmal je Projektion vorbereitet; Beschreibungsabgleiche erhalten nur Quellen,
die über dieselben strengen Identitätsmerkmale relevant sein können.

Der fokussierte Vertrag liegt in `entdecken_projection_index_test.mjs`. Er
vergleicht die resultierende Kartenstruktur mit dem bisherigen
Vollkatalog-Matching und prüft Konflikte, Mehrdeutigkeit, Titel/Jahr/Typ,
Dienstauswahl, frischen Seen-/Profilzustand, Beschreibungen und die
Wiederverwendung identischer Snapshotreferenzen.
