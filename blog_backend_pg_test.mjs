import assert from "node:assert/strict";
import { startBlogPublicationPgHarness } from "./tools/blog-publication-pg-harness.mjs";

let checks = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  checks += 1;
  console.log(`✓ ${name}`);
};
const expectFailure = (name, fn, pattern) => {
  assert.throws(fn, pattern, name);
  checks += 1;
  console.log(`✓ ${name}`);
};
const id = (prefix, value) => `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const newHope = (rank = 1) => ({
  rowId: "row-new-hope", rank, title: "Star Wars: A New Hope", year: 1977, mediaType: "film",
  identityHints: [{ namespace: "imdb", value: "tt0076759" }], resolutionIntent: { kind: "auto" },
});
const jedi = (rank = 2) => ({
  rowId: "row-jedi", rank, title: "Star Wars: Return of the Jedi", year: 1983, mediaType: "film",
  identityHints: [{ namespace: "film_at", value: "fixture-film-at-jedi" }], resolutionIntent: { kind: "auto" },
});
const request = ({ op, content, articleId, expected = null, title = "Fixture Artikel", text = "Volltext", references = [] }) => ({
  contractVersion: "blog-publication-v1",
  operationId: id("3", op), contentVersion: id("4", content), privateArticleId: articleId,
  expectedPublicRevision: expected,
  article: { title, text, ordered: true, references },
});

const harness = await startBlogPublicationPgHarness();
try {
  const capability = harness.callRpc("kd_blog_publication_capabilities", undefined, { role: "anon", accountId: null });
  check("Capability ist anonym lesbar und meldet exakt die v1-RPCs",
    capability.contractVersion === "blog-publication-v1" && capability.enabled === true
    && capability.rpcs.length === 5 && capability.legacyProjectionSafe === true);

  const publishRequest = request({ op: 1, content: 1, articleId: "private-alpha-main", references: [newHope(), jedi()] });
  expectFailure("Anon kann nicht publizieren",
    () => harness.callRpc("kd_publish_blog_v1", publishRequest, { role: "anon", accountId: null }),
    /permission denied|authenticated account required/);
  expectFailure("Inaktives Konto bleibt fail-closed",
    () => harness.callRpc("kd_publish_blog_v1", publishRequest, { accountId: harness.accounts.inactive }),
    /account_inactive/);
  expectFailure("Manipulierte Zusatzfelder wie accountId werden abgelehnt",
    () => harness.callRpc("kd_publish_blog_v1", { ...publishRequest, accountId: harness.accounts.beta }),
    /invalid_blog_publication_request/);

  const published = harness.callRpc("kd_publish_blog_v1", publishRequest);
  check("Aktives Konto publiziert anonym mit serverseitigen IDs und Revision 1",
    published.outcome === "published" && published.publication.publicRevision === 1
    && published.referenceResults.length === 2
    && published.referenceResults.every((entry) => entry.resolutionStatus === "matched"));
  const replay = harness.callRpc("kd_publish_blog_v1", publishRequest);
  check("Bytegleich wiederholte Operation ist idempotent",
    JSON.stringify(replay) === JSON.stringify(published));
  const operationConflict = harness.callRpc("kd_publish_blog_v1", {
    ...publishRequest, article: { ...publishRequest.article, text: "Manipulierter zweiter Inhalt" },
  });
  check("Gleiche operationId mit anderem Request kollidiert",
    operationConflict.outcome === "conflict" && operationConflict.errorCode === "OPERATION_ID_CONFLICT");

  const readback = harness.callRpc("kd_read_own_blog_publication_v1", {
    contractVersion: "blog-publication-v1", privateArticleId: "private-alpha-main",
    operationId: publishRequest.operationId,
  });
  check("Owner-Readback liefert aktuellen Stand und den bemerkten Operationskonflikt",
    readback.currentPublication.publicationId === published.publication.publicationId
    && readback.currentPublication.publishedContentVersion === publishRequest.contentVersion
    && readback.operation.status === "conflict" && readback.operation.errorCode === "OPERATION_ID_CONFLICT");
  const foreignReadback = harness.callRpc("kd_read_own_blog_publication_v1", {
    contractVersion: "blog-publication-v1", privateArticleId: "private-alpha-main", operationId: null,
  }, { accountId: harness.accounts.beta });
  check("Anderes Konto erhaelt weder Publikation noch Operation des Owners",
    foreignReadback.currentPublication === null && foreignReadback.operation === null);

  const publicPage = harness.callRpc("kd_list_shared_articles_v1", {
    contractVersion: "blog-publication-v1", limit: 20, cursor: null,
  }, { role: "anon", accountId: null });
  const publicText = JSON.stringify(publicPage);
  const publicItem = publicPage.items.find((item) => item.publicationId === published.publication.publicationId);
  const cinemaTarget = publicItem.article.references.find((entry) => entry.title.includes("Jedi")).sources.cinema[0];
  const streamingTarget = publicItem.article.references.find((entry) => entry.title.includes("New Hope")).sources.streaming[0];
  check("Oeffentliche Projektion enthaelt Volltext, neutrale Metadaten und echte zentrale Ziele",
    publicItem.author === "Ohne Namensangabe" && publicItem.article.text === "Volltext"
    && streamingTarget.sourceId === "netflix" && cinemaTarget.art === "programm"
    && cinemaTarget.ref === "fixture-film-at-jedi");
  check("Oeffentliche Projektion enthaelt keine Konto-, private Artikel- oder Zeilen-ID",
    !publicText.includes(harness.accounts.alpha) && !publicText.includes("private-alpha-main")
    && !publicText.includes("row-new-hope") && !publicText.includes('"kind":"library"'));

  const badUpdate = request({ op: 2, content: 2, articleId: "private-alpha-main", expected: 99,
    text: "Neue private Fassung", references: [newHope(), jedi()] });
  const updateConflict = harness.callRpc("kd_update_blog_publication_v1", badUpdate);
  check("Update mit veralteter Revision veraendert nichts und liefert beide Revisionen",
    updateConflict.outcome === "conflict" && updateConflict.expectedPublicRevision === 99
    && updateConflict.actualPublicRevision === 1);
  const updateRequest = request({ op: 3, content: 3, articleId: "private-alpha-main", expected: 1,
    text: "Aktualisierter Volltext", references: [jedi(1), newHope(2)] });
  const updated = harness.callRpc("kd_update_blog_publication_v1", updateRequest);
  const firstIds = Object.fromEntries(published.referenceResults.map((entry) => [entry.rowId, entry.referenceId]));
  check("Update behaelt Publikations- und Zeilenidentitaet trotz Umordnung",
    updated.outcome === "updated" && updated.publication.publicationId === published.publication.publicationId
    && updated.publication.publicRevision === 2
    && updated.referenceResults.every((entry) => firstIds[entry.rowId] === entry.referenceId));
  const currentWithoutOperation = harness.callRpc("kd_read_own_blog_publication_v1", {
    contractVersion: "blog-publication-v1", privateArticleId: "private-alpha-main", operationId: null,
  });
  check("Owner-Readback liefert den aktuellen Stand auch ohne ausstehende Operation",
    currentWithoutOperation.operation === null
    && currentWithoutOperation.currentPublication.publicRevision === 2
    && currentWithoutOperation.currentPublication.publishedContentVersion === updateRequest.contentVersion);

  const ambiguousRequest = request({ op: 4, content: 4, articleId: "private-alpha-twin", references: [{
    rowId: "row-twin", rank: 1, title: "Synthetic Twin", year: 2000, mediaType: "film",
    resolutionIntent: { kind: "auto" },
  }] });
  const ambiguous = harness.callRpc("kd_publish_blog_v1", ambiguousRequest);
  check("Mehrdeutige starke Identitaeten blockieren statt falsch zu matchen",
    ambiguous.outcome === "decision_required" && ambiguous.decisionRequests.length === 1);
  const redlinkRequest = request({ op: 5, content: 5, articleId: "private-alpha-twin", references: [{
    ...ambiguousRequest.article.references[0], resolutionIntent: { kind: "keep_redlink" },
  }] });
  const redlink = harness.callRpc("kd_publish_blog_v1", redlinkRequest);
  check("Bewusster Rotlink kann ohne falsche Werkzuordnung publiziert werden",
    redlink.outcome === "published" && redlink.referenceResults[0].resolutionStatus === "not_found"
    && redlink.referenceResults[0].workKey === null);

  const remakeRequest = request({ op: 6, content: 6, articleId: "private-alpha-remake", references: [{
    rowId: "row-remake", rank: 1, title: "Synthetic Remake", year: 1984, mediaType: "film",
    resolutionIntent: { kind: "auto" },
  }] });
  const remake = harness.callRpc("kd_publish_blog_v1", remakeRequest);
  check("Gleicher Titel mit anderem Jahr wird nicht zusammengelegt",
    remake.outcome === "published" && remake.referenceResults[0].resolutionStatus === "matched");
  const forgedIdentity = harness.callRpc("kd_publish_blog_v1", request({
    op: 13, content: 13, articleId: "private-alpha-forged-id", references: [{
      rowId: "row-forged", rank: 1, title: "Star Wars: A New Hope", year: 1977, mediaType: "film",
      identityHints: [{ namespace: "film_at", value: "private-library-id" }], resolutionIntent: { kind: "auto" },
    }],
  }));
  check("Unbestaetigte starke Client-ID wird nicht blind als Werk oder Kinoziel uebernommen",
    forgedIdentity.outcome === "decision_required"
    && !JSON.stringify(forgedIdentity).includes("private-library-id"));

  const lostRequest = request({ op: 7, content: 7, articleId: "private-alpha-lost", references: [] });
  const lostPublished = harness.callRpc("kd_publish_blog_v1", lostRequest);
  const lostReadback = harness.callRpc("kd_read_own_blog_publication_v1", {
    contractVersion: "blog-publication-v1", privateArticleId: "private-alpha-lost", operationId: lostRequest.operationId,
  });
  check("Verlorene Publish-Antwort ist per Ledger vollstaendig ruecklesbar",
    lostReadback.operation.status === "applied"
    && lostReadback.operation.result.publication.publicationId === lostPublished.publication.publicationId);

  for (let number = 8; number <= 10; number += 1) {
    harness.callRpc("kd_publish_blog_v1", request({ op: number, content: number,
      articleId: `private-page-${number}`, title: `Seitenartikel ${number}`, references: [] }));
  }
  const seen = new Set(); let cursor = null; let complete = false; let pages = 0;
  while (!complete) {
    const page = harness.callRpc("kd_list_shared_articles_v1", {
      contractVersion: "blog-publication-v1", limit: 2, cursor,
    }, { role: "anon", accountId: null });
    pages += 1;
    for (const item of page.items) { assert.ok(!seen.has(item.publicationId)); seen.add(item.publicationId); }
    cursor = page.nextCursor; complete = page.complete;
  }
  check("Cursor-Pagination liefert mehrere Seiten ohne Duplikate", pages >= 3 && seen.size >= 6);

  const legacy = harness.sqlJson(`with inserted as (
    insert into public.kd_shared_articles(article_id,author,payload)
    values('private-legacy-secret','Echter Name','{"titel":"Legacy","text":"Alttext","geordnet":true,"liste":[{"eingabe":"Geheimfilm","jahr":1999,"typ":"film","ref":"private-media-secret"}],"account_id":"leak"}'::jsonb)
    returning publication_id,share_token) select to_jsonb(inserted) from inserted;`,
    { role: "service_role", accountId: harness.accounts.alpha });
  const legacyRows = harness.callRpc("kd_list_shared_articles", undefined, { role: "anon", accountId: null });
  const legacyRow = legacyRows.find((row) => row.publication_id === legacy.publication_id);
  check("Legacy-Liste behaelt Signatur und anonymisiert IDs, Autor und Payload",
    legacyRow.article_id === legacy.publication_id && legacyRow.author === "Ohne Namensangabe"
    && legacyRow.payload.autor === "Ohne Namensangabe"
    && !JSON.stringify(legacyRow).includes("private-legacy-secret")
    && !JSON.stringify(legacyRow).includes("private-media-secret")
    && !JSON.stringify(legacyRow).includes("Echter Name"));
  const legacyReadback = harness.callRpc("kd_read_own_blog_publication_v1", {
    contractVersion: "blog-publication-v1", privateArticleId: "private-legacy-secret", operationId: null,
  });
  check("Legacy-Owner-Readback fordert Reload ohne erfundene Content-Version",
    legacyReadback.legacyReloadRequired === true
    && legacyReadback.currentPublication.publishedContentVersion === null
    && legacyReadback.currentPublication.publicRevision === 1);
  const firstClaim = harness.callRpc("kd_claim_shared_article", { p_share_token: legacy.share_token }, { accountId: harness.accounts.beta });
  const secondClaim = harness.callRpc("kd_claim_shared_article", { p_share_token: legacy.share_token }, { accountId: harness.accounts.beta });
  check("Legacy-Claim bleibt atomar einmalig und liefert dieselbe sichere Projektion",
    firstClaim[0].claimed === true && secondClaim[0].claimed === false
    && firstClaim[0].article_id === legacy.publication_id
    && !JSON.stringify(firstClaim).includes("private-media-secret"));
  expectFailure("Inaktives Konto kann auch Legacy-Claim nicht ausfuehren",
    () => harness.callRpc("kd_claim_shared_article", { p_share_token: legacy.share_token }, { accountId: harness.accounts.inactive }),
    /account_inactive/);
  expectFailure("Authentifizierter Browser kann die Publikationstabelle nicht direkt manipulieren",
    () => harness.sql("delete from public.kd_shared_articles;", { role: "authenticated", accountId: harness.accounts.alpha }),
    /permission denied/);

  const withdrawConflict = harness.callRpc("kd_withdraw_blog_publication_v1", {
    contractVersion: "blog-publication-v1", operationId: id("3", 11),
    privateArticleId: "private-alpha-main", expectedPublicRevision: 1,
  });
  check("Withdraw-Konflikt ist eindeutig und loescht nichts",
    withdrawConflict.outcome === "conflict" && withdrawConflict.actualPublicRevision === 2);
  const withdrawn = harness.callRpc("kd_withdraw_blog_publication_v1", {
    contractVersion: "blog-publication-v1", operationId: id("3", 12),
    privateArticleId: "private-alpha-main", expectedPublicRevision: 2,
  });
  const afterWithdraw = harness.callRpc("kd_read_own_blog_publication_v1", {
    contractVersion: "blog-publication-v1", privateArticleId: "private-alpha-main", operationId: id("3", 12),
  });
  check("Erfolgreiche Ruecknahme entfernt nur die oeffentliche Kopie und bleibt ruecklesbar",
    withdrawn.outcome === "withdrawn" && afterWithdraw.currentPublication === null
    && afterWithdraw.operation.status === "applied");

  console.log(`blog_backend_pg_test: ${checks} Checks bestanden.`);
} finally {
  harness.stop();
}
