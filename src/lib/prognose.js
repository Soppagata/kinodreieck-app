import { BEWERTUNGSKATEGORIE_IDS } from "./kategorien.js";

export const PROGNOSE_FORMAT = "film-prognose-v1";
export const PROGNOSE_PROMPT_VERSION = "v2";
export const PROGNOSE_STATUS = Object.freeze(["offen", "angenommen", "korrigiert", "verworfen"]);
export const PROGNOSE_SICHERHEIT = Object.freeze(["sehr_niedrig", "niedrig", "mittel", "hoch"]);
export const PROGNOSE_WARUM_HERKUNFT = Object.freeze(["persoenlich_geschaetzt", "filmwissen"]);

const STATUS_WECHSEL = Object.freeze({
  offen: new Set(["angenommen", "korrigiert", "verworfen"]),
  angenommen: new Set(["korrigiert", "verworfen"]),
  korrigiert: new Set(),
  verworfen: new Set(),
});
const VERSION_FORM = /^[a-z][a-z0-9._-]{0,31}$/;
const MODELL_FORM = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const SIGNAL_ID_FORM = /^S[1-9][0-9]{0,3}$/;
const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STEUERZEICHEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const istObjekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);
const hatExakt = (objekt, keys) => istObjekt(objekt)
  && Object.keys(objekt).sort().join("|") === [...keys].sort().join("|");
const istSkala = (wert) => wert === null || (Number.isInteger(wert) && wert >= 0 && wert <= 5);
const istPassung = (wert) => wert === null
  || (Number.isInteger(wert) && wert >= 0 && wert <= 100);
const istIso = (wert) => typeof wert === "string"
  && wert.length <= 40
  && !Number.isNaN(Date.parse(wert));
const istKurztext = (wert, max) => typeof wert === "string"
  && wert.trim() === wert
  && wert.length > 0
  && wert.length <= max
  && !STEUERZEICHEN.test(wert);

export function pruefeVerwendetesSignal(signal) {
  const fehler = [];
  if (!hatExakt(signal, ["id", "art", "wert", "richtung"])) return ["Signal hat nicht die erwartete Form"];
  if (!SIGNAL_ID_FORM.test(signal.id || "")) fehler.push("Signal-ID ist ungültig");
  if (!istKurztext(signal.art, 40)) fehler.push("Signal-Art ist ungültig");
  if (!istKurztext(signal.wert, 60)) fehler.push("Signal-Wert ist ungültig");
  if (!["zieht_an", "stoesst_ab", "ambivalent"].includes(signal.richtung)) {
    fehler.push("Signal-Richtung ist ungültig");
  }
  return fehler;
}

export function pruefePrognoseErgebnis(ergebnis) {
  const fehler = [];
  if (!hatExakt(ergebnis, [
    "format", "achsen", "passung", "kategorie_vorschlag", "sicherheit",
    "begruendung", "verwendete_signale",
  ])) return ["Ergebnis hat nicht die erwartete Form"];
  if (ergebnis.format !== PROGNOSE_FORMAT) fehler.push("Ergebnisformat ist unbekannt");
  if (!hatExakt(ergebnis.achsen, ["wie", "was", "warum"])) {
    fehler.push("Achsen haben nicht die erwartete Form");
  } else {
    if (!istSkala(ergebnis.achsen.wie)) fehler.push("WIE muss 0..5 oder null sein");
    if (!istSkala(ergebnis.achsen.was)) fehler.push("WAS muss 0..5 oder null sein");
    if (!istSkala(ergebnis.achsen.warum)) fehler.push("WARUM muss 0..5 oder null sein");
  }
  if (!istPassung(ergebnis.passung)) {
    fehler.push("Passung muss eine ganze Zahl von 0 bis 100 oder null sein");
  }
  if (ergebnis.kategorie_vorschlag !== null
      && !BEWERTUNGSKATEGORIE_IDS.includes(ergebnis.kategorie_vorschlag)) {
    fehler.push("Kategorie-Vorschlag ist unbekannt");
  }
  if (ergebnis.sicherheit !== null && !PROGNOSE_SICHERHEIT.includes(ergebnis.sicherheit)) {
    fehler.push("Sicherheit ist unbekannt");
  }
  if (ergebnis.begruendung !== null && !istKurztext(ergebnis.begruendung, 280)) {
    fehler.push("Begründung ist ungültig");
  }
  if (!Array.isArray(ergebnis.verwendete_signale) || ergebnis.verwendete_signale.length > 20) {
    fehler.push("Verwendete Signale müssen eine Liste mit höchstens 20 Einträgen sein");
  } else {
    const ids = new Set();
    ergebnis.verwendete_signale.forEach((signal, index) => {
      for (const f of pruefeVerwendetesSignal(signal)) fehler.push(`Signal ${index + 1}: ${f}`);
      if (istObjekt(signal) && ids.has(signal.id)) fehler.push("Signal-IDs dürfen nicht doppelt sein");
      if (istObjekt(signal)) ids.add(signal.id);
    });
  }
  return fehler;
}

