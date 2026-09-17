/* Executes the actual RLS CLI in isolated children. Every fetch is replaced. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const idA = "00000000-0000-4000-8000-000000000001";
const idB = "00000000-0000-4000-8000-000000000002";
if (process.argv[2] === "--child") {
  const scenario = process.argv[3];
  const rows = scenario === "existing-profile" ? [{ account_id: idA, key: "kd:geschmacksprofil", value: "existing-profile", revision: 1 }] : [];
  const shared = [], deleted = [], inserted = [];
  let interrupted = false, claimed = false;
  const response = (status, data) => new Response(JSON.stringify(data), { status });
  const denied = () => response(403, { code: "42501" });
  Object.assign(process.env, {
    KD_SB_URL: "https://mock.supabase.co", KD_SB_ANON: "synthetic-anon",
    KD_TESTA_USER: "testa", KD_TESTB_USER: "testb", KD_TESTA_PASS: "synthetic-a",
    KD_TESTB_PASS: "synthetic-b", KD_MAIL_DOMAIN: "example.invalid", KD_RLS_ACCESS_MODE: "active",
  });
  process.on("exit", () => console.log("P03_REPORT " + JSON.stringify({ rows, shared, deleted, inserted })));
  globalThis.fetch = async (input, opts = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://mock.supabase.co");
    const path = url.pathname.replace("/rest/v1/", "");
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : null;
    const account = opts.headers?.Authorization === "Bearer mock-a" ? idA
      : opts.headers?.Authorization === "Bearer mock-b" ? idB : null;
    const q = url.searchParams;
    const select = (data) => data.filter((r) => r.account_id === account && [...q].every(([k, v]) => {
      if (["select", "limit", "order"].includes(k)) return true;
      if (k === "payload") return v === "eq." + JSON.stringify(r[k]);
      return v === "eq." + r[k];
    }));
    if (url.pathname === "/auth/v1/token") {
      const a = body.email === "testa@example.invalid";
      return response(200, { access_token: a ? "mock-a" : "mock-b", user: { id: a ? idA : idB } });
    }
    if (path === "kd_account_access") {
      if (method !== "GET" || !account) return denied();
      return response(200, select([{ account_id: account, role: "member", active: true, personal_ai: false }]));
    }
    if (path === "rpc/kd_account_active") return account ? response(200, true) : denied();
    if (path === "kd_personal") {
      if (!account) return denied();
      if (scenario === "before-probe" && !interrupted && method === "GET" && q.get("select") === "key") {
        interrupted = true; throw new TypeError("synthetic preflight transport error");
      }
      if (method === "POST") {
        if (body.account_id && body.account_id !== account) return denied();
        if (body.value.length > 1048576 || body.key === "kd:boeser-topf") return response(400, { code: "23514" });
        if (rows.some((r) => r.account_id === account && r.key === body.key)) return response(409, {});
        const row = { account_id: account, key: body.key, value: body.value, revision: 1 };
        rows.push(row); inserted.push({ account, key: body.key });
        if (scenario === "lost-insert-response") { interrupted = true; throw new TypeError("synthetic lost write response"); }
        return response(201, [row]);
      }
      if (["t3", "changed-value"].includes(scenario) && !interrupted && q.get("select") === "key,value,revision") {
        interrupted = true;
        if (scenario === "changed-value") rows[0].value = "concurrent-user-value";
        throw new TypeError("synthetic T3 transport error");
      }
      if (scenario === "changed-after-read" && method === "DELETE" && account === idA && q.get("key") === "eq.kd:vokabular") {
        rows.find((r) => r.account_id === idA && r.key === "kd:vokabular").value = "concurrent-user-value";
      }
      const selected = select(rows);
      if (method === "GET") {
        if (scenario === "cleanup-read-fails" && q.get("select") === "value" && q.has("account_id") && account === idA && q.get("key") !== "eq.kd:geschmacksprofil") throw new TypeError("synthetic cleanup read failure");
        return response(200, selected);
      }
      if (method === "PATCH") {
        for (const row of selected) { row.value = body.value; row.revision++; }
        return response(200, selected);
      }
      if (method === "DELETE") {
        assert.ok(q.has("account_id") && q.has("key") && q.has("value"), "cleanup requires all identity filters");
        if (scenario === "cleanup-delete-fails" && account === idA && q.get("key") !== "eq.kd:geschmacksprofil") return response(503, {});
        for (const row of selected) rows.splice(rows.indexOf(row), 1);
        deleted.push({ table: path, account, key: q.get("key"), count: selected.length });
        return response(200, selected);
      }
    }
    if (path === "kd_catalog") {
      if (!account) return denied();
      return response(200, q.has("name") ? [{ name: "demo_seed" }] : ["programm", "streaming_bekannt", "streaming_entdecken"].map((name) => ({ name })));
    }
    if (path === "kd_quellen") return account ? response(200, [{ slug: "fixture", status: "ok" }]) : denied();
    if (path === "kd_ai_log") return method === "GET" && account ? response(200, []) : denied();
    if (path === "kd_store" || path === "kd_ai_limits" || path.startsWith("kd_film")) return denied();
    if (path === "rpc/kd_filmwissen_aktuell_lesen") return account ? response(200, { status: "cache_miss" }) : denied();
    if (path === "kd_shared_articles") {
      if (!account) return denied();
      if (method === "POST") {
        const row = { ...body, account_id: account, publication_id: "publication-fixture", share_token: "share-fixture" };
        shared.push(row); return response(201, [row]);
      }
      if (scenario === "changed-shared" && method === "DELETE" && account === idB) shared[0].payload.text = "concurrent edit";
      const selected = select(shared);
      if (method === "GET") return response(200, selected);
      if (method === "DELETE") {
        if (account === idB && scenario.startsWith("cleanup-")) { interrupted = true; throw new TypeError("synthetic late failure"); }
        if (account === idA) assert.ok(q.has("account_id") && q.has("article_id") && q.has("payload"));
        for (const row of selected) shared.splice(shared.indexOf(row), 1);
        deleted.push({ table: path, account, count: selected.length });
        return response(200, selected);
      }
    }
    if (path === "rpc/kd_list_shared_articles") return response(200, shared.map(({ account_id, ...row }) => row));
    if (path === "rpc/kd_claim_shared_article") {
      if (!account) return denied();
      const value = account === idB && !claimed;
      if (account === idB) claimed = true;
      return response(200, [{ claimed: value }]);
    }
    if (path.startsWith("rpc/")) return denied();
    throw new Error("Unexpected mocked request " + method + " " + path);
  };
  await import("./tools/rls_test_personal.mjs");
} else {
  let checks = 0;
  const run = (scenario) => {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--child", scenario], {
      encoding: "utf8", timeout: 15000, env: { PATH: process.env.PATH },
    });
    assert.equal(child.error, undefined);
    const report = JSON.parse(child.stdout.split("P03_REPORT ")[1]);
    return { ...report, exit: child.status, stdout: child.stdout, stderr: child.stderr };
  };
  for (const scenario of ["t3", "lost-insert-response", "before-probe", "changed-value", "cleanup-read-fails", "cleanup-delete-fails", "changed-after-read", "changed-shared", "normal", "existing-profile"]) {
    const result = run(scenario);
    const normal = ["normal", "existing-profile"].includes(scenario);
    assert.equal(result.exit, normal ? 0 : 1, result.stdout + result.stderr);
    assert.equal(result.shared.length, scenario === "changed-shared" ? 1 : 0);
    if (scenario === "changed-shared") {
      assert.equal(result.shared[0].payload.text, "concurrent edit");
      assert.match(result.stderr, /cleanup-value-changed/);
    }
    if (normal) assert.match(result.stdout, /73\/73 RLS-Negativtests bestanden/);
    if (["changed-value", "changed-after-read", "cleanup-read-fails", "cleanup-delete-fails", "existing-profile"].includes(scenario)) {
      assert.equal(result.rows.length, 1);
      if (["changed-value", "changed-after-read"].includes(scenario)) assert.equal(result.rows[0].value, "concurrent-user-value");
      if (scenario === "existing-profile") assert.equal(result.rows[0].value, "existing-profile");
      else {
        assert.match(result.stderr, /RLS_RECOVERY/);
        assert.match(result.stderr, /expectedSha256/);
        assert.doesNotMatch(result.stderr, /mock-a|mock-b|synthetic-a|synthetic-b|share-fixture/);
      }
    } else assert.equal(result.rows.length, 0);
    if (scenario === "before-probe") assert.equal(result.deleted.length, 0);
    if (scenario === "t3") {
      assert.match(result.stdout, /✓ T7 A legt eigene Zeile/);
      assert.match(result.stdout, /RLS_TEST_ABORTED/);
      assert.equal(result.deleted[0].count, 1);
      const again = run("t3");
      assert.equal(again.inserted[0].key, result.inserted[0].key);
      assert.equal(again.rows.length, 0);
    }
    if (scenario.startsWith("cleanup-")) {
      assert.ok(result.deleted.some((r) => r.account === idB && r.count === 1));
      assert.ok(result.deleted.some((r) => r.key === "eq.kd:geschmacksprofil" && r.count === 1));
      assert.ok(result.deleted.some((r) => r.table === "kd_shared_articles" && r.account === idA && r.count === 1));
    }
    checks++; console.log(`✓ RLS mocked actual CLI: ${scenario}`);
  }
  console.log(`review49_p03_rls_test: ${checks} Checks bestanden; no network.`);
}
