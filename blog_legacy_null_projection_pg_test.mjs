import assert from "node:assert/strict";
import { startBlogPublicationPgHarness } from "./tools/blog-publication-pg-harness.mjs";

let checks = 0;
const check = (name, condition) => { assert.ok(condition, name); checks += 1; console.log(`✓ ${name}`); };

const harness = await startBlogPublicationPgHarness({
  applyAuthorMigration: true,
  applyLegacyNullMigration: true,
});
try {
  const rows = harness.sqlJson(`with inserted as (
    insert into public.kd_shared_articles(article_id,author,payload,contract_version)
    values
      ('legacy-null','Legacy Name','{"titel":"Alt ohne Version","text":"Alttext","geordnet":false,"liste":[]}'::jsonb,null),
      ('legacy-v2','Ohne Namensangabe','{"titel":"V2","text":"V2","ordered":false,"references":[],"contractVersion":"blog-publication-v2"}'::jsonb,'blog-publication-v2'),
      ('legacy-v3','Ohne Namensangabe','{"titel":"V3","text":"V3","ordered":false,"references":[],"contractVersion":"blog-publication-v3"}'::jsonb,'blog-publication-v3')
    returning article_id,publication_id,share_token
  ) select jsonb_object_agg(article_id,jsonb_build_object(
    'publicationId',publication_id,'shareToken',share_token)) from inserted;`, {
    role: "service_role", accountId: harness.accounts.alpha,
  });

  const legacyRows = harness.callRpc("kd_list_shared_articles", undefined, {
    accountId: harness.accounts.beta,
  });
  check("Legacy-Liste bewahrt ausschließlich die unversionierte Altzeile",
    legacyRows.length === 1
      && legacyRows[0].publication_id === rows["legacy-null"].publicationId
      && !JSON.stringify(legacyRows).includes(rows["legacy-v2"].publicationId)
      && !JSON.stringify(legacyRows).includes(rows["legacy-v3"].publicationId));

  const v1Page = harness.callRpc("kd_list_shared_articles_v1", {
    p_request: { contractVersion: "blog-publication-v1", limit: 20, cursor: null },
  }, { accountId: harness.accounts.beta });
  check("V1-Liste bewahrt NULL-contract und schließt v2/v3 weiter aus",
    v1Page.items.length === 1
      && v1Page.items[0].publicationId === rows["legacy-null"].publicationId
      && v1Page.items[0].article.title === "Alt ohne Version");

  const claimed = harness.callRpc("kd_claim_shared_article", {
    p_share_token: rows["legacy-null"].shareToken,
  }, { accountId: harness.accounts.beta });
  check("Legacy-Claim übernimmt die unversionierte Altzeile weiterhin einmalig",
    claimed.length === 1 && claimed[0].claimed === true
      && claimed[0].publication_id === rows["legacy-null"].publicationId);

  const v2Claim = harness.callRpc("kd_claim_shared_article", {
    p_share_token: rows["legacy-v2"].shareToken,
  }, { accountId: harness.accounts.beta });
  const v3Claim = harness.callRpc("kd_claim_shared_article", {
    p_share_token: rows["legacy-v3"].shareToken,
  }, { accountId: harness.accounts.beta });
  check("Legacy-Claim bleibt für v2 und v3 geschlossen",
    v2Claim.length === 0 && v3Claim.length === 0);
} finally {
  harness.stop();
}

console.log(`blog_legacy_null_projection_pg_test: ${checks} Checks bestanden.`);