export function pruefePrognose(prognose) {
  const fehler = [];
  const basisFelder = [
    "format", "erstellt", "geaendert", "promptVersion", "profilVersion",
    "modell", "modellAlias", "vorgangId", "verbrauch", "ergebnis", "status",
  ];
  const neueFelder = [...basisFelder, "warumHerkunft", "filmwissenVersionId"];
  const istAltbestand = hatExakt(prognose, basisFelder);
  if (!istAltbestand && !hatExakt(prognose, neueFelder)) {
    return ["Prognose hat nicht die erwartete Form"];
  }
  if (prognose.format !== PROGNOSE_FORMAT) fehler.push("Prognoseformat ist unbekannt");
  if (!istIso(prognose.erstellt) || !istIso(prognose.geaendert)) fehler.push("Zeitstempel ist ungültig");
  if (!VERSION_FORM.test(prognose.promptVersion || "")) fehler.push("Promptversion ist ungültig");
  if (!VERSION_FORM.test(prognose.profilVersion || "")) fehler.push("Profilversion ist ungültig");
  if (!MODELL_FORM.test(prognose.modell || "")) fehler.push("Modellversion ist ungültig");
  if (!istKurztext(prognose.modellAlias, 40)) fehler.push("Modellalias ist ungültig");
  if (!istKurztext(prognose.vorgangId, 80)) fehler.push("Vorgangs-ID ist ungültig");
  if (!PROGNOSE_STATUS.includes(prognose.status)) fehler.push("Status ist unbekannt");
  if (!istAltbestand) {
    if (!PROGNOSE_WARUM_HERKUNFT.includes(prognose.warumHerkunft)) {
      fehler.push("WARUM-Herkunft ist unbekannt");
    }
    if (prognose.warumHerkunft === "filmwissen") {
      if (!UUID_FORM.test(prognose.filmwissenVersionId || "")) {
        fehler.push("Filmwissen-Version ist ungültig");
      }
    } else if (prognose.filmwissenVersionId !== null) {
      fehler.push("Persönliche WARUM-Schätzung darf keine Filmwissen-Version tragen");
    }
  }
  if (!hatExakt(prognose.verbrauch, [
    "inputTokens", "outputTokens", "kostenUsdCent", "dauerMs",
  ])) {
    fehler.push("Verbrauch hat nicht die erwartete Form");
  } else {
    for (const key of ["inputTokens", "outputTokens", "dauerMs"]) {
      if (!Number.isInteger(prognose.verbrauch[key]) || prognose.verbrauch[key] < 0) {
        fehler.push(`${key} muss eine nichtnegative ganze Zahl sein`);
      }
    }
    if (typeof prognose.verbrauch.kostenUsdCent !== "number"
        || !Number.isFinite(prognose.verbrauch.kostenUsdCent)
        || prognose.verbrauch.kostenUsdCent < 0) {
      fehler.push("kostenUsdCent muss eine nichtnegative Zahl sein");
    }
  }
  fehler.push(...pruefePrognoseErgebnis(prognose.ergebnis));
  return fehler;
}

