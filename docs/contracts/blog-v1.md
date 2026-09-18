# Blog-Vertrag v1

Status: eingefrorene Grundlage F0 fuer die parallelen Pakete A, B und C

Version: `blog-publication-v1`

Grenze: lokale Implementierung fuer einen spaeter gemeinsam aktivierten
Staging-/Produktions-Datenbereich; dieser Vertrag selbst fuehrt kein Deployment
und keinen gemeinsamen Datenbankwrite aus

Dieser Vertrag ergaenzt die vorhandene Shared-Article-Infrastruktur. Er ersetzt
weder den persoenlichen Artikeltopf noch Mediathek, Streamingindex oder
Kinoprogramm. Die gemeinsame Referenzliste bleibt auf 15 Zeilen begrenzt und
behält pro Zeile eine stabile Identitaet, auch wenn der Rang geaendert wird.

## Bestandsnaehte, auf die v1 aufbaut

- `kd_shared_articles` besitzt bereits eine kontogebundene eindeutige Zuordnung
  `(account_id, article_id)`, eine servererzeugte `publication_id` und einen
  unveraenderlichen `share_token`. v1 nutzt diese Zuordnung weiter.
- `kd_list_shared_articles()` und `kd_claim_shared_article(uuid)` sind
  bestehende Verbrauchergrenzen. Signatur und Spaltenform bleiben kompatibel.
- Der Streamingindex fuehrt `source_revision`, `output_key`, starke
  `watchmode_id`-/`imdb_id`-/`tmdb_id`-Kennungen, Titel-/Jahr-/Typ-Schluessel und
  Quellen-IDs. Der Blogabgleich liest diese vorhandene Projektion; er startet
  keinen Providerabruf.
- Oeffentliche Kinoziele nutzen ausschliesslich die vorhandene zentrale
  `film_at_id` als `{ kind: "cinema", art: "programm", ref, titel }`.
  `art: "film"` adressiert in der bestehenden App eine private Mediathek-ID
  und darf deshalb nie in die oeffentliche Projektion gelangen. Die App
  navigiert zu Streaming mit `{ kind: "streaming",
  art: "programm"|"entdecken", ref, titel }` und zur Mediathek mit
  `{ kind: "library", ref, titel }`. Letzteres erzeugt B ausschliesslich aus
  dem Bestand des aktuellen Lesers; es wird weder publiziert noch gespeichert.
- Private Artikelreferenzen (`liste[].ref` und die neue private `rowId`) bleiben
  kontogebunden. Eine gemeinsame Projektion erhaelt stattdessen eine
  servererzeugte `referenceId` und gegebenenfalls einen oeffentlichen,
  kataloggebundenen `workKey`.

## Gemeinsamer Backendbereich und Lieferreihenfolge

Staging und Produktion verwenden absichtlich denselben veroeffentlichten
Blogbereich. Eine auf Staging veroeffentlichte Kopie ist damit nach Aktivierung
auch fuer aktive Produktionskonten sichtbar. Es gibt keine Environment-Spalte,
kein Staging-Praefix und keine getrennte Publikationsliste. Der neue Editor kann
trotzdem zunaechst nur im Staging-Client ausgeliefert werden; diese UI-Grenze
veraendert den gemeinsamen Backendvertrag nicht.

Vor `20260918120000_blog_publication_v1.sql` muss
`20260918115900_blog_publication_pg_cron.sql` erfolgreich laufen. Die schmale
Voraussetzung installiert `pg_cron` deklarativ in `pg_catalog` und gibt dem
Migrationseigner `postgres` Zugriff auf das `cron`-Schema und dessen Tabellen.
Die lokale PG17-Harness verwendet dafuer nur ein Cron-Doppel; sie belegt keine
Installation im gemeinsamen Supabase-Projekt. Die reale Migration und der
registrierte Job muessen deshalb separat per Readback bestaetigt werden.

## Gemeinsame Konstanten

Die kanonischen Werte stehen in `src/lib/blogContract.js`:

- Version `blog-publication-v1`
- maximal 15 Referenzen
- neutraler Autorenwert `Ohne Namensangabe`
- RPC-Namen, Referenz-/Quellen-/Anzeigezustaende und Save-Outcomes
- Fail-closed-Capabilitypruefung
- Ableitung `private` / `published` / `private_changes`
- genau eine leserseitige Referenzprojektion fuer B und C
- kanonische Streaming-Quellen-IDs `netflix`, `prime`, `disney`, `apple`,
  `hbo`, `paramount`, `mubi`, `crunchyroll`, `rtl`; sie entsprechen den
  vorhandenen Backend-Service-IDs und sind keine neuen Anzeigenamen

