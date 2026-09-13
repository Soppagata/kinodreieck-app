const ORIGIN = "https://api.movieofthenight.com/v4";
export const MOTN_COUNTRY = "at";
export const MOTN_CATALOGS = Object.freeze([
  "netflix.subscription", "prime.subscription", "disney.subscription",
  "apple.subscription", "hbo.subscription", "paramount.subscription",
  "mubi.subscription", "crunchyroll.subscription", "rtl.subscription",
]);

export class MotnError extends Error {
  constructor(code, status = null) { super(code); this.code = code; this.status = status; }
}

// Direct developer-platform keys use v4 and X-API-Key, not RapidAPI headers.
// https://docs.movieofthenight.com/guide/authentication
export function createMotnClient({ apiKey, fetchImpl = fetch, maxRequests = 4, timeoutMs = 15000 } = {}) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 25
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new MotnError("MOTN_INVALID_LIMIT");
  }
  let requests = 0;
  async function get(path, query) {
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new MotnError("MOTN_NOT_CONFIGURED");
    if (requests >= maxRequests) throw new MotnError("MOTN_REQUEST_LIMIT");
    requests += 1;
    let response;
    try {
      response = await fetchImpl(`${ORIGIN}${path}?${new URLSearchParams(query)}`, {
        headers: { "X-API-Key": apiKey, Accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw new MotnError("MOTN_TRANSPORT_ERROR"); }
    if (!response.ok) throw new MotnError("MOTN_HTTP_ERROR", response.status);
    try { return await response.json(); }
    catch { throw new MotnError("MOTN_INVALID_JSON"); }
  }
  return {
    get requests() { return requests; },
    async show(imdbId) {
      if (!/^tt\d{7,10}$/.test(imdbId || "")) throw new MotnError("MOTN_INVALID_ID");
      return get(`/shows/${imdbId}`, { country: MOTN_COUNTRY, series_granularity: "show", output_language: "de" });
    },
    async changes({ type, from, to, catalogs = MOTN_CATALOGS, cursor = null } = {}) {
      if (!["new", "removed"].includes(type)
          || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to
          || !Array.isArray(catalogs) || !catalogs.length || catalogs.length > 32
          || catalogs.some(value => !MOTN_CATALOGS.includes(value))
          || (cursor !== null && (typeof cursor !== "string" || !cursor || cursor.length > 2048))) {
        throw new MotnError("MOTN_INVALID_QUERY");
      }
      const query = { country: MOTN_COUNTRY, change_type: type, item_type: "show",
        catalogs: catalogs.join(","), from: String(from), to: String(to),
        order_direction: "asc", output_language: "de" };
      if (cursor !== null) query.cursor = cursor;
      return get("/changes", query);
    },
  };
}
