import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { startBlogPublicationPgHarness } from "./tools/blog-publication-pg-harness.mjs";

let checks = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  checks += 1;
  console.log(`✓ ${name}`);
};
const id = (prefix, value) => `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const scaled = (number, rank = 1) => ({
  rowId: `scale-row-${number}`,
  rank,
  title: `Scale Film ${String(number).padStart(5, "0")}`,
  year: 1950 + (number % 75),
  mediaType: "film",
  identityHints: [{ namespace: "imdb", value: `tt${String(7_000_000 + number).padStart(7, "0")}` }],
  resolutionIntent: { kind: "auto" },
});
const request = (number, articleId, references) => ({
  contractVersion: "blog-publication-v1",
  operationId: id("3", number),
  contentVersion: id("4", number),
  privateArticleId: articleId,
  expectedPublicRevision: null,
  article: { title: `Scale article ${number}`, text: "Synthetic scale payload", ordered: true, references },
});
const timed = (fn) => {
  const start = performance.now();
  const value = fn();
  return { value, ms: Math.round((performance.now() - start) * 10) / 10 };
};

const harness = await startBlogPublicationPgHarness();
try {
  harness.seedScaleCatalog();
  const dimensions = harness.sqlJson(`select jsonb_build_object(
    'base',(select count(*) from public.kd_streaming_page_base),
    'motn',(select count(*) from public.kd_streaming_page_motn));`);
  check("Skalierungstest nutzt den produktionsnahen 24.678+1.115-Katalog",
    dimensions.base === 24_678 && dimensions.motn === 1_115);
  assert.throws(() => harness.sql("select count(*) from public.kd_blog_catalog_works_setwise();"),
    /permission denied/, "Browserrolle darf die interne Rohprojektion nicht aufrufen");
  checks += 1;
  console.log("✓ Interne Mengenprojektion bleibt fuer Browserrollen gesperrt");

  const internalSql = { role: "postgres", accountId: null };
  const snapshotReuse = harness.sqlJson(`set local statement_timeout='8s';
    create temporary table kd_blog_scale_timings(cold_ms numeric,warm_ms numeric) on commit drop;
    do $timing$
    declare v_started timestamptz; v_cold numeric; v_warm numeric;
    begin
      v_started:=clock_timestamp();
      perform 1 from public.kd_blog_catalog_works() limit 1;
      v_cold:=extract(epoch from clock_timestamp()-v_started)*1000;
      v_started:=clock_timestamp();
      perform 1 from public.kd_blog_catalog_works() limit 1;
      v_warm:=extract(epoch from clock_timestamp()-v_started)*1000;
      insert into kd_blog_scale_timings values(v_cold,v_warm);
    end
    $timing$;
    select jsonb_build_object('coldMs',round(cold_ms,1),'warmMs',round(warm_ms,1))
      from kd_blog_scale_timings;`, internalSql);
  check("Eine Transaktion baut den verifizierten Katalog einmal und nutzt danach den privaten Snapshot",
    snapshotReuse.coldMs > 0 && snapshotReuse.warmMs >= 0
    && snapshotReuse.coldMs < 8_000 && snapshotReuse.warmMs < snapshotReuse.coldMs);

  const coldLimit = timed(() => harness.sqlJson(`set local statement_timeout='8s';
    select to_jsonb(q) from (
      select work_key,title,release_year,media_type
      from public.kd_blog_catalog_works()
      where not identity_conflict
        and coalesce(jsonb_array_length(identities->'imdb'),0)>0
        and media_type in ('film','serie') and title is not null
        and jsonb_array_length(coalesce(sources->'streaming','[]'::jsonb))>0
      limit 1
    ) q;`, internalSql));
  const warmLimit = timed(() => harness.sqlJson(`set local statement_timeout='8s';
    select to_jsonb(q) from (
      select work_key,title,release_year,media_type
      from public.kd_blog_catalog_works()
      where not identity_conflict
        and coalesce(jsonb_array_length(identities->'imdb'),0)>0
        and media_type in ('film','serie') and title is not null
        and jsonb_array_length(coalesce(sources->'streaming','[]'::jsonb))>0
      limit 1
    ) q;`, internalSql));
  check("Kalter und warmer LIMIT-1-Katalogpfad bleiben unter dem belegten 8s-Limit",
    coldLimit.value.work_key && warmLimit.value.work_key && coldLimit.ms < 8_000 && warmLimit.ms < 8_000);

  const strongReference = scaled(24_678);
  const strong = timed(() => harness.sqlJson(`set local statement_timeout='8s';
    select public.kd_blog_resolve_reference('${JSON.stringify(strongReference).replaceAll("'", "''")}'::jsonb);`, internalSql));
  check("Eine starke verifizierte IMDb-ID loest im 25k-Katalog eindeutig auf",
    strong.value.resolution.status === "matched" && strong.value.resolution.workKey
    && strong.value.sources.streaming.length === 1 && strong.ms < 8_000);

  const missing = timed(() => harness.sqlJson(`set local statement_timeout='8s';
    select public.kd_blog_resolve_reference('{"rowId":"missing","rank":1,"title":"Scale Missing Work","year":2035,"mediaType":"film","resolutionIntent":{"kind":"auto"}}'::jsonb);`, internalSql));
  check("Nichttreffer bleibt ein ehrlicher Rotlink mit endlichem Quellenbeleg",
    missing.value.resolution.status === "not_found" && missing.value.resolution.workKey === null
    && missing.value.sources.status === "checked" && missing.ms < 8_000);

  const ambiguous = timed(() => harness.sqlJson(`set local statement_timeout='8s';
    select public.kd_blog_resolve_reference('{"rowId":"ambiguous","rank":1,"title":"Scale Ambiguous Twin","year":2000,"mediaType":"film","resolutionIntent":{"kind":"auto"}}'::jsonb);`, internalSql));
  check("Titelgleiche Werke mit verschiedenen starken IDs bleiben getrennte Kandidaten",
    ambiguous.value.resolution.status === "ambiguous"
    && ambiguous.value.decisionCandidates.length === 2
    && new Set(ambiguous.value.decisionCandidates.map((entry) => entry.workKey)).size === 2
    && ambiguous.ms < 8_000);

  const one = timed(() => harness.callRpc("kd_publish_blog_v1",
    request(501, "scale-publish-one", [strongReference])));
  check("Publish mit einer Referenz bleibt im 25k-Katalog vollstaendig und zeitlich begrenzt",
    one.value.outcome === "published" && one.value.referenceResults.length === 1
    && one.value.referenceResults[0].resolutionStatus === "matched" && one.ms < 8_000);

  const fifteenReferences = Array.from({ length: 15 }, (_, index) => scaled(24_000 + index, index + 1));
  const fifteen = timed(() => harness.callRpc("kd_publish_blog_v1",
    request(502, "scale-publish-fifteen", fifteenReferences)));
  check("Publish mit maximal 15 Referenzen scannt den Katalog nicht quadratisch",
    fifteen.value.outcome === "published" && fifteen.value.referenceResults.length === 15
    && fifteen.value.referenceResults.every((entry) => entry.resolutionStatus === "matched")
    && fifteen.ms < 8_000);

  console.log(`catalog-scale timings ms: ${JSON.stringify({
    snapshotCold: snapshotReuse.coldMs,
    snapshotWarm: snapshotReuse.warmMs,
    coldLimit: coldLimit.ms,
    warmLimit: warmLimit.ms,
    strongResolve: strong.ms,
    missingResolve: missing.ms,
    ambiguousResolve: ambiguous.ms,
    publishOne: one.ms,
    publishFifteen: fifteen.ms,
  })}`);
  console.log(`blog_catalog_scale_pg_test: ${checks} Checks bestanden.`);
} finally {
  harness.stop();
}
