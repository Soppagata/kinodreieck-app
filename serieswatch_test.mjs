import assert from "node:assert/strict";
import fs from "node:fs";

assert.equal(fs.existsSync("src/services/seriesWatch.js"), false);
assert.doesNotMatch(fs.readFileSync("src/App.jsx", "utf8"), /seriesWatchService|setObserved/);
assert.match(fs.readFileSync("src/services/accountSelfService.js", "utf8"), /seriesWatch/);
console.log("SERIESWATCH-ABLÖSUNG BESTANDEN");
