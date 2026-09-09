import {
  externeTitelKennungen,
  externesReferenzjahr,
  normalisiereExternenTitel,
  normalisiereExterneWerkart,
  ordneExternenTitelZu,
} from "./externalTitleIdentity.js";
import { FLIXPATROL_AT_CHARTS } from "./flixpatrolFacts.js";

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

export function normalisiereFlixpatrolKontextTitel(rows) {
  if (!Array.isArray(rows)) return Object.freeze([]);
  const seen = new Set();
  const facts = [];
  for (const row of rows) {
    const sourceId = text(row?.sourceId, 64);
    const titel = text(row?.title, 240);
    const typ = mediaType(row?.mediaType);
    const jahr = year(row?.releaseYear);
    if (!sourceId || !FLIXPATROL_ID.test(sourceId) || seen.has(sourceId)
        || row?.status !== "resolved" || !titel || !typ || jahr === null) continue;
    const sourceUrl = text(row?.sourceUrl, 1000);
    seen.add(sourceId);
    facts.push(freezeDeep({
      sourceId,
      flixpatrol_id: sourceId,
      titel,
      jahr,
      typ,
      imdb_id: imdbId(row?.imdbId),
      tmdb_id: positiveId(row?.tmdbId),
      beschreibung: text(row?.description, 2000),
      laufzeit_minuten: Number.isInteger(row?.runtimeMinutes) && row.runtimeMinutes > 0 && row.runtimeMinutes <= 1440
        ? row.runtimeMinutes : null,
      premiere: /^\d{4}-\d{2}-\d{2}$/.test(String(row?.premiere ?? "")) ? row.premiere : null,
      checkedAt: text(row?.checkedAt, 64),
      freshUntil: text(row?.freshUntil, 64),
      fresh: row?.fresh === true,
      sourceUrl: sourceUrl && HTTP_URL.test(sourceUrl) ? sourceUrl : null,
    }));
  }
  return Object.freeze(facts);
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
  return freezeDeep({
    source: "FlixPatrol",
    checkedAt: fact.checkedAt,
    fresh: fact.fresh === true,
    sourceUrl: fact.sourceUrl,
    identity: {
      flixpatrolId: fact.flixpatrol_id,
      imdbId: fact.imdb_id,
      tmdbId: fact.tmdb_id,
      title: fact.titel,
      year: fact.jahr,
      mediaType: fact.typ,
    },
    description: fact.beschreibung,
    runtimeMinutes: fact.laufzeit_minuten,
    premiere: fact.premiere,
  });
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
      const directId = directFlixpatrolId(identity);
      let ids;
      if (directId) {
        ids = [directId];
      } else {
        const charts = await Promise.all(FLIXPATROL_CONTEXT_AT_CHARTS.map(async (spec) => ({
          spec,
          result: await call("kd_flixpatrol_chart_read", {
            p_company_id: spec.companyId,
            p_country_id: spec.countryId,
            p_chart_type: spec.chartType,
          }, deadline),
        })));
        ids = [...new Set(charts.flatMap(({ result, spec }) => chartIds(result, spec)))].slice(0, 50);
      }
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
