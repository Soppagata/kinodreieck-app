import assert from "node:assert/strict";
import test from "node:test";
import {
  kdApiReleaseInfo,
  parseReleaseInfoArgs,
} from "../../../tools/kd-api-release-info.mjs";

const commit = "a".repeat(40);
const blobs = new Map([
  ["supabase/functions/kd-api/index.ts", Buffer.from('import "../_shared/helper.ts";\n')],
  ["supabase/functions/_shared/helper.ts", Buffer.from("export const helper = true;\n")],
  ["supabase/config.toml", Buffer.from('project_id = "bscjgwcntapobyxsiyce"\n[functions.kd-api]\nverify_jwt = false\n')],
  ["supabase/migrations/20260926010101_kd_api.sql", Buffer.from("select 1;\n")],
  ["supabase/migrations/20260926010202_kd_api_more.sql", Buffer.from("select 2;\n")],
]);

function gitStub({ dirty = "", source = blobs } = {}) {
  return (args) => {
    if (args[0] === "rev-parse") return commit;
    if (args[0] === "status") return dirty;
    if (args[0] === "ls-tree") return [...source.keys()].filter((path) => path.endsWith(".sql")).join("\n");
    if (args[0] === "show") {
      const path = args[1].slice(commit.length + 1);
      if (!source.has(path)) throw new Error(`fixture missing: ${path}`);
      return source.get(path);
    }
    throw new Error(`unexpected git command: ${args.join(" ")}`);
  };
}

test("Release-Info bindet Commit, Functionclosure, Config und Migrationsbytes", () => {
  const info = kdApiReleaseInfo({ sourceCommit: commit, releaseId: "e5-fixture-1", git: gitStub() });
  assert.equal(info.functionSlug, "kd-api");
  assert.equal(info.contractVersion, "kd-api-v1");
  assert.equal(info.sourceCommit, commit);
  assert.equal(info.enabledDefault, false);
  assert.equal(info.verifyJwt, false);
  assert.deepEqual(info.functionSources.files, [
    "supabase/functions/_shared/helper.ts", "supabase/functions/kd-api/index.ts",
  ]);
  assert.equal(info.schema.migrations.length, 2);
  for (const hash of [info.releaseSha256, info.functionSources.sha256, info.config.sha256, info.schema.sha256]) {
    assert.match(hash, /^[a-f0-9]{64}$/);
  }

  const changed = new Map(blobs);
  changed.set("supabase/migrations/20260926010202_kd_api_more.sql", Buffer.from("select 3;\n"));
  const changedInfo = kdApiReleaseInfo({ sourceCommit: commit, releaseId: "e5-fixture-1", git: gitStub({ source: changed }) });
  assert.notEqual(changedInfo.schema.sha256, info.schema.sha256);
  assert.notEqual(changedInfo.releaseSha256, info.releaseSha256);
});

test("Release-Info sperrt falschen HEAD, Dirty-State und unsichere CLI-Werte", () => {
  assert.throws(() => kdApiReleaseInfo({ sourceCommit: "b".repeat(40), releaseId: "x", git: gitStub() }), /SOURCE_COMMIT_NOT_HEAD/);
  assert.throws(() => kdApiReleaseInfo({ sourceCommit: commit, releaseId: "x", git: gitStub({ dirty: " M supabase\/config.toml" }) }), /NOT_COMMITTED/);
  assert.deepEqual(parseReleaseInfoArgs(["--source-commit", commit, "--release-id", "release:1"]), {
    sourceCommit: commit, releaseId: "release:1",
  });
  assert.throws(() => parseReleaseInfoArgs(["--source-commit", commit, "--release-id", "bad value"]), /RELEASE_ID_INVALID/);
});
