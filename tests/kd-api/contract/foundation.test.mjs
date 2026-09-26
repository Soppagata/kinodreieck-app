import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyBlogDraftMutation,
  applyLibraryMutation,
  createKdActionAdapter,
  exportLibrarySelection,
} from "../../../src/lib/kdApiAdapters.js";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Medien- und Blogaktionen bleiben reine, ID-gebundene Fachmutationen", () => {
  const media = [
    { id: "film-a", typ: "film", titel: "Alpha", jahr: 2001, notiz: "privat" },
    { id: "serie-b", typ: "serie", titel: "Beta", jahr: 2020 },
  ];
  const changed = applyLibraryMutation(media, {
    operation: "update", id: "film-a", patch: { notiz: "neu", nichtErlaubt: "weg" },
  });
  assert.equal(changed.entries[0].notiz, "neu");
  assert.equal(changed.entries[0].nichtErlaubt, undefined);
  assert.equal(media[0].notiz, "privat");

  const drafts = [{ id: "blog-a", titel: "Alt", text: "Text", liste: [], status: "wartet" }];
  const blog = applyBlogDraftMutation(drafts, {
    operation: "update", id: "blog-a", patch: { titel: "Neu", publikation: { unerlaubt: true } },
  });
  assert.equal(blog.entity.titel, "Neu");
  assert.equal(blog.entity.publikation, undefined);
  assert.equal(drafts[0].titel, "Alt");
});

test("Text und kinodreieck-paket v1 enthalten dieselbe geordnete Auswahl", () => {
  const media = [
    { id: "film-a", typ: "film", titel: "Alpha", jahr: 2001, notiz: "geheim", bewertung: { wie: 3, was: 4, warum: 5 } },
    { id: "serie-b", typ: "serie", titel: "Beta", jahr: 2020, notiz: "geheim-2" },
    { id: "film-c", typ: "film", titel: "Nicht gewaehlt", jahr: 1990 },
  ];
  const ids = ["serie-b", "film-a"];
  const textResult = exportLibrarySelection({ entries: media, ids, format: "text" });
  const jsonResult = exportLibrarySelection({
    entries: media, ids, format: "json", author: "Max", createdAt: "2026-09-26T00:00:00.000Z",
  });
  assert.equal(textResult.content, "Beta (2020)\nAlpha (2001)");
  assert.deepEqual(textResult.selectedIds, ids);
  assert.deepEqual(jsonResult.selectedIds, ids);
  const packet = JSON.parse(jsonResult.content);
  assert.equal(packet.format, "kinodreieck-paket");
  assert.equal(packet.version, 1);
  assert.deepEqual(Object.keys(packet.bereiche).sort(), ["filme", "serien"]);
  const exported = Object.values(packet.bereiche).flat();
  assert.deepEqual(new Set(exported.map((entry) => entry.titel)), new Set(["Alpha", "Beta"]));
  assert.ok(exported.every((entry) => !("id" in entry) && !("notiz" in entry)));
  assert.ok(!jsonResult.content.includes("Nicht gewaehlt"));
});

test("Aktionsadapter verlangt die vollstaendige schmale Medien- und Blognaht", async () => {
  const calls = [];
  const fn = (name) => async (input) => { calls.push([name, input]); return { ok: true }; };
  const adapter = createKdActionAdapter({
    library: { search: fn("search"), get: fn("get"), add: fn("add"), update: fn("update"), remove: fn("remove") },
    blog: { list: fn("list"), get: fn("blog-get"), create: fn("create"), update: fn("blog-update"), remove: fn("blog-remove"), publish: fn("publish"), unpublish: fn("unpublish") },
  });
  await adapter.library.update({ id: "film-a" });
  await adapter.blog.publish({ id: "blog-a" });
  assert.deepEqual(calls.map(([name]) => name), ["update", "publish"]);
  assert.equal(adapter.contractVersion, "kd-api-v1");
  assert.throws(() => createKdActionAdapter({ library: {}, blog: {} }), { code: "ADAPTER_INCOMPLETE" });
});

test("OpenAPI, Toolangebot und Funktionszuordnung sind vollstaendig verbunden", async () => {
  const [mapRaw, toolsRaw, openapi, persistence, deployment, readme, packageRaw, ui] = await Promise.all([
    read("contracts/kd-api/operation-map.json"), read("contracts/kd-api/tool-schemas.json"),
    read("contracts/kd-api/openapi.yaml"), read("contracts/kd-api/persistence-rpc.md"),
    read("contracts/kd-api/deployment.md"), read("contracts/kd-api/README.md"),
    read("package.json"), read("src/tabs/MediathekTab.jsx"),
  ]);
  const map = JSON.parse(mapRaw);
  const registry = JSON.parse(toolsRaw);
  const toolNames = new Set(registry.tools.map((tool) => tool.name));
  assert.equal(toolNames.size, registry.tools.length);

  for (const operation of map.operations) {
    if (operation.route !== "app_local") {
      for (const route of operation.route.split("|")) {
        const documentPath = route.startsWith("/v1/") ? route.slice(3) : route;
        assert.ok(openapi.includes(`  ${documentPath}:`), route);
      }
    }
    for (const tool of String(operation.tool || "").split("|").filter(Boolean)) {
      assert.ok(toolNames.has(tool), tool);
      assert.ok(openapi.includes(`operationId: ${tool}`), tool);
    }
  }

  const memberTools = registry.tools.filter((tool) => tool.identities.includes("member_assistant"));
  assert.ok(memberTools.length > 0);
  assert.ok(memberTools.every((tool) => !/^(ai_|usage_|requests_|backend_)/.test(tool.name)));
  assert.ok(registry.tools.filter((tool) => /^(ai_|usage_|requests_|backend_)/.test(tool.name))
    .every((tool) => tool.identities.length === 1 && tool.identities[0] === "personal_owner_assistant"));
  assert.ok(!openapi.includes("/v1/lists") && !openapi.includes("  /lists:"));
  for (const code of ["API_DISABLED", "REVISION_CONFLICT", "IDEMPOTENCY_MISMATCH", "ORIGIN_REQUIRED", "ACCOUNT_INACTIVE"]) {
    assert.ok(openapi.includes(code));
  }
  assert.ok(openapi.includes('url: "{apiBaseUrl}"'));
  for (const rpc of ["kd_api_mutate_personal_v1", "kd_api_apply_package_v1", "kd_api_mutate_blog_v1", "kd_api_enqueue_ai_job_v1", "kd_api_read_job_v1"]) {
    assert.ok(persistence.includes(rpc));
  }
  for (const rpc of ["public.kd_api_resolve_key_v1", "kd_api_issue_access_v1", "kd_api_rotate_access_v1", "kd_api_revoke_access_v1"]) {
    assert.ok(persistence.includes(rpc));
  }
  assert.ok(persistence.includes("FOR UPDATE") && persistence.includes("kd_personal"));
  assert.ok(deployment.includes("Function-Slug: exakt `kd-api`")
    && deployment.includes("verify_jwt = false")
    && deployment.includes("KD_API_ENABLED")
    && deployment.includes("/_meta/version")
    && deployment.includes("tools/kd-api-keychain.mjs"));
  assert.ok(readme.includes("tests/kd-api/backend/**") && readme.includes("integrations/kd-assistant/**"));
  assert.ok(readme.includes("npm run build:online"));
  assert.ok(JSON.parse(packageRaw).scripts["test:kd-api:final"].endsWith("npm run build:online"));
  assert.ok(ui.includes("exportLibrarySelection") && ui.includes("JSON speichern"));
});
