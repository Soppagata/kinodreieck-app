import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const modulePath = path.join(root, "src/lib/kdApiAdapters.js");
const imported = await import(pathToFileURL(modulePath).href + `?runtime=${Date.now()}`);
assert.equal(typeof imported.exportLibrarySelection, "function");

const moduleRoot = process.env.KD_TEST_NODE_MODULES || path.join(root, "node_modules");
const deno = path.join(moduleRoot, ".bin", "deno");
try { accessSync(deno, constants.X_OK); }
catch { throw new Error(`Deno-Laufzeit fehlt unter ${deno}; KD_TEST_NODE_MODULES auf die vorhandenen Projektmodule setzen.`); }

const code = `import { exportLibrarySelection } from ${JSON.stringify(pathToFileURL(modulePath).href)};
const result = exportLibrarySelection({entries:[{id:"a",typ:"film",titel:"A",jahr:2020}],ids:["a"],format:"text"});
if (result.content !== "A (2020)") throw new Error("Deno import result mismatch");`;
const result = spawnSync(deno, ["eval", "--no-config", code], { cwd: root, encoding: "utf8" });
if (result.status !== 0) throw new Error(`Deno-Import fehlgeschlagen: ${result.stderr || result.stdout}`);
console.log("✓ Node- und Deno-Runtime importieren den plattformneutralen Adapter");
