import { sigAusSchema } from "../src/lib/finder.js";
import { ausExtraktion } from "../src/lib/extraktion.js";
import {
  erteileEinwilligung,
  leeresProfil,
  pruefeProfil,
  pruefeSignal,
  sammle,
  uebernimmAlle,
  uebernimmBlogProfilSignale,
  uebernimmRahmen,
  vorschlagRahmen,
} from "../src/lib/profil.js";
import { erstellePrognose, pruefePrognose, pruefePrognoseErgebnis } from "../src/lib/prognose.js";
import { dekodiereFilmwissen } from "../src/lib/filmwissen.js";
import { normalisiereStapelAntwort, baueStapelUebernahme } from "../src/lib/stapelimport.js";
import { pruefeBlogProfilAnalyseAntwort } from "../src/lib/blogProfilAnalyse.js";
import { uebernimmBlogVokabular, vokabularZuMap } from "../src/lib/vokabular.js";

export const AI_USER_TASKS = Object.freeze([
  "intelligent-search",
  "profile-extract",
  "film-forecast",
  "filmwissen-synthese",
  "media-batch-extract",
  "blog-profile-extract",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERBRAUCH_KEYS = Object.freeze([
  "dauerMs", "inputTokens", "kostenUsdCent", "outputTokens", "stopReason",
]);
const BASIS_KEYS = Object.freeze([
  "data", "modell", "modellAlias", "ok", "task", "verbrauch", "vorgangId",
]);

export class AiUserTaskContractError extends Error {
  constructor(code, detail = "") {
    super(`AI_USER_TASK_CONTRACT:${code}${detail ? `:${detail}` : ""}`);
    this.name = "AiUserTaskContractError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new AiUserTaskContractError(code, detail); };
const objekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);
const gleicheKeys = (wert, keys) => objekt(wert)
  && Object.keys(wert).sort().join("|") === [...keys].sort().join("|");

function pruefeVerbrauch(verbrauch) {
  if (!gleicheKeys(verbrauch, VERBRAUCH_KEYS)) fail("VERBRAUCH_FORM");
  for (const key of ["inputTokens", "outputTokens", "dauerMs"]) {
    if (!Number.isInteger(verbrauch[key]) || verbrauch[key] < 0) fail("VERBRAUCH_WERT", key);
  }
  if (typeof verbrauch.kostenUsdCent !== "number"
      || !Number.isFinite(verbrauch.kostenUsdCent)
      || verbrauch.kostenUsdCent < 0) fail("VERBRAUCH_WERT", "kostenUsdCent");
  if (!(verbrauch.stopReason === null
      || (typeof verbrauch.stopReason === "string" && verbrauch.stopReason.length <= 80))) {
    fail("VERBRAUCH_WERT", "stopReason");
  }
}

function pruefeErfolgshuelle(task, antwort) {
  if (!AI_USER_TASKS.includes(task)) fail("TASK_UNBEKANNT", String(task));
  const cacheHit = task === "filmwissen-synthese" && antwort?.data?.status === "cache_hit";
  if (cacheHit) {
    const keys = Object.hasOwn(antwort, "verbrauch")
      ? ["data", "ok", "task", "verbrauch", "vorgangId"]
      : ["data", "ok", "task", "vorgangId"];
    if (!gleicheKeys(antwort, keys)) fail("ERFOLGSHUELLE_FORM");
    if (antwort.ok !== true) fail("KEIN_ERFOLG");
    if (antwort.task !== task) fail("TASK_ABWEICHUNG", String(antwort.task));
    if (!UUID.test(antwort.vorgangId || "")) fail("VORGANG_ID");
    if (Object.hasOwn(antwort, "verbrauch") && antwort.verbrauch !== null) fail("VERBRAUCH_CACHE_HIT");
    return;
  }
  const keys = task === "film-forecast" ? [...BASIS_KEYS, "provenienz"] : BASIS_KEYS;
  if (!gleicheKeys(antwort, keys)) fail("ERFOLGSHUELLE_FORM");
  if (antwort.ok !== true) fail("KEIN_ERFOLG");
  if (antwort.task !== task) fail("TASK_ABWEICHUNG", String(antwort.task));
  if (!UUID.test(antwort.vorgangId || "")) fail("VORGANG_ID");
  if (typeof antwort.modell !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(antwort.modell)) {
    fail("MODELL");
  }
  if (typeof antwort.modellAlias !== "string" || !antwort.modellAlias.trim()) fail("MODELL_ALIAS");
  if (!objekt(antwort.data)) fail("DATA_FORM");
  if (task === "film-forecast") {
    const provenienz = antwort.provenienz;
    if (!gleicheKeys(provenienz, ["filmwissenVersionId", "warumHerkunft"])) {
      fail("FORECAST_PROVENIENZ_FORM");
    }
    const persoenlich = provenienz.warumHerkunft === "persoenlich_geschaetzt"
      && provenienz.filmwissenVersionId === null;
    const filmwissen = provenienz.warumHerkunft === "filmwissen"
      && UUID.test(provenienz.filmwissenVersionId || "");
    if (!persoenlich && !filmwissen) fail("FORECAST_PROVENIENZ_WERT");
  }
  pruefeVerbrauch(antwort.verbrauch);
  if (antwort.verbrauch.inputTokens <= 0
      || antwort.verbrauch.outputTokens <= 0
      || antwort.verbrauch.kostenUsdCent <= 0) fail("VERBRAUCH_NICHT_POSITIV");
}

function jsonRoundtrip(wert) {
  let text;
  try { text = JSON.stringify(wert); } catch { fail("NICHT_SERIALISIERBAR"); }
  if (typeof text !== "string") fail("NICHT_SERIALISIERBAR");
  let gelesen;
  try { gelesen = JSON.parse(text); } catch { fail("READBACK_JSON"); }
  if (JSON.stringify(gelesen) !== text) fail("READBACK_DRIFT");
  return gelesen;
}

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const produktion = (fn) => {
  try { return fn(); }
  catch (error) {
    if (error instanceof AiUserTaskContractError) throw error;
    fail("PRODUKTIONSPARSER", error?.message || "unbekannt");
  }
};
const verbrauchFuerPrognose = (v) => ({
  inputTokens: v.inputTokens,
  outputTokens: v.outputTokens,
  kostenUsdCent: v.kostenUsdCent,
  dauerMs: v.dauerMs,
});

function pruefeFinder(antwort, kontext) {
  const parse = (data) => sigAusSchema(data, kontext.master || [], kontext.zusatzGenres || []);
  const geparst = parse(antwort.data);
  const gelesen = jsonRoundtrip(geparst);
  if (!gleich(gelesen, parse(jsonRoundtrip(antwort.data)))) fail("READBACK_DRIFT", "intelligent-search");
  return { persistenz: "sitzung", gelesen };
}

function pruefeProfilExtraktion(antwort, kontext) {
  const parse = (data) => ausExtraktion(data);
  const geparst = parse(antwort.data);
  if (geparst.verworfen.length) fail("PRODUKTIONSPARSER", geparst.verworfen[0].grund);
  geparst.signale.forEach((signal) => {
    const fehler = pruefeSignal(signal);
    if (fehler.length) fail("PRODUKTIONSPARSER", fehler[0]);
  });
  if (typeof kontext.jetzt !== "string" || !kontext.jetzt) fail("KONTEXT", "jetzt");
  let profil = erteileEinwilligung(leeresProfil(), kontext.jetzt);
  const gesammelt = sammle(profil, geparst.signale, kontext.jetzt);
  if (gesammelt.abgelehnt || gesammelt.verworfen.length) {
    fail("PRODUKTIONSPARSER", gesammelt.abgelehnt || gesammelt.verworfen[0]?.fehler?.[0]);
  }
  const signale = uebernimmAlle(gesammelt.profil, kontext.jetzt);
  if (signale.fehler) fail("PRODUKTIONSPARSER", signale.fehler);
  profil = signale.profil;
  if (geparst.rahmen) {
    const vorgeschlagen = vorschlagRahmen(profil, geparst.rahmen, kontext.jetzt);
    if (vorgeschlagen.fehler) fail("PRODUKTIONSPARSER", vorgeschlagen.fehler);
    const rahmen = uebernimmRahmen(vorgeschlagen.profil, kontext.jetzt);
    if (!rahmen.uebernommen || rahmen.fehler) fail("PRODUKTIONSPARSER", rahmen.fehler);
    profil = rahmen.profil;
  }
  const gelesen = jsonRoundtrip({ extraktion: geparst, profil });
  if (pruefeProfil(gelesen.profil).length) fail("READBACK_PARSER", "profile-extract");
  if (!gleich(gelesen.extraktion, parse(jsonRoundtrip(antwort.data)))) {
    fail("READBACK_DRIFT", "profile-extract");
  }
  return { persistenz: "lokales-json", gelesen };
}

function pruefeForecast(antwort, kontext) {
  const ergebnisFehler = pruefePrognoseErgebnis(antwort.data);
  if (ergebnisFehler.length) fail("PRODUKTIONSPARSER", ergebnisFehler[0]);
  const erstellt = erstellePrognose({
    ergebnis: antwort.data,
    profilVersion: kontext.profilVersion,
    promptVersion: kontext.promptVersion,
    modell: antwort.modell,
    modellAlias: antwort.modellAlias,
    vorgangId: antwort.vorgangId,
    verbrauch: verbrauchFuerPrognose(antwort.verbrauch),
    jetzt: kontext.jetzt,
  });
  if (!erstellt.ok) fail("PRODUKTIONSPARSER", erstellt.fehler[0]);
  const gelesen = jsonRoundtrip(erstellt.prognose);
  const readbackFehler = pruefePrognose(gelesen);
  if (readbackFehler.length) fail("READBACK_PARSER", readbackFehler[0]);
  return { persistenz: "lokales-json", gelesen };
}

function pruefeFilmwissen(antwort, kontext) {
  if (!gleicheKeys(antwort.data, ["status", "versionId"])
      || !["belegt", "cache_hit"].includes(antwort.data.status)
      || !UUID.test(antwort.data.versionId || "")) fail("FILMWISSEN_TASK_DATA");
  let gelesen;
  try { gelesen = dekodiereFilmwissen(jsonRoundtrip(kontext.rpcReadback)); }
  catch (error) { fail("READBACK_PARSER", error?.message || "filmwissen"); }
  if (gelesen.status !== "belegt" || gelesen.version?.id !== antwort.data.versionId) {
    fail("FILMWISSEN_VERSION_DRIFT");
  }
  return { persistenz: "providerfreie-rpc", gelesen: jsonRoundtrip(gelesen) };
}

function pruefeStapel(antwort, kontext) {
  const parse = (data) => produktion(() => normalisiereStapelAntwort({ data }, kontext.master || []));
  const geparst = parse(antwort.data);
  const gelesen = jsonRoundtrip(geparst);
  if (!gleich(gelesen, parse(jsonRoundtrip(antwort.data)))) fail("READBACK_DRIFT", "media-batch-extract");
  const uebernahme = jsonRoundtrip(baueStapelUebernahme(gelesen.kandidaten));
  return { persistenz: "lokales-json", gelesen, uebernahme };
}

function pruefeBlog(antwort, kontext) {
  const parse = (data) => pruefeBlogProfilAnalyseAntwort(data, kontext.artikelPayload);
  const geparst = parse(antwort.data);
  if (!geparst.ok) fail("PRODUKTIONSPARSER", geparst.fehler?.[0] || "blog-profile-extract");
  const profil = uebernimmBlogProfilSignale(kontext.profil, kontext.vorschaukopf, geparst.payload.geschmackszuege);
  if (profil.abgelehnt) fail("BLOG_PROFIL", profil.fehler?.[0]);
  const vokabular = uebernimmBlogVokabular(kontext.vokabular, kontext.vorschaukopf, geparst.payload.vokabular);
  if (vokabular.abgelehnt) fail("BLOG_VOKABULAR", vokabular.fehler?.[0]);
  const gelesen = jsonRoundtrip({ profil: profil.profil, vokabular: vokabular.vokabular });
  const profilFehler = pruefeProfil(gelesen.profil);
  if (profilFehler.length) fail("READBACK_PARSER", profilFehler[0]);
  vokabularZuMap(gelesen.vokabular);
  if (!parse(jsonRoundtrip(antwort.data)).ok) fail("READBACK_DRIFT", "blog-profile-extract");
  return { persistenz: "lokales-json", gelesen };
}

const PRUEFER = Object.freeze({
  "intelligent-search": pruefeFinder,
  "profile-extract": pruefeProfilExtraktion,
  "film-forecast": pruefeForecast,
  "filmwissen-synthese": pruefeFilmwissen,
  "media-batch-extract": pruefeStapel,
  "blog-profile-extract": pruefeBlog,
});

export function pruefeAiUserTaskReadback({ task, antwort, kontext = {} } = {}) {
  pruefeErfolgshuelle(task, antwort);
  const auswertung = PRUEFER[task](antwort, kontext);
  return Object.freeze({
    ok: true,
    task,
    vorgangId: antwort.vorgangId,
    verbrauch: antwort.verbrauch == null ? null : jsonRoundtrip(antwort.verbrauch),
    ...auswertung,
  });
}