`contentVersion` und `operationId` sind UUIDs. `contentVersion` wird fuer jede
erfolgreich privat gespeicherte Fassung neu erzeugt und bleibt fuer exakt diese
Fassung stabil. `operationId` bezeichnet genau eine beabsichtigte
Publikationsmutation; Readback und Wiederholung verwenden dieselbe ID und
denselben Request. Dieselbe ID mit anderem Inhalt ist
`OPERATION_ID_CONFLICT`. `publicRevision` ist eine serverseitig monoton
steigende positive Ganzzahl pro Publikation. Sie schuetzt Updates und
Ruecknahmen vor dem Ueberschreiben einer neueren oeffentlichen Fassung.

## Backend-Faehigkeitspruefung

`POST /rest/v1/rpc/kd_blog_publication_capabilities` ohne Bodyfelder liefert
exakt:

```json
{
  "contractVersion": "blog-publication-v1",
  "enabled": true,
  "anonymousProjection": true,
  "maxReferences": 15,
  "cursorPagination": true,
  "ownerReadback": true,
  "legacyProjectionSafe": true,
  "rpcs": [
    "kd_publish_blog_v1",
    "kd_update_blog_publication_v1",
    "kd_withdraw_blog_publication_v1",
    "kd_read_own_blog_publication_v1",
    "kd_list_shared_articles_v1"
  ]
}
```

Der Client aktiviert die Checkbox **Anonym veroeffentlichen** nur, wenn
`hasBlogPublicationCapability` dieses Objekt vollstaendig akzeptiert. Fehlende
RPC, alte Version, HTTP-Fehler, unbekannte Zusatzform, `enabled: false` oder
eine nicht ausdruecklich sichere Legacyprojektion ergeben `unavailable`. Ein
alter Server kann damit niemals einen erfolgreichen anonymen Einstieg
vortaeuschen. Private Speicherung bleibt unabhaengig davon verfuegbar.

## Schreib-RPCs

Alle v1-RPCs verlangen ein aktives authentifiziertes Konto. `account_id` kommt
ausschliesslich aus `auth.uid()`. Der Client sendet weder Account-ID noch Autor,
Quellentags, Pruefzeitpunkte oder Quellenrevisionen.

### Publish und Update

- `kd_publish_blog_v1(p_request jsonb)` verlangt
  `expectedPublicRevision: null` und legt bei fehlender Owner-Zuordnung die
  Publikation an.
- `kd_update_blog_publication_v1(p_request jsonb)` verlangt eine positive,
  exakt aktuelle `expectedPublicRevision` und aktualisiert dieselbe
  `publication_id`; es entsteht kein zweiter Beitrag.

Beide erhalten dieselbe Requestform:

```json
{
  "contractVersion": "blog-publication-v1",
  "operationId": "UUID",
  "contentVersion": "UUID",
  "privateArticleId": "kontogebundene Artikel-ID, 1..160 Zeichen",
  "expectedPublicRevision": null,
  "article": {
    "title": "1..240 Zeichen",
    "text": "nicht leer",
    "ordered": true,
    "references": [
      {
        "rowId": "private stabile Zeilen-ID, 1..160 Zeichen",
        "rank": 1,
        "title": "1..240 Zeichen",
        "year": 1977,
        "mediaType": "film",
        "identityHints": [
          { "namespace": "imdb", "value": "tt0076759" },
          { "namespace": "tmdb", "value": "11" }
        ],
        "resolutionIntent": { "kind": "auto" }
      }
    ]
  }
}
```

`year` darf `null` sein; `mediaType` ist `film`, `serie`, `musik` oder
`sonstiges`. `rowId` bleibt beim Umordnen stabil, `rank` ist innerhalb des
Requests lueckenlos 1..n. Derselbe `workKey` darf in mehreren Zeilen stehen;
Zeilen werden nicht nach Werk dedupliziert.

`identityHints` ist optional, enthaelt hoechstens vier Eintraege und darf je
Namespace hoechstens einen Wert fuehren. Erlaubt sind ausschliesslich
`imdb`, `tmdb`, `watchmode` und `film_at`, jeweils mit der bereits am privaten
Eintrag vorhandenen nichtleeren ID als String. Das Feld transportiert keine
private Mediathek-Referenz, kein `rowId`-fremdes Ziel und keine Quelle. Der
Server prueft jeden Hinweis gegen den zentralen Katalog bzw. das zentrale
Programm und gegen Titel, Jahr und Medientyp; er vertraut keinen Client-IDs
blind. Widerspruechliche starke IDs ergeben `decision_required` oder einen
Fachfehler, niemals eine stille Titelzuordnung. Verifizierte gemeinsame starke
IDs haben beim Abgleich Vorrang.

