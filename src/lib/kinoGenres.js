const UNKNOWN_GENRE_KEY = "__unknown__";

const DEUTSCHE_GENRE_LABELS = Object.freeze({
  action: "Action", abenteuer: "Abenteuer", animation: "Animation", anime: "Anime",
  biografie: "Biografie", komodie: "Komödie", krimi: "Krimi", dokumentarfilm: "Dokumentarfilm",
  drama: "Drama", familie: "Familie", fantasy: "Fantasy", historienfilm: "Historienfilm",
  horror: "Horror", musikfilm: "Musikfilm", mystery: "Mystery", romantik: "Romantik",
  sciencefiction: "Science-Fiction", sport: "Sport", thriller: "Thriller",
  fernsehfilm: "Fernsehfilm", kriegsfilm: "Kriegsfilm", western: "Western",
});
const GENRE_ALIASES = Object.freeze({
  adventure: "abenteuer", biography: "biografie", comedy: "komodie", crime: "krimi", kriminalfilm: "krimi",
  documentary: "dokumentarfilm", dokumentation: "dokumentarfilm", family: "familie",
  history: "historienfilm", historie: "historienfilm", music: "musikfilm", musik: "musikfilm",
  romance: "romantik", romanze: "romantik", scifi: "sciencefiction", tvmovie: "fernsehfilm", war: "kriegsfilm",
});

function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value == null ? "" : value).trim(); }
function normalizedIdentity(value) { return text(value).normalize("NFKC").toLocaleLowerCase("de").replace(/\s+/gu, " "); }
function stableFilmAtId(value) {
  const clean = text(value);
  return /^[1-9]\d{0,14}$/u.test(clean) ? clean : null;
}

export function kinoGenreKey(value) {
  const key = text(value).normalize("NFKD").replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("de").replace(/&/gu, "and").replace(/[^a-z0-9]+/gu, "");
  return GENRE_ALIASES[key] || key;
}

export function kinoGenreLabel(value) {
  const original = text(value);
  if (!original) return null;
  return DEUTSCHE_GENRE_LABELS[kinoGenreKey(original)] || original;
}

/* Ergänzungen binden ausschließlich an eine eindeutige film.at-ID. Doppelte
   IDs werden fail-closed verworfen statt nach Titel/Jahr zusammengeführt. */
export function createKinoGenreFactsIndex(records = []) {
  const index = new Map();
  const blocked = new Set();
  const input = Array.isArray(records) ? records : (
    records?.format === 1 && records?.entries && typeof records.entries === "object"
      ? Object.entries(records.entries).map(([film_at_id, record]) => ({ ...record, film_at_id }))
      : []
  );
  for (const record of input) {
    const id = stableFilmAtId(record?.film_at_id ?? record?.filmAtId);
    if (!id || blocked.has(id)) continue;
    const genres = list(record?.genres ?? record?.g).map(text).filter(Boolean);
    if (index.has(id)) {
      index.delete(id);
      blocked.add(id);
    } else if (genres.length) index.set(id, Object.freeze({
      genres: Object.freeze(genres),
      title: text(record?.title ?? record?.titel) || null,
      year: record?.year == null ? null : Number(record.year),
    }));
  }
  return index;
}

export function projectKinoGenres(entry, factsIndex = null) {
  const id = stableFilmAtId(entry?.film_at_id);
  const fact = id ? factsIndex?.get(id) : null;
  const titleMatches = !fact?.title || !text(entry?.t)
    || normalizedIdentity(fact.title) === normalizedIdentity(entry.t);
  const yearMatches = fact?.year == null || entry?.j == null || fact.year === Number(entry.j);
  const supplemented = fact && titleMatches && yearMatches ? list(fact.genres) : [];
  const byKey = new Map();
  for (const value of [...list(entry?.g), ...supplemented]) {
    const key = kinoGenreKey(value);
    const label = kinoGenreLabel(value);
    if (key && label && !byKey.has(key)) byKey.set(key, Object.freeze({ key, label }));
  }
  return Object.freeze([...byKey.values()]);
}

export function kinoGenreOptions(entries = [], factsIndex = null) {
  const byKey = new Map();
  let hasUnknown = false;
  for (const entry of list(entries)) {
    const genres = projectKinoGenres(entry, factsIndex);
    if (!genres.length) hasUnknown = true;
    for (const genre of genres) if (!byKey.has(genre.key)) byKey.set(genre.key, genre);
  }
  const options = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "de"));
  if (hasUnknown) options.push(Object.freeze({ key: UNKNOWN_GENRE_KEY, label: "Genre nicht verfügbar" }));
  return Object.freeze(options);
}

export function kinoGenreMatches(entry, selectedKey, factsIndex = null) {
  if (!selectedKey) return true;
  const genres = projectKinoGenres(entry, factsIndex);
  if (selectedKey === UNKNOWN_GENRE_KEY) return genres.length === 0;
  return genres.some((genre) => genre.key === selectedKey);
}

export { UNKNOWN_GENRE_KEY };
