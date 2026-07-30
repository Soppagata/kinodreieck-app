import { aiService } from "./ai.js";
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

export async function erstelleVorbewertung(film, {
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
  if (!antwort || antwort.ok !== true) {
    throw lokaleGrenze("forecast-response-envelope");
  }

  const gebaut = erstellePrognose({
    ergebnis: antwort.data,
    profilVersion: auftrag.profilVersion,
    modell: antwort.modell,
    modellAlias: antwort.modellAlias,
    vorgangId: antwort.vorgangId,
    verbrauch: antwort.verbrauch,
    warumHerkunft: antwort.provenienz?.warumHerkunft || "persoenlich_geschaetzt",
    filmwissenVersionId: antwort.provenienz?.filmwissenVersionId ?? null,
    promptVersion: PROGNOSE_PROMPT_VERSION,
    jetzt,
  });
  if (!gebaut.ok) throw lokaleGrenze("forecast-response-invalid", gebaut.fehler);
  return gebaut.prognose;
}

export const vorbewertungService = Object.freeze({
  pruefeBereitschaft: pruefeVorbewertungsBereitschaft,
  erstelle: erstelleVorbewertung,
});