`resolutionIntent` ist genau eine der Formen:

```json
{ "kind": "auto" }
{ "kind": "keep_redlink" }
{ "kind": "confirm_work", "workKey": "serverseitig bestaetigte Werkkennung" }
```

`confirm_work` ist nur gueltig, wenn der Server das Werk im zentralen Bestand
mit Titel, Jahr, Typ und starken IDs bestaetigt. Freie Aliase, ungepruefte
Client-Quellentags und rein unscharfe Titelgleichheit werden abgelehnt. Bei
gleichnamigen Werken mit abweichendem Jahr oder widerspruechlichen IDs entsteht
keine stille Zuordnung. Ein offener Mehrfachtreffer liefert
`decision_required`; `keep_redlink` loest ihn bewusst ohne Publikationssperre.

Erfolgs- und Fachantwort:

```json
{
  "contractVersion": "blog-publication-v1",
  "outcome": "published",
  "operationId": "UUID",
  "contentVersion": "UUID",
  "publication": {
    "publicationId": "UUID",
    "shareToken": "UUID",
    "publicRevision": 1,
    "publishedContentVersion": "UUID",
    "updatedAt": "RFC-3339-Zeitpunkt"
  },
  "referenceResults": [],
  "decisionRequests": []
}
```

`outcome` ist bei Publish `published`, bei Update `updated`, ansonsten
`decision_required` oder `conflict`. `referenceResults` enthaelt nur fuer den
Owner `rowId`, die servererzeugte `referenceId`, den Aufloesungszustand und den
oeffentlichen `workKey`. `decisionRequests` enthaelt fuer betroffene `rowId`
kleine Kandidaten `{ workKey, title, year, mediaType }`; keine kompletten
Katalogzeilen. Ein Fachfehler schreibt keine Publikation. Ein unbekannter
Transportausgang wird clientseitig als `unknown` behandelt und per
Owner-Readback geklaert.

### Ruecknahme

`kd_withdraw_blog_publication_v1(p_request jsonb)` erhaelt:

```json
{
  "contractVersion": "blog-publication-v1",
  "operationId": "UUID",
  "privateArticleId": "kontogebundene Artikel-ID",
  "expectedPublicRevision": 3
}
```

Die Antwort hat `outcome: "withdrawn"` oder bei bereits fehlender Zuordnung
`outcome: "absent"`, jeweils mit derselben `operationId`. Nur der Owner darf
die Zuordnung adressieren. Erst `withdrawn`/`absent` erlaubt B, bei einer
Gesamtloeschung anschliessend den privaten Artikel zu entfernen. Fehler oder
`unknown` lassen den privaten Artikel und den moeglicherweise oeffentlichen
Status sichtbar.

Bei abweichender Revision ist die Antwort eindeutig und veraendert nichts:

```json
{
  "contractVersion": "blog-publication-v1",
  "outcome": "conflict",
  "operationId": "UUID",
  "publicationId": "UUID",
  "expectedPublicRevision": 2,
  "actualPublicRevision": 3,
  "errorCode": "PUBLIC_REVISION_CONFLICT"
}
```

B uebernimmt danach den aktuellen Owner-Readback. Es darf `conflict` weder als
`withdrawn` noch als `absent` behandeln und darf den privaten Artikel nicht
loeschen.

### Owner-Readback und gezielte Wiederholung

`kd_read_own_blog_publication_v1(p_request jsonb)` liefert den aktuellen
Owner-Publikationsstand unabhaengig davon, ob eine Operation aussteht. Der
Request lautet exakt:

```json
{
  "contractVersion": "blog-publication-v1",
  "privateArticleId": "kontogebundene Artikel-ID",
  "operationId": null
}
```

`operationId` darf fehlen oder `null` sein. Eine UUID fragt zusaetzlich genau
diese Operation ab. Die Antwortform bleibt in allen Faellen gleich:

```json
{
  "contractVersion": "blog-publication-v1",
  "privateArticleId": "kontogebundene Artikel-ID",
  "currentPublication": {
    "publicationId": "UUID",
    "shareToken": "UUID",
    "publicRevision": 3,
    "publishedContentVersion": "UUID",
    "updatedAt": "RFC-3339-Zeitpunkt"
  },
  "operation": null,
  "legacyReloadRequired": false
}
```

`currentPublication` ist entweder dieses Objekt oder `null`; es beschreibt
immer den zum Antwortzeitpunkt committed Owner-Zustand. Die
`publishedContentVersion` ist nur im unten beschriebenen Legacyfall `null`.
Bei einer angefragten Operation ist `operation` entweder `null` (noch kein
Ledger-Eintrag) oder:

