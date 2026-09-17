import assert from "node:assert/strict";
import {
  erstelleMediathekIdentitaetsIndex,
  gleicheMediathekStatusAb,
  mediathekIdVon,
  verknuepfeStreamingPageMitMediathek,
} from "./src/lib/staffeln.js";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log("✓ " + name); };

const master = [
  { id: "heat", titel: "Heat", jahr: 1995, typ: "film", watchmode_id: 10, imdb_id: "tt0113277" },
  { id: "heat-remake", titel: "Heat", jahr: 2025, typ: "film", watchmode_id: 11 },
  { id: "serie", titel: "Serie", jahr: 2020, typ: "serie", watchmode_id: 12 },
];

check("derselbe Masterstand verwendet denselben Kandidatenindex", () => {
  assert.equal(erstelleMediathekIdentitaetsIndex(master), erstelleMediathekIdentitaetsIndex(master));
});

check("Watchmode-Statusabgleich verlangt vollständige konfliktfreie Werkidentität", () => {
  const result = gleicheMediathekStatusAb({}, [{ watchmode_id: 10, titel: "Beliebig", jahr: 1995, typ: "movie" }], master);
  assert.equal(mediathekIdVon(result[10]), "heat");
});

check("MotN verlangt weiterhin einen konfliktfreien starken ID-Match", () => {
  const conflict = { motn_id: "motn:x", watchmode_id: 10, imdb_id: "tt9999999", titel: "Heat", jahr: 1995, typ: "movie" };
  const result = gleicheMediathekStatusAb({}, [conflict], master);
  assert.equal(result[10], undefined);
});

check("Seitenzuordnung erlaubt exakten Titel-Jahr-Typ nur eindeutig", () => {
  const [matched] = verknuepfeStreamingPageMitMediathek([
    { streaming_id: "x", titel: "Heat", jahr: 1995, typ: "movie" },
  ], master);
  assert.equal(matched.library_id, "heat");
});

check("Titelgleichheit ohne passendes Jahr erzeugt keinen naiven Match", () => {
  const [unmatched] = verknuepfeStreamingPageMitMediathek([
    { streaming_id: "x", titel: "Heat", jahr: 2000, typ: "movie", library_id: "heat" },
  ], master);
  assert.equal("library_id" in unmatched, false);
});

check("widersprechende starke IDs entfernen eine unbestaetigte Serverzuordnung", () => {
  const [unmatched] = verknuepfeStreamingPageMitMediathek([
    { watchmode_id: 10, imdb_id: "tt9999999", titel: "Heat", jahr: 1995, typ: "movie", library_id: "heat" },
  ], master);
  assert.equal("library_id" in unmatched, false);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("STREAMING-IDENTITY-INDEX-TEST BESTANDEN");
