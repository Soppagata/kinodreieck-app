import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("./src/styles/design-secondary.css", import.meta.url), "utf8");
const sources = await Promise.all([
  "src/tabs/EntdeckenTab.jsx",
  "src/tabs/BlogTab.jsx",
  "src/tabs/FinderTab.jsx",
  "src/tabs/DatenTab.jsx",
  "src/components/BlogProfilAnalyse.jsx",
  "src/components/GeschmackBereich.jsx",
  "src/components/GeschmackOnboarding.jsx",
  "src/components/ProfilAnsicht.jsx",
  "src/components/PrognoseBereich.jsx",
  "src/components/FilmwissenBereich.jsx",
  "src/components/DreiFragen.jsx",
  "src/components/StapelImport.jsx",
  "src/components/TeilenBlock.jsx",
  "src/components/StreamingEinstellungen.jsx",
  "src/components/RadarSubscriptionPreview.jsx",
  "src/components/PrivatePilotOps.jsx",
  "src/components/PrivateMailRequests.jsx",
].map((path) => readFile(new URL(`./${path}`, import.meta.url), "utf8")));

assert.match(css, /\.kd-entdecken[\s\S]*?--kd-secondary-surface/);
assert.match(css, /\.kd-finder-eingabe input/);
assert.match(css, /\[data-private-mail-feedback\]/);
assert.match(css, /\.kd-stapelimport/);
assert.match(css, /\.kd-profil-dialog/);
assert.match(css, /min-height: 44px/);
assert.match(css, /font-size: max\(16px/);
assert.doesNotMatch(css, /\.kd-streamfilter|\.kd-filmkarte/, "secondary styles do not reach primary surfaces");
assert.doesNotMatch(css, /!important/, "secondary design must not flatten shared styles with !important");

const requiredRoots = [
  ["src/tabs/EntdeckenTab.jsx", "kd-entdecken"],
  ["src/tabs/BlogTab.jsx", "kd-blog"],
  ["src/tabs/FinderTab.jsx", "kd-finder"],
  ["src/tabs/DatenTab.jsx", "kd-daten-tab"],
];
for (const [path, marker] of requiredRoots) {
  const source = sources[["src/tabs/EntdeckenTab.jsx", "src/tabs/BlogTab.jsx", "src/tabs/FinderTab.jsx", "src/tabs/DatenTab.jsx"].indexOf(path)];
  assert.ok(source.includes(marker), `${path} exposes its secondary design root`);
}

console.log("design secondary: local roots, 44px controls, and scoped secondary roles verified");
