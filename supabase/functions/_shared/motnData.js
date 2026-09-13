// AT subscription services; channel subscriptions intentionally retain Watchmode.
export const MOTN_SERVICES = Object.freeze({
  netflix: "Netflix", prime: "Prime Video", disney: "Disney+",
  apple: "AppleTV+", hbo: "HBO Max", paramount: "Paramount Plus",
  mubi: "MUBI", crunchyroll: "Crunchyroll Premium", rtl: "RTL+",
});
const object = value => value && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 500) => typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
const seconds = value => Number.isSafeInteger(value) && value > 0 && value < 7258118400 ? value : null;
const https = value => { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } };

export function motnShowIdentity(show) {
  if (!object(show) || show.itemType !== "show" || !["movie", "series"].includes(show.showType)
      || !/^\d{1,12}$/.test(show.id || "") || !text(show.title, 500)) return null;
  const imdbId = /^tt\d{7,10}$/.test(show.imdbId || "") ? show.imdbId : null;
  const tmdb = /^(movie|tv)\/([1-9]\d{0,9})$/.exec(show.tmdbId || "");
  if (tmdb && tmdb[1] !== (show.showType === "movie" ? "movie" : "tv")) return null;
  if (!imdbId && !tmdb) return null;
  const year = show.showType === "movie" ? show.releaseYear : show.firstAirYear;
  if (!Number.isInteger(year) || year < 1888 || year > 2100) return null;
  return { motn_id: show.id, imdb_id: imdbId, tmdb_id: tmdb ? Number(tmdb[2]) : null,
    titel: show.title.trim(), originaltitel: text(show.originalTitle), jahr: year,
    typ: show.showType === "movie" ? "film" : "serie",
    genres: Array.isArray(show.genres) ? show.genres.map(g => text(g?.name, 100)).filter(Boolean) : [],
    beschreibung: text(show.overview, 6000), laufzeit_minuten: Number.isInteger(show.runtime) ? show.runtime : null,
  };
}

export function normalizeMotnPage(page, { type, from, to, checkedAt, catalogs } = {}) {
  if (!object(page) || !Array.isArray(page.changes) || page.changes.length > 25 || !object(page.shows)
      || typeof page.hasMore !== "boolean"
      || (page.hasMore && !text(page.nextCursor, 2048))
      || !Number.isFinite(Date.parse(checkedAt))) throw new Error("MOTN_INVALID_PAGE");
  const requested = new Set(catalogs.map(value => value.split(".")[0]));
  const records = [], skipped = [];
  for (const change of page.changes) {
    const timestamp = seconds(change?.timestamp);
    if (!object(change) || change.changeType !== type || change.itemType !== "show"
        || !requested.has(change.service?.id) || !MOTN_SERVICES[change.service?.id]
        || change.streamingOptionType !== "subscription" || change.addon
        || timestamp === null || timestamp < from || timestamp > to) throw new Error("MOTN_CHANGE_SCOPE_MISMATCH");
    const rawShow = page.shows[change.showId];
    const show = motnShowIdentity(rawShow);
    if (!show || show.motn_id !== change.showId
        || rawShow.showType !== change.showType || !object(rawShow.streamingOptions)) {
      skipped.push({ id: change.showId, reason: "identity_or_availability_unresolved" }); continue;
    }
    const options = rawShow.streamingOptions.at;
    if (options !== undefined && !Array.isArray(options)) throw new Error("MOTN_INVALID_OPTIONS");
    if (Array.isArray(options) && !options.every(option => object(option) && object(option.service)
      && typeof option.service.id === "string" && ["subscription","free","addon","rent","buy"].includes(option.type))) {
      throw new Error("MOTN_INVALID_OPTIONS");
    }
    if (Array.isArray(options)) {
      show.at_subscription_services = [...new Set(options.filter(option => option.type === "subscription" && !option.addon
        && (seconds(option.expiresOn) === null || option.expiresOn * 1000 > Date.parse(checkedAt)))
        .map(option => option.service.id))];
      show.at_subscription_offers = options.filter(option => option.type === "subscription" && !option.addon
        && MOTN_SERVICES[option.service.id] && https(option.link)
        && (seconds(option.expiresOn) === null || option.expiresOn * 1000 > Date.parse(checkedAt)))
        .map(option => ({ service: option.service.id, link: https(option.link),
          added_at: seconds(option.availableSince) === null ? null : new Date(option.availableSince * 1000).toISOString() }));
    }
    const matching = (options || []).filter(option => option?.service?.id === change.service.id
      && option.type === "subscription" && !option.addon
      && (seconds(option.expiresOn) === null || option.expiresOn * 1000 > Date.parse(checkedAt)));
    // A removed offer variant does not remove a remaining subscription offer.
    // Historical additions already absent today do not resurrect availability.
    if (type === "new" && !matching.length) { skipped.push({ id: change.showId, reason: "addition_no_longer_available" }); continue; }
    const link = matching.map(option => https(option.link)).find(Boolean) || null;
    if (matching.length && !link) { skipped.push({ id: change.showId, reason: "subscription_link_unresolved" }); continue; }
    const starts = matching.map(option => seconds(option.availableSince)).filter(value => value !== null && value <= to);
    const added = matching.length ? (starts.length ? Math.min(...starts) : type === "new" ? timestamp : null) : null;
    records.push({ show_id: change.showId, service_id: change.service.id, country: "AT",
      available: matching.length > 0, event_at: new Date(timestamp * 1000).toISOString(),
      added_at: added === null ? null : new Date(added * 1000).toISOString(),
      checked_at: checkedAt, link, show_data: show,
    });
  }
  return { records, skipped, hasMore: page.hasMore, nextCursor: page.hasMore ? page.nextCursor : null };
}
