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
  ? String(value).trim().replace(/^0+(?=\d)/, "") : null;
const imdbId = (value) => /^(?:tt)?[0-9]{5,12}$/i.test(String(value ?? "").trim())
  && /[1-9]/.test(String(value)) ? `tt${String(value).trim().toLowerCase().replace(/^tt/, "")}` : null;

function vocabularyTerms(value, pattern) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const seen = new Set();
  const terms = [];
  for (const item of value) {
    const id = text(item?.id, 64);
    const name = text(item?.name, 240);
    if (!pattern.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    terms.push(Object.freeze({ id, name }));
  }
  return Object.freeze(terms);
}

export function normalisiereTitleFactsProjektionen(rows, chartsBySourceId = new Map()) {
  if (!Array.isArray(rows)) return Object.freeze([]);
  const facts = [];
  const gesehen = new Set();
  for (const item of rows) {
    const sourceId = text(item?.sourceId, 64);
    const providerType = item?.mediaType === "film" ? "film" : item?.mediaType === "series" ? "series" : null;
    const titel = text(item?.title, 240);
    const jahr = year(item?.releaseYear);
    if (!ID.test(sourceId) || !providerType || !titel || jahr == null
        || item?.status !== "resolved" || gesehen.has(sourceId)) continue;
    gesehen.add(sourceId);
    const descriptionLanguage = text(item?.descriptionLanguage, 32) || null;
    const charts = Array.isArray(chartsBySourceId?.get?.(sourceId))
      ? Object.freeze([...chartsBySourceId.get(sourceId)]) : Object.freeze([]);
    facts.push(Object.freeze({
      schemaVersion: "title-facts-projection-v1",
      source: "flixpatrol",
      checkedAt: text(item.checkedAt, 64) || null,
      fetchedAt: text(item.fetchedAt, 64) || null,
      freshUntil: text(item.freshUntil, 64) || null,
      fresh: item.fresh === true,
      sourceUrl: text(item.sourceUrl, 1000) || null,
      identity: Object.freeze({
        flixpatrolId: sourceId,
        imdbId: imdbId(item.imdbId),
        tmdbId: positiveId(item.tmdbId),
        watchmodeId: null,
        title: titel,
        originalTitle: null,
        year: jahr,
        mediaType: providerType,
      }),
      description: text(item.description, 4000) || null,
      descriptionLanguage,
      runtimeMinutes: Number.isInteger(Number(item.runtimeMinutes)) && Number(item.runtimeMinutes) > 0
        ? Number(item.runtimeMinutes) : null,
      premiere: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.premiere ?? "")) ? item.premiere : null,
      genres: vocabularyTerms(item.genres, /^gnr_[A-Za-z0-9]{20,40}$/),
      keywords: vocabularyTerms(item.keywords, /^kwd_[A-Za-z0-9]{20,40}$/),
      charts,
    }));
  }
  return Object.freeze(facts);
}

function legacyFact(projection) {
  return Object.freeze({
    ...projection,
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
    status: "resolved",
  });
}

export function normalisiereFlixpatrolFaktenAusCache(rows) {
  return Object.freeze(normalisiereTitleFactsProjektionen(rows).map(legacyFact));
}

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
  const rows = titelAntwort.items.filter((item) => charts.has(text(item?.sourceId, 64)));
  return Object.freeze(normalisiereTitleFactsProjektionen(rows, charts).map(legacyFact));
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

const ERGAENZUNGSFELDER = Object.freeze({
  flixpatrol_id: "FlixPatrol-ID", imdb_id: "IMDb-ID", tmdb_id: "TMDB-ID",
  beschreibung: "Beschreibung", laufzeit_minuten: "Laufzeit", premiere: "Premiere",
});

function formatiereDatum(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || "");
}

export function beschreibeFlixpatrolErgaenzungen(ergaenzungen) {
  return Object.entries(ERGAENZUNGSFELDER).flatMap(([feld, label]) => {
    const wert = ergaenzungen?.[feld];
    if (wert == null || wert === "") return [];
    const anzeige = feld === "laufzeit_minuten" ? `${wert} Minuten`
      : feld === "premiere" ? formatiereDatum(wert) : String(wert);
    return [Object.freeze({ feld, label, wert: anzeige })];
  });
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
  for (const feld of Object.keys(ERGAENZUNGSFELDER)) {
    const wert = vorschlag.ergaenzungen[feld];
    if ((ergebnis[feld] == null || ergebnis[feld] === "") && wert != null && wert !== "") ergebnis[feld] = wert;
  }
  return ergebnis;
}