```json
{
  "operationId": "UUID",
  "action": "publish",
  "status": "applied",
  "result": { "outcome": "published" },
  "errorCode": null
}
```

`action` ist `publish`, `update` oder `withdraw`; `status` ist `applied`,
`not_applied`, `unknown` oder `conflict`. Bei `applied` enthaelt `result` die
vollstaendige urspruengliche Mutationantwort. `not_applied` hat `result: null`
und einen Fachfehlercode. `unknown` behauptet keinen Erfolg. `conflict` mit
`OPERATION_ID_CONFLICT` bedeutet, dass dieselbe UUID bereits an einen anderen
normalisierten Request gebunden ist; diese Operation wird nie wiederholt.

Beim normalen Neu-/Reload fragt B mit `operationId: null` und ersetzt seinen
lokalen Publikationsstand durch `currentPublication`, auch wenn lokal keine
Operation aussteht. So bleiben Update und Ruecknahme nach Konto- oder
Geraetewechsel moeglich. Eine alte eindeutig zuordenbare Publikation ohne
Content-Version liefert das Objekt mit `publishedContentVersion: null` und
`legacyReloadRequired: true`. B laedt zuerst den privaten Artikel neu, erzeugt
beim naechsten privaten Speichern eine frische `contentVersion` und behandelt
die Kopie bis zum erfolgreichen Update als `private_changes`. Ist keine
Owner-Zuordnung vorhanden, lautet der Zustand `currentPublication: null`,
`legacyReloadRequired: false`. Eine nicht eindeutig einem privaten Artikel
zuordenbare Legacyzeile wird nicht als dessen Publikation ausgegeben; die
Capability darf in diesem Serverzustand nicht `legacyProjectionSafe: true`
melden.

Bei `unknown` darf der Client hoechstens den bytegleich normalisierten Request
mit derselben `operationId` wiederholen. Die aktuelle Publikation aus derselben
Readback-Antwort bleibt trotzdem massgeblich fuer Anzeige und Revision.

Der Server bindet eine Operation an Konto, Artikel, Aktionsart und Hash des
normalisierten Requests. Dadurch ist Wiederholung idempotent. Eine neue lokale
Aenderung erhaelt zuerst eine neue `contentVersion` und danach eine neue
`operationId`; sie darf eine ausstehende alte Antwort nicht uebernehmen.

## Serverseitiger Referenzabgleich

Der Server verarbeitet hoechstens 15 Referenzen gebuendelt. Er verwendet alle
vorhandenen zentralen Streamingquellen und das vorhandene Programm unabhaengig
von der Quellenauswahl des Verfassers. Vorrang haben gemeinsame starke IDs.
Ohne gemeinsame ID ist nur ein eindeutiger Kandidat mit normalisiertem Titel
oder bestaetigtem Katalogalias, passendem Jahr und Medientyp zulaessig.

Der Aufloesungszustand ist `matched`, `not_found`, `ambiguous`, `unchecked`
oder `error`. `ambiguous` braucht vor der Publikation eine Entscheidung.
`unchecked` und `error` sind weder `not_found` noch Rotlinkbeweise. Ein
technischer Fehler darf bestehende Werkidentitaet nicht loeschen.

Eine oeffentliche Referenz hat folgende Form:

```json
{
  "referenceId": "serverseitig erzeugte stabile ID",
  "rank": 1,
  "title": "Star Wars: A New Hope",
  "year": 1977,
  "mediaType": "film",
  "resolution": {
    "status": "matched",
    "workKey": "opaque-public-work-key",
    "identityHints": [
      { "namespace": "imdb", "value": "tt0076759" },
      { "namespace": "tmdb", "value": "11" }
    ]
  },
  "sources": {
    "status": "checked",
    "checkedAt": "RFC-3339-Zeitpunkt",
    "validUntil": "RFC-3339-Zeitpunkt",
    "streamingRevision": "vorhandene source_revision",
    "cinemaRevision": "vorhandener Programmstand",
    "streaming": [
      {
        "kind": "streaming",
        "sourceId": "disney",
        "art": "programm",
        "ref": "vorhandene Karten-ID",
        "titel": "Anzeigetitel",
        "sourceRevision": "Revision",
        "checkedAt": "RFC-3339-Zeitpunkt",
        "validUntil": "RFC-3339-Zeitpunkt"
      }
    ],
    "cinema": []
  }
}
```

