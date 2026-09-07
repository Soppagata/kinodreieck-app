import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("./src/styles/design-shell.css");
const search = read("./src/components/GlobalSearchBar.jsx");
const navigation = read("./src/components/AppNavigation.jsx");

assert.match(css, /\.kd-globalsuche \{[\s\S]*border-radius:12px/);
assert.match(css, /\.kd-globalsuche \.kd-globalsuche-los \{[\s\S]*var\(--kd-wolfram\)/);
assert.match(css, /\.kd-globalsuche-antwortkopf \{[\s\S]*position:sticky/);
assert.match(css, /\.kd-globalsuche-trefferzeile>\.kd-globalsuche-ziel strong \{[\s\S]*white-space:normal/);
assert.match(css, /\.kd-mobile-menu-liste button \{[\s\S]*min-height:48px/);
assert.match(css, /\.kd-film-batch-aktionen \{[\s\S]*position:sticky/);
assert.doesNotMatch(css, /transition\s*:[^;]*(?:top|bottom|transform|height|width)/i);
assert.match(search, /IconSearch/);
assert.match(search, /IconClose/);
assert.doesNotMatch(search, />⌕</);
assert.doesNotMatch(navigation, /icon: "⌕"/);
console.log("design_shell_test: 10 Shell-Verträge bestanden.");
