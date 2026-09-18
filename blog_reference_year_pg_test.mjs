import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startBlogPublicationPgHarness } from "./tools/blog-publication-pg-harness.mjs";

const YEAR_MIGRATION = "supabase/migrations/20260918170000_blog_reference_v2_years.sql";

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
const uuid = (prefix, value) =>
  `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const reference = (rowId, rank, title, year, mediaType) => ({
  rowId,
  rank,
  title,
  year,
  mediaType,
  resolutionIntent: { kind: "keep_redlink" },
});
const filmReferences = (count) => Array.from({ length: count }, (_, index) =>
  reference(
    `row-${String(index + 1).padStart(3, "0")}`,
    index + 1,
    `Film ${String(index + 1).padStart(3, "0")}`,
    1950 + (index % 75),
    "film",
  ));
const request = ({
  operation,
  articleId,
  references,
  contractVersion = "blog-publication-v2",
}) => ({
  contractVersion,
  operationId: uuid("9", operation),
  contentVersion: uuid("a", operation),
  privateArticleId: articleId,
  expectedPublicRevision: null,
  article: {
    title: `Artikel ${articleId}`,
    text: "Volltext",
    ordered: true,
    references,
  },
});

const harness = await startBlogPublicationPgHarness();
try {
  harness.sql(readFileSync(YEAR_MIGRATION, "utf8"), {
    role: "postgres",
    accountId: null,
  });

  const historical = [
    reference("music-1824", 1, "Sinfonie Nr. 9", 1824, "musik"),
    reference("book-1605", 2, "Don Quijote", 1605, "sonstiges"),
  ];
  const privateValue = JSON.stringify({
    artikel: [{
      id: "historical-works",
      titel: "Historische Werke",
      text: "Volltext",
      liste: historical.map((item) => ({
        eingabe: item.title,
        jahr: item.year,
        typ: item.mediaType,
      })),
    }],
  });
  harness.sql(`insert into public.kd_personal(key,value)
    values ('kd:artikel','${privateValue.replaceAll("'", "''")}');`, {
    role: "authenticated",
    accountId: harness.accounts.alpha,
  });
  const saved = harness.sqlJson(`select value::jsonb->'artikel'->0->'liste'
    from public.kd_personal where key='kd:artikel';`, {
    role: "authenticated",
    accountId: harness.accounts.alpha,
  });
  check("Privater PG-Save erhält Musik 1824 und Buch 1605",
    saved.length === 2
    && saved[0].jahr === 1824 && saved[0].typ === "musik"
    && saved[1].jahr === 1605 && saved[1].typ === "sonstiges");

  const historicalRequest = request({
    operation: 1,
    articleId: "historical-works",
    references: historical,
  });
  const published = harness.callRpc("kd_publish_blog_v2", historicalRequest);
  check("v2 publiziert Musik 1824 und Buch 1605 vollständig",
    published.outcome === "published"
    && published.referenceResults.length === 2);

  const stored = harness.sqlJson(`select coalesce(jsonb_agg(jsonb_build_object(
      'rank',rank,'title',title,'year',release_year,'mediaType',media_type)
      order by rank),'[]'::jsonb)
    from public.kd_blog_publication_references
    where publication_id='${published.publication.publicationId}'::uuid;`);
  check("Persistente Referenzspalten bewahren beide historischen Jahre und Typen",
    stored.length === 2
    && stored[0].year === 1824 && stored[0].mediaType === "musik"
    && stored[1].year === 1605 && stored[1].mediaType === "sonstiges");

  const ownerReadback = harness.callRpc("kd_read_own_blog_publication_v2", {
    contractVersion: "blog-publication-v2",
    privateArticleId: "historical-works",
    operationId: historicalRequest.operationId,
  });
  const publicReadback = harness.callRpc("kd_list_shared_articles_v2", {
    contractVersion: "blog-publication-v2",
    limit: 20,
    cursor: null,
  }).items.find((item) => item.publicationId === published.publication.publicationId);
  check("Owner- und öffentliche v2-Projektion lesen die Publikation zurück",
    ownerReadback.currentPublication.publicationId === published.publication.publicationId
    && ownerReadback.operation.status === "applied"
    && publicReadback.article.references.length === 2
    && publicReadback.article.references[0].year === 1824
    && publicReadback.article.references[0].mediaType === "musik"
    && publicReadback.article.references[1].year === 1605
    && publicReadback.article.references[1].mediaType === "sonstiges");

  const invalidCases = [
    ["v1 lehnt Musik 1824 weiterhin ab", "blog-publication-v1", "musik", 1824],
    ["v2 lehnt Film 1869 weiterhin ab", "blog-publication-v2", "film", 1869],
    ["v2 lehnt Serie 1869 weiterhin ab", "blog-publication-v2", "serie", 1869],
    ["v2 lehnt Musik im Jahr 0 ab", "blog-publication-v2", "musik", 0],
    ["v2 lehnt Sonstiges im Jahr 2201 ab", "blog-publication-v2", "sonstiges", 2201],
  ];
  invalidCases.forEach(([name, contractVersion, mediaType, year], index) => {
    const candidate = request({
      operation: 10 + index,
      articleId: `invalid-year-${index}`,
      references: [reference(`invalid-${index}`, 1, `Ungültig ${index}`, year, mediaType)],
      contractVersion,
    });
    expectFailure(name,
      () => harness.callRpc(
        contractVersion === "blog-publication-v1" ? "kd_publish_blog_v1" : "kd_publish_blog_v2",
        candidate,
      ),
      /invalid_blog_reference/);
  });

  const v1Fifteen = harness.callRpc("kd_publish_blog_v1", request({
    operation: 20,
    articleId: "v1-fifteen",
    references: filmReferences(15),
    contractVersion: "blog-publication-v1",
  }));
  check("v1-Grenze bleibt bei 15 und akzeptiert genau 15",
    v1Fifteen.outcome === "published" && v1Fifteen.referenceResults.length === 15);

  const v2Fifty = harness.callRpc("kd_publish_blog_v2", request({
    operation: 21,
    articleId: "v2-fifty",
    references: filmReferences(50),
  }));
  check("v2-Grenze bleibt bei 50 und akzeptiert genau 50",
    v2Fifty.outcome === "published" && v2Fifty.referenceResults.length === 50);

  expectFailure("v2 weist 51 Referenzen weiterhin vor dem Write ab",
    () => harness.callRpc("kd_publish_blog_v2", request({
      operation: 22,
      articleId: "v2-fifty-one",
      references: filmReferences(51),
    })),
    /invalid_blog_publication_request/);
  check("Abgewiesene 51er-Anfrage erzeugt keine Publikation",
    Number(harness.sqlJson(`select to_jsonb(count(*)) from public.kd_shared_articles
      where article_id='v2-fifty-one';`)) === 0);

  console.log(`blog_reference_year_pg_test: ${checks} Checks bestanden.`);
} finally {
  harness.stop();
}