`resolution.identityHints` ist eine optionale additive Projektion mit hoechstens
vier Eintraegen und hoechstens einem Wert je Namespace. Sie ist nur bei
`status: "matched"` zulaessig und enthaelt ausschliesslich starke Identitaeten,
die der Server am exakt bestaetigten zentralen Werk gefunden hat. Reihenfolge
ist `imdb`, `tmdb`, `watchmode`, `film_at`. Der Server kopiert weder
ungepruefte Request-Hinweise noch private Mediathek-IDs in dieses Feld.
Widerspruechliche oder unbekannte Eingaben ergeben weiterhin
`decision_required` beziehungsweise keinen Match; sie erscheinen niemals in
der oeffentlichen Aufloesung. Fehlen am bestaetigten Werk starke Identitaeten,
wird `identityHints` weggelassen.

`sourceId` ist bei Streaming exakt eine der kanonischen vorhandenen
Backend-Service-IDs aus `BLOG_STREAMING_SOURCE_IDS`. Unbekannte IDs und freie
Provideranzeigenamen sind ungueltig. Kinoziele verwenden dieselben Zeitfelder
sowie ausschliesslich `kind: "cinema"`, `art: "programm"` und als `ref` die
zentrale `film_at_id`. Private Mediathek-IDs, `art: "film"` und
`kind: "library"` sind in jeder oeffentlichen Payload verboten.

Zielgueltigkeit ist ein halboffenes Intervall
`checkedAt <= now < validUntil`; `sourceRevision` muss vorhanden sein.
`sources.validUntil` begrenzt zusaetzlich den gesamten positiven wie negativen
Quellennachweis. Es ist auch Pflicht, wenn `streaming` und `cinema` leer sind;
nach Ablauf wird ein fehlendes Ziel zu `unchecked`, nicht zu einem dauerhaften
Rotlink. Sind fuer eine vom Leser gewaehlte Streamingquelle nur abgelaufene
Ziele vorhanden, bleibt diese Referenz `unchecked`, selbst wenn ein aktuelles
Ziel eines nicht gewaehlten Dienstes vorliegt. Nicht gewaehlte Dienste duerfen
weder `available` noch die Aktualitaet der Leserentscheidung begruenden.
Fehlt `resolution.status` oder liegt er ausserhalb der definierten Werte,
lautet der Leserzustand ebenfalls `unchecked`. Im
Browser wird `now` ausdruecklich injiziert. Lokale SQL-Tests leiten die Zeiten
relativ zu `clock_timestamp()` ab oder verschieben die Fixture-Zeiten als
Ganzes. Die statischen Zeiten in `blog-contract-v1.json` duerfen niemals gegen
die reale Wanduhr als aktuell interpretiert werden.

Hintergrundpflege aktualisiert nur Quellenfelder, wenn Publikation,
`contentVersion`, `referenceId` und Werkidentitaet noch dieselben sind. Sie
veraendert keinen Text, Rang, privaten Aenderungsstatus oder Ruecknahmestatus
und stellt keine entfernte Publikation wieder her. Gleiche Werke koennen die
zentrale Aufloesung wiederverwenden, behalten in jedem Artikel aber getrennte
`referenceId` und Rangposition.

## Paginierte gemeinsame Liste

`kd_list_shared_articles_v1(p_request jsonb)` erhaelt exakt:

```json
{
  "contractVersion": "blog-publication-v1",
  "limit": 20,
  "cursor": null
}
```

`limit` liegt zwischen 1 und 50. Der opake Cursor bindet Snapshotzeit,
Sortierschluessel `(updated_at, publication_id)` und Vertragsversion. Die erste
Antwort setzt `snapshotAt`; Folgeseiten bleiben an diesem Snapshot und liefern
keine Duplikate durch zwischenzeitliche Updates.

```json
{
  "contractVersion": "blog-publication-v1",
  "snapshotAt": "RFC-3339-Zeitpunkt",
  "items": [],
  "nextCursor": null,
  "complete": true
}
```

Jedes Item enthaelt ausschliesslich `publicationId`, `shareToken`, den neutralen
`author`, `publicRevision`, `contentVersion`, `publishedAt`, `updatedAt` und
`article`. `article` enthaelt `id = publicationId`, `title`, `text`, `ordered`
und die vorbereiteten Referenzen. Konto-ID, Login, E-Mail, privater
`article_id`, private `rowId`, private `liste[].ref`, persoenliche Besitzdaten,
interne Matchkandidaten und freie Payload-Zusatzfelder fehlen.

