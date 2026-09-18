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
const request = ({ op, content = op, articleId, expected = null, references = [],
  text = "Volltext", contractVersion = "blog-publication-v2" }) => ({
  contractVersion,
  operationId: uuid("5", op), contentVersion: uuid("6", content),
  privateArticleId: articleId, expectedPublicRevision: expected,
  article: { title: `Artikel ${articleId}`, text, ordered: true, references },
});
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const privatePot = (count, shadowCount = count) => JSON.stringify({
  artikel: [{ id: "direct-private", titel: "Direkt", text: "Text",
    liste: Array.from({ length: count }, (_, index) => ({ eingabe: `Liste ${index + 1}` })),
    blogReferencesV2: { references: Array.from({ length: shadowCount }, (_, index) => ({
      rowId: `shadow-${index + 1}`, eingabe: `Schatten ${index + 1}`,
    })) },
  }],
  gespeichertAm: 1,
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

  harness.sql(`insert into public.kd_personal(key,value) values
    ('kd:artikel','[]');`, { role: "authenticated", accountId: harness.accounts.alpha });
  harness.sql(`update public.kd_personal set value=${sqlText(privatePot(30))}
    where key='kd:artikel';`, { role: "authenticated", accountId: harness.accounts.alpha });
  harness.sql(`update public.kd_personal set value=${sqlText(privatePot(50))}
    where key='kd:artikel';`, { role: "authenticated", accountId: harness.accounts.alpha });
  expectFailure("Direkter kd:artikel-Update mit 51 Listeneinträgen wird atomar abgewiesen",
    () => harness.sql(`update public.kd_personal set value=${sqlText(privatePot(51))}
      where key='kd:artikel';`, { role: "authenticated", accountId: harness.accounts.alpha }),
    /kd_personal_blog_references_max/);
  expectFailure("Direkter kd:artikel-Insert mit 1.945 Listeneinträgen wird abgewiesen",
    () => harness.sql(`insert into public.kd_personal(key,value) values
      ('kd:artikel',${sqlText(privatePot(1945))});`,
      { role: "authenticated", accountId: harness.accounts.beta }),
    /kd_personal_blog_references_max/);
  expectFailure("Ein kleineres liste-Feld kann 51 Schattenreferenzen nicht umgehen",
    () => harness.sql(`update public.kd_personal set value=${sqlText(privatePot(15, 51))}
      where key='kd:artikel';`, { role: "authenticated", accountId: harness.accounts.alpha }),
    /kd_personal_blog_references_max/);
  const retainedPrivate = harness.sqlJson(`select jsonb_build_object(
    'list',jsonb_array_length(value::jsonb->'artikel'->0->'liste'),
    'shadow',jsonb_array_length(value::jsonb->'artikel'->0->'blogReferencesV2'->'references'))
    from public.kd_personal where key='kd:artikel';`,
    { role: "authenticated", accountId: harness.accounts.alpha });
  check("Direkte Alt-/30-/50-Writes funktionieren und Fehlversuche erhalten den 50er-Stand",
    retainedPrivate.list === 50 && retainedPrivate.shadow === 50);
  harness.sql(`insert into public.kd_personal(key,value) values
    ('kd:merkliste','unveraendert-nicht-json');`,
    { role: "authenticated", accountId: harness.accounts.beta });
  check("Die kd:artikel-Prüfung verändert andere persönliche Töpfe nicht",
    harness.sqlJson(`select to_jsonb(value) from public.kd_personal
      where key='kd:merkliste';`,
      { role: "authenticated", accountId: harness.accounts.beta }) === "unveraendert-nicht-json");

  const v2OnV1 = request({ op: 2, articleId: "cross-v2-on-v1", references: refs(50) });
  expectFailure("v1-Publish weist ein v2-Payload vor Start und Katalogarbeit ab",
    () => harness.callRpc("kd_publish_blog_v1", v2OnV1), /invalid_blog_publication_request/);
  expectFailure("v1-Publish akzeptiert auch mit v1-Kennung niemals 50 Referenzen",
    () => harness.callRpc("kd_publish_blog_v1", { ...v2OnV1,
      contractVersion: "blog-publication-v1", operationId: uuid("5", 3) }),
    /invalid_blog_publication_request/);
  expectFailure("Der 128-KiB-Zaun gilt auch vor einem echten v1-Publish",
    () => harness.callRpc("kd_publish_blog_v1", request({ op: 4,
      articleId: "oversized-v1", references: [], text: "x".repeat(132_000),
      contractVersion: "blog-publication-v1" })), /invalid_blog_publication_request/);
  const v1PublishRequest = request({ op: 5, articleId: "private-v1-cross",
    references: refs(15), contractVersion: "blog-publication-v1" });
  const v1Published = harness.callRpc("kd_publish_blog_v1", v1PublishRequest);
  check("Gültiger v1-Publish behält Antwortform, 15 Referenzen und v1-Speicherung",
    v1Published.contractVersion === "blog-publication-v1"
    && v1Published.referenceResults.length === 15
    && harness.sqlJson(`select to_jsonb(contract_version) from public.kd_shared_articles
      where article_id='private-v1-cross';`) === "blog-publication-v1");
  expectFailure("v2-Update weist ein v1-Payload strikt ab",
    () => harness.callRpc("kd_update_blog_publication_v2", request({ op: 6,
      articleId: "private-v1-cross", expected: 1, references: refs(15),
      contractVersion: "blog-publication-v1" })), /invalid_blog_publication_request/);
  expectFailure("v1-Update weist ein v2-Payload strikt ab",
    () => harness.callRpc("kd_update_blog_publication_v1", request({ op: 7,
      articleId: "private-v1-cross", expected: 1, references: refs(50) })),
    /invalid_blog_publication_request/);
  const v1AfterCross = harness.callRpc("kd_read_own_blog_publication_v1", {
    contractVersion: "blog-publication-v1", operationId: uuid("5", 8),
    privateArticleId: "private-v1-cross",
  });
  check("Cross-Version-Updates lassen v1-Revision und 15 Referenzen unverändert",
    v1AfterCross.currentPublication.publicRevision === 1
    && Number(harness.sqlJson(`select to_jsonb(count(*))
      from public.kd_blog_publication_references r
      join public.kd_shared_articles a using(publication_id)
      where a.article_id='private-v1-cross';`)) === 15);

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
  expectFailure("Interne kd:artikel-Prüffunktion wird nicht als zusätzlicher RPC veröffentlicht",
    () => harness.sql(`select public.kd_blog_private_article_references_valid('[]');`,
      { role: "authenticated", accountId: harness.accounts.alpha }), /permission denied/);

  const lock = await harness.holdBlogAccountLock(harness.accounts.alpha);
  const busyStart = performance.now();
  const busy = harness.callRpc("kd_publish_blog_v2",
    request({ op: 16, articleId: "busy-account", references: [] }));
  const busyV1 = harness.callRpc("kd_publish_blog_v1",
    request({ op: 17, articleId: "busy-account-v1", references: [],
      contractVersion: "blog-publication-v1" }));
  const busyElapsed = performance.now() - busyStart;
  await lock.stop();
  check("Gemischte v1/v2-Aufträge desselben Kontos teilen den schnellen Account-Lock",
    busy.errorCode === "PUBLICATION_ACCOUNT_BUSY"
    && busyV1.errorCode === "PUBLICATION_ACCOUNT_BUSY" && busyElapsed < 1500);

  const globalLocks = await harness.holdBlogGlobalLocks();
  const globalV1 = harness.callRpc("kd_publish_blog_v1",
    request({ op: 18, articleId: "global-v1", references: [],
      contractVersion: "blog-publication-v1" }),
    { accountId: harness.accounts.beta });
  const globalV2 = harness.callRpc("kd_publish_blog_v2",
    request({ op: 19, articleId: "global-v2", references: [] }),
    { accountId: harness.accounts.beta });
  await globalLocks.stop();
  check("Gemischte v1/v2-Aufträge teilen die acht globalen Try-Lock-Slots",
    globalV1.errorCode === "PUBLICATION_CAPACITY_BUSY"
    && globalV2.errorCode === "PUBLICATION_CAPACITY_BUSY");

  harness.sql(`delete from public.kd_blog_publication_starts
    where account_id='${harness.accounts.beta}'::uuid;`);
  let firstRateRequest; let firstRateResponse;
  for (let index = 0; index < 5; index++) {
    const isV1 = index % 2 === 0;
    const candidate = request({ op: 100 + index, articleId: `rate-${index}`, references: [],
      contractVersion: isV1 ? "blog-publication-v1" : "blog-publication-v2" });
    const response = harness.callRpc(isV1 ? "kd_publish_blog_v1" : "kd_publish_blog_v2", candidate,
      { accountId: harness.accounts.beta });
    if (index === 0) { firstRateRequest = candidate; firstRateResponse = response; }
    assert.equal(response.outcome, "published");
  }
  const startsBeforeReplay = harness.sqlJson(`select to_jsonb(count(*))
    from public.kd_blog_publication_starts where account_id='${harness.accounts.beta}'::uuid;`);
  const replay = harness.callRpc("kd_publish_blog_v1", firstRateRequest,
    { accountId: harness.accounts.beta });
  const sixth = harness.callRpc("kd_publish_blog_v2",
    request({ op: 106, articleId: "rate-sixth", references: [] }),
    { accountId: harness.accounts.beta });
  const startsAfterReplay = harness.sqlJson(`select to_jsonb(count(*))
    from public.kd_blog_publication_starts where account_id='${harness.accounts.beta}'::uuid;`);
  check("Bekanntes v1-Ergebnis bleibt nach fünf gemischten Starts abrufbar",
    JSON.stringify(replay) === JSON.stringify(firstRateResponse));
  check("Idempotenter Readback verbraucht keinen weiteren Start",
    Number(startsBeforeReplay) === 5 && Number(startsAfterReplay) === 5);
  check("Sechster neuer v2-Start nach gemischten v1/v2-Starts wird abgewiesen",
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
