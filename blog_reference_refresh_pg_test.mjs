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
const reference = (rowId, rank, title, year, resolutionIntent = { kind: "auto" }) => ({
  rowId, rank, title, year, mediaType: "film", resolutionIntent,
});
const publishRequest = (number, articleId, title, references) => ({
  contractVersion: "blog-publication-v1", operationId: id("3", number), contentVersion: id("4", number),
  privateArticleId: articleId, expectedPublicRevision: null,
  article: { title, text: `Unveraenderlicher Text ${title}`, ordered: true, references },
});

const harness = await startBlogPublicationPgHarness();
try {
  const mainRequest = publishRequest(101, "refresh-main", "Refresh Hauptartikel", [
    reference("row-known", 1, "Star Wars: A New Hope", 1977),
    reference("row-future", 2, "Future Catalog Arrival", 2030),
    reference("row-kept", 3, "Deliberate Redlink", 2031, { kind: "keep_redlink" }),
  ]);
  const secondRequest = publishRequest(102, "refresh-second", "Refresh Zweitartikel", [
    reference("row-empire", 1, "Star Wars: The Empire Strikes Back", 1980),
  ]);
  const main = harness.callRpc("kd_publish_blog_v1", mainRequest);
  const second = harness.callRpc("kd_publish_blog_v1", secondRequest);
  check("Frischer Quellenstand erzeugt Treffer, datierten Negativbeleg und bewussten Rotlink",
    main.outcome === "published" && main.referenceResults[0].resolutionStatus === "matched"
    && main.referenceResults[1].resolutionStatus === "not_found"
    && main.referenceResults[2].resolutionStatus === "not_found");

  const list = () => harness.callRpc("kd_list_shared_articles_v1", {
    contractVersion: "blog-publication-v1", limit: 50, cursor: null,
  }, { role: "anon", accountId: null });
  const item = (publicationId) => list().items.find((entry) => entry.publicationId === publicationId);
  const initial = item(main.publication.publicationId);
  const negative = initial.article.references.find((entry) => entry.title === "Future Catalog Arrival");
  check("Auch ein Nullziel besitzt eine endliche Quellen-Gueltigkeit",
    negative.sources.status === "checked" && negative.sources.streaming.length === 0
    && Number.isFinite(Date.parse(negative.sources.validUntil)));

  expectFailure("Browserrollen koennen die Hintergrundpflege nicht starten",
    () => harness.callRpc("kd_refresh_blog_reference_sources_v1", { limit: 10, publicationId: main.publication.publicationId }),
    /permission denied|service_role required/);

  const changedRows = harness.defaultStreamingRows.map((row) => {
    if (row.sourceKey === "stream-new-hope") return { ...row, services: ["Prime Video"] };
    if (row.sourceKey === "stream-empire") return { ...row, services: ["Netflix"] };
    return row;
  }).concat([{ sourceKey: "stream-future", title: "Future Catalog Arrival", year: 2030,
    type: "film", services: ["MUBI"], watchmode: "future-2030", imdb: "tt2030000", tmdb: "2030000" }]);
  harness.sourceUpdate({ streamingRows: changedRows, sourceRevision: 2 });
  const targeted = harness.callRpc("kd_refresh_blog_reference_sources_v1", {
    limit: 100, publicationId: main.publication.publicationId,
  }, { role: "service_role", accountId: null });
  check("Gezielte Pflege bearbeitet nur eine begrenzte Publikationsmenge",
    targeted.status === "completed" && targeted.limit === 100 && targeted.scanned === 3
    && targeted.updated >= 2 && targeted.errors === 0);
  const refreshedMain = item(main.publication.publicationId);
  const refreshedSecond = item(second.publication.publicationId);
  const refreshedKnown = refreshedMain.article.references.find((entry) => entry.title.includes("New Hope"));
  const healed = refreshedMain.article.references.find((entry) => entry.title === "Future Catalog Arrival");
  const kept = refreshedMain.article.references.find((entry) => entry.title === "Deliberate Redlink");
  const untouchedEmpire = refreshedSecond.article.references[0];
  check("Neue zentrale Quelle heilt Auto-Rotlink und nutzt kanonische Service-ID",
    healed.resolution.status === "matched" && healed.sources.streaming[0].sourceId === "mubi"
    && refreshedKnown.sources.streaming[0].sourceId === "prime");
  check("Bewusster Rotlink bleibt bewusst und fremde Zielpublikation bleibt bis zu ihrer Teilpflege unveraendert",
    kept.resolution.status === "not_found" && untouchedEmpire.sources.streaming[0].sourceId === "disney");
  check("Quellenpflege aendert weder Text, Rang noch Publikationsrevision",
    refreshedMain.article.text === mainRequest.article.text
    && refreshedMain.publicRevision === 1
    && refreshedMain.article.references.map((entry) => entry.rank).join(",") === "1,2,3");

  const secondRefresh = harness.callRpc("kd_refresh_blog_reference_sources_v1", {
    limit: 1, publicationId: second.publication.publicationId,
  }, { role: "service_role", accountId: null });
  const updatedEmpire = item(second.publication.publicationId).article.references[0];
  check("Limit eins aktualisiert exakt eine weitere Teilmenge",
    secondRefresh.scanned === 1 && updatedEmpire.sources.streaming[0].sourceId === "netflix");

  const old = Date.now() - 4 * 24 * 60 * 60 * 1000;
  harness.sourceUpdate({
    streamingRows: changedRows, sourceRevision: 3,
    streamingGeneratedAt: new Date(old).toISOString(),
    programPayload: { filme: [] }, programUpdatedAt: new Date(old).toISOString(),
    programValidUntil: new Date(old + 24 * 60 * 60 * 1000).toISOString(),
  });
  harness.callRpc("kd_refresh_blog_reference_sources_v1", {
    limit: 100, publicationId: main.publication.publicationId,
  }, { role: "service_role", accountId: null });
  const expired = item(main.publication.publicationId);
  check("Abgelaufene zentrale Quellen werden ungeprueft statt verfuegbar oder falsch negativ",
    expired.article.references.every((entry) => entry.sources.status === "unchecked"
      || Date.parse(entry.sources.validUntil) <= Date.now())
    && expired.article.references.filter((entry) => entry.resolution.status === "matched")
      .every((entry) => entry.sources.streaming.every((target) => Date.parse(target.validUntil) <= Date.now())));
  check("Quellenausfall behaelt Artikel und bestaetigte Werkidentitaeten",
    expired.article.text === mainRequest.article.text
    && expired.article.references.filter((entry) => ["Star Wars: A New Hope", "Future Catalog Arrival"].includes(entry.title))
      .every((entry) => entry.resolution.status === "matched" && entry.resolution.workKey));

  harness.sourceUpdate({
    streamingRows: changedRows, sourceRevision: 4,
    programPayload: { filme: "invalid-program-shape" },
  });
  const malformed = harness.callRpc("kd_refresh_blog_reference_sources_v1", {
    limit: 100, publicationId: main.publication.publicationId,
  }, { role: "service_role", accountId: null });
  const afterMalformed = item(main.publication.publicationId);
  check("Fehlerhafte Programmquelle bleibt fail-closed und zerstoert keinen Blog",
    malformed.errors === 0
    && afterMalformed.article.references.filter((entry) => entry.resolution.status === "matched")
      .every((entry) => entry.sources.status === "unchecked")
    && afterMalformed.article.text === mainRequest.article.text);

  const withdrawn = harness.callRpc("kd_withdraw_blog_publication_v1", {
    contractVersion: "blog-publication-v1", operationId: id("3", 103),
    privateArticleId: "refresh-main", expectedPublicRevision: 1,
  });
  harness.sourceUpdate({ streamingRows: changedRows, sourceRevision: 5 });
  const afterWithdrawalRefresh = harness.callRpc("kd_refresh_blog_reference_sources_v1", {
    limit: 100, publicationId: main.publication.publicationId,
  }, { role: "service_role", accountId: null });
  check("Rueckgezogene Publikation wird durch Quellenpflege nicht wiedererweckt",
    withdrawn.outcome === "withdrawn" && afterWithdrawalRefresh.scanned === 0
    && item(main.publication.publicationId) === undefined);

  console.log(`blog_reference_refresh_pg_test: ${checks} Checks bestanden.`);
} finally {
  harness.stop();
}
