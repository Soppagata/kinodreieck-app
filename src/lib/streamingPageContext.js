export function buildStreamingPageLibrary(master = []) {
  return (Array.isArray(master) ? master : []).map((film) => Object.freeze({
    id: film?.id ?? null,
    watchmode_id: film?.watchmode_id ?? null,
    streaming_id: film?.streaming_id ?? null,
    imdb_id: film?.imdb_id ?? null,
    tmdb_id: film?.tmdb_id ?? null,
    titel: film?.titel ?? null,
    originaltitel: film?.originaltitel ?? null,
    jahr: film?.jahr ?? null,
    typ: film?.typ ?? null,
  }));
}

export function buildStreamingPagePersonal({
  status = {}, mustWatchIds = [], master = [], newEntries = [], legacyNew = [],
} = {}) {
  return Object.freeze({
    seenIds: Object.freeze(Object.entries(status || {}).filter(([, value]) => (
      value === "gesehen" || value?.status === "gesehen"
    )).map(([id]) => id)),
    mustWatchIds: Object.freeze([...(mustWatchIds || [])].map(String)),
    ratedIds: Object.freeze((Array.isArray(master) ? master : [])
      .filter((film) => film?.bewertung != null && film?.id != null)
      .map((film) => String(film.id))),
    newEntries: Object.freeze(Array.isArray(newEntries) ? newEntries : []),
    legacyNew: Object.freeze(Array.isArray(legacyNew) ? legacyNew : []),
  });
}
