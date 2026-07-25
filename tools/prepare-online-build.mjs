import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const quelle = join("dist-single", "Kinodreieck.html");
const zielOrdner = join("dist", "download");
const ziel = join(zielOrdner, "Kinodreieck.html");

const info = await stat(quelle).catch(() => null);
if (!info?.isFile() || info.size < 1000) {
  throw new Error("Single-File-Build fehlt: zuerst npm run build:single ausführen.");
}

await mkdir(zielOrdner, { recursive: true });
await copyFile(quelle, ziel);

const indexPfad = join("dist", "index.html");
const swPfad = join("dist", "sw.js");
const [indexHtml, sw] = await Promise.all([
  readFile(indexPfad, "utf8"),
  readFile(swPfad, "utf8"),
]);
const assets = [...indexHtml.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)]
  .map((treffer) => treffer[1]);
const precache = [...new Set(["./", "index.html", "manifest.webmanifest", ...assets])];
const swMitAssets = sw.replace(
  /const PRECACHE = \[[^\n]+\];/,
  `const PRECACHE = ${JSON.stringify(precache)};`,
);
if (swMitAssets === sw || !assets.some((pfad) => pfad.endsWith(".js"))
  || !assets.some((pfad) => pfad.endsWith(".css"))) {
  throw new Error("Service-Worker-Precache konnte nicht aus dem Web-Build erzeugt werden.");
}
await writeFile(swPfad, swMitAssets);

console.log(`Online-Paket vorbereitet: ${ziel} (${info.size} Bytes), ${precache.length} Shell-Dateien.`);
