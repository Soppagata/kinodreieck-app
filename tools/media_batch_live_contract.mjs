/* Rueckwaertskompatible Media-Fassade fuer den zentralen Smoke-Integrator.
   Die eigentliche, fuer P4/P5/P6 gemeinsame fail-closed Klassifikation liegt
   in ai_task_live_forms_contract.mjs; dieser Import veraendert keine
   Orchestrierung und fuehrt weder Netz noch Persistenz aus. */

import {
  klassifiziereMediaBatchLiveAntwort as klassifiziereGemeinsam,
  MEDIA_BATCH_LIVE_TASK,
} from "./ai_task_live_forms_contract.mjs";

export { MEDIA_BATCH_LIVE_TASK };
export const MEDIA_BATCH_LIVE_SHAPE_VERSION = "media-batch-live-shape-v1";

export function klassifiziereMediaBatchLiveAntwort(input = {}) {
  const gemeinsam = klassifiziereGemeinsam(input);
  return Object.freeze({
    ...gemeinsam,
    schemaVersion: MEDIA_BATCH_LIVE_SHAPE_VERSION,
  });
}

export function formatiereMediaBatchLiveKlassifikation(input) {
  return JSON.stringify(klassifiziereMediaBatchLiveAntwort(input));
}
