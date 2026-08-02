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
const metaPfad = join("dist", "build-meta.json");
const buildVersion = String(process.env.VITE_BUILD_VERSION || "local").trim();
const appEnvironment = String(process.env.VITE_APP_ENV || "local").trim();
const [indexHtml, sw] = await Promise.all([
  readFile(indexPfad, "utf8"),
  readFile(swPfad, "utf8"),
]);
const assets = [...indexHtml.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)]
  .map((treffer) => treffer[1]);
const precache = [...new Set(["./", "index.html", "manifest.webmanifest", ...assets])];
const swMitVersion = sw.replace(
  'const BUILD_VERSION = "__KD_BUILD_VERSION__";',
  `const BUILD_VERSION = ${JSON.stringify(buildVersion)};`,
);
const swMitAssets = swMitVersion.replace(
  /const PRECACHE = \[[^\n]+\];/,
  `const PRECACHE = ${JSON.stringify(precache)};`,
);
if (swMitVersion === sw || swMitAssets === swMitVersion
  || swMitAssets.includes("__KD_BUILD_VERSION__")
  || !assets.some((pfad) => pfad.endsWith(".js"))
  || !assets.some((pfad) => pfad.endsWith(".css"))) {
  throw new Error("Service-Worker-Version oder Precache konnte nicht aus dem Web-Build erzeugt werden.");
}
await writeFile(swPfad, swMitAssets);

/* Der feste Domain-Smoke braucht einen vom HTML unabhängigen Beleg, welcher
   Commit dort wirklich liegt. Ein Query-Parameter im Abruf umgeht dabei
   alte Browser-/Edge-Einträge, ohne den Dateinamen pro Build zu verändern. */
await writeFile(metaPfad, JSON.stringify({
  format: 1,
  buildVersion,
  appEnvironment,
}) + "\n");

console.log(`Online-Paket vorbereitet: ${ziel} (${info.size} Bytes), ${precache.length} Shell-Dateien, Build ${buildVersion}.`);
