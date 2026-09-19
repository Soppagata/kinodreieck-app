import assert from "node:assert/strict";
import { BLOG_TEST_ACCOUNTS, startBlogPublicationPgHarness } from "./tools/blog-publication-pg-harness.mjs";

let checks = 0;
const check = (name, condition) => { assert.ok(condition, name); checks += 1; console.log(`✓ ${name}`); };
const uuid = (tail) => `30000000-0000-4000-8000-${String(tail).padStart(12, "0")}`;
const request = ({ operation, articleId, revision = null, mode = "profile", name = "alpha", text = "Text" }) => ({
  contractVersion: "blog-publication-v3",
  operationId: uuid(operation),
  contentVersion: uuid(operation + 100),
  privateArticleId: articleId,
  expectedPublicRevision: revision,
  article: { title: "Titel", text, ordered: false, references: [] },
  authorDecision: { mode, expectedAuthor: mode === "profile" ? name : null },
});

const harness = await startBlogPublicationPgHarness({ applyAuthorMigration: true });
try {
  const capability = harness.callRpc("kd_blog_publication_capabilities_v3");
  check("Capability bindet den sichtbaren Autor an den internen Login-Benutzernamen",
    capability.profileAuthor === "alpha" && capability.namedAuthorProjection === true
      && capability.contractVersion === "blog-publication-v3");

  harness.sql(`insert into public.kd_personal(account_id,key,value) values
    ('${BLOG_TEST_ACCOUNTS.alpha}','kd:autor-name','Abweichender Profilname')
    on conflict(account_id,key) do update set value=excluded.value;`, {
    role: "authenticated", accountId: BLOG_TEST_ACCOUNTS.alpha,
  });
  check("Der frei gepflegte kd:autor-name kann den öffentlichen Loginnamen nicht überschreiben",
    harness.callRpc("kd_blog_publication_capabilities_v3").profileAuthor === "alpha");

  const namedRequest = request({ operation: 1, articleId: "alpha-named" });
  const published = harness.callRpc("kd_publish_blog_v3", { p_request: namedRequest });
  check("Benannte Publikation bestätigt Modus und serverkanonischen Namen atomar",
    published.outcome === "published" && published.publication.authorMode === "profile"
      && published.publication.author === "alpha");
  const replay = harness.callRpc("kd_publish_blog_v3", { p_request: namedRequest });
  check("Idempotenter Replay bindet dieselbe Autorenentscheidung",
    JSON.stringify(replay) === JSON.stringify(published));
  const conflicting = harness.callRpc("kd_publish_blog_v3", { p_request: {
    ...namedRequest, authorDecision: { mode: "anonymous", expectedAuthor: null },
  } });
  check("Dieselbe operationId mit anderer Autorenentscheidung ist ein Konflikt",
    conflicting.outcome === "conflict" && conflicting.errorCode === "OPERATION_ID_CONFLICT");

  const page = harness.callRpc("kd_list_shared_articles_v3", {
    p_request: { contractVersion: "blog-publication-v3", limit: 20, cursor: null },
  });
  const encoded = JSON.stringify(page);
  check("V3-Leser zeigt nur den bestätigten Namen und keine private Konto- oder Artikel-ID",
    page.items[0].author === "alpha" && !encoded.includes(BLOG_TEST_ACCOUNTS.alpha)
      && !encoded.includes("alpha-named"));
  const v2Page = harness.callRpc("kd_list_shared_articles_v2", {
    p_request: { contractVersion: "blog-publication-v2", limit: 20, cursor: null },
  });
  check("V2 bleibt kompatibel und projiziert v3-Beiträge weiterhin anonym",
    v2Page.items[0].author === "Ohne Namensangabe");
  const v1Page = harness.callRpc("kd_list_shared_articles_v1", {
    p_request: { contractVersion: "blog-publication-v1", limit: 20, cursor: null },
  });
  const legacyRows = harness.callRpc("kd_list_shared_articles");
  const legacyClaim = harness.callRpc("kd_claim_shared_article", { p_share_token: published.publication.shareToken });
  check("V1- und Legacypfade können eine v3-Publikation weder kürzen noch claimen",
    v1Page.items.length === 0 && legacyRows.length === 0 && legacyClaim.length === 0);

  const anonymousRequest = request({ operation: 2, articleId: "alpha-anonymous", mode: "anonymous" });
  const anonymous = harness.callRpc("kd_publish_blog_v3", { p_request: anonymousRequest });
  const readback = harness.callRpc("kd_read_own_blog_publication_v3", {
    p_request: { contractVersion: "blog-publication-v3", privateArticleId: "alpha-anonymous", operationId: null },
  });
  check("Anonyme Publikation bleibt nach Owner-Reload ausdrücklich anonym",
    anonymous.publication.authorMode === "anonymous"
      && readback.currentPublication.authorMode === "anonymous"
      && readback.currentPublication.author === "Ohne Namensangabe");
  const v2UpdateRequest = request({ operation: 6, articleId: "alpha-anonymous", revision: 1, mode: "anonymous" });
  delete v2UpdateRequest.authorDecision;
  v2UpdateRequest.contractVersion = "blog-publication-v2";
  const v2Update = harness.callRpc("kd_update_blog_publication_v2", { p_request: v2UpdateRequest });
  check("Ein alter v2-Client kann eine v3-Publikation nicht anonym überschreiben",
    v2Update.outcome === "conflict" && v2Update.errorCode === "CLIENT_UPGRADE_REQUIRED");
  const promoted = harness.callRpc("kd_update_blog_publication_v3", { p_request: request({
    operation: 3, articleId: "alpha-anonymous", revision: 1, mode: "profile", name: "alpha", text: "Neu",
  }) });
  check("Erst eine ausdrückliche Aktualisierung wechselt anonym zu benannt",
    promoted.outcome === "updated" && promoted.publication.authorMode === "profile"
      && promoted.publication.author === "alpha");

  harness.sql(`update auth.users set email='private@example.test' where id='${BLOG_TEST_ACCOUNTS.beta}';`, { role: "postgres" });
  const betaCapability = harness.callRpc("kd_blog_publication_capabilities_v3", undefined, { accountId: BLOG_TEST_ACCOUNTS.beta });
  check("Persönliche oder fremde Maildomains ergeben keinen öffentlichen Profilautor",
    betaCapability.profileAuthor === null);
  const betaNamed = harness.callRpc("kd_publish_blog_v3", { p_request: request({
    operation: 4, articleId: "beta-named", name: "private",
  }) }, { accountId: BLOG_TEST_ACCOUNTS.beta });
  check("Ohne interne Systemadresse bleibt namentliches Publizieren geschlossen",
    betaNamed.outcome === "conflict" && betaNamed.errorCode === "AUTHOR_CHANGED");
  const betaAnonymous = harness.callRpc("kd_publish_blog_v3", { p_request: request({
    operation: 5, articleId: "beta-anonymous", mode: "anonymous",
  }) }, { accountId: BLOG_TEST_ACCOUNTS.beta });
  check("Anonymes Publizieren bleibt ohne Profilautor möglich",
    betaAnonymous.outcome === "published" && betaAnonymous.publication.authorMode === "anonymous");
  const isolated = harness.callRpc("kd_read_own_blog_publication_v3", {
    p_request: { contractVersion: "blog-publication-v3", privateArticleId: "alpha-named", operationId: null },
  }, { accountId: BLOG_TEST_ACCOUNTS.beta });
  check("Owner-Readback bleibt kontoisoliert", isolated.currentPublication === null);
  const withdrawRequest = {
    contractVersion: "blog-publication-v3", operationId: uuid(7),
    privateArticleId: "alpha-named", expectedPublicRevision: 1,
  };
  const withdrawn = harness.callRpc("kd_withdraw_blog_publication_v3", { p_request: withdrawRequest });
  const withdrawReplay = harness.callRpc("kd_withdraw_blog_publication_v3", { p_request: withdrawRequest });
  const absent = harness.callRpc("kd_read_own_blog_publication_v3", {
    p_request: { contractVersion: "blog-publication-v3", privateArticleId: "alpha-named", operationId: uuid(7) },
  });
  check("V3-Rücknahme ist idempotent und Owner-Readback bestätigt die Abwesenheit",
    withdrawn.outcome === "withdrawn" && JSON.stringify(withdrawReplay) === JSON.stringify(withdrawn)
      && absent.currentPublication === null && absent.operation.status === "applied");
} finally {
  harness.stop();
}

console.log(`blog_publication_author_v3_pg_test: ${checks} Checks bestanden.`);
