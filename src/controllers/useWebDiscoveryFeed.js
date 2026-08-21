import { useEffect, useRef, useState } from "react";
import { entdeckenDailyFeedService } from "../services/entdeckenDailyFeed.js";

/* Genau ein globaler Feed-GET je App-Lauf. Bei Fehler bleibt ein bereits
   sichtbarer, validierter Feed erhalten; es entsteht kein Hintergrund-Loop. */
export function useWebDiscoveryFeed(
  active,
  authorized = true,
  service = entdeckenDailyFeedService,
) {
  const [feed, setFeed] = useState(null);
  const laufRef = useRef(null);
  useEffect(() => {
    if (!authorized) {
      laufRef.current = null;
      setFeed(null);
      return;
    }
    if (!active || laufRef.current) return;
    const lauf = service.load();
    laufRef.current = lauf;
    void lauf.then((result) => {
      if (laufRef.current === lauf && result?.feed) setFeed(result.feed);
    }).catch(() => {});
  }, [active, authorized, service]);
  return feed;
}