export function erstellePrognose({
  ergebnis,
  profilVersion,
  modell,
  modellAlias,
  vorgangId,
  verbrauch,
  warumHerkunft = "persoenlich_geschaetzt",
  filmwissenVersionId = null,
  promptVersion = PROGNOSE_PROMPT_VERSION,
  jetzt = new Date().toISOString(),
} = {}) {
  const prognose = {
    format: PROGNOSE_FORMAT,
    erstellt: jetzt,
    geaendert: jetzt,
    promptVersion,
    profilVersion,
    modell,
    modellAlias,
    vorgangId,
    warumHerkunft,
    filmwissenVersionId,
    verbrauch: {
      inputTokens: verbrauch?.inputTokens,
      outputTokens: verbrauch?.outputTokens,
      kostenUsdCent: verbrauch?.kostenUsdCent,
      dauerMs: verbrauch?.dauerMs,
    },
    ergebnis,
    status: "offen",
  };
  const fehler = pruefePrognose(prognose);
  return fehler.length ? { ok: false, prognose: null, fehler } : { ok: true, prognose, fehler: [] };
}

export function setzePrognoseStatus(prognose, status, jetzt = new Date().toISOString()) {
  const vorherFehler = pruefePrognose(prognose);
  if (vorherFehler.length) return { ok: false, prognose, fehler: vorherFehler };
  if (!STATUS_WECHSEL[prognose.status]?.has(status)) {
    return { ok: false, prognose, fehler: [`Statuswechsel ${prognose.status} → ${status} ist nicht erlaubt`] };
  }
  const naechste = { ...prognose, status, geaendert: jetzt };
  const fehler = pruefePrognose(naechste);
  return fehler.length ? { ok: false, prognose, fehler } : { ok: true, prognose: naechste, fehler: [] };
}

export function lesePrognose(film) {
  if (!istObjekt(film) || film.prognose == null) return { ok: true, prognose: null, fehler: [] };
  const fehler = pruefePrognose(film.prognose);
  return fehler.length
    ? { ok: false, prognose: null, fehler }
    : { ok: true, prognose: film.prognose, fehler: [] };
}

export function deckeleSicherheit(sicherheit, {
  signalAnzahl = 0,
  signalArten = 0,
  achsen = {},
} = {}) {
  const rang = PROGNOSE_SICHERHEIT.indexOf(sicherheit);
  if (rang < 0) return "sehr_niedrig";
  let maximum = 3;
  if (signalAnzahl <= 2) maximum = 0;
  else if (signalAnzahl <= 4 || signalArten < 2) maximum = 1;
  if (achsen?.wie == null || achsen?.was == null || achsen?.warum == null) {
    maximum = Math.min(maximum, 2);
  }
  return PROGNOSE_SICHERHEIT[Math.min(rang, maximum)];
}

export function prognoseIstVeraltet(prognose, aktuelleProfilVersion) {
  return !!prognose
    && typeof aktuelleProfilVersion === "string"
    && prognose.profilVersion !== aktuelleProfilVersion;
}

export function passungsBand(passung) {
  if (!Number.isInteger(passung) || passung < 0 || passung > 100) return null;
  if (passung < 25) return { id: "sehr_unwahrscheinlich", label: "passt wahrscheinlich nicht" };
  if (passung < 50) return { id: "eher_nicht", label: "passt eher nicht" };
  if (passung < 75) return { id: "eher_passend", label: "passt eher zu dir" };
  return { id: "sehr_passend", label: "passt wahrscheinlich sehr gut" };
}
