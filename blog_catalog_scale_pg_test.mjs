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
    'motn',(select count(*) from public.kd_streaming_page_motn),
    'program',(select jsonb_array_length(payload->'filme') from public.kd_catalog where name='programm'));`);
  check("Skalierungstest nutzt produktionsnahe 24.678+1.115 Streaming- und 753 Kinodatensaetze",
    dimensions.base === 24_678 && dimensions.motn === 1_115 && dimensions.program === 753);
  const functionConfig = harness.sqlJson(`select to_jsonb(p.proconfig) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='kd_blog_catalog_works_setwise';`,
  { role: "postgres", accountId: null });
  check("Setwise-Projektion begrenzt JIT- und Sortkosten nur innerhalb der Backendfunktion",
    functionConfig.includes("jit=off") && functionConfig.includes("work_mem=16MB"));
  assert.throws(() => harness.sql("select count(*) from public.kd_blog_catalog_works_setwise();"),
    /permission denied/, "Browserrolle darf die interne Rohprojektion nicht aufrufen");
  assert.throws(() => harness.sql("select count(*) from public.kd_blog_catalog_work('work:forged');"),
    /permission denied/, "Browserrolle darf den internen Indexlookup nicht aufrufen");
  checks += 1;
  console.log("✓ Interne Mengenprojektion und Indexlookup bleiben fuer Browserrollen gesperrt");

  const internalSql = { role: "postgres", accountId: null };
  const snapshotReuse = harness.sqlJson(`set local statement_timeout='8s';
    create temporary table kd_blog_scale_timings(
      cold_ms numeric,srf_ms numeric,direct_ms numeric,catalog_rows bigint,
      streaming_targets bigint,wide_targets integer,average_source_bytes numeric,max_source_bytes integer,
      direct_index boolean
    ) on commit drop;
    do $timing$
    declare
      v_started timestamptz; v_cold numeric; v_srf numeric; v_direct numeric;
      v_work_key text; v_rows bigint; v_targets bigint; v_wide integer; v_average numeric; v_max integer;
      v_plan jsonb;
    begin
      v_started:=clock_timestamp();
      perform 1 from public.kd_blog_catalog_works() limit 1;
      v_cold:=extract(epoch from clock_timestamp()-v_started)*1000;
      execute 'select work_key from pg_temp.kd_blog_catalog_snapshot
        where identities @> ''{"imdb":["tt7011045"]}''::jsonb' into v_work_key;
      v_started:=clock_timestamp();
      perform work_key from public.kd_blog_catalog_works() where work_key=v_work_key;
      v_srf:=extract(epoch from clock_timestamp()-v_started)*1000;
      v_started:=clock_timestamp();
      execute 'select work_key from pg_temp.kd_blog_catalog_snapshot where work_key=$1'
        into v_work_key using v_work_key;
      v_direct:=extract(epoch from clock_timestamp()-v_started)*1000;
      execute 'explain (format json) select work_key from pg_temp.kd_blog_catalog_snapshot where work_key=$1'
        into v_plan using v_work_key;
      execute 'select count(*),sum(jsonb_array_length(sources->''streaming'')),
        round(avg(pg_column_size(sources)),1),max(pg_column_size(sources))
        from pg_temp.kd_blog_catalog_snapshot'
        into v_rows,v_targets,v_average,v_max;
      execute 'select jsonb_array_length(sources->''streaming'')
        from pg_temp.kd_blog_catalog_snapshot where title=''Scale Wide Sources'''
        into v_wide;
      insert into kd_blog_scale_timings values(
        v_cold,v_srf,v_direct,v_rows,v_targets,v_wide,v_average,v_max,
        v_plan::text like '%kd_blog_catalog_snapshot_work_key_idx%');
    end
    $timing$;
    select jsonb_build_object(
      'coldMs',round(cold_ms,1),'srfMs',round(srf_ms,1),'directMs',round(direct_ms,1),
      'catalogRows',catalog_rows,'streamingTargets',streaming_targets,
      'wideTargets',wide_targets,
      'averageSourceBytes',average_source_bytes,'maxSourceBytes',max_source_bytes,
      'directIndex',direct_index)
      from kd_blog_scale_timings;`, internalSql);
  console.log(`catalog-scale fixture: ${JSON.stringify(snapshotReuse)}`);
  check("Skalierungsfixture bildet 25.304 Werke und 11.181 Streamingziele samt breiter Quelle ab",
    snapshotReuse.catalogRows === 25_304 && snapshotReuse.streamingTargets === 11_181
    && snapshotReuse.wideTargets === 128
    && snapshotReuse.averageSourceBytes > 100 && snapshotReuse.maxSourceBytes > 1_000);
  check("Direkter Temp-Tabellen-Lookup nutzt den Index statt alle SRF-Zeilen zu filtern",
    snapshotReuse.coldMs > 0 && snapshotReuse.coldMs < 8_000
    && snapshotReuse.directIndex === true && snapshotReuse.directMs < snapshotReuse.srfMs / 5);

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

  const strongReference = scaled(11_045);
  const strong = timed(() => harness.sqlJson(`set local statement_timeout='8s';
    select public.kd_blog_resolve_reference('${JSON.stringify(strongReference).replaceAll("'", "''")}'::jsonb);`, internalSql));
  check("Eine starke verifizierte IMDb-ID loest im 25k-Katalog eindeutig auf",
    strong.value.resolution.status === "matched" && strong.value.resolution.workKey
    && strong.value.sources.streaming.length === 1
    && strong.value.sources.streaming[0].sourceId === "mubi" && strong.ms < 8_000);

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
    request(501, "scale-publish-one", [strongReference]), { statementTimeoutMs: 8_000 }));
  check("Publish mit einer Referenz bleibt im 25k-Katalog vollstaendig und zeitlich begrenzt",
    one.value.outcome === "published" && one.value.referenceResults.length === 1
    && one.value.referenceResults[0].resolutionStatus === "matched" && one.ms < 8_000);

  const fifteenReferences = Array.from({ length: 15 }, (_, index) => scaled(11_000 + index, index + 1));
  const fifteen = timed(() => harness.callRpc("kd_publish_blog_v1",
    request(502, "scale-publish-fifteen", fifteenReferences), { statementTimeoutMs: 8_000 }));
  check("Publish mit maximal 15 Referenzen scannt den Katalog nicht quadratisch",
    fifteen.value.outcome === "published" && fifteen.value.referenceResults.length === 15
    && fifteen.value.referenceResults.every((entry) => entry.resolutionStatus === "matched")
    && fifteen.ms < 8_000);

  console.log(`catalog-scale timings ms: ${JSON.stringify({
    snapshotCold: snapshotReuse.coldMs,
    srfLookup: snapshotReuse.srfMs,
    directLookup: snapshotReuse.directMs,
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
