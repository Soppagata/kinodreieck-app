/* Datenfreie Normalisierung eines geladenen Katalogs.
   Online-Service und lokale Downloadbeilage liefern dadurch exakt dieselbe
   Form, ohne dass diese Regeln an Netzwerk- oder DOM-Code gekoppelt sind. */

import { ensureIds } from "./match.js";

export function zeitpunkt(wert) {
  if (wert == null || wert === "") return null;
  const t = typeof wert === "number" ? wert : Date.parse(wert);
  return Number.isFinite(t) ? t : null;
}

export const IMPORT_INFO = (stand) => ({
  art: "manuell",
  variante: null,
  stand,
  gueltigBis: null,
  abgelaufen: false,
  ausCache: false,
  anmeldungNoetig: false,
  fehler: null,
  code: null,
});

export function demoSeedZuLadung(seed) {
  const master = seed?.master || {};
  return {
    filme: ensureIds(master.filme || []),
    meta: master.meta || null,
    herkunft: { typ: "demo", zeit: master.meta?.erstellt_am || null },
    streaming: seed?.streaming_dienste || null,
    artikel: seed?.artikel || null,
    pins: seed?.kino_pins || [],
    mustwatch: seed?.mustwatch || null,
    merkliste: seed?.merkliste || [],
  };
}
