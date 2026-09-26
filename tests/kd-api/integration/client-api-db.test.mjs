import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { Client } from "../../../integrations/kd-assistant/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../../integrations/kd-assistant/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { ALL_TOOLS, KdApiError, createKdApiClient, createKdMcpServer, invokeTool, operationNames, projectKeychainCredential } from "../../../integrations/kd-assistant/src/index.mjs";
import { executeKeyLifecycle } from "../../../tools/kd-api-keychain.mjs";
import { kdApiReleaseInfo } from "../../../tools/kd-api-release-info.mjs";
import { readKdApiVersion } from "../../../tools/kd-api-readback.mjs";
import { MEMBER_PERMISSIONS, OWNER_PERMISSIONS, SERVICE_KEY, startLocalKdApiHarness } from "./local-harness.mjs";

const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const RELEASE_ID = "e6-local-final";
const operationId = () => randomUUID();
const names = operationNames();
const digest = (key) => createHash("sha256").update(key, "utf8").digest("hex");
const fingerprint = (key) => `kd_${digest(key).slice(0, 16)}`;
const rawKey = (byte) => `kd_v1_${Buffer.alloc(32, byte).toString("base64url")}`;
const currentRevision = (response) => response.revision ?? response.data.revision;

function rpcFetch(harness) {
  return async (url, init) => new Response(JSON.stringify(await harness.rpc(new URL(url).pathname.split("/").at(-1), JSON.parse(init.body))), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

async function issue(harness, { alias, accountId, profile, permissions, byte }) {
  await executeKeyLifecycle([
    "issue", "--base-url", "https://local.supabase.invalid", "--keychain-account", alias,
    "--account-id", accountId, "--assistant-profile", profile, "--permissions", permissions.join(","),
    "--operation-id", operationId(), "--label", `E6 ${profile}`,
  ], { keychain: harness.keychain, adminCredentialReader: () => SERVICE_KEY, fetchImpl: rpcFetch(harness), random: () => Buffer.alloc(32, byte) });
  const stored = harness.keychain.read(alias);
  return { stored: JSON.parse(stored), key: projectKeychainCredential(stored, { alias }) };
}

function makeClient(baseUrl, key, called = null) {
  const api = createKdApiClient({ baseUrl, credential: async () => key, fetch });
  if (!called) return api;
  return new Proxy(api, { get(target, property) {
    if (property === "call") return async (name, input = {}) => { called.add(name); return target.call(name, input); };
    if (property === "capabilities") return async () => { called.add("capabilities_get"); return target.capabilities(); };
    return Reflect.get(target, property);
  } });
}

test("E6 connected local client/tool/MCP -> kd-api -> PG17/ai-task", { timeout: 300_000 }, async (t) => {
  const harness = await startLocalKdApiHarness({ sourceCommit: HEAD, releaseId: RELEASE_ID });
  t.after(() => harness.stop());

  assert.equal((await readKdApiVersion({ baseUrl: harness.functionBaseUrl, expectedSourceCommit: HEAD, expectedReleaseId: RELEASE_ID, expectEnabled: false, fetchImpl: fetch })).enabled, false);
  assert.equal((await fetch(`${harness.baseUrl}/capabilities`)).status, 503);
  harness.setEnabled(true);
  assert.equal((await readKdApiVersion({ baseUrl: harness.functionBaseUrl, expectedSourceCommit: HEAD, expectedReleaseId: RELEASE_ID, expectEnabled: true, fetchImpl: fetch })).enabled, true);
  const manifest = kdApiReleaseInfo({ sourceCommit: HEAD, releaseId: RELEASE_ID });
  assert.deepEqual(manifest.requiredFunctions.map(({ slug, verifyJwt }) => ({ slug, verifyJwt })), [{ slug: "ai-task", verifyJwt: true }, { slug: "kd-api", verifyJwt: false }]);
  assert.ok(manifest.requiredFunctions.every(({ sourceSha256 }) => /^[a-f0-9]{64}$/.test(sourceSha256)));

  const ownerAccess = await issue(harness, { alias: "e6-owner", accountId: harness.accounts.owner, profile: "personal_owner", permissions: OWNER_PERMISSIONS, byte: 17 });
  const memberAccess = await issue(harness, { alias: "e6-member", accountId: harness.accounts.member, profile: "member", permissions: MEMBER_PERMISSIONS, byte: 34 });
  assert.equal(ownerAccess.stored.version, "kd-api-keychain-v1");
  assert.equal(ownerAccess.stored.rawKey, rawKey(17));
  const called = new Set();
  const owner = makeClient(harness.baseUrl, ownerAccess.key, called);
  const member = makeClient(harness.baseUrl, memberAccess.key, called);
  const app = makeClient(harness.baseUrl, "owner.header.payload");

  const ownerCapabilities = await owner.call("capabilities_get");
  assert.equal(ownerCapabilities.data.identity, "personal_owner_assistant");
  assert.deepEqual(new Set(ownerCapabilities.data.tools), new Set(names));
  assert.equal(names.length, 40, "39 domain tools plus capability inspection");
  assert.equal((await app.call("capabilities_get")).data.identity, "app_session");
  const memberCapabilities = await member.call("capabilities_get");
  assert.equal(memberCapabilities.data.identity, "member_assistant");
  assert.equal(memberCapabilities.data.tools.some((name) => /^(ai_|usage_|requests_|backend_)/.test(name)), false);
  await assert.rejects(() => invokeTool(member, "ai_job_start", { operationId: operationId(), kind: "echo-struct", payload: {} }), (error) => error instanceof KdApiError && error.code === "FORBIDDEN");
  await assert.rejects(() => makeClient(harness.baseUrl, "unknown-key").call("capabilities_get"), (error) => error.code === "UNAUTHENTICATED");

  let libraryRevision = 0;
  const mediaId = `media-${operationId()}`;
  const addedTool = await invokeTool(owner, "library_add", { operationId: operationId(), expectedRevision: libraryRevision, value: { id: mediaId, titel: "E6 Serie", jahr: 2026, typ: "serie", staffel: 1, fortschritt: 2, status: "angefangen", notiz: "lokal" } });
  called.add("library_add");
  assert.equal(addedTool.result.status, "succeeded"); libraryRevision = addedTool.result.revision;
  const search = await owner.call("library_search", { query: "E6", type: "serie", limit: 1 });
  assert.equal(search.data.items[0].id, mediaId); assert.ok(search.data.nextCursor);
  assert.equal((await owner.call("library_get", { id: mediaId })).data.item.fortschritt, 2);
  const updated = await owner.call("library_update", { id: mediaId, operationId: operationId(), expectedRevision: libraryRevision, patch: { fortschritt: 3, status: "gesehen" } });
  libraryRevision = updated.data.revision; assert.equal(updated.data.entity.status, "gesehen");
  const replayId = operationId(); const replayValue = { id: `replay-${operationId()}`, titel: "Replay", typ: "film" };
  const first = await owner.call("library_add", { operationId: replayId, expectedRevision: libraryRevision, value: replayValue });
  const replay = await owner.call("library_add", { operationId: replayId, expectedRevision: libraryRevision, value: replayValue });
  assert.equal(replay.data.replayed, true); libraryRevision = first.data.revision;
  await assert.rejects(() => owner.call("library_add", { operationId: replayId, expectedRevision: libraryRevision, value: { ...replayValue, titel: "Drift" } }), (error) => error.code === "IDEMPOTENCY_MISMATCH");
  harness.sql(`update public.kd_personal set value=jsonb_set(value::jsonb,'{filme,0,notiz}','\"PWA\"')::text where account_id='${harness.accounts.owner}' and key='kd:master';`, { role: "authenticated", accountId: harness.accounts.owner });
  await assert.rejects(() => owner.call("library_update", { id: mediaId, operationId: operationId(), expectedRevision: libraryRevision, patch: { notiz: "API" } }), (error) => error.code === "REVISION_CONFLICT" && error.currentRevision === libraryRevision + 1);
  libraryRevision += 1;
  const textSelection = await owner.call("library_export_selection", { ids: [mediaId], format: "text" });
  const jsonSelection = await owner.call("library_export_selection", { ids: [mediaId], format: "json" });
  assert.deepEqual(textSelection.data.selectedIds, jsonSelection.data.selectedIds); assert.match(textSelection.data.content, /E6 Serie/);
  const selectionPackage = JSON.parse(jsonSelection.data.content);
  assert.equal(selectionPackage.format, "kinodreieck-paket"); assert.equal(selectionPackage.version, 1);
  assert.deepEqual(Object.keys(selectionPackage.bereiche.serien[0]).sort(), ["jahr","titel","typ"].sort());
  const removed = await owner.call("library_remove", { id: mediaId, operationId: operationId(), expectedRevision: libraryRevision });
  libraryRevision = removed.data.revision;

  async function bucket(prefix, value) {
    const before = await owner.call(`${prefix}_list`, { limit: 20 }); const id = `${prefix}-${operationId()}`;
    const add = await owner.call(`${prefix}_add`, { operationId: operationId(), expectedRevision: currentRevision(before), value: { id, ...value } });
    const change = await owner.call(`${prefix}_update`, { id, operationId: operationId(), expectedRevision: add.data.revision, patch: { status: "aktualisiert" } });
    const del = await owner.call(`${prefix}_remove`, { id, operationId: operationId(), expectedRevision: change.data.revision });
    assert.equal(del.data.entity.deleted, true);
  }
  await bucket("mustwatch", { titel: "Must E6", typ: "film" });
  await bucket("schedule", { titel: "Kino E6", zeit: "2026-10-01T19:00:00Z" });
  await bucket("radar", { titel: "Radar E6", active: false, featureEnabled: false });

  const settings0 = await owner.call("settings_get");
  const settings1 = await owner.call("settings_update", { operationId: operationId(), expectedRevision: currentRevision(settings0), patch: { ansicht: "liste", kiAktiv: false } });
  assert.equal(settings1.data.entity.kiAktiv, false);
  const exported = await owner.call("account_export");
  assert.equal(exported.data.format, "kinodreieck-paket-v1"); assert.equal(JSON.stringify(exported.data).includes(ownerAccess.key), false);
  const preview = await owner.call("package_preview", { package: { format: "kinodreieck-paket", version: 1, autor: "E6", bereiche: { filme: [{ titel: "Import E6", jahr: 2026, typ: "film" }], artikel: [{ titel: "Import Draft", text: "Text" }] } } });
  assert.deepEqual(new Set(preview.data.sections), new Set(["library","blogDrafts"]));
  assert.equal((await owner.call("package_apply", { previewId: preview.data.previewId, sections: preview.data.sections, operationId: operationId(), expectedRevision: libraryRevision })).data.status, "succeeded");

  let draftRevision = currentRevision(await owner.call("blog_drafts_list", { limit: 20 }));
  const draftId = `draft-${operationId()}`;
  const draft = await owner.call("blog_draft_create", { operationId: operationId(), expectedRevision: draftRevision, value: { id: draftId, titel: "Benannter E6 Blog", text: "Ein lokaler Text.", geordnet: false, liste: [], autor: "alpha" } });
  draftRevision = draft.data.revision;
  const draftChanged = await owner.call("blog_draft_update", { id: draftId, operationId: operationId(), expectedRevision: draftRevision, patch: { text: "Ein aktualisierter Text." } });
  draftRevision = draftChanged.data.revision;
  assert.equal((await owner.call("blog_draft_get", { id: draftId })).data.item.text, "Ein aktualisierter Text.");
  const named = await owner.call("blog_publish", { id: draftId, operationId: operationId(), expectedRevision: draftRevision, expectedPublicRevision: null, anonymous: false });
  assert.equal(named.data.entity.publication.authorMode, "profile");
  const publicationId = named.data.entity.publication.publicationId;
  assert.ok((await member.call("blog_publications_list", { limit: 20 })).data.items.some((item) => item.publicationId === publicationId));
  assert.equal((await member.call("blog_publication_get", { id: publicationId })).data.autor, "alpha");
  assert.equal((await owner.call("blog_unpublish", { id: publicationId, operationId: operationId(), expectedRevision: named.data.revision })).data.status, "succeeded");
  const anonId = `draft-${operationId()}`;
  const anonBefore = currentRevision(await owner.call("blog_drafts_list", { limit: 20 }));
  const anonDraft = await owner.call("blog_draft_create", { operationId: operationId(), expectedRevision: anonBefore, value: { id: anonId, titel: "Anonymer E6 Blog", text: "Privat bis zur Freigabe.", geordnet: false, liste: [] } });
  const anonymous = await owner.call("blog_publish", { id: anonId, operationId: operationId(), expectedRevision: anonDraft.data.revision, expectedPublicRevision: null, anonymous: true });
  assert.equal(anonymous.data.entity.publication.authorMode, "anonymous");
  assert.equal((await owner.call("blog_draft_remove", { id: draftId, operationId: operationId(), expectedRevision: anonDraft.data.revision })).data.entity.deleted, true);

  const foreignKey = rawKey(51);
  await harness.rpc("kd_api_issue_access_v1", { p_operation_id: operationId(), p_account_id: harness.accounts.foreign, p_assistant_profile: "member", p_permissions: MEMBER_PERMISSIONS, p_key_digest: digest(foreignKey), p_key_fingerprint: fingerprint(foreignKey), p_expires_at: null, p_label: "foreign" });
  assert.equal((await makeClient(harness.baseUrl, foreignKey).call("library_search", { query: "Import E6" })).data.items.length, 0);

  const jobOperation = operationId();
  const started = await owner.call("ai_job_start", { operationId: jobOperation, kind: "echo-struct", payload: { wort: "E6" } });
  const jobReplay = await owner.call("ai_job_start", { operationId: jobOperation, kind: "echo-struct", payload: { wort: "E6" } });
  assert.equal(jobReplay.data.id, started.data.id); assert.equal(jobReplay.data.replayed, true);
  await assert.rejects(() => owner.call("ai_job_start", { operationId: jobOperation, kind: "echo-struct", payload: { wort: "drift" } }), (error) => error.code === "IDEMPOTENCY_MISMATCH");
  await harness.drainAi();
  const job = await owner.call("ai_job_get", { id: started.data.id });
  assert.equal(job.data.status, "succeeded"); assert.deepEqual(job.data.result.data, { echo: "E6", zeichen: 2 });
  assert.equal(harness.providerRuns.length, 1); assert.equal(harness.providerRuns[0].providerCalls, 1);

  const context = await harness.rpc("kd_api_resolve_key_v1", { p_key_digest: digest(ownerAccess.key), p_request_id: operationId(), p_now: new Date().toISOString() });
  const unknownOperation = operationId(); const unknownRequest = operationId();
  const unknown = await harness.rpc("kd_api_enqueue_ai_job_v1", { p_context_id: context.contextId, p_operation_id: unknownOperation, p_request_hash: "d".repeat(64), p_kind: "echo-struct", p_payload: {}, p_origin: { requestId: unknownRequest, rootOperationId: unknownOperation, surface: "test", clientVersion: "e6" } });
  await harness.rpc("kd_api_mark_ai_job_unknown_v1", { p_job_id: unknown.id });
  assert.equal((await owner.call("ai_job_get", { id: unknown.id })).data.status, "unknown");

  const window = { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" };
  const usage = await owner.call("usage_get", window); assert.ok(["partial","unknown"].includes(usage.data.coverage)); assert.equal(typeof usage.data.cost.cent, "number");
  assert.ok((await owner.call("requests_list", { limit: 100 })).data.items.length > 0);
  assert.equal((await owner.call("backend_status_get")).data.database, "reachable");
  const diagnostics = await owner.call("backend_diagnostics_get", { limit: 20 }); assert.equal(diagnostics.data.coverage, "unknown"); assert.equal(diagnostics.data.collectionStartedAt, null);
  assert.ok(["partial","unknown"].includes((await owner.call("backend_usage_get", window)).data.coverage));
  await assert.rejects(() => member.call("backend_usage_get", window), (error) => error.code === "FORBIDDEN");

  const server = createKdMcpServer({ client: owner }); const sdk = new Client({ name: "kd-e6", version: "1" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await server.connect(serverTransport); await sdk.connect(clientTransport);
  try {
    assert.deepEqual(new Set((await sdk.listTools()).tools.map(({ name }) => name)), new Set(names));
    const result = await sdk.callTool({ name: "account_export", arguments: {} }); assert.equal(result.isError, undefined); assert.equal(result.structuredContent.result.format, "kinodreieck-paket-v1");
  } finally { await sdk.close(); await server.close(); }

  await executeKeyLifecycle(["rotate","--base-url","https://local.supabase.invalid","--keychain-account","e6-owner","--access-id",ownerAccess.stored.metadata.accessId,"--expected-key-epoch","0","--operation-id",operationId()], { keychain:harness.keychain,adminCredentialReader:()=>SERVICE_KEY,fetchImpl:rpcFetch(harness),random:()=>Buffer.alloc(32,68) });
  await assert.rejects(() => owner.call("capabilities_get"), (error) => error.code === "UNAUTHENTICATED");
  const rotatedKey = projectKeychainCredential(harness.keychain.read("e6-owner"), { alias: "e6-owner" }); const rotated = makeClient(harness.baseUrl, rotatedKey);
  assert.equal((await rotated.call("capabilities_get")).data.identity, "personal_owner_assistant");
  await executeKeyLifecycle(["revoke","--base-url","https://local.supabase.invalid","--keychain-account","e6-owner","--access-id",ownerAccess.stored.metadata.accessId,"--expected-key-epoch","1","--reason-code","OWNER_REQUEST","--operation-id",operationId()], { keychain:harness.keychain,adminCredentialReader:()=>SERVICE_KEY,fetchImpl:rpcFetch(harness) });
  await assert.rejects(() => rotated.call("capabilities_get"), (error) => error.code === "ACCESS_REVOKED");

  harness.sql(`update public.kd_account_access set active=false,updated_at=clock_timestamp()+interval '1 second' where account_id='${harness.accounts.member}';`, { role:"service_role" });
  await assert.rejects(() => member.call("library_search", {}), (error) => error.code === "ACCOUNT_INACTIVE");
  const demotedKey = rawKey(85);
  await harness.rpc("kd_api_issue_access_v1", { p_operation_id:operationId(),p_account_id:harness.accounts.owner,p_assistant_profile:"personal_owner",p_permissions:OWNER_PERMISSIONS,p_key_digest:digest(demotedKey),p_key_fingerprint:fingerprint(demotedKey),p_expires_at:null,p_label:"demotion" });
  harness.sql(`update public.kd_account_access set role='member',personal_ai=false,updated_at=clock_timestamp()+interval '2 seconds' where account_id='${harness.accounts.owner}';`, { role:"service_role" });
  await assert.rejects(() => makeClient(harness.baseUrl, demotedKey).call("backend_status_get"), (error) => error.code === "ACCOUNT_INACTIVE");

  assert.deepEqual(new Set(ALL_TOOLS.map(({ name }) => name)), new Set(names));
  const missing = names.filter((name) => !called.has(name));
  assert.deepEqual(missing, [], `every frozen tool must traverse the real HTTP handler: ${missing.join(",")}`);
});
