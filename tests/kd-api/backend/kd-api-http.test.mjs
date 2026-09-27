import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createKdApiHandler } from "../../../supabase/functions/kd-api/core.js";

const ownerContext = { ok: true, contextId: "10000000-0000-4000-8000-000000000001", accountId: "20000000-0000-4000-8000-000000000001",
  effectiveRole: "owner", assistantProfile: "personal_owner", permissions: ["library.read","library.write","ai.run","diagnostics.read"], aiAuthorized: true };

function harness({ enabled = true, resolve = ownerContext } = {}) {
  const calls = []; const dispatches = [];
  const handler = createKdApiHandler({
    env(name) { return ({ KD_API_ENABLED: enabled ? "true" : "false", KD_API_SOURCE_COMMIT: "a".repeat(40), KD_API_RELEASE_ID: "test-r1" })[name] || null; },
    randomUUID,
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    authUser: async () => "20000000-0000-4000-8000-000000000001",
    dispatchAi: (id) => dispatches.push(id),
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "kd_api_resolve_key_v1" || name === "kd_api_resolve_session_v1") return resolve;
      if (name === "kd_api_record_request_v1") return null;
      if (name === "kd_api_capabilities_v1") return { contractVersion: "kd-api-v1", identity: "personal_owner_assistant", tools: ["library_add"] };
      if (name === "kd_api_read_personal_v1") {
        if (args.p_entity_id) return { bucket: args.p_bucket, revision: 7, item: { id: args.p_entity_id, titel: `Titel ${args.p_entity_id}`, typ: "film", geheim: "nicht-exportiert" }, nextCursor: null };
        return { bucket: args.p_bucket, revision: 7, items: [{ id: "film-1", titel: "Film Eins", typ: "film" }], nextCursor: null };
      }
      if (name === "kd_api_mutate_personal_v1") return { operationId: args.p_operation_id, status: "succeeded", revision: 8, entity: args.p_payload, replayed: false };
      if (name === "kd_api_enqueue_ai_job_v1") return { id: "30000000-0000-4000-8000-000000000001", operationId: args.p_operation_id, status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  });
  return { handler, calls, dispatches };
}

const api = (path, init = {}) => new Request(`https://example.test/functions/v1/kd-api/v1${path}`, { ...init,
  headers: { Authorization: "Bearer kd_test_opaque", ...(init.headers || {}) } });

test("exact local and Supabase gateway routes preserve meta readback and the closed API gate", async () => {
  const { handler, calls } = harness({ enabled: false });
  const expectedMeta = { functionSlug: "kd-api", contractVersion: "kd-api-v1", sourceCommit: "a".repeat(40), releaseId: "test-r1", enabled: false };
  for (const url of [
    "http://127.0.0.1:54321/_meta/version",
    "https://example.test/functions/v1/kd-api/_meta/version",
  ]) {
    const meta = await handler(new Request(url));
    assert.equal(meta.status, 200, url);
    assert.deepEqual(await meta.json(), expectedMeta);
  }
  for (const url of [
    "http://127.0.0.1:54321/v1/library",
    "https://example.test/functions/v1/kd-api/v1/library",
    "https://example.test/arbitrary/functions/v1/kd-api/_meta/version",
    "https://example.test/functions/v1/other/_meta/version",
  ]) {
    const denied = await handler(new Request(url));
    assert.equal(denied.status, 503, url);
    assert.equal((await denied.json()).code, "API_DISABLED");
  }
  assert.equal(calls.length, 0, "gate closes before auth/database work");
});

test("local and exact Supabase gateway v1 paths reach the same authorized API route", async () => {
  for (const url of [
    "http://127.0.0.1:54321/v1/capabilities",
    "https://example.test/functions/v1/kd-api/v1/capabilities",
  ]) {
    const h = harness();
    const response = await h.handler(new Request(url, { headers: { Authorization: "Bearer kd_test_opaque" } }));
    assert.equal(response.status, 200, url);
    assert.equal((await response.json()).identity, "personal_owner_assistant");
    assert.deepEqual(h.calls.slice(0, 2).map((entry) => entry.name), ["kd_api_resolve_key_v1", "kd_api_capabilities_v1"]);
  }
  const h = harness();
  const rejected = await h.handler(new Request("https://example.test/arbitrary/functions/v1/kd-api/v1/capabilities", {
    headers: { Authorization: "Bearer kd_test_opaque" },
  }));
  assert.equal(rejected.status, 404);
  assert.equal(h.calls.some((entry) => entry.name === "kd_api_capabilities_v1"), false);
});