Die Liste loest beim Lesen nichts gegen Streaming oder Kino auf. B filtert die
vorbereiteten aktuellen Streamingziele nach der aktuellen Quellenauswahl des
Lesers, fuegt einen stark aufgeloesten privaten Mediathektreffer hinzu und nutzt
gueltige Kinoziele. `projectBlogReferenceForReader` ist die einzige gemeinsame
Zustandsableitung. Fehlende Mediathekbereitschaft, ungepruefte Quellen,
Mehrdeutigkeit oder Quellenfehler ergeben `unchecked`. Erst bei geladenem
Eigenbestand und geprueftem Quellenstand darf das Fehlen nutzbarer Ziele als
`redlink` erscheinen.

## Legacy-List/Claim-Kompatibilitaet

`kd_list_shared_articles()` bleibt parameterlos und liefert weiterhin exakt
die Spalten `publication_id`, `share_token`, `article_id`, `author`, `payload`,
`updated_at`. `kd_claim_shared_article(uuid)` behaelt dieselben Spalten plus
`claimed` und seine atomare Einmal-Semantik. Beide werden serverseitig aus der
v1-Projektion erzeugt:

- `article_id = publication_id::text`
- `author = 'Ohne Namensangabe'`
- `payload.id = publication_id::text`
- `payload.autor = 'Ohne Namensangabe'`
- `payload` enthaelt fuer alte Leser nur `id`, `titel`, `autor`, `text`,
  `geordnet`, `erstellt_am` und `liste[{ eingabe, jahr, typ }]`

So bleiben vorhandene Parser und Claim-Snapshots funktionsfaehig, ohne private
IDs oder Autorendaten zu leaken. Alte List-/Claim-Signaturen werden weder
umbenannt noch um Pflichtparameter erweitert.

Der ausgelieferte Produktionsclient entfernt seine eigene oeffentliche Kopie
noch ueber `DELETE kd_shared_articles?article_id=eq...&select=publication_id`
mit `return=representation`. Dafuer besitzt `authenticated` ausschliesslich
`DELETE` sowie Spalten-SELECT auf `article_id` und `publication_id`; Owner- und
Aktivkonto-RLS gelten fuer Auswahl und Loeschung. Direkter INSERT und UPDATE
bleiben ohne Tabellenrecht und ohne RLS-Policy gesperrt. Listen- und
Claim-Antworten kommen weiterhin nur aus den anonymisierten Funktionen und
enthalten weder Autor- noch private Artikel- oder Referenz-IDs. Erst mit dieser
Kompatibilitaet darf die Capability `legacyProjectionSafe: true` melden.

## Anwendung-zu-UI-Vertrag

C erhaelt von B kontrollierte Props und ruft keine Shared-Article-RPC direkt
auf. Die Blogoberflaeche konsumiert folgende schmale Objekte:

```text
publicationCapability:
  { status: "checking"|"ready"|"unavailable", reason: string|null }

view:
  { area: "mine"|"published",
    mode: "list"|"editor"|"reader"|"redlink_form",
    articleId: string|null, returnToken: string|null }

editor:
  { draftKey, accountScope, articleId, contentVersion, title, text, ordered,
    references, anonymousPublication, dirty, saveStatus }

reader:
  null|{ scope: "private"|"published",
    article: { articleId, title, text, ordered },
    referenceViews, canEdit: boolean, returnToken: string }

redlinkForm:
  null|{ articleId, rowId, status: "open"|"saving"|"failed",
    initial: { titel, jahr, typ }, errorCode: string|null }

articleCards:
  [{ articleId, title, excerpt, updatedAt, displayState,
     referencePreview, publicationError }]

publishedPage:
  { status, items, nextCursor, complete, errorCode }

actions:
  onNewArticle()
  onEditArticle({ articleId })
  onReadArticle({ scope, articleId, returnToken })
  onBack({ returnToken })
  onEditorChange(patch)
  onAddReference({ draftKey, reference })
  onMoveReference({ draftKey, rowId, direction: "up"|"down" })
  onRemoveReference({ draftKey, rowId })
  onSave({ draftKey, anonymousPublication }) -> Promise<SaveResult>
  onReferenceDecision({ articleId, rowId, decision }) -> Promise<ActionResult>
  onNavigateReference({ referenceId, target }) -> Promise<ActionResult>|void
  onOpenRedlinkForm({ articleId, rowId })
  onCancelRedlinkForm({ articleId, rowId })
  onConfirmRedlinkForm({ articleId, rowId, mediaInput }) -> Promise<ActionResult>
  onRetryPublication({ articleId, operationId }) -> Promise<SaveResult>
  onWithdraw({ articleId }) -> Promise<MutationResult>
  onDelete({ articleId }) -> Promise<DeleteResult>
  onLoadPublished({ cursor, replace }) -> Promise<ActionResult>
```

