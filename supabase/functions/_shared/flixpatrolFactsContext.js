import {
  externeTitelKennungen,
  externesReferenzjahr,
  normalisiereExterneTitelkennung,
  normalisiereExternenTitel,
  normalisiereExterneWerkart,
  ordneExternenTitelZu,
} from "./externalTitleIdentity.js";
import { FLIXPATROL_AT_CHARTS, normalisiereTitleFactsProjektionen } from "./flixpatrolFacts.js";

export const FLIXPATROL_CONTEXT_AT_CHARTS = FLIXPATROL_AT_CHARTS;

const FLIXPATROL_ID = /^ttl_[A-Za-z0-9]{20,40}$/;
const HTTP_URL = /^https:\/\/flixpatrol\.com\/title\/[^?#\s]+\/$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const text = (value, max) => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= max && !CONTROL.test(cleaned) ? cleaned : null;
};
const year = (value) => Number.isInteger(value) && value >= 1870 && value <= 2999 ? value : null;
const mediaType = (value) => value === "film" ? "film" : value === "series" || value === "serie" ? "serie" : null;
const positiveId = (value) => /^\d+$/.test(String(value ?? "").trim()) && /[1-9]/.test(String(value ?? ""))
  ? String(value).trim().replace(/^0+(?=\d)/, "") : null;
const imdbId = (value) => /^(?:tt)?[0-9]{5,12}$/i.test(String(value ?? "").trim())
    && /[1-9]/.test(String(value ?? ""))
  ? `tt${String(value).trim().toLowerCase().replace(/^tt/, "")}` : null;

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeRpcResult(result) {
  if (result && typeof result === "object" && "data" in result) {
    if (result.error) throw new Error("flixpatrol-context-rpc");
    return result.data;
  }
  return result;
}

function targetKennung(targetId) {
  if (typeof targetId !== "string") return null;
  if (targetId.startsWith("imdb:")) return { namespace: "imdb", value: targetId.slice(5) };
  const tmdb = /^tmdb:(movie|tv):(.+)$/.exec(targetId);
  if (tmdb) return {
    namespace: "tmdb",
    value: tmdb[2],
    mediaType: tmdb[1] === "movie" ? "film" : "series",
  };
  if (targetId.startsWith("watchmode:")) return { namespace: "watchmode", value: targetId.slice(10) };
  if (targetId.startsWith("flixpatrol:")) return { namespace: "flixpatrol", value: targetId.slice(11) };
  return null;
}

/* Ein einziger reiner Identitaetsbauer fuer Forecast und Radar. Jede Kennung
   wird mit dem E3-Vertrag normalisiert. Zwei Werte desselben Namensraums
   duerfen sich danach entweder gleichen oder ergeben einen sichtbaren
   Konflikt; kein spaeteres Objekt-Spread kann ihn ueberschreiben. */
/** @param {{titel?: unknown, originaltitel?: unknown, jahr?: unknown, typ?: unknown, externeIds?: Record<string, unknown>, filmkennung?: {namespace: string, kennung: unknown} | null, targetId?: unknown}} [options] */
export function baueFlixpatrolKontextIdentitaet({
  titel,
  originaltitel = null,
  jahr,
  typ,
  externeIds = {},
  filmkennung = null,
  targetId = null,
} = {}) {
  const ids = {};
  const add = (namespace, raw) => {
    if (raw === null || raw === undefined || raw === "") return null;
    const normalized = normalisiereExterneTitelkennung(namespace, raw);
    if (!normalized) return { reason: "external-id-invalid", namespace };
    if (ids[namespace] && ids[namespace] !== normalized) {
      return { reason: "external-id-conflict", namespace };
    }
    ids[namespace] = normalized;
    return null;
  };
  for (const namespace of ["flixpatrol", "imdb", "tmdb", "watchmode"]) {
    const conflict = add(namespace, externeIds?.[namespace]);
    if (conflict) return freezeDeep({ ok: false, identity: null, ...conflict });
  }
  if (filmkennung && ["imdb", "tmdb"].includes(filmkennung.namespace)) {
    const conflict = add(filmkennung.namespace, filmkennung.kennung);
    if (conflict) return freezeDeep({ ok: false, identity: null, ...conflict });
  }
  const target = targetKennung(targetId);
  if (target) {
    const ownType = normalisiereExterneWerkart({ typ });
    if (target.mediaType && ownType !== target.mediaType) {
      return freezeDeep({
        ok: false,
        identity: null,
        reason: "target-media-type-conflict",
        namespace: target.namespace,
      });
    }
    const conflict = add(target.namespace, target.value);
    if (conflict) return freezeDeep({ ok: false, identity: null, ...conflict });
  }
  return freezeDeep({
    ok: true,
    identity: {
      titel,
      originaltitel,
      jahr,
      typ,
      ...(ids.imdb ? { imdb_id: ids.imdb } : {}),
      ...(ids.tmdb ? { tmdb_id: ids.tmdb } : {}),
      ...(ids.watchmode ? { watchmode_id: ids.watchmode } : {}),
      ...(ids.flixpatrol ? { flixpatrol_id: ids.flixpatrol } : {}),
    },
  });
}

