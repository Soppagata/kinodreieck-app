# Blog-Vertrag v1

Status: eingefrorene Grundlage F0 fuer die parallelen Pakete A, B und C

Version: `blog-publication-v1`

Grenze: lokale Implementierung; kein Deployment und kein gemeinsamer Datenbankwrite

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
- Programmziele nutzen `film_at_id`, soweit vorhanden. Die bestehende App
  navigiert zu Kino mit `{ kind: "cinema", art: "film"|"programm", ref,
  titel }`, zu Streaming mit `{ kind: "streaming",
  art: "programm"|"entdecken", ref, titel }` und zur Mediathek mit
  `{ kind: "library", ref, titel }`. v1 erfindet keine zweite Zielkennung.
- Private Artikelreferenzen (`liste[].ref` und die neue private `rowId`) bleiben
  kontogebunden. Eine gemeinsame Projektion erhaelt stattdessen eine
  servererzeugte `referenceId` und gegebenenfalls einen oeffentlichen,
  kataloggebundenen `workKey`.

## Gemeinsame Konstanten

Die kanonischen Werte stehen in `src/lib/blogContract.js`:

- Version `blog-publication-v1`
- maximal 15 Referenzen
- neutraler Autorenwert `Ohne Namensangabe`
- RPC-Namen, Referenz-/Quellen-/Anzeigezustaende und Save-Outcomes
- Fail-closed-Capabilitypruefung
- Ableitung `private` / `published` / `private_changes`
- genau eine leserseitige Referenzprojektion fuer B und C

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

### Owner-Readback und gezielte Wiederholung

`kd_read_own_blog_publication_v1(p_request jsonb)` erhaelt Version,
`privateArticleId` und die zu klaerende `operationId`. Es liefert eine der
atomaren Aussagen:

- `applied`: dieselbe Operation wurde committed; die urspruengliche
  Mutationantwort liegt bei.
- `not_applied`: die Operation wurde serverseitig abgeschlossen, ohne die
  Mutation anzuwenden; Fehlercode liegt bei.
- `unknown`: es gibt noch keinen abschliessenden Ledgerstand. Der Client darf
  keinen Erfolg behaupten und hoechstens den bytegleich normalisierten Request
  mit derselben `operationId` wiederholen.

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
  "resolution": { "status": "matched", "workKey": "opaque-public-work-key" },
  "sources": {
    "status": "checked",
    "checkedAt": "RFC-3339-Zeitpunkt",
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

Kinoziele verwenden dieselben Zeitfelder sowie `kind: "cinema"`,
`art: "film"|"programm"` und als `ref` die bestaetigte Mediathek-ID oder
`film_at_id`. Zielgueltigkeit ist ein halboffenes Intervall
`checkedAt <= now < validUntil`; `sourceRevision` muss vorhanden sein. Sind
nur abgelaufene Zielbelege vorhanden, lautet der Leserzustand bis zur
Quellenauffrischung `unchecked`, nicht Rotlink. Im
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
umbenannt noch um Pflichtparameter erweitert. Direkter authentifizierter
INSERT/UPDATE/DELETE auf `kd_shared_articles` wird fuer normale Clients
entzogen; neue Writes laufen ausschliesslich ueber die v1-RPCs. Erst danach
darf die Capability `legacyProjectionSafe: true` melden.

## Anwendung-zu-UI-Vertrag

C erhaelt von B kontrollierte Props und ruft keine Shared-Article-RPC direkt
auf. Die Blogoberflaeche konsumiert folgende schmale Objekte:

```text
publicationCapability:
  { status: "checking"|"ready"|"unavailable", reason: string|null }

editor:
  { draftKey, accountScope, articleId, contentVersion, title, text, ordered,
    references, anonymousPublication, dirty, saveStatus }

articleCards:
  [{ articleId, title, excerpt, updatedAt, displayState,
     referencePreview, publicationError }]

publishedPage:
  { status, items, nextCursor, complete, errorCode }

actions:
  onEditorChange(patch)
  onSave({ draftKey, anonymousPublication }) -> Promise<SaveResult>
  onReferenceDecision({ articleId, rowId, decision }) -> Promise<ActionResult>
  onNavigateReference({ referenceId, target }) -> Promise<ActionResult>|void
  onAddRedlink({ articleId, rowId }) -> Promise<ActionResult>
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
  { status: "saved"|"opened"|"loaded"|"failed",
    articleId|null, rowId|null, errorCode|null }

MutationResult fuer onWithdraw:
  { status: "withdrawn"|"absent"|"failed"|"unknown",
    operationId, publicationId|null, errorCode|null }

DeleteResult:
  { publication:
      { status: "withdrawn"|"absent"|"failed"|"unknown",
        operationId|null, errorCode|null },
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
und oeffentliche `referenceId` bleiben stabil. `onAddRedlink` darf erst nach
bestaetigtem eigenem Mediathek-Write die private Zeile verknuepfen; Abbruch
erhaelt Entwurf und Rotlink. `onNavigateReference` akzeptiert nur die oben
genannten Zielobjekte; C konstruiert keine IDs aus Titeltext.

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