`draftKey` und `accountScope` verhindern, dass Tabwechsel oder Kontowechsel
einen fremden Entwurf uebernehmen. `anonymousPublication` startet fuer einen
neuen Editor immer `false`; Umschalten allein ruft keine Aktion. B bewahrt den
Wert innerhalb desselben offenen Entwurfs. C zeigt bei `checking` oder
`unavailable` keinen aktivierbaren anonymen Publish-Einstieg.

`view` ist die einzige kontrollierte Navigation innerhalb des Blogbereichs.
B setzt sie fuer Neu, Bearbeiten, Lesen, Rotlinkformular und Zurueck; C haelt
keinen zweiten Ansichtsautomaten. `reader.article.text` ist immer der volle
Artikeltext der gewaehlten privaten oder oeffentlichen Fassung, kein Karten-
Excerpt. `returnToken` ist opak und wird bei `onBack` unveraendert
zurueckgegeben, damit Seite, Auswahl und Listenposition erhalten bleiben.

`onNewArticle` oeffnet einen kontogebundenen Entwurf mit neuer stabiler
`draftKey`, leerem Text und `anonymousPublication: false`.
`onAddReference` fuegt eine Zeile mit von B erzeugter stabiler `rowId` und dem
naechsten Rang hinzu. `onMoveReference` aendert nur die lueckenlosen `rank`-
Werte; `rowId` bleibt gleich. `onRemoveReference` adressiert ebenfalls nur die
`rowId`. C erzeugt oder ersetzt keine Zeilenidentitaet.

`onSave` persistiert zuerst privat. Das Promise liefert beide Teilergebnisse:

```text
SaveResult.private:
  { status: "saved"|"failed", articleId, contentVersion|null,
    errorCode|null }

SaveResult.publication:
  { status: "not_requested"|"published"|"updated"|
            "decision_required"|"conflict"|"failed"|"unknown",
    operationId|null, publicationId|null, publicRevision|null,
    publishedContentVersion|null, decisionRequests[], errorCode|null }
```

Bei privatem Fehler ist Publikation `not_requested`. Bei Publish-Fehler bleibt
`private.status = saved`; C zeigt **Privat gespeichert, Veroeffentlichung
fehlgeschlagen**. `unknown` zeigt keinen Erfolg und aktiviert nur die gezielte
Wiederholung derselben Operation nach Owner-Readback. Nach einer weiteren
Text-/Listenänderung darf die alte Operation nicht erneut gesendet werden.

Die uebrigen Promiseformen sind ebenfalls fest:

```text
ActionResult:
  { status: "saved"|"opened"|"cancelled"|"loaded"|"failed",
    articleId|null, rowId|null, mediaWriteConfirmed: boolean|null,
    reference: { rowId, title, year, mediaType, linked: boolean }|null,
    errorCode|null }

MutationResult fuer onWithdraw:
  { status: "withdrawn"|"absent"|"conflict"|"failed"|"unknown",
    operationId, publicationId|null,
    expectedPublicRevision: number|null, actualPublicRevision: number|null,
    errorCode|null }

DeleteResult:
  { publication:
      { status: "withdrawn"|"absent"|"conflict"|"failed"|"unknown",
        operationId|null, expectedPublicRevision: number|null,
        actualPublicRevision: number|null, errorCode|null },
    private:
      { status: "deleted"|"kept"|"failed",
        articleId, errorCode|null } }
```

`onReferenceDecision` bestaetigt `status: saved` erst nach dem privaten Write.
`onNavigateReference` darf synchron `void` liefern; wenn Navigation ein Ziel
nicht findet, liefert sie `ActionResult.status = failed` und behaelt den Leser.
`onLoadPublished` liefert `loaded` erst nach akzeptierter v1-Seite. Bei Cursor-
oder Versionsfehler verwirft B die angefangene Folgeseite, nicht die bereits
sichtbare erste Seite.

Die primäre Aktion folgt ausschliesslich `blogSaveIntent`:

| Oeffentliche Kopie | Checkbox | Intent / Beschriftung |
|---|---|---|
| nein | aus | `private_only` / Privat speichern |
| nein | an | `publish` / Speichern & veroeffentlichen |
| ja | aus | `private_only` / Aenderungen privat speichern |
| ja | an | `update` / Speichern & aktualisieren |

`blogPublicationDisplayState` leitet aus `publicationId`, aktueller
`contentVersion` und `publishedContentVersion` genau `private`, `published`
oder `private_changes` ab. B und C fuehren dafuer keinen zweiten Automaten.