export function normalisiereFlixpatrolKontextTitel(rows) {
  return Object.freeze(normalisiereTitleFactsProjektionen(rows).map((projection) => freezeDeep({
    projection,
    sourceId: projection.identity.flixpatrolId,
    flixpatrol_id: projection.identity.flixpatrolId,
    titel: projection.identity.title,
    jahr: projection.identity.year,
    typ: projection.identity.mediaType === "series" ? "serie" : projection.identity.mediaType,
    imdb_id: projection.identity.imdbId,
    tmdb_id: projection.identity.tmdbId,
    beschreibung: projection.description,
    laufzeit_minuten: projection.runtimeMinutes,
    premiere: projection.premiere,
    checkedAt: projection.checkedAt,
    fetchedAt: projection.fetchedAt,
    freshUntil: projection.freshUntil,
    fresh: projection.fresh,
    sourceUrl: projection.sourceUrl,
    genres: projection.genres,
    keywords: projection.keywords,
    descriptionLanguage: projection.descriptionLanguage,
  })));
}

function chartIds(result, spec) {
  const chart = result?.ok === true ? result.chart : null;
  if (!chart || chart.companyId !== spec.companyId || chart.countryId !== spec.countryId
      || chart.chartType !== spec.chartType || !Array.isArray(chart.items)) return [];
  return chart.items.map((item) => text(item?.sourceId, 64))
    .filter((id) => id && FLIXPATROL_ID.test(id));
}

function directFlixpatrolId(identity) {
  return externeTitelKennungen(identity).flixpatrol || null;
}

export function findeFlixpatrolKontextFakt(identity, facts) {
  const match = ordneExternenTitelZu(identity, Array.isArray(facts) ? facts : []);
  return match.status === "matched" ? match.match : null;
}

export function projiziereFlixpatrolKontext(fact) {
  if (!fact) return null;
  if (fact.projection?.schemaVersion === "title-facts-projection-v1") return fact.projection;
  return normalisiereTitleFactsProjektionen([{
    sourceId: fact.flixpatrol_id,
    mediaType: fact.typ === "serie" ? "series" : fact.typ,
    status: "resolved",
    title: fact.titel,
    releaseYear: fact.jahr,
    imdbId: fact.imdb_id,
    tmdbId: fact.tmdb_id,
    description: fact.beschreibung,
    descriptionLanguage: fact.descriptionLanguage,
    runtimeMinutes: fact.laufzeit_minuten,
    premiere: fact.premiere,
    checkedAt: fact.checkedAt,
    fetchedAt: fact.fetchedAt,
    freshUntil: fact.freshUntil,
    fresh: fact.fresh,
    sourceUrl: fact.sourceUrl,
    genres: fact.genres,
    keywords: fact.keywords,
  }])[0] ?? null;
}

