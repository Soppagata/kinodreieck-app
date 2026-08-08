import { useCallback, useRef, useState } from "react";
import { captureStorageContext } from "../services/storage.js";

/* Queue-zeitige, bestätigte Persistenz für kleine persönliche UI-Töpfe.
   Der sichtbare State wird erst nach erfolgreichem Write übernommen; ein
   Treiberwechsel oder Reject liefert false und lässt den vorherigen Stand
   unverändert. */
export function erstelleBestaetigtenStateWriter({
  key,
  liesWert,
  normalisiere = (wert) => wert,
  commit,
  meldeFehler,
  captureContext = captureStorageContext,
}) {
  let kette = Promise.resolve(true);
  return (berechne) => {
    const kontext = captureContext();
    const auftrag = kette.then(async () => {
      if (!kontext?.isCurrent?.()) return false;
      const vorher = liesWert();
      const roh = typeof berechne === "function" ? berechne(vorher) : berechne;
      let next;
      try { next = normalisiere(roh); }
      catch { return false; }
      if (next == null) return false;
      if (next === vorher) return vorher;
      try {
        await kontext.set(key, JSON.stringify(next));
        if (!kontext.isCurrent()) return false;
        commit(next);
        return next;
      } catch (error) {
        if (kontext.isCurrent()) meldeFehler?.(error);
        return false;
      }
    });
    kette = auftrag.catch(() => false);
    return auftrag;
  };
}

export function useConfirmedStorageState({ key, initial, normalisiere, setErr, fehlermeldung }) {
  const normalisiereRef = useRef(normalisiere);
  normalisiereRef.current = normalisiere;
  const [wert, setWertState] = useState(() => normalisiere(initial));
  const wertRef = useRef(wert);
  wertRef.current = wert;
  const setErrRef = useRef(setErr);
  setErrRef.current = setErr;
  const commit = useCallback((next) => {
    wertRef.current = next;
    setWertState(next);
    return next;
  }, []);
  const writerRef = useRef(null);
  if (!writerRef.current) {
    writerRef.current = erstelleBestaetigtenStateWriter({
      key,
      liesWert: () => wertRef.current,
      normalisiere: (next) => normalisiereRef.current(next),
      commit,
      meldeFehler: () => setErrRef.current?.(fehlermeldung),
    });
  }
  const uebernehmeBestaetigt = useCallback((roh) => {
    try { return commit(normalisiereRef.current(roh)); }
    catch { return false; }
  }, [commit]);
  const schreibe = useCallback((berechne) => writerRef.current(berechne), []);
  return { wert, wertRef, uebernehmeBestaetigt, schreibe };
}
