import { aiService, normalisiereAiErgebnis } from "./ai.js";
import { BoundaryError, ERROR_CODES } from "./errors.js";
import { ladeProfil } from "../lib/profil.js";
import { bauePrognoseAuftrag } from "../lib/prognoseAuftrag.js";
import {
  erstellePrognose, PROGNOSE_PROMPT_VERSION,
} from "../lib/prognose.js";

function lokaleGrenze(reason, details = []) {
  return new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
    source: "forecast",
    operation: "forecast.validate",
    reason,
    message: details.join("; ") || undefined,
  });
}

export function pruefeVorbewertungsBereitschaft(film, profil) {
  return bauePrognoseAuftrag(film, profil);
}

export function verarbeiteVorbewertungsAntwort(antwort, {
  profilVersion,
  jetzt,
} = {}) {
  if (!antwort || antwort.ok !== true) {
    throw lokaleGrenze("forecast-response-envelope");
  }
  const sicher = normalisiereAiErgebnis("film-forecast", antwort);
  const responseMode = sicher.responseMode || "structured";
  if (responseMode === "degraded") {
    return Object.freeze({
      responseMode,
      displayText: sicher.displayText,
      warnings: sicher.warnings,
      prognose: null,
    });
  }

  const gebaut = erstellePrognose({
    ergebnis: sicher.data,
    profilVersion,
    modell: sicher.modell,
    modellAlias: sicher.modellAlias,
    vorgangId: sicher.vorgangId,
    verbrauch: sicher.verbrauch,
    warumHerkunft: sicher.provenienz?.warumHerkunft || "persoenlich_geschaetzt",
    filmwissenVersionId: sicher.provenienz?.filmwissenVersionId ?? null,
    promptVersion: PROGNOSE_PROMPT_VERSION,
    jetzt,
  });
  if (!gebaut.ok) throw lokaleGrenze("forecast-response-invalid", gebaut.fehler);
  return Object.freeze({
    responseMode,
    displayText: responseMode === "partial" ? sicher.displayText : null,
    warnings: sicher.warnings || Object.freeze([]),
    prognose: gebaut.prognose,
  });
}

export async function erstelleVorbewertungsErgebnis(film, {
  profil: profilVorgabe,
  ai = aiService,
  jetzt,
  signal,
  vorgangId,
} = {}) {
  const profil = profilVorgabe === undefined ? await ladeProfil() : profilVorgabe;
  const auftrag = bauePrognoseAuftrag(film, profil);
  if (!auftrag.ok) throw lokaleGrenze("forecast-not-ready", auftrag.fehler);

  const antwort = await ai.runTask("film-forecast", auftrag.payload, {
    promptVersion: PROGNOSE_PROMPT_VERSION,
    profilVersion: auftrag.profilVersion,
    signal,
    vorgangId,
  });
  return verarbeiteVorbewertungsAntwort(antwort, {
    profilVersion: auftrag.profilVersion,
    jetzt,
  });
}

/* Bestehende Aufrufer bekommen weiterhin direkt ein Prognoseobjekt. Der
   Controller nutzt die Ergebnisvariante darüber, damit ein sicherer
   degradierter Hinweis sichtbar werden kann, ohne ein Prognosefeld zu
   persistieren. */
export async function erstelleVorbewertung(film, optionen = {}) {
  const ergebnis = await erstelleVorbewertungsErgebnis(film, optionen);
  if (!ergebnis.prognose) {
    throw lokaleGrenze("forecast-response-degraded", [
      ergebnis.displayText || "Es konnten keine sicheren Prognosefelder übernommen werden.",
    ]);
  }
  return ergebnis.prognose;
}

export const vorbewertungService = Object.freeze({
  pruefeBereitschaft: pruefeVorbewertungsBereitschaft,
  erstelle: erstelleVorbewertung,
});
