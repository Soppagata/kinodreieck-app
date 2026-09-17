import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const requireReact = createRequire(import.meta.resolve("@vitejs/plugin-react"));
const { parseSync } = requireReact("@babel/core");
const source = readFileSync(new URL("./blogprofilanalyse_test.mjs", import.meta.url), "utf8");
const names = [
  "Hash-Fallback mit 64 Nullen wird abgelehnt",
  "Clock-Fehler wird nicht nach außen geworfen",
  "Marker mit 64 Nullen wird abgelehnt",
  "Marker mit nicht-string Typen wird explizit abgelehnt",
];
const ast = parseSync(source, { configFile: false, babelrc: false });
const arrows = new Map();
for (const statement of ast.program.body) {
  const call = statement.expression?.argument;
  if (call?.callee?.name !== "checkAsync" || !names.includes(call.arguments[0]?.value)) continue;
  assert.equal(call.arguments[1]?.type, "CallExpression", "async assertion must be invoked");
  arrows.set(call.arguments[0].value, call.arguments[1].callee);
}
assert.equal(arrows.size, 4);
const run = (text) => spawnSync(process.execPath, ["--input-type=module", "--eval",
  text.replace('"./src/lib/blogProfilAnalyse.js"', JSON.stringify(new URL("./src/lib/blogProfilAnalyse.js", import.meta.url).href))],
{ encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH } });
const replaceBodies = (sentinel) => {
  let text = source;
  for (const [name, arrow] of [...arrows].sort((a, b) => b[1].body.start - a[1].body.start)) {
    const body = arrow.body;
    const original = source.slice(body.start, body.end);
    const enter = `console.log(${JSON.stringify("P03_ENTER " + name)});`;
    const replacement = name === sentinel
      ? `{ ${enter} throw new Error("P03_SENTINEL"); }`
      : body.type === "BlockStatement"
        ? `{ ${enter} ${original.slice(1)}`
        : `{ ${enter} return (${original}); }`;
    text = text.slice(0, arrow.start) + "async () => " + replacement + text.slice(arrow.end);
  }
  return text;
};
const originalBodies = run(replaceBodies(null));
assert.equal(originalBodies.status, 0, originalBodies.stderr);
assert.match(originalBodies.stdout, /149 ok, 0 offen/);
for (const name of names) assert.ok(originalBodies.stdout.includes("P03_ENTER " + name));
for (const name of names) {
  const sentinel = run(replaceBodies(name));
  assert.equal(sentinel.status, 1, sentinel.stderr);
  assert.match(sentinel.stdout, /148 ok, 1 offen/);
  assert.match(sentinel.stdout, /P03_SENTINEL/);
  assert.ok(sentinel.stdout.includes("P03_ENTER " + name));
  console.log("✓ Executed and sentinel detected: " + name);
}
const callback = run(source.replace('console.log("\\nErgebnis:"',
  'await checkAsync("uncalled callback", async () => true);\nconsole.log("\\nErgebnis:"'));
assert.equal(callback.status, 1);
assert.match(callback.stdout, /Testfunktion wurde nicht aufgerufen/);
console.log("review49_p03_blog_execution_test: original 4 bodies and 4 individual sentinels executed; uncalled callback rejected.");
