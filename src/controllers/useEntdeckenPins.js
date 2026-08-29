import { useCallback, useState } from "react";
import { normalizeEntdeckenPins, toggleEntdeckenPin } from "../lib/entdeckenPins.js";
import { K } from "../lib/storage.js";

/* Enger geraetelokaler State fuer Entdecken-Pins. Bewusst kein Storage-Treiber:
   Der Topf wird weder ins Konto synchronisiert noch ausserhalb von Start projiziert. */
export function useEntdeckenPins() {
  const [entdeckenPins, setEntdeckenPins] = useState(() => {
    try { return normalizeEntdeckenPins(JSON.parse(localStorage.getItem(K.entdeckenPins) || "[]")); }
    catch { return []; }
  });
  const persist = useCallback((pins) => {
    try { localStorage.setItem(K.entdeckenPins, JSON.stringify(pins)); } catch { /* geraetelokal best effort */ }
  }, []);
  const toggleRecommendationPin = useCallback((entry) => {
    const next = toggleEntdeckenPin(entdeckenPins, entry);
    setEntdeckenPins(next);
    persist(next);
  }, [entdeckenPins, persist]);
  const bereinigeEntdeckenPins = useCallback((pinIds) => {
    const ids = new Set(Array.isArray(pinIds) ? pinIds : []);
    if (!ids.size) return;
    setEntdeckenPins((aktuell) => {
      const next = aktuell.filter((pin) => !ids.has(pin.pinId));
      if (next.length !== aktuell.length) persist(next);
      return next;
    });
  }, [persist]);
  return { entdeckenPins, toggleRecommendationPin, bereinigeEntdeckenPins };
}
