import { MOTN_SERVICES } from "../../supabase/functions/_shared/motnData.js";

const list = value => Array.isArray(value) ? value : [];
const type = value => ["movie","film"].includes(value) ? "film"
  : ["tv_series","serie","series"].includes(value) ? "serie" : null;
const imdb = value => /^tt\d{7,10}$/.test(value || "") ? value : null;
const tmdb = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(value) : null;
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const strongKeys = title => [imdb(title?.imdb_id) && `imdb:${title.imdb_id}`,
  type(title?.typ) && tmdb(title?.tmdb_id) && `tmdb:${type(title.typ)}:${tmdb(title.tmdb_id)}`].filter(Boolean);
const conflicts = (a,b) => (type(a.typ) && type(b.typ) && type(a.typ) !== type(b.typ))
  || (imdb(a.imdb_id) && imdb(b.imdb_id) && a.imdb_id !== b.imdb_id)
  || (tmdb(a.tmdb_id) && tmdb(b.tmdb_id) && tmdb(a.tmdb_id) !== tmdb(b.tmdb_id));

export function motnEnvelope(...values) {
  const offers = new Map();
  for (const value of values) {
    if (value?.format !== 1 || value.country !== "AT") continue;
    for (const offer of list(value.offers)) {
      if (offer?.country !== "AT" || !MOTN_SERVICES[offer.service_id]
          || typeof offer.available !== "boolean" || !offer.show_data
          || String(offer.show_id) !== offer.show_data.motn_id || !strongKeys(offer.show_data).length
          || time(offer.checked_at) === null) continue;
      const key = `${offer.show_id}:${offer.service_id}`;
      if (!offers.has(key) || time(offer.checked_at) > time(offers.get(key).checked_at)) offers.set(key,offer);
    }
  }
  return { format: 1, country: "AT", offers: [...offers.values()] };
}

// Strong IDs only. A matching title string never establishes availability.
export function applyMotnStreaming(titles, envelope, now = Date.now()) {
  const result = titles.map(title => ({ ...title, dienste: [...list(title.dienste)], web_urls: { ...(title.web_urls || {}) } }));
  const index = new Map();
  result.forEach((title,i) => strongKeys(title).forEach(key => {
    if (!index.has(key)) index.set(key,new Set()); index.get(key).add(i);
  }));
  const groups = new Map();
  for (const offer of motnEnvelope(envelope).offers) {
    if (time(offer.checked_at) > now) continue;
    if (!groups.has(offer.show_id)) groups.set(offer.show_id,[]);
    groups.get(offer.show_id).push(offer);
  }
  for (const [id,offers] of groups) {
    const newest = [...offers].sort((a,b) => time(b.checked_at)-time(a.checked_at))[0];
    const data = newest.show_data;
    const candidates = new Set(strongKeys(data).flatMap(key => [...(index.get(key) || [])]));
    if (candidates.size > 1) continue;
    const match = [...candidates][0];
    if (match !== undefined && conflicts(result[match],data)) continue;
    if (match === undefined && !offers.some(offer => offer.available && !offer.watchmode_seen_at)) continue;
    const title = match === undefined ? { ...data, watchmode_id: null, streaming_id: `motn:${id}`,
      dienste: [], web_urls: {}, relevanz: 0, relevanz_signale: [] } : result[match];
    title.motn_id = id;
    title.streaming_aliases = [...new Set([...(title.streaming_aliases || []), `motn:${id}`,
      ...(title.watchmode_id != null ? [String(title.watchmode_id)] : [])])];
    title.motn_zugaenge = [];
    title.motn_checked_at = newest.checked_at;
    title.motn_source_url = "https://www.movieofthenight.com/about/api";
    // A complete, identity-checked AT snapshot validates stale Watchmode
    // offers too. Channel service names are intentionally outside this map.
    if (Array.isArray(data.at_subscription_services)) {
      for (const [service,name] of Object.entries(MOTN_SERVICES)) {
        if (!data.at_subscription_services.includes(service)) {
          title.dienste = title.dienste.filter(value => value !== name);
          delete title.web_urls[name];
        }
      }
    }
    for (const storedOffer of offers) {
      let offer = storedOffer;
      if (time(storedOffer.checked_at) < time(newest.checked_at) && Array.isArray(data.at_subscription_offers)) {
        const current = data.at_subscription_offers.filter(value => value.service === storedOffer.service_id);
        offer = { ...storedOffer, available: current.length > 0,
          link: current[0]?.link || null,
          added_at: current.map(value => value.added_at).filter(value => time(value) !== null).sort()[0] ?? null };
      }
      const name = MOTN_SERVICES[offer.service_id];
      if (!offer.available) {
        title.dienste = title.dienste.filter(value => value !== name);
        delete title.web_urls[name];
      } else {
        if (!offer.watchmode_seen_at || title.dienste.includes(name)) {
          if (!title.dienste.includes(name)) title.dienste.push(name);
          title.web_urls[name] = offer.link;
          if (time(offer.added_at) !== null && time(offer.added_at) <= now) {
            title.motn_zugaenge.push({ dienst: name, erkannt_am: offer.added_at });
          }
        }
      }
    }
    const motnServices = new Set(offers.map(offer => MOTN_SERVICES[offer.service_id]));
    // Watchmode catching up is not a second addition and cannot restart Neu.
    if (Array.isArray(title.dienst_diffs)) title.dienst_diffs = title.dienst_diffs.filter(diff => !motnServices.has(diff.dienst));
    if (match === undefined) {
      const position = result.length; result.push(title);
      strongKeys(title).forEach(key => { if (!index.has(key)) index.set(key,new Set()); index.get(key).add(position); });
    }
  }
  return result.filter(title => !title.motn_checked_at || title.dienste.length);
}