test("anonymous and revoked callers stop before domain and provider work", async () => {
  const h = harness();
  const anonymous = await h.handler(new Request("https://example.test/functions/v1/kd-api/v1/library"));
  assert.equal(anonymous.status, 401); assert.equal(h.calls.length, 0);
  const revoked = harness({ resolve: { ok: false, code: "ACCESS_REVOKED" } });
  const response = await revoked.handler(api("/ai/jobs", { method: "POST", headers: { "Idempotency-Key": randomUUID(), "Content-Type": "application/json" }, body: JSON.stringify({ kind: "echo-struct", payload: {} }) }));
  assert.equal(response.status, 401); assert.equal(revoked.dispatches.length, 0);
  assert.deepEqual(revoked.calls.map((entry) => entry.name), ["kd_api_resolve_key_v1"]);
});

test("library mutation binds revision, idempotency, hash and server context", async () => {
  const h = harness(); const operationId = randomUUID();
  const response = await h.handler(api("/library", { method: "POST", headers: { "Idempotency-Key": operationId, "If-Match": '"7"', "Content-Type": "application/json" },
    body: JSON.stringify({ id: "film-2", titel: "Film Zwei", typ: "film" }) }));
  assert.equal(response.status, 201); assert.equal(response.headers.get("etag"), '"8"');
  const call = h.calls.find((entry) => entry.name === "kd_api_mutate_personal_v1");
  assert.equal(call.args.p_context_id, ownerContext.contextId); assert.equal(call.args.p_expected_revision, 7);
  assert.equal(call.args.p_operation_id, operationId); assert.match(call.args.p_request_hash, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(call.args, "p_account_id"), false);
});

test("selection text and JSON are projections without collection write or private fields", async () => {
  for (const format of ["text", "json"]) {
    const h = harness();
    const response = await h.handler(api("/library/selection/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ["a", "b"], format }) }));
    assert.equal(response.status, 200); const output = await response.json();
    assert.deepEqual(output.selectedIds, ["a", "b"]); assert.equal(output.count, 2);
    assert.equal(output.content.includes("nicht-exportiert"), false);
    assert.equal(h.calls.some((entry) => entry.name === "kd_api_mutate_personal_v1"), false);
  }
});

test("member AI denial never dispatches a provider job", async () => {
  const member = { ...ownerContext, assistantProfile: "member", effectiveRole: "member", aiAuthorized: false, permissions: ["library.read"] };
  const h = harness({ resolve: member });
  h.handler = createKdApiHandler({
    env: (name) => name === "KD_API_ENABLED" ? "true" : null, randomUUID,
    sha256: async (value) => createHash("sha256").update(value).digest("hex"), authUser: async () => null,
    dispatchAi: (id) => h.dispatches.push(id),
    async rpc(name) { h.calls.push({ name }); if (name === "kd_api_resolve_key_v1") return member; if (name === "kd_api_enqueue_ai_job_v1") return { ok: false, code: "FORBIDDEN" }; return null; },
  });
  const response = await h.handler(api("/ai/jobs", { method: "POST", headers: { "Idempotency-Key": randomUUID(), "Content-Type": "application/json" }, body: JSON.stringify({ kind: "echo-struct", payload: {} }) }));
  assert.equal(response.status, 403); assert.equal(h.dispatches.length, 0);
});

test("owner AI operation dispatches only the stable database job id", async () => {
  const h = harness(); const operationId = randomUUID();
  const response = await h.handler(api("/ai/jobs", { method: "POST", headers: { "Idempotency-Key": operationId, "Content-Type": "application/json", "X-KD-Client-Version": "ios-test" }, body: JSON.stringify({ kind: "echo-struct", payload: { wort: "Kino" } }) }));
  assert.equal(response.status, 202);
  assert.deepEqual(h.dispatches, ["30000000-0000-4000-8000-000000000001"]);
  const call = h.calls.find((entry) => entry.name === "kd_api_enqueue_ai_job_v1");
  assert.equal(call.args.p_origin.rootOperationId, operationId); assert.equal(call.args.p_origin.clientVersion, "ios-test");
});
