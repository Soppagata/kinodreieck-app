import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { normalisiereArtikelTypen, mitBlogReferenzSchatten } from "./src/lib/artikel.js";
import { parsePaket } from "./src/lib/paket.js";
import { serialisiereArtikelTopf } from "./src/controllers/useArticleController.js";
import { startBlogPublicationPgHarness } from "./tools/blog-publication-pg-harness.mjs";

let checks = 0;
const check = (name, value) => { assert.ok(value, name); checks++; console.log(`✓ ${name}`); };
const expectFailure = (name, fn, pattern) => {
  assert.throws(fn, pattern, name); checks++; console.log(`✓ ${name}`);
};
const uuid = (prefix, value) => `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const refs = (count) => Array.from({ length: count }, (_, index) => ({
  rowId: `row-${String(index + 1).padStart(4, "0")}`,
  rank: index + 1,
  title: `Synthetic Reference ${String(index + 1).padStart(4, "0")}`,
  year: 1950 + (index % 75),
  mediaType: "film",
  resolutionIntent: { kind: "keep_redlink" },
}));
const request = ({ op, content = op, articleId, expected = null, references = [], text = "Volltext" }) => ({
  contractVersion: "blog-publication-v2",
  operationId: uuid("5", op), contentVersion: uuid("6", content),
  privateArticleId: articleId, expectedPublicRevision: expected,
  article: { title: `Artikel ${articleId}`, text, ordered: true, references },
});

const fiftyPrivateRows = refs(50).map((row) => ({
  rowId: row.rowId, eingabe: row.title, jahr: row.year, typ: row.mediaType, ref: null,
}));
const fullArticle = mitBlogReferenzSchatten({
  id: "private-shadow", titel: "Schatten", text: "Text", liste: fiftyPrivateRows,
});
const oldClientSave = { ...fullArticle, liste: fullArticle.liste.slice(0, 15) };
const recovered = normalisiereArtikelTypen([oldClientSave])[0];
check("Additiver privater Schatten stellt nach einem alten 15-Zeilen-Save alle 50 Zeilen wieder her",
  recovered.liste.length === 50 && recovered.blogReferencesV2.references.length === 50);
check("Vollständiger privater Topf einschließlich Schatten und Metadaten bleibt unter 1 MiB serialisierbar",
  new TextEncoder().encode(serialisiereArtikelTopf([{ ...recovered,
    publikation: { pending: { operationId: uuid("7", 1), request: request({
      op: 1, articleId: recovered.id, references: refs(50),
    }) } } }], Date.now())).byteLength < 1024 * 1024);
expectFailure("Ein privater Topf über 1 MiB wird vor dem Write vollständig abgelehnt",
  () => serialisiereArtikelTopf([{ ...recovered, text: "x".repeat(1024 * 1024) }], Date.now()),
  /Artikelspeicher ist voll/);
expectFailure("Import mit 51 Referenzen wird erklärt und niemals still gekürzt",
  () => parsePaket(JSON.stringify({
    format: "kinodreieck-paket", version: 1, autor: "Test",
    bereiche: { artikel: [{ titel: "Zu lang", text: "Text", liste: refs(51).map((row) => ({
      eingabe: row.title, jahr: row.year, typ: row.mediaType,
    })) }] },
  })), /mehr als 50 Referenzen/);

const harness = await startBlogPublicationPgHarness();
try {
  const cap = harness.callRpc("kd_blog_publication_capabilities_v2");
  check("v2-Capability ist additiv und meldet exakt 50, während v1 exakt 15 bleibt",
    cap.contractVersion === "blog-publication-v2" && cap.maxReferences === 50
    && harness.callRpc("kd_blog_publication_capabilities").maxReferences === 15);
  expectFailure("Anon erhält auch die v2-Capability nicht",
    () => harness.callRpc("kd_blog_publication_capabilities_v2", undefined,
      { role: "anon", accountId: null }), /permission denied|authenticated account required/);
  expectFailure("Inaktives Konto bleibt im v2-Pfad gesperrt",
    () => harness.callRpc("kd_blog_publication_capabilities_v2", undefined,
      { accountId: harness.accounts.inactive }), /account_inactive/);

  const thirtyRequest = request({ op: 10, articleId: "private-v2-main", references: refs(30) });
  const thirty = harness.callRpc("kd_publish_blog_v2", thirtyRequest);
  check("30 Referenzen werden vollständig publiziert",
    thirty.outcome === "published" && thirty.referenceResults.length === 30);
  const fiftyRequest = request({ op: 11, articleId: "private-v2-main", expected: 1,
    references: refs(50).reverse().map((row, index) => ({ ...row, rank: index + 1 })) });
  const fifty = harness.callRpc("kd_update_blog_publication_v2", fiftyRequest);
  const page = harness.callRpc("kd_list_shared_articles_v2", {
    contractVersion: "blog-publication-v2", limit: 20, cursor: null,
  });
  const publicArticle = page.items.find((item) => item.publicationId === fifty.publication.publicationId);
  check("50 Referenzen überstehen Update, Umordnung und öffentlichen Reload vollständig",
    fifty.outcome === "updated" && fifty.referenceResults.length === 50
    && publicArticle.article.references.length === 50
    && publicArticle.article.references[0].title === "Synthetic Reference 0050");

  const beforeInvalid = harness.sqlJson(`select jsonb_build_object(
    'ops',(select count(*) from public.kd_blog_publication_operations),
    'starts',(select count(*) from public.kd_blog_publication_starts),
    'publications',(select count(*) from public.kd_shared_articles));`);
  expectFailure("51 Referenzen werden vor Operation und Katalogarbeit abgelehnt",
    () => harness.callRpc("kd_publish_blog_v2",
      request({ op: 12, articleId: "invalid-51", references: refs(51) })),
    /invalid_blog_publication_request/);
  expectFailure("1.945 Referenzen werden vollständig abgelehnt",
    () => harness.callRpc("kd_publish_blog_v2",
      request({ op: 13, articleId: "invalid-1945", references: refs(1945) })),
    /invalid_blog_publication_request/);
  expectFailure("Überlanger Request wird an der 128-KiB-SQL-Grenze abgelehnt",
    () => harness.callRpc("kd_publish_blog_v2",
      request({ op: 14, articleId: "invalid-bytes", text: "x".repeat(132000) })),
    /invalid_blog_publication_request/);
  expectFailure("Überlange Referenztitel werden abgelehnt",
    () => harness.callRpc("kd_publish_blog_v2", request({ op: 15, articleId: "invalid-field",
      references: [{ ...refs(1)[0], title: "x".repeat(241) }] })),
    /invalid_blog_reference/);
  const afterInvalid = harness.sqlJson(`select jsonb_build_object(
    'ops',(select count(*) from public.kd_blog_publication_operations),
    'starts',(select count(*) from public.kd_blog_publication_starts),
    'publications',(select count(*) from public.kd_shared_articles));`);
  check("Ungültige Mengen und Bytes erzeugen weder Ledger-, Start- noch Publikationswrites",
    JSON.stringify(afterInvalid) === JSON.stringify(beforeInvalid));

  const v1Page = harness.callRpc("kd_list_shared_articles_v1", {
    contractVersion: "blog-publication-v1", limit: 20, cursor: null,
  });
  const legacyRows = harness.callRpc("kd_list_shared_articles", undefined,
    { accountId: harness.accounts.beta });
  const legacyClaim = harness.callRpc("kd_claim_shared_article",
    { p_share_token: fifty.publication.shareToken }, { accountId: harness.accounts.beta });
  check("Alte v1- und Legacy-Lesepfade sehen die 50er-Publikation nicht und können sie nicht gekürzt übernehmen",
    !v1Page.items.some((item) => item.publicationId === fifty.publication.publicationId)
    && !legacyRows.some((row) => row.publication_id === fifty.publication.publicationId)
    && legacyClaim.length === 0);
  const oldUpdate = harness.callRpc("kd_update_blog_publication_v1", {
    ...fiftyRequest, contractVersion: "blog-publication-v1",
    operationId: uuid("3", 99), contentVersion: uuid("4", 99),
    expectedPublicRevision: 2, article: { ...fiftyRequest.article, references: refs(15) },
  });
  const afterOldUpdate = harness.callRpc("kd_list_shared_articles_v2", {
    contractVersion: "blog-publication-v2", limit: 20, cursor: null,
  }).items.find((item) => item.publicationId === fifty.publication.publicationId);
  check("Alter v1-Update wird erklärt abgewiesen und lässt alle 50 öffentlichen Zeilen erhalten",
    oldUpdate.errorCode === "CLIENT_UPGRADE_REQUIRED"
    && afterOldUpdate.article.references.length === 50);
  expectFailure("Direkte authentifizierte Tabellenwrites bleiben gesperrt",
    () => harness.sql(`update public.kd_blog_publication_references set rank=1;`,
      { role: "authenticated", accountId: harness.accounts.alpha }), /permission denied/);
  expectFailure("Interne v2-Anwendungsfunktion kann nicht als RPC-Grenze umgangen werden",
    () => harness.sql(`select public.kd_blog_apply_publication_v2(
      '${JSON.stringify(request({ op: 98, articleId: "internal-bypass" })).replaceAll("'", "''")}'::jsonb,
      'publish');`, { role: "authenticated", accountId: harness.accounts.alpha }),
    /permission denied/);

  const lock = await harness.holdBlogAccountLock(harness.accounts.alpha);
  const busyStart = performance.now();
  const busy = harness.callRpc("kd_publish_blog_v2",
    request({ op: 16, articleId: "busy-account", references: [] }));
  const busyElapsed = performance.now() - busyStart;
  await lock.stop();
  check("Paralleler Auftrag desselben Kontos wird ohne Lock-Warteschlange schnell abgewiesen",
    busy.errorCode === "PUBLICATION_ACCOUNT_BUSY" && busyElapsed < 1500);

  harness.sql(`delete from public.kd_blog_publication_starts
    where account_id='${harness.accounts.beta}'::uuid;`);
  let firstRateRequest; let firstRateResponse;
  for (let index = 0; index < 5; index++) {
    const candidate = request({ op: 100 + index, articleId: `rate-${index}`, references: [] });
    const response = harness.callRpc("kd_publish_blog_v2", candidate,
      { accountId: harness.accounts.beta });
    if (index === 0) { firstRateRequest = candidate; firstRateResponse = response; }
    assert.equal(response.outcome, "published");
  }
  const startsBeforeReplay = harness.sqlJson(`select to_jsonb(count(*))
    from public.kd_blog_publication_starts where account_id='${harness.accounts.beta}'::uuid;`);
  const replay = harness.callRpc("kd_publish_blog_v2", firstRateRequest,
    { accountId: harness.accounts.beta });
  const sixth = harness.callRpc("kd_publish_blog_v2",
    request({ op: 106, articleId: "rate-sixth", references: [] }),
    { accountId: harness.accounts.beta });
  const startsAfterReplay = harness.sqlJson(`select to_jsonb(count(*))
    from public.kd_blog_publication_starts where account_id='${harness.accounts.beta}'::uuid;`);
  check("Bekanntes idempotentes Ergebnis bleibt nach fünf Starts abrufbar",
    JSON.stringify(replay) === JSON.stringify(firstRateResponse));
  check("Idempotenter Readback verbraucht keinen weiteren Start",
    Number(startsBeforeReplay) === 5 && Number(startsAfterReplay) === 5);
  check("Sechster neuer Start pro Minute wird atomar abgewiesen",
    sixth.errorCode === "PUBLICATION_RATE_LIMIT");

  const withdrawn = harness.callRpc("kd_withdraw_blog_publication_v2", {
    contractVersion: "blog-publication-v2", operationId: uuid("8", 1),
    privateArticleId: "private-v2-main", expectedPublicRevision: 2,
  });
  check("v2-Rücknahme funktioniert nach dem 50er-Leseweg",
    withdrawn.outcome === "withdrawn"
    && harness.callRpc("kd_read_own_blog_publication_v2", {
      contractVersion: "blog-publication-v2", privateArticleId: "private-v2-main",
      operationId: withdrawn.operationId,
    }).currentPublication === null);

  harness.sql(`delete from public.kd_blog_publication_starts;`);
  const scaleStart = performance.now();
  for (let article = 0; article < 20; article++) {
    const accountId = harness.accounts.beta;
    const scaleResponse = harness.callRpc("kd_publish_blog_v2", request({
      op: 300 + article, articleId: `scale-${article}`, references: refs(50),
    }), { accountId });
    assert.equal(scaleResponse.outcome, "published",
      `scale article ${article}: ${scaleResponse.errorCode || scaleResponse.outcome}`);
    harness.sql(`update public.kd_blog_publication_starts
      set started_at=clock_timestamp()-interval '2 minutes';`);
  }
  const scalePage = harness.callRpc("kd_list_shared_articles_v2", {
    contractVersion: "blog-publication-v2", limit: 50, cursor: null,
  });
  const scaleElapsed = performance.now() - scaleStart;
  const fullScaleArticles = scalePage.items.filter((item) => item.article.references.length === 50).length;
  check(`Realistischer Feed enthält mindestens 20 vollständige 50-Zeilen-Artikel (gemessen: ${fullScaleArticles})`,
    fullScaleArticles >= 20);
  check(`20x50-Publikation und Feed bleiben lokal unter 20 Sekunden (gemessen: ${Math.round(scaleElapsed)} ms)`,
    scaleElapsed < 20_000);
} finally {
  harness.stop();
}

console.log(`blog_reference_limit_v2_test: ${checks} Checks bestanden.`);
