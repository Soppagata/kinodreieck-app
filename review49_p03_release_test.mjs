import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localImportClosure, releaseInfo } from "./tools/function-release-info.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "kd-p03-release-"));
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log("✓ " + name); };
try {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (args, options = {}) => execFileSync("git", args, { cwd: temp, env, ...options });
  git(["init", "--quiet"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "user.name", "Local Fixture"]);
  git(["config", "commit.gpgsign", "false"]);
  mkdirSync(join(temp, "supabase"));
  cpSync(join(root, "supabase/functions"), join(temp, "supabase/functions"), { recursive: true });
  cpSync(join(root, "supabase/config.toml"), join(temp, "supabase/config.toml"));
  const commit = () => { git(["add", "supabase"]); git(["commit", "--quiet", "-m", "local fixture"]); };
  commit();
  const info = () => releaseInfo({ git });
  const baseline = info();
  check("Actual committed ai-task graph includes the blog extractor and all former omissions", () => {
    assert.equal(baseline.dateien.length, 12);
    assert.ok(baseline.dateien.includes("supabase/functions/ai-task/blogReferenceExtract.ts"));
    for (const leaf of ["externalTitleIdentity.js", "flixpatrolFacts.js", "flixpatrolFactsContext.js"]) {
      assert.ok(baseline.dateien.includes("supabase/functions/_shared/" + leaf));
    }
    assert.deepEqual(info(), baseline);
  });
  for (const file of baseline.dateien) {
    const path = join(temp, file);
    const before = info();
    writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from("\n// committed byte regression\n")]));
    check("CLI blocks dirty source " + file, () => {
      const child = spawnSync(process.execPath, [join(root, "tools/function-release-info.mjs")], { cwd: temp, env, encoding: "utf8" });
      assert.equal(child.status, 1);
      assert.match(child.stderr, /nicht committed/);
    });
    commit();
    check("Committed bytes alter source and deploy hashes " + file, () => {
      const after = info();
      assert.notEqual(after.sourceSha256, before.sourceSha256);
      assert.notEqual(after.deployContractSha256, before.deployContractSha256);
      assert.equal(after.configSha256, before.configSha256);
    });
  }
  const entry = join(temp, "supabase/functions/ai-task/index.ts");
  writeFileSync(entry, readFileSync(entry, "utf8") + '\nexport * from "./review49-extra.ts";\n');
  const extra = "supabase/functions/ai-task/review49-extra.ts";
  const leaf = "supabase/functions/ai-task/review49-leaf.ts";
  writeFileSync(join(temp, extra), 'import type { T } from "./review49-leaf.ts"; export { T };\n');
  writeFileSync(join(temp, leaf), 'export type T = string;\n');
  commit();
  check("A newly committed transitive dependency joins the graph without a list edit", () => {
    assert.equal(info().dateien.length, baseline.dateien.length + 2);
    assert.ok(info().dateien.includes(extra));
    assert.ok(info().dateien.includes(leaf));
    writeFileSync(join(temp, leaf), 'export type T = number;\n');
    assert.throws(info, /nicht committed/);
  });
  check("Parser follows reexports, type imports, literal dynamic imports and cycles, ignores comment/string decoys", () => {
    const files = {
      "entry.ts": 'import type { T } from "./types.ts"; export * from "./reexport.ts"; const s = "import \\\"./decoy.ts\\\""; /* import "./comment.ts" */ import("./dynamic.ts");',
      "types.ts": "export type T = string;",
      "reexport.ts": 'export * from "./entry.ts";',
      "dynamic.ts": 'export const value = true;',
    };
    assert.deepEqual(localImportClosure((file) => files[file], "entry.ts"), Object.keys(files).sort());
    assert.throws(() => localImportClosure(() => 'import(variable);', "entry.ts"), /Nicht statisch/);
  });
} finally { rmSync(temp, { recursive: true, force: true }); }
console.log(`review49_p03_release_test: ${checks} Checks bestanden.`);
