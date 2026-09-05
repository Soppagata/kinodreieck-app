import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");

let checks = 0;
const check = (name, cond) => {
  assert.ok(cond, name);
  checks += 1;
  console.log(`✓ ${name}`);
};

check("Kino öffnet ohne aktive Restzeitbeschränkung", /const \[zeigeAlles, setZeigeAlles\]\s*=\s*useState\(true\)/.test(source));
check("Gespeicherte Zeitpräferenz wird als eigene persistente Quelle gelesen", /store\.get\(K\.zeitgrenze\)/.test(source));
check("Zeitgrenze bleibt Session-Setzung + Persistenz (persistenter Input, kein hartes Überschreiben auf Reset)",
  !/setZeitgrenze\("14:00"\)/.test(source.replace(/\s+/g, " ")));

console.log(`\nLOCAL-DOMAIN-TEST BESTANDEN (${checks}/${checks})`);
