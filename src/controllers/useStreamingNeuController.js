import { useCallback, useEffect, useMemo, useState } from "react";
import { projiziereStreamingNeu } from "../lib/streamingNeu.js";
import { streamingKatalogstaendePassen } from "../lib/streamingProjection.js";

/* Der Producer liefert bereits kleine, quellenbezogene Diffbelege. Der
   Controller hält sie nur für die offene App-Sitzung und projiziert Auswahl
   sowie Ablauf; er liest und schreibt keine persönlichen Speicherstände. */
export function useStreamingNeuController({
  kontextKey = "",
  auswahl = [],
  auswahlGeladen = false,
} = {}) {
  const [beleg, setBeleg] = useState(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const aktiverBeleg = beleg?.kontextKey === kontextKey ? beleg : null;
  const streamingNeu = useMemo(() => projiziereStreamingNeu({
    bekannt: aktiverBeleg?.bekannt,
    entdecken: aktiverBeleg?.entdecken,
    auswahl,
    auswahlGeladen,
    vollstaendig: aktiverBeleg?.vollstaendig === true,
    now: jetzt,
  }), [aktiverBeleg, auswahl, auswahlGeladen, jetzt]);

  useEffect(() => {
    setBeleg(null);
    setJetzt(Date.now());
  }, [kontextKey]);

  const uebernehmeVollkatalog = useCallback(({ bekannt, entdecken } = {}) => {
    if (!bekannt || !entdecken || entdecken?.katalogMengen?.umfang !== "voll"
        || !streamingKatalogstaendePassen(bekannt, entdecken)) {
      setBeleg(null);
      setJetzt(Date.now());
      return false;
    }
    setBeleg({ kontextKey, bekannt, entdecken, vollstaendig: true });
    setJetzt(Date.now());
    return true;
  }, [kontextKey]);

  /* Exakter Ablauf in einer offen gebliebenen PWA. Der nächste Render
     berechnet ausschließlich aus den unveränderten Producerbelegen neu. */
  useEffect(() => {
    if (!Number.isFinite(streamingNeu.naechsterAblauf)) return undefined;
    const wartezeit = Math.max(0, streamingNeu.naechsterAblauf - Date.now() + 5);
    const timer = window.setTimeout(() => setJetzt(Date.now()), wartezeit);
    return () => window.clearTimeout(timer);
  }, [streamingNeu.naechsterAblauf]);

  return { streamingNeu, uebernehmeVollkatalog };
}
