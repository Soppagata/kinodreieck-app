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
  const job = harness.scheduledRefreshJob();
  check("Migration bindet einen begrenzten Refresh an den vorhandenen Scheduler",
    job.jobname === "kd-blog-reference-refresh-v1" && job.schedule === "*/5 * * * *"
    && job.command === "select public.kd_run_blog_reference_refresh_batch(50);");

  const mainRequest = publishRequest(101, "refresh-main", "Refresh Hauptartikel", [
    reference("row-known", 1, "Star Wars: A New Hope", 1977),
    reference("row-future", 2, "Future Catalog Arrival", 2030),
    reference("row-broken", 3, "Broken Retry Fixture", 2032),
    reference("row-missing-a", 4, "Missing Fixture A", 2033),
    reference("row-missing-b", 5, "Missing Fixture B", 2034),
    reference("row-kept", 6, "Deliberate Redlink", 2031, { kind: "keep_redlink" }),
  ]);
  const secondRequest = publishRequest(102, "refresh-second", "Refresh Zweitartikel", [
    reference("row-empire", 1, "Star Wars: The Empire Strikes Back", 1980),
  ]);
  const main = harness.callRpc("kd_publish_blog_v1", mainRequest);
  const second = harness.callRpc("kd_publish_blog_v1", secondRequest);
  check("Frischer Quellenstand erzeugt Treffer, endlichen Negativbeleg und bewussten Rotlink",
    main.outcome === "published" && main.referenceResults[0].resolutionStatus === "matched"
    && main.referenceResults.slice(1).every((entry) => entry.resolutionStatus === "not_found"));

  const list = () => harness.callRpc("kd_list_shared_articles_v1", {
    contractVersion: "blog-publication-v1", limit: 50, cursor: null,
  });
  const item = (publicationId) => list().items.find((entry) => entry.publicationId === publicationId);
  const initialNegative = item(main.publication.publicationId).article.references
    .find((entry) => entry.title === "Future Catalog Arrival");
  check("Auch ein Nullziel besitzt eine endliche Quellen-Gueltigkeit",
    initialNegative.sources.status === "checked" && initialNegative.sources.streaming.length === 0
    && Number.isFinite(Date.parse(initialNegative.sources.validUntil)));
  expectFailure("Browserrollen koennen die Hintergrundpflege nicht starten",
    () => harness.callRpc("kd_refresh_blog_reference_sources_v1", { limit: 2 }),
    /permission denied|service_role required/);

  harness.sql(`update public.kd_blog_publication_references
    set resolution_input=jsonb_set(resolution_input,'{identityHints}','{}'::jsonb,true)
    where publication_id='${main.publication.publicationId}'::uuid and title='Broken Retry Fixture';`,
    { role: "service_role", accountId: null });
  const changedRows = harness.defaultStreamingRows.map((row) => {
    if (row.sourceKey === "stream-new-hope") return { ...row, services: ["Prime Video"] };
    if (row.sourceKey === "stream-empire") return { ...row, services: ["Netflix"] };
    return row;
  }).concat([{ sourceKey: "stream-future", title: "Future Catalog Arrival", year: 2030,
    type: "film", services: ["MUBI"], watchmode: "future-2030", imdb: "tt2030000", tmdb: "2030000" }]);
  const beforeSourceGeneration = harness.sqlJson(`select to_jsonb(s) from
    (select requested_generation,completed_generation from public.kd_blog_reference_refresh_state where singleton) s;`);
  harness.sourceUpdate({ streamingRows: changedRows, sourceRevision: 2 });
  const afterSourceGeneration = harness.sqlJson(`select to_jsonb(s) from
    (select requested_generation,completed_generation,scan_complete from public.kd_blog_reference_refresh_state where singleton) s;`);
  check("Quellenrevision markiert nur persistent neue Arbeit und loest keinen synchronen Vollscan aus",
    afterSourceGeneration.requested_generation > beforeSourceGeneration.requested_generation
    && afterSourceGeneration.scan_complete === false);

  let totalErrors = 0;
  let totalScanned = 0;
  let queueState;
  for (let turn = 0; turn < 30; turn += 1) {
    const result = harness.callRpc("kd_refresh_blog_reference_sources_v1", { limit: 2 },
      { role: "service_role", accountId: null });
    totalErrors += result.errors;
    totalScanned += result.scanned;
    queueState = harness.sqlJson(`select jsonb_build_object(
      'scanComplete',s.scan_complete,'requested',s.requested_generation,'completed',s.completed_generation,
      'pending',(select count(*) from public.kd_blog_reference_refresh_queue),
      'retrying',(select count(*) from public.kd_blog_reference_refresh_queue where attempt_count>0))
      from public.kd_blog_reference_refresh_state s where singleton;`);
    if (queueState.scanComplete && queueState.pending === 1 && queueState.retrying === 1) break;
  }
  const refreshedMain = item(main.publication.publicationId);
  const refreshedSecond = item(second.publication.publicationId);
  const healed = refreshedMain.article.references.find((entry) => entry.title === "Future Catalog Arrival");
  const refreshedKnown = refreshedMain.article.references.find((entry) => entry.title.includes("New Hope"));
  check("Kleine Batches erreichen trotz Teilfehler alle spaeteren faelligen Einheiten",
    totalScanned > 2 && totalErrors === 1 && queueState.scanComplete
    && queueState.pending === 1 && queueState.retrying === 1
    && healed.resolution.status === "matched" && healed.sources.streaming[0].sourceId === "mubi"
    && refreshedKnown.sources.streaming[0].sourceId === "prime"
    && refreshedSecond.article.references[0].sources.streaming[0].sourceId === "netflix");
  check("Quellenpflege aendert weder Text, Rang noch Publikationsrevision",
    refreshedMain.article.text === mainRequest.article.text && refreshedMain.publicRevision === 1
    && refreshedMain.article.references.map((entry) => entry.rank).join(",") === "1,2,3,4,5,6");

  harness.sql(`update public.kd_blog_publication_references
    set resolution_input=jsonb_set(resolution_input,'{identityHints}','[]'::jsonb,true)
    where publication_id='${main.publication.publicationId}'::uuid and title='Broken Retry Fixture';
    update public.kd_blog_reference_refresh_queue set available_at=now() where attempt_count>0;`,
    { role: "service_role", accountId: null });
  for (let turn = 0; turn < 10; turn += 1) {
    harness.callRpc("kd_refresh_blog_reference_sources_v1", { limit: 2 },
      { role: "service_role", accountId: null });
    queueState = harness.sqlJson(`select jsonb_build_object(
      'complete',completed_generation=requested_generation,
      'pending',(select count(*) from public.kd_blog_reference_refresh_queue))
      from public.kd_blog_reference_refresh_state where singleton;`);
    if (queueState.complete && queueState.pending === 0) break;
  }
  check("Reparierte Teilfehler werden gezielt wiederaufgenommen und verlassen danach die Queue",
    queueState.complete === true && queueState.pending === 0);

  const generationBeforeNoop = harness.sqlJson(`select requested_generation
    from public.kd_blog_reference_refresh_state where singleton;`);
  harness.sql(`update public.kd_streaming_page_state set source_revision=source_revision where singleton;
    update public.kd_catalog set payload=payload where name='programm';`,
    { role: "service_role", accountId: null });
  const noop = harness.callRpc("kd_refresh_blog_reference_sources_v1", { limit: 2 },
    { role: "service_role", accountId: null });
  const generationAfterNoop = harness.sqlJson(`select requested_generation
    from public.kd_blog_reference_refresh_state where singleton;`);
  check("Unveraenderte Quellen erzeugen keine neue Vollwiederholung",
    generationAfterNoop === generationBeforeNoop && noop.enqueued === 0 && noop.scanned === 0);

  const old = Date.now() - 4 * 24 * 60 * 60 * 1000;
  harness.sourceUpdate({
    streamingRows: changedRows, sourceRevision: 3,
    streamingGeneratedAt: new Date(old).toISOString(),
    programPayload: { filme: [] }, programUpdatedAt: new Date(old).toISOString(),
    programValidUntil: new Date(old + 24 * 60 * 60 * 1000).toISOString(),
  });
  const scheduled = harness.runScheduledRefresh();
  const expired = item(main.publication.publicationId);
  check("Der echte Schedulerpfad verarbeitet die markierte Teilmenge resolverfrei vom Listenlesen",
    scheduled.scanned > 0 && scheduled.limit === 50);
  check("Abgelaufene Quellen werden ungeprueft und zerstoeren Artikel oder Werkidentitaet nicht",
    expired.article.text === mainRequest.article.text
    && expired.article.references.filter((entry) => ["Star Wars: A New Hope", "Future Catalog Arrival"].includes(entry.title))
      .every((entry) => entry.resolution.status === "matched" && entry.resolution.workKey
        && entry.sources.status === "unchecked"));

  const withdrawn = harness.callRpc("kd_withdraw_blog_publication_v1", {
    contractVersion: "blog-publication-v1", operationId: id("3", 103),
    privateArticleId: "refresh-main", expectedPublicRevision: 1,
  });
  harness.sourceUpdate({ streamingRows: changedRows, sourceRevision: 4 });
  harness.runScheduledRefresh();
  check("Quellenpflege erweckt eine zurueckgezogene Publikation nicht wieder",
    withdrawn.outcome === "withdrawn" && item(main.publication.publicationId) === undefined);

  console.log(`blog_reference_refresh_pg_test: ${checks} Checks bestanden.`);
} finally {
  harness.stop();
}