export function baueFlixpatrolProfilHinweise(mentions, facts) {
  if (!Array.isArray(mentions) || !Array.isArray(facts)) return Object.freeze([]);
  const hints = [];
  for (const [filmIndex, mention] of mentions.entries()) {
    const title = normalisiereExternenTitel(mention?.titel ?? mention?.title);
    if (!title) continue;
    const mentionYear = externesReferenzjahr(mention);
    const mentionType = normalisiereExterneWerkart(mention);
    const candidates = facts.filter((fact) => {
      const titles = [fact?.titel, fact?.originaltitel, fact?.title, fact?.originalTitle]
        .map(normalisiereExternenTitel).filter(Boolean);
      return titles.includes(title)
        && (mentionYear === null || fact.jahr === mentionYear)
        && (mentionType === null || normalisiereExterneWerkart(fact) === mentionType);
    }).slice(0, 3).map((fact) => freezeDeep({
      flixpatrolId: fact.flixpatrol_id,
      title: fact.titel,
      year: fact.jahr,
      mediaType: fact.typ,
      checkedAt: fact.checkedAt,
      sourceUrl: fact.sourceUrl,
    }));
    if (candidates.length) hints.push(freezeDeep({ filmIndex, candidates }));
  }
  return Object.freeze(hints);
}

/** @param {{rpc?: (name: string, args: Record<string, unknown>) => unknown, timeoutMs?: number, now?: () => number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout}} [options] */
export function createFlixpatrolFactsContextReader({
  rpc,
  timeoutMs = 1500,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const call = async (name, args, deadline) => {
    if (typeof rpc !== "function") throw new Error("flixpatrol-context-reader");
    const remaining = Math.max(0, deadline - now());
    if (remaining === 0) throw new Error("flixpatrol-context-timeout");
    let timer = null;
    try {
      return normalizeRpcResult(await Promise.race([
        Promise.resolve().then(() => rpc(name, args)),
        new Promise((_, reject) => {
          timer = setTimer(() => reject(new Error("flixpatrol-context-timeout")), remaining);
        }),
      ]));
    } finally {
      if (timer !== null) clearTimer(timer);
    }
  };

  const load = async (identity = null) => {
    const deadline = now() + Math.max(1, Number(timeoutMs) || 1);
    try {
      const identifiers = externeTitelKennungen(identity);
      const directId = directFlixpatrolId(identity);
      if (directId) {
        const titles = await call("kd_flixpatrol_titles_read", { p_source_ids: [directId] }, deadline);
        return titles?.ok === true ? normalisiereFlixpatrolKontextTitel(titles.items) : Object.freeze([]);
      }
      if (identifiers.imdb || identifiers.tmdb) {
        try {
          const expectedMediaType = mediaType(identity?.typ ?? identity?.mediaType);
          const lookup = await call("kd_title_facts_lookup", {
            p_identities: [{
              ...(identifiers.imdb ? { imdbId: identifiers.imdb } : {}),
              ...(identifiers.tmdb ? { tmdbId: identifiers.tmdb } : {}),
              ...(expectedMediaType ? { mediaType: expectedMediaType } : {}),
            }],
          }, deadline);
          if (lookup?.ok === true && Array.isArray(lookup.items) && lookup.items.length) {
            return normalisiereFlixpatrolKontextTitel(lookup.items);
          }
        } catch { /* Ohne additive Migration bleibt der bisherige Chartfallback wirksam. */ }
      }
      const charts = await Promise.all(FLIXPATROL_CONTEXT_AT_CHARTS.map(async (spec) => ({
        spec,
        result: await call("kd_flixpatrol_chart_read", {
          p_company_id: spec.companyId,
          p_country_id: spec.countryId,
          p_chart_type: spec.chartType,
        }, deadline),
      })));
      const ids = [...new Set(charts.flatMap(({ result, spec }) => chartIds(result, spec)))].slice(0, 50);
      if (!ids.length) return Object.freeze([]);
      const titles = await call("kd_flixpatrol_titles_read", { p_source_ids: ids }, deadline);
      if (titles?.ok !== true) return Object.freeze([]);
      return normalisiereFlixpatrolKontextTitel(titles.items);
    } catch {
      return Object.freeze([]);
    }
  };

  const find = async (identity) => findeFlixpatrolKontextFakt(identity, await load(identity));
  return Object.freeze({
    load,
    find,
    async context(identity) {
      return projiziereFlixpatrolKontext(await find(identity));
    },
    async profileHints(mentions) {
      return baueFlixpatrolProfilHinweise(mentions, await load());
    },
  });
}
