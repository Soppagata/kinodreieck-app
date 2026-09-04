import assert from "node:assert/strict";
import fs from "node:fs";

const activeProduct = [
  "src/App.jsx", "src/tabs/StartTab.jsx", "src/tabs/StreamingTab.jsx",
  "src/tabs/EntdeckenTab.jsx", "src/components/Wochenplan.jsx", "src/lib/wochenplan.js",
].map((path) => fs.readFileSync(path, "utf8")).join("\n");
assert.doesNotMatch(activeProduct, /staffel_pipeline|beobachteteSerienEreignisse|neueStaffeln|staffelHinweis/);
console.log("STAFFELPIPELINE IST KEIN AKTIVER PRODUKTPFAD");
