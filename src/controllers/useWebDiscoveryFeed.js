import { useEffect, useRef, useState } from "react";
import { entdeckenDailyFeedService } from "../services/entdeckenDailyFeed.js";

/* Genau ein globaler Feed-GET je App-Lauf. Der Service selbst kennt weder
   Konto noch Profil/Katalog; bei Fehler bleibt ein bereits sichtbarer Feed. */
export function useWebDiscoveryFeed(active) {
  const [feed, setFeed] = useState(null);
  const laufRef = useRef(null);
  useEffect(() => {
    if (!active || laufRef.current) return;
    const lauf = entdeckenDailyFeedService.load();
    laufRef.current = lauf;
    void lauf.then((result) => {
      if (laufRef.current === lauf && result?.feed) setFeed(result.feed);
    }).catch(() => {});
  }, [active]);
  return feed;
}
