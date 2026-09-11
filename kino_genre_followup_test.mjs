import assert from "node:assert/strict";
import { KINO_GENRE_FACTS } from "./src/data/kinoGenreFacts.js";
import {
  UNKNOWN_GENRE_KEY,
  createKinoGenreFactsIndex,
  kinoGenreKey,
  kinoGenreMatches,
  kinoGenreOptions,
  projectKinoGenres,
} from "./src/lib/kinoGenres.js";

let checks = 0;
function check(name, test) { test(); checks += 1; console.log(`✓ ${name}`); }

check("Englische und deutsche API-Schreibweisen teilen lesbare Filterwerte", () => {
  assert.equal(kinoGenreKey("Science-Fiction"), "sciencefiction");
  assert.deepEqual(projectKinoGenres({ g: ["Comedy", "Komödie", "Documentary"] }), [
    { key: "komodie", label: "Komödie" },
    { key: "dokumentarfilm", label: "Dokumentarfilm" },
  ]);
});

check("Ergänzungen greifen nur über exakte film.at-ID", () => {
  const facts = createKinoGenreFactsIndex([{ film_at_id: 42, genres: ["Horror"] }]);
  assert.deepEqual(projectKinoGenres({ film_at_id: 42, t: "Werk A", g: [] }, facts), [{ key: "horror", label: "Horror" }]);
  assert.deepEqual(projectKinoGenres({ film_at_id: 43, t: "Werk A", g: [] }, facts), []);
  assert.deepEqual(projectKinoGenres({ t: "Werk A", j: 2026, g: [] }, facts), []);
});

check("Gebündeltes Meisterformat nutzt ID und erwartete Katalogidentität", () => {
  const facts = createKinoGenreFactsIndex({
    format: 1,
    entries: { "42": { title: "Werk A", year: 2026, genres: ["Drama"] } },
  });
  assert.deepEqual(projectKinoGenres({ film_at_id: 42, t: "Werk A", j: 2026, g: [] }, facts), [
    { key: "drama", label: "Drama" },
  ]);
  assert.deepEqual(projectKinoGenres({ film_at_id: 42, t: "Anderes Werk", j: 2026, g: [] }, facts), []);
  assert.deepEqual(projectKinoGenres({ film_at_id: 42, t: "Werk A", j: 2025, g: [] }, facts), []);
});

check("Doppelte Fakten-ID bleibt fail-closed", () => {
  const facts = createKinoGenreFactsIndex([
    { film_at_id: 42, genres: ["Drama"] },
    { film_at_id: "42", genres: ["Horror"] },
  ]);
  assert.deepEqual(projectKinoGenres({ film_at_id: 42, g: [] }, facts), []);
});

check("Unbekannt bleibt sichtbar filterbar und erfindet kein Genre", () => {
  const entries = [{ film_at_id: 1, g: ["Drama"] }, { film_at_id: 2, g: [] }];
  const options = kinoGenreOptions(entries);
  assert.ok(options.some((option) => option.key === UNKNOWN_GENRE_KEY && option.label === "Genre nicht verfügbar"));
  assert.equal(kinoGenreMatches(entries[0], UNKNOWN_GENRE_KEY), false);
  assert.equal(kinoGenreMatches(entries[1], UNKNOWN_GENRE_KEY), true);
});

check("Belegtes All-My-Sisters-Overlay ist ID-gebunden", () => {
  const facts = createKinoGenreFactsIndex(KINO_GENRE_FACTS);
  assert.deepEqual(projectKinoGenres({ film_at_id: 403137796, g: [] }, facts), [
    { key: "dokumentarfilm", label: "Dokumentarfilm" },
  ]);
  assert.deepEqual(projectKinoGenres({ film_at_id: 403137797, t: "All My Sisters", g: [] }, facts), []);
});

console.log(`\n${checks}/${checks} Kino-Genre-Follow-up-Checks bestanden.`);
