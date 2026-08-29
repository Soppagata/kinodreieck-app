import { useEffect, useRef, useState } from "react";
import { entdeckenDailyFeedService } from "../services/entdeckenDailyFeed.js";

/* Genau ein globaler Feed-Ladevorgang je App-Lauf. Der versionierte
   Staging-Fallback ist netzfrei; der Service kennt weder Konto noch
   Profil/Katalog. Bei Fehler bleibt ein bereits sichtbarer Feed. */
export function useWebDiscoveryFeed(active) {
  const [state, setState] = useState(() => Object.freeze({
    status: "idle", feed: null, responseMode: "structured", displayText: null,
    warnings: Object.freeze([]),
  }));
  const laufRef = useRef(null);
  useEffect(() => {
    if (!active || laufRef.current) return;
    const lauf = entdeckenDailyFeedService.load();
    laufRef.current = lauf;
    void lauf.then((result) => {
      if (laufRef.current !== lauf || !result || typeof result !== "object") return;
      setState((current) => Object.freeze({
        ...result,
        /* Ein schon sichtbarer, validierter Feed wird von einem leeren
           degradierten Ergebnis niemals im Browser weggeräumt. */
        feed: result.feed || current.feed,
      }));
    }).catch(() => {});
  }, [active]);
  return state;
}
