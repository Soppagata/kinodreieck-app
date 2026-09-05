import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./src/tabs/StreamingTab.jsx", import.meta.url), "utf8");

let checks = 0;
const check = (name, cond) => {
  assert.ok(cond, name);
  checks += 1;
  console.log(`✓ ${name}`);
};

check(
  "Streaming-Filter-Panel startet standardmäßig zu",
  /const \[streamFilterOffen, setStreamFilterOffen\]\s*=\s*useState\(false\)/.test(source)
);
check(
  "Gespeicherte alte Panel-Öffnung wird beim Start nicht mehr gelesen",
  !/store\.get\(K\.filterStreaming\)/.test(source)
);
check(
  "Gespeicherte Filter-Panel-Öffnung wird auch bei Nutzerschaltvorgängen nicht geändert",
  !/store\.set\(K\.filterStreaming\)/.test(source)
);
check(
  "Filter-Panel schaltet nur seinen lokalen Komponenten-State",
  /const toggleStreamFilter\s*=\s*\(\)\s*=>\s*setStreamFilterOffen\(\(offen\)\s*=>\s*!offen\)/.test(source)
);
check(
  "Unbenutzter Storage-Import ist entfernt",
  !/from "\.\.\/services\/storage\.js"/.test(source)
);
check(
  "Keine veraltete Referenz auf persistente Panel-Ref mehr im Streaming-Tab",
  !/streamFilterOffenRef/.test(source)
);

console.log(`\nSTREAMING-UI-CONTRACT BESTANDEN (${checks}/${checks})`);
