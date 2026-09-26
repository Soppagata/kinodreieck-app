import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import operationContract from "../contracts/operation-map.json" with { type: "json" };
import toolContract from "../contracts/tool-schemas.json" with { type: "json" };
import {
  ALL_TOOLS,
  KdApiError,
  OPERATIONS,
  createKdApiClient,
  discoverTools,
  invokeTool,
} from "../src/index.mjs";
import { runBlogFlowExample } from "../examples/blog-flow.mjs";
import { runSelectionExample } from "../examples/selection.mjs";

const OWNER_KEY = "synthetic-owner-key";
const MEMBER_KEY = "synthetic-member-key";
const PRIVILEGED = /^(ai_|usage_|requests_|backend_)/;
const allNames = toolContract.tools.map((tool) => tool.name);
const memberNames = allNames.filter((name) => !PRIVILEGED.test(name));

function problem(status, code, title, extra = {}) {
  return { type: `https://example.invalid/problems/${code}`, title, status, code, requestId: randomUUID(), ...extra };
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

async function bodyOf(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : null;
}

async function createMockApi() {
  const requests = [];
  let revision = 7;
  let blogDraftId = "draft-1";
  const confirmedRevision = (request) => Number(/^\"([0-9]+)\"$/.exec(request.headers["if-match"] || "")?.[1] ?? revision) + 1;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const key = request.headers.authorization?.replace(/^Bearer /, "");
    const identity = key === OWNER_KEY ? "personal_owner_assistant" : key === MEMBER_KEY ? "member_assistant" : null;
    const requestBody = await bodyOf(request);
    requests.push({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: request.headers, body: requestBody, identity });
    if (!identity) return json(response, 401, problem(401, "UNAUTHENTICATED", "Unknown test key"), { "content-type": "application/problem+json" });
    if (url.pathname === "/v1/capabilities") {
      return json(response, 200, { contractVersion: "kd-api-v1", identity, tools: identity === "member_assistant" ? memberNames : allNames, limits: {} });
    }
    if (identity === "member_assistant" && (url.pathname.startsWith("/v1/ai/") || url.pathname.startsWith("/v1/assistant/"))) {
      return json(response, 403, problem(403, "FORBIDDEN", "Not permitted"), { "content-type": "application/problem+json" });
    }
    if (url.pathname === "/v1/library/conflict") {
      return json(response, 409, problem(409, "REVISION_CONFLICT", "Revision changed", { operationId: request.headers["idempotency-key"], currentRevision: revision, retryable: false }), { "content-type": "application/problem+json" });
    }
    if (request.method === "GET" && url.pathname === "/v1/library") {
      return json(response, 200, { items: [
        { id: "film-1", titel: "Alien", jahr: 1979, typ: "Film" },
        { id: "film-2", titel: "Arrival", jahr: 2016, typ: "Film" },
      ], nextCursor: null, revision });
    }
    if (url.pathname === "/v1/library/selection/export") {
      const text = requestBody.format === "text";
      return json(response, 200, {
        format: requestBody.format,
        filename: text ? "kinodreieck-auswahl.txt" : "kinodreieck-auswahl.json",
        mimeType: text ? "text/plain;charset=utf-8" : "application/json",
        count: requestBody.ids.length,
        selectedIds: requestBody.ids,
        content: text ? "Alien (1979)\nArrival (2016)" : JSON.stringify({ format: "kinodreieck-paket", version: 1, master: requestBody.ids }),
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/blog-drafts") {
      revision = confirmedRevision(request);
      return json(response, 201, { operationId: request.headers["idempotency-key"], status: "succeeded", revision, entity: { id: blogDraftId, ...requestBody }, replayed: false }, { etag: `\"${revision}\"` });
    }
    if (request.method === "PATCH" && url.pathname === `/v1/blog-drafts/${blogDraftId}`) {
      revision = confirmedRevision(request);
      return json(response, 200, { operationId: request.headers["idempotency-key"], status: "succeeded", revision, entity: { id: blogDraftId, ...requestBody }, replayed: false }, { etag: `\"${revision}\"` });
    }
    if (request.method === "POST" && url.pathname === `/v1/blog-drafts/${blogDraftId}/publish`) {
      revision = confirmedRevision(request);
      return json(response, 202, { operationId: request.headers["idempotency-key"], status: "succeeded", revision, entity: { id: "publication-1", draftId: blogDraftId }, replayed: false }, { etag: `\"${revision}\"` });
    }
    if (request.method === "POST" && url.pathname === "/v1/blog-publications/publication-1/unpublish") {
      revision = confirmedRevision(request);
      return json(response, 202, { operationId: request.headers["idempotency-key"], status: "succeeded", revision, entity: { id: "publication-1", draftId: blogDraftId }, replayed: false }, { etag: `\"${revision}\"` });
    }
    if (request.method === "DELETE" && url.pathname === `/v1/blog-drafts/${blogDraftId}`) {
      revision = confirmedRevision(request);
      return json(response, 200, { operationId: request.headers["idempotency-key"], status: "succeeded", revision, entity: { id: blogDraftId }, replayed: false }, { etag: `\"${revision}\"` });
    }
    if (request.method === "POST" && url.pathname === "/v1/ai/jobs") {
      return json(response, 202, { id: "00000000-0000-4000-8000-000000000111", operationId: request.headers["idempotency-key"], status: "accepted", createdAt: "2026-09-26T10:00:00Z", updatedAt: "2026-09-26T10:00:00Z" });
    }
    if (request.method !== "GET" && !url.pathname.endsWith("/export") && !url.pathname.endsWith("/preview")) {
      revision = confirmedRevision(request);
      return json(response, request.method === "POST" ? 201 : 200, { operationId: request.headers["idempotency-key"], status: "succeeded", revision, entity: { id: "item-1" }, replayed: false }, { etag: `\"${revision}\"` });
    }
    if (url.pathname.endsWith("/usage")) {
      return json(response, 200, { from: url.searchParams.get("from"), to: url.searchParams.get("to"), timezone: "Europe/Vienna", collectionStartedAt: null, coverage: "unknown", requests: null, logicalJobs: null, providerRequests: null, websearchCalls: null, cost: null });
    }
    return json(response, 200, { items: [], nextCursor: null, revision, value: {}, id: url.pathname.split("/").at(-1) });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

function inputFor(tool) {
  const definition = tool.inputSchema.$ref.split("/").at(-1);
  switch (definition) {
    case "empty": return {};
    case "id": return { id: "item/1" };
    case "page": return { cursor: "cursor-1", limit: 4 };
    case "search": return { query: "Alien", type: "Film", cursor: "cursor-1", limit: 4 };
    case "createMutation": return { operationId: randomUUID(), expectedRevision: 2, value: { id: "item-1", titel: "Alien", typ: "Film" } };
    case "updateMutation": return { id: "item/1", operationId: randomUUID(), expectedRevision: 2, patch: { titel: "Neu" } };
    case "updateWithoutId": return { operationId: randomUUID(), expectedRevision: 2, patch: { ansicht: "liste" } };
    case "removeMutation": return { id: "item/1", operationId: randomUUID(), expectedRevision: 2 };
    case "selection": return { ids: ["film-1", "film-2"], format: "text" };
    case "publish": return { id: "item/1", operationId: randomUUID(), expectedRevision: 2, expectedPublicRevision: null, anonymous: false };
    case "packagePreview": return { package: { format: "kinodreieck-paket", version: 1 } };
    case "packageApply": return { previewId: "preview-1", sections: ["master"], operationId: randomUUID(), expectedRevision: 2 };
    case "aiJob": return { operationId: randomUUID(), kind: "filmwissen", payload: { id: "film-1" } };
    case "window": return { from: "2026-09-01T00:00:00Z", to: "2026-09-26T00:00:00Z" };
    default: throw new Error(`No sample for ${definition}`);
  }
}

function expectedOperationMap() {
  const map = new Map();
  for (const operation of operationContract.operations) {
    if (!operation.tool) continue;
    const tools = operation.tool.split("|");
    const methods = operation.method.split("|");
    const routes = operation.route.split("|");
    tools.forEach((name, index) => {
      const method = methods.length === 1 ? methods[0] : methods[index];
      const tool = toolContract.tools.find((candidate) => candidate.name === name);
      const definition = tool.inputSchema.$ref.split("/").at(-1);
      const itemInput = ["id", "updateMutation", "removeMutation", "publish"].includes(definition);
      const route = routes.length === tools.length
        ? routes[index]
        : routes.length === 1
          ? routes[0]
          : routes.find((candidate) => candidate.includes("{id}") === itemInput);
      map.set(name, { method, route });
    });
  }
  return map;
}

test("B2 bundled assistant package control", async (t) => {
  const mock = await createMockApi();
  t.after(() => mock.close());
  const owner = createKdApiClient({ baseUrl: mock.baseUrl, credential: async () => OWNER_KEY });
  const member = createKdApiClient({ baseUrl: mock.baseUrl, credential: async () => MEMBER_KEY });

  await t.test("packaged contracts are exact and exports are complete", async () => {
    const here = fileURLToPath(new URL("..", import.meta.url));
    for (const name of ["tool-schemas.json", "operation-map.json", "openapi.yaml"]) {
      assert.equal(await readFile(new URL(`../../../contracts/kd-api/${name}`, import.meta.url), "utf8"), await readFile(`${here}/contracts/${name}`, "utf8"));
    }
    assert.deepEqual(Object.keys(OPERATIONS).sort(), allNames.slice().sort());
    assert.deepEqual(ALL_TOOLS.map((tool) => tool.name), allNames);
    assert.ok(ALL_TOOLS.every((tool) => !tool.inputSchema.$ref));
  });

  await t.test("every frozen tool maps to its HTTP route without gaps", async () => {
    const expected = expectedOperationMap();
    assert.equal(expected.size, allNames.length);
    for (const tool of toolContract.tools) {
      const before = mock.requests.length;
      await owner.call(tool.name, inputFor(tool));
      const request = mock.requests[before];
      const route = expected.get(tool.name);
      assert.equal(request.method, route.method, tool.name);
      assert.equal(request.path, route.route.replace("{id}", "item%2F1"), tool.name);
      const spec = OPERATIONS[tool.name];
      if (spec.mutation || spec.idempotent) assert.match(request.headers["idempotency-key"], /^[0-9a-f-]{36}$/);
      if (spec.mutation) assert.equal(request.headers["if-match"], "\"2\"");
    }
  });

  await t.test("fresh capabilities filter Member and Owner tools", async () => {
    const memberDiscovery = await discoverTools(member);
    assert.deepEqual(memberDiscovery.tools.map((tool) => tool.name), memberNames);
    assert.equal(memberDiscovery.tools.some((tool) => PRIVILEGED.test(tool.name)), false);
    const ownerDiscovery = await discoverTools(owner);
    assert.deepEqual(ownerDiscovery.tools.map((tool) => tool.name), allNames);
    await assert.rejects(() => invokeTool(member, "ai_job_get", { id: "job-1" }), (error) => error instanceof KdApiError && error.code === "FORBIDDEN");
    const capabilityReads = mock.requests.filter((request) => request.path === "/v1/capabilities").length;
    await invokeTool(member, "settings_get", {});
    assert.equal(mock.requests.filter((request) => request.path === "/v1/capabilities").length, capabilityReads + 1);
  });

  await t.test("errors, revisions, idempotency and job status stay explicit", async () => {
    const operationId = randomUUID();
    await assert.rejects(
      () => owner.call("library_update", { id: "item-1", patch: { titel: "X" } }),
      (error) => error instanceof KdApiError && error.code === "IDEMPOTENCY_REQUIRED",
    );
    await assert.rejects(
      () => owner.call("library_update", { id: "conflict", operationId, expectedRevision: 1, patch: { titel: "X" } }),
      (error) => error instanceof KdApiError && error.code === "REVISION_CONFLICT" && error.operationId === operationId && error.currentRevision >= 0 && error.retryable === false,
    );
    const job = await owner.call("ai_job_start", { operationId, kind: "filmwissen", payload: { id: "film-1" } });
    assert.equal(job.data.operationId, operationId);
    assert.equal(job.data.status, "accepted");
    const sent = mock.requests.at(-1);
    assert.equal(sent.headers["idempotency-key"], operationId);
    assert.equal(sent.headers["if-match"], undefined);
  });

  await t.test("selection separates content from local target effects", async () => {
    const result = await runSelectionExample(member, { query: "", count: 2 });
    assert.equal(result.text.content, "Alien (1979)\nArrival (2016)");
    assert.deepEqual(result.text.selectedIds, result.json.selectedIds);
    assert.equal(result.targetEffects.text.performed, false);
    assert.equal(result.targetEffects.json.performed, false);
    const tool = await invokeTool(member, "library_export_selection", { ids: result.selectedIds, format: "json" });
    assert.equal(tool.targetEffect.action, "save_json_file");
    assert.equal(tool.targetEffect.performed, false);
  });

  await t.test("full blog flow carries confirmed revisions", async () => {
    const before = mock.requests.length;
    const result = await runBlogFlowExample(member, { initialRevision: 7 });
    assert.equal(result.draftId, "draft-1");
    assert.equal(result.publicationId, "publication-1");
    const writes = mock.requests.slice(before);
    assert.deepEqual(writes.map((request) => request.method), ["POST", "PATCH", "POST", "POST", "DELETE"]);
    assert.deepEqual(writes.map((request) => request.headers["if-match"]), ["\"7\"", "\"8\"", "\"9\"", "\"10\"", "\"11\""]);
    assert.equal(new Set(writes.map((request) => request.headers["idempotency-key"])).size, 5);
  });

  await t.test("official MCP SDK client discovers and calls the stdio adapter", async () => {
    const bin = fileURLToPath(new URL("../bin/kd-assistant-mcp.mjs", import.meta.url));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin],
      env: { KD_API_BASE_URL: mock.baseUrl, KD_API_KEY: MEMBER_KEY },
      stderr: "pipe",
    });
    const client = new Client({ name: "kd-assistant-test", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    try {
      const listed = await client.listTools();
      assert.deepEqual(listed.tools.map((tool) => tool.name), memberNames);
      const called = await client.callTool({ name: "library_export_selection", arguments: { ids: ["film-1", "film-2"], format: "text" } });
      assert.equal(called.isError, undefined);
      assert.equal(called.structuredContent.targetEffect.performed, false);
      assert.equal(called.structuredContent.result.content, "Alien (1979)\nArrival (2016)");
    } finally {
      await client.close();
    }
  });
});
