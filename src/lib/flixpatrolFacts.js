import {
  ergaenzeFehlendeExterneKennungen,
  ordneExternenTitelZu,
} from "./externalTitleIdentity.js";

export const FLIXPATROL_AT_CHARTS = Object.freeze([
  Object.freeze({ companyId: "cmp_qypvowjqFhEIpCc0HlQ6VoYk", countryId: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", chartType: "movies" }),
  Object.freeze({ companyId: "cmp_qypvowjqFhEIpCc0HlQ6VoYk", countryId: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", chartType: "tvshows" }),
  Object.freeze({ companyId: "cmp_oGtsgdpOrjIu3XzTEnWPt87Y", countryId: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", chartType: "movies" }),
  Object.freeze({ companyId: "cmp_oGtsgdpOrjIu3XzTEnWPt87Y", countryId: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", chartType: "tvshows" }),
  Object.freeze({ companyId: "cmp_VvmYc7OphiUds0Hgjbz5MESn", countryId: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", chartType: "movies" }),
]);

const ID = /^ttl_[A-Za-z0-9]{20,40}$/;
const text = (value, max = 5000) => String(value ?? "").trim().slice(0, max);
const year = (value) => Number.isInteger(Number(value)) && Number(value) >= 1870 && Number(value) <= 2999
  ? Number(value) : null;
const mediaType = (value) => value === "film" ? "film" : value === "series" ? "serie" : null;
const positiveId = (value) => /^\d+$/.test(String(value ?? "").trim()) && BigInt(String(value).trim()) > 0n
  ? Number(value) : null;
const imdbId = (value) => /^(?:tt)?[0-9]{5,12}$/i.test(String(value ?? "").trim())
  && /[1-9]/.test(String(value)) ? `tt${String(value).trim().toLowerCase().replace(/^tt/, "")}` : null;

export function normalisiereFlixpatrolFakten(chartAntworten, titelAntwort) {
  if (!Array.isArray(chartAntworten) || chartAntworten.length !== FLIXPATROL_AT_CHARTS.length
      || !titelAntwort || titelAntwort.ok !== true || !Array.isArray(titelAntwort.items)) return [];
  const charts = new Map();
  for (const [index, antwort] of chartAntworten.entries()) {
    const chart = antwort?.ok === true ? antwort.chart : null;
    const spec = FLIXPATROL_AT_CHARTS[index];
    if (!chart || chart.companyId !== spec.companyId || chart.countryId !== spec.countryId
        || chart.chartType !== spec.chartType || !Array.isArray(chart.items)) continue;
    for (const item of chart.items) {
      const sourceId = text(item?.sourceId, 64);
      const rank = Number(item?.ranking);
      if (!ID.test(sourceId) || !Number.isInteger(rank) || rank < 1 || rank > 10) continue;
      if (!charts.has(sourceId)) charts.set(sourceId, []);
      charts.get(sourceId).push(Object.freeze({
        companyId: spec.companyId, chartType: spec.chartType, rank,
        chartDate: text(chart.chartDate, 32) || null,
        fetchedAt: text(chart.fetchedAt, 64) || null,
        fresh: chart.fresh === true,
      }));
    }
  }
  const facts = [];
  const gesehen = new Set();
  for (const item of titelAntwort.items) {
    const sourceId = text(item?.sourceId, 64);
    const typ = mediaType(item?.mediaType);
    const titel = text(item?.title, 240);
    const jahr = year(item?.releaseYear);
    if (!ID.test(sourceId) || !charts.has(sourceId) || !typ || !titel || jahr == null
        || item?.status !== "resolved" || gesehen.has(sourceId)) continue;
    gesehen.add(sourceId);
    facts.push(Object.freeze({
      sourceId, flixpatrol_id: sourceId, titel, jahr, typ,
      imdb_id: imdbId(item.imdbId), tmdb_id: positiveId(item.tmdbId),
      beschreibung: text(item.description, 4000) || null,
      laufzeit_minuten: Number.isInteger(Number(item.runtimeMinutes)) && Number(item.runtimeMinutes) > 0
        ? Number(item.runtimeMinutes) : null,
      premiere: text(item.premiere, 32) || null,
      status: "resolved", fresh: item.fresh === true,
      checkedAt: text(item.checkedAt, 64) || null,
      freshUntil: text(item.freshUntil, 64) || null,
      sourceUrl: text(item.sourceUrl, 1000) || null,
      charts: Object.freeze(charts.get(sourceId)),
    }));
  }
  return Object.freeze(facts);
}

function ergaenzungenFuer(eigen, fakt) {
  const ids = ergaenzeFehlendeExterneKennungen(eigen, fakt);
  const ergaenzungen = {};
  for (const feld of ["flixpatrol_id", "imdb_id", "tmdb_id"]) {
    if (ids[feld] !== undefined && eigen?.[feld] == null) ergaenzungen[feld] = ids[feld];
  }
  if (!text(eigen?.beschreibung) && fakt.beschreibung) ergaenzungen.beschreibung = fakt.beschreibung;
  if (eigen?.laufzeit_minuten == null && fakt.laufzeit_minuten != null) ergaenzungen.laufzeit_minuten = fakt.laufzeit_minuten;
  if (!text(eigen?.premiere) && fakt.premiere) ergaenzungen.premiere = fakt.premiere;
  return ergaenzungen;
}

export function baueFlixpatrolVorschlaege(eintraege, fakten) {
  return (Array.isArray(eintraege) ? eintraege : []).map((eintrag) => {
    const zuordnung = ordneExternenTitelZu(eintrag, fakten);
    if (zuordnung.status !== "matched") return { ...eintrag };
    const fakt = zuordnung.match;
    const ergaenzungen = ergaenzungenFuer(eintrag, fakt);
    if (!Object.keys(ergaenzungen).length) return { ...eintrag };
    return {
      ...eintrag,
      flixpatrolVorschlag: Object.freeze({
        ausgewaehlt: true,
        matchedBy: zuordnung.matchedBy,
        sourceId: fakt.sourceId,
        fresh: fakt.fresh,
        checkedAt: fakt.checkedAt,
        sourceUrl: fakt.sourceUrl,
        charts: fakt.charts,
        ergaenzungen: Object.freeze(ergaenzungen),
      }),
    };
  });
}

export function uebernehmeFlixpatrolVorschlag(eintrag) {
  const vorschlag = eintrag?.flixpatrolVorschlag;
  const ergebnis = { ...eintrag };
  delete ergebnis.flixpatrolVorschlag;
  if (!vorschlag || vorschlag.ausgewaehlt !== true || !vorschlag.ergaenzungen) return ergebnis;
  for (const [feld, wert] of Object.entries(vorschlag.ergaenzungen)) {
    if ((ergebnis[feld] == null || ergebnis[feld] === "") && wert != null && wert !== "") ergebnis[feld] = wert;
  }
  return ergebnis;
}
