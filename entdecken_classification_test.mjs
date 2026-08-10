import assert from "node:assert/strict";
import {
  classifyNewCandidate,
  classifyRemakeRelation,
  classifyCultScreening,
} from "./src/lib/entdeckenClassification.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const TODAY = "2026-08-09";

check("Kino- und Streamingstarts gelten einschließlich heute bis +90 Tage", () => {
  assert.equal(classifyNewCandidate({ region: "AT", medium: "cinema", releaseDate: TODAY }, { today: TODAY }).eligible, true);
  assert.equal(classifyNewCandidate({ region: "AT", medium: "streaming", releaseDate: "2026-11-07" }, { today: TODAY }).eligible, true);
  assert.equal(classifyNewCandidate({ region: "AT", medium: "streaming", releaseDate: "2026-11-08" }, { today: TODAY }).eligible, false);
});

check("Seit kurzem verfügbar gilt höchstens sieben Tage rückwärts", () => {
  const recent = classifyNewCandidate({
    region: "AT", medium: "streaming", releaseDate: "2026-08-02", firstAvailableInSource: true,
  }, { today: TODAY });
  assert.equal(recent.eligible, true);
  assert.equal(recent.label, "Seit kurzem verfügbar");
  assert.equal(classifyNewCandidate({
    region: "AT", medium: "streaming", releaseDate: "2026-08-01", firstAvailableInSource: true,
  }, { today: TODAY }).eligible, false);
});

check("Ein älteres Werk auf neuem Dienst heißt ehrlich Neu auf Dienst", () => {
  const result = classifyNewCandidate({
    region: "AT", medium: "streaming", releaseDate: "2026-08-05", firstAvailableInSource: true,
    workYear: 1982, newToService: true, service: "Testdienst",
  }, { today: TODAY });
  assert.equal(result.category, "new_on_service");
  assert.equal(result.label, "Neu auf Testdienst");
  assert.doesNotMatch(result.label, /neuer Film/i);
});

check("Artikel-, Chart- oder Indexdatum ersetzt kein Releasedatum", () => {
  const result = classifyNewCandidate({
    region: "AT", medium: "cinema", articleDate: TODAY, chartDate: TODAY, indexedAt: TODAY,
  }, { today: TODAY });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "date-invalid");
});

check("Remake-Label verlangt starke strukturierte oder belegte manuelle Relation", () => {
  const base = {
    type: "remake_of", originalTargetId: "fixture:target:original", originalTitle: "Originalwerk", originalYear: 1978,
  };
  assert.equal(classifyRemakeRelation({ ...base, basis: "structured", strength: "strong" }).label, "Remake von Originalwerk (1978)");
  assert.equal(classifyRemakeRelation({ ...base, basis: "manual", verified: true }).isRemake, true);
  assert.equal(classifyRemakeRelation({ ...base, basis: "llm", strength: "strong" }).isRemake, false);
  assert.equal(classifyRemakeRelation({ ...base, basis: "structured", strength: "weak" }).isRemake, false);
});

check("Gleicher Titel oder Franchise-Nähe allein erzeugt kein Remake", () => {
  assert.equal(classifyRemakeRelation({
    type: "same_title", originalTargetId: "fixture:target:original", originalTitle: "Gleich", originalYear: 1990,
    basis: "structured", strength: "strong",
  }).isRemake, false);
});

check("Kultblock verlangt reale zukünftige AT-Vorstellung, kanonisches Werk und Passung", () => {
  const base = {
    showingDate: "2026-08-10", region: "AT", actualShowing: true,
    canonicalTargetId: "fixture:target:cult", fitReasons: ["Profil: Horror"],
  };
  const eligible = classifyCultScreening(base, { today: TODAY });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.label, "Kult & wieder im Kino");
  assert.equal(classifyCultScreening({ ...base, fitReasons: [] }, { today: TODAY }).eligible, false);
  assert.equal(classifyCultScreening({ ...base, actualShowing: false }, { today: TODAY }).eligible, false);
  assert.equal(classifyCultScreening({ ...base, showingDate: "2026-08-08" }, { today: TODAY }).eligible, false);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("ENTDECKEN-CLASSIFICATION-TEST BESTANDEN");
