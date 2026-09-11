import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";

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
  console.log(`3/3 Vite-Chunking-Pruefungen bestanden (groesster Chunk: ${largest.name}, ${largest.bytes} Bytes).`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
