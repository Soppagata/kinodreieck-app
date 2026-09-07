import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const css = readFileSync(join(ROOT, "src", "index.css"), "utf8");
const htmlPath = join(ROOT, "dist-single", "Kinodreieck.html");
assert.ok(existsSync(htmlPath), "Erst `npm run build:single` ausführen.");
const html = readFileSync(htmlPath, "utf8");
const embeddedStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(([, style]) => style).join("\n");
const fontFaceRules = embeddedStyles.match(/@font-face\s*\{[^}]*\}/gi) || [];
const fonts = [...new Set([...css.matchAll(/url\(['\"]?\.\/assets\/fonts\/([^'\")]+\.woff2)['\"]?\)/g)]
  .map(([, name]) => name))];

assert.ok(fonts.length > 0, "Keine referenzierten @font-face-Dateien gefunden.");
assert.ok(!fontFaceRules.some((rule) => /local\s*\(/i.test(rule)), "Einzeldatei verlangt eine lokale Systemfont-Quelle.");
assert.ok(!fontFaceRules.some((rule) => /url\(\s*(?!['\"]?data:)/i.test(rule)), "Einzeldatei enthält einen externen Fontpfad.");

for (const font of fonts) {
  const bytes = readFileSync(join(ROOT, "src", "assets", "fonts", font));
  assert.ok(html.includes(bytes.toString("base64")), `${font}: WOFF2-Bytes fehlen in der Einzeldatei`);
  console.log(`✓ ${font}: lokal eingebettet`);
}

console.log(`singlefile_fonts_test: ${fonts.length} verwendete Faces ohne Netzpfad belegt.`);
