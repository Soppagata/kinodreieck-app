import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { chunkDepthsForGraph } from "./vite.config.js";

const depths = (graph) => chunkDepthsForGraph(
  Object.keys(graph),
  (id) => ({ importedIds: graph[id] }),
);

const firstGraph = depths({ entry: ["leaf"], leaf: [] });
const changedGraph = depths({ entry: [], leaf: ["entry"] });
assert.deepEqual([...firstGraph], [["entry", 1], ["leaf", 0]]);
assert.deepEqual([...changedGraph], [["entry", 0], ["leaf", 1]], "Graphänderung muss frisch berechnet werden");

const cyclicGraph = depths({ shell: ["cycle-a"], "cycle-a": ["cycle-b"], "cycle-b": ["cycle-a"] });
assert.equal(cyclicGraph.get("cycle-a"), cyclicGraph.get("cycle-b"), "Zyklus muss in derselben Tiefenschicht bleiben");
assert.equal(cyclicGraph.get("shell"), cyclicGraph.get("cycle-a") + 1);

const root = resolve(import.meta.dirname);
const outDir = await mkdtemp(join(tmpdir(), "kd-vite-chunks-"));

try {
  await build({
    configFile: join(root, "vite.config.js"),
    root,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });

  const assetsDir = join(outDir, "assets");
  const jsFiles = (await readdir(assetsDir)).filter((name) => name.endsWith(".js"));
  assert.ok(jsFiles.length >= 4, `erwartete mehrere JS-Chunks, erhalten: ${jsFiles.join(", ")}`);

  const sizes = await Promise.all(jsFiles.map(async (name) => ({
    name,
    bytes: (await stat(join(assetsDir, name))).size,
  })));
  const largest = sizes.sort((a, b) => b.bytes - a.bytes)[0];
  assert.ok(
    largest.bytes <= 500_000,
    `groesster JS-Chunk ueberschreitet 500 kB: ${largest.name} (${largest.bytes} Bytes)`,
  );

  assert.ok(jsFiles.some((name) => name.startsWith("vendor-")), "separater Vendor-Chunk fehlt");

  await build({
    configFile: join(root, "vite.config.js"),
    root,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });
  const repeatedJsFiles = (await readdir(assetsDir)).filter((name) => name.endsWith(".js")).sort();
  assert.deepEqual(repeatedJsFiles, jsFiles.sort(), "wiederholter Build in derselben Node-Instanz muss stabil bleiben");

  console.log(`8/8 Vite-Chunking-Pruefungen bestanden (groesster Chunk: ${largest.name}, ${largest.bytes} Bytes).`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
