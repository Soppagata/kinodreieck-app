/* Strikter, accountfreier Clientvertrag fuer gemeinsames Filmwissen. */
export const FILMWISSEN_FORMAT = "filmwissen-cache-v1";
export const FILMWISSEN_STATUS = Object.freeze({
  NICHT_ZUORDENBAR: "nicht_zuordenbar", CACHE_MISS: "cache_miss",
  GESPERRT: "gesperrt", NICHT_BELEGT: "nicht_belegt",
  BELEGT: "belegt", VERALTET: "veraltet",
});
const PRIORITAET = [
  ["kinodreieck", ["filmwissen_werk_id", "filmwissenWerkId"]],
  ["imdb", ["imdb_id", "imdbId"]], ["tmdb", ["tmdb_id", "tmdbId"]],
  ["watchmode", ["watchmode_id", "watchmodeId"]], ["film_at", ["film_at_id", "filmAtId"]],
  ["wikidata", ["wikidata_id", "wikidataId"]],
];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const VERSION = /^[A-Za-z0-9._-]{1,20}$/;
const text = (v) => typeof v === "string" ? v.trim() : "";
const objekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function friere(v) {
  if (!v || typeof v !== "object" || Object.isFrozen(v)) return v;
  Object.values(v).forEach(friere); return Object.freeze(v);
}
export function normalisiereFilmkennung(namespace, wert) {
  const ns = text(namespace).toLowerCase(); const roh = text(wert);
  if (ns === "imdb") return /^tt[0-9]{7,10}$/i.test(roh) ? roh.toLowerCase() : null;
  if (["tmdb", "watchmode", "film_at"].includes(ns)) {
    return /^[0-9]{1,18}$/.test(roh) && /[1-9]/.test(roh) ? roh.replace(/^0+/, "") : null;
  }
  if (ns === "wikidata") return /^Q[1-9][0-9]{0,17}$/i.test(roh) ? roh.toUpperCase() : null;
  if (ns === "kinodreieck") return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(roh) ? roh : null;
  return null;
}
export function filmwissenKennungen(film) {
  if (!objekt(film)) return Object.freeze([]);
  const aus = [];
  for (const [namespace, felder] of PRIORITAET) {
    const roh = felder.map((f) => film[f]).find((v) => v !== null && v !== undefined && v !== "");
    const kennung = normalisiereFilmkennung(namespace, String(roh ?? ""));
    if (kennung) aus.push(Object.freeze({ namespace, kennung }));
  }
  return Object.freeze(aus);
}
const RECHERCHE_KENNUNGEN = new Set(["imdb", "tmdb", "wikidata"]);
export function filmwissenRechercheKennung(film) {
  return filmwissenKennungen(film)
    .find((kennung) => RECHERCHE_KENNUNGEN.has(kennung.namespace)) || null;
}
function ungueltig(grund) { throw new Error("Ungueltige Filmwissen-Antwort: " + grund); }
export function dekodiereFilmwissen(raw) {
  if (!objekt(raw) || raw.format !== FILMWISSEN_FORMAT) ungueltig("format");
  if (["cache_miss", "gesperrt"].includes(raw.status)) return friere({ format: FILMWISSEN_FORMAT, status: raw.status });
  if (!["belegt", "nicht_belegt"].includes(raw.status)) ungueltig("status");
  const { werk, version, warum } = raw; const fundstellen = raw.fundstellen;
  if (!objekt(werk) || !UUID.test(text(werk.id)) || !["film", "filmreihe", "serie"].includes(werk.typ)
      || !text(werk.titel) || !Number.isInteger(werk.jahr)) ungueltig("werk");
  if (!objekt(version) || !UUID.test(text(version.id)) || !Number.isInteger(version.nr) || version.nr < 1
      || !VERSION.test(text(version.schemaVersion)) || !VERSION.test(text(version.rubrikVersion))
      || !Number.isFinite(Date.parse(version.stand))) ungueltig("version");
  const wert = warum?.wert;
  if (!objekt(warum) || !["sehr_niedrig", "niedrig", "mittel", "hoch"].includes(warum.sicherheit)
      || !text(warum.kurztext) || !(wert === null || (Number.isInteger(wert) && wert >= 0 && wert <= 5))
      || (raw.status === "belegt") !== (wert !== null)) ungueltig("warum");
  if (!Array.isArray(fundstellen) || fundstellen.length < 1 || fundstellen.length > 5) ungueltig("fundstellen");
  const fund = fundstellen.map((f) => {
    if (!objekt(f) || !text(f.quelle) || !text(f.domain) || !text(f.titel)
        || !/^https:\/\/[^\s]{1,2048}$/.test(text(f.url)) || !text(f.attribution)
        || !Array.isArray(f.kernaussagen) || f.kernaussagen.length < 1 || f.kernaussagen.length > 10
        || f.kernaussagen.some((a) => !text(a) || text(a).length > 500)) ungueltig("fundstelle");
    return { quelle: text(f.quelle), domain: text(f.domain), titel: text(f.titel), url: text(f.url),
      veroeffentlichtAm: f.veroeffentlichtAm || null, abgerufenAm: f.abgerufenAm || null,
      attribution: text(f.attribution), kernaussagen: f.kernaussagen.map(text) };
  });
  return friere({ format: FILMWISSEN_FORMAT, status: raw.status,
    werk: { id: text(werk.id), typ: werk.typ, titel: text(werk.titel), originaltitel: text(werk.originaltitel) || null, jahr: werk.jahr },
    version: { id: text(version.id), nr: version.nr, schemaVersion: text(version.schemaVersion), rubrikVersion: text(version.rubrikVersion), stand: version.stand },
    warum: { wert, sicherheit: warum.sicherheit, kurztext: text(warum.kurztext) }, fundstellen: fund });
}
export const filmwissenSonderstatus = (status) => friere({ format: FILMWISSEN_FORMAT, status });