`onReferenceDecision` akzeptiert dieselben drei `resolutionIntent`-Formen wie
der Write-Request. Umordnen aendert nur `rank`; `rowId`, bestaetigter `workKey`
und oeffentliche `referenceId` bleiben stabil. `onOpenRedlinkForm` setzt die
kontrollierte `view.mode = redlink_form` und `redlinkForm` mit den Daten der
Zeile. C rendert darin die vorhandene `FilmForm` aus `EintragForm.jsx`.
`onCancelRedlinkForm` liefert ohne Write zur vorherigen `view` zurueck und
erhaelt Entwurf und Rotlink. `onConfirmRedlinkForm` uebergibt deren
`mediaInput`; erst nach bestaetigtem eigenen Mediathek-Write und danach
bestaetigtem privaten Artikelwrite liefert B `status: saved`,
`mediaWriteConfirmed: true` und die aktualisierten neutralen Referenzdaten.
Die private Mediathek-ID bleibt in B und wird nie Bestandteil der Props oder
der oeffentlichen Referenz. Bei einem der Fehler bleibt das Formular mit
`status: failed` offen. `onNavigateReference`
akzeptiert nur die oben genannten Zielobjekte; C konstruiert keine IDs aus
Titeltext.

`onDelete` liefert getrennt `publication` und `private`; private Loeschung ist
nur nach bestaetigtem `withdrawn`/`absent` zulaessig. Fremde Publikationen
erhalten diese Aktionen nie.

## Paketnaehte und zusaetzliche exklusive Write-Dateien

### Paket A: SQL/Backend

A implementiert die sechs v1-RPCs, Operationsledger, interne stabile
Referenzzuordnung, sichere neue/Legacy-Projektionen, Katalog-/Programmmatching
und begrenzte Hintergrundpflege. Empfohlene zusaetzliche exklusive Dateien im
bereits zugewiesenen Scope:

- eine additive `supabase/migrations/*_blog_publication_v1.sql`
- `blog_backend_pg_test.mjs`
- `blog_reference_refresh_pg_test.mjs`

Die bestehenden Shared-/Streamingmigrationen werden nicht rueckwirkend
editiert. Schemaabbilder aktualisiert nur A.

### Paket B: Service/App/State

B implementiert Capability, v1-RPC-Adapter, Owner-Readback, accountgebundenen
Entwurf, Content-/Operationsversionen, Teilergebnisse und die persoenliche
Referenzprojektion. Es bindet die vorhandenen App-Ziele an die v1-Zielobjekte.
Empfohlene neue exklusive Datei:

- `src/controllers/useBlogPublicationController.js`
- `src/lib/blogReferenceProjection.js` nur als Adapter fuer Mediathekindex;
  die gemeinsame Zustandsableitung bleibt in `blogContract.js`
- `blog_reference_projection_test.mjs`

`src/services/sharedArticles.js`, `src/App.jsx`, `src/lib/sharedPublication.js`
und die benannten bestehenden Tests bleiben B zugeordnet.

### Paket C: Blog-UI

C baut Editor, Karten, Leseansicht und Referenzaktionen nur gegen die obigen
Props und die gemeinsame Fixture. Es besitzt keine zweite Publish-,
Capability-, Matching-, Ablauf- oder Kontozustandslogik. Empfohlene neue
exklusive Dateien:

- `src/components/blog/**`
- `src/styles/blog.css`
- `blog_compact_ui_test.mjs`

`src/tabs/BlogTab.jsx` bleibt C zugeordnet. App, Service, Controller, globale
Styles, Package-/Lockdateien und Testregistrierung werden von C nicht
veraendert.

## Neutrale Fixture und fokussierter Nachweis

`tests/fixtures/blog-contract-v1.json` enthaelt eine nummerierte synthetische
Star-Wars-Liste mit eigener Mediathek, nur Streaming, nur Kino, Rotlink,
ungepruefter Quelle, gleichem Titel bei abweichendem Jahr, abgelaufenem Kino
und mehrfach dargestelltem selben Werk. Zwei synthetische Konten besitzen
verschiedene Quellenwahl und Mediathekziele. Die oeffentliche Seite enthaelt
keine dieser Konto- oder privaten Zeilenkennungen.

`node blog_contract_test.mjs` prueft Capability, Privacy, stabile Identitaet,
maximale Referenzzahl, Lesersicht, echte App-Zielformen, injizierte Uhr,
Rotlink-/Ungeprueft-Grenze, Checkbox-Intents, Versionsanzeige und Teilerfolge.
Der spaetere Integrationsadapter darf die Fixture-Zeit relativ zur lokalen
PostgreSQL-Uhr verschieben; dafuer ist keine neue Produkt- oder
Providerinfrastruktur erforderlich.
