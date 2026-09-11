import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  parseStreamingNeuUebergang,
  projiziereStreamingNeu,
  streamingNeuUebergangStorageKey,
} from "../lib/streamingNeu.js";
import { streamingKatalogstaendePassen } from "../lib/streamingProjection.js";
import {
  captureStorageContext,
  storageContextGenerationSnapshot,
  subscribeStorageContext,
} from "../lib/storage.js";

/* Der Producer liefert kleine, quellenbezogene Diffbelege. Der Controller
   projiziert Auswahl und Ablauf und liest ergänzend den liegen gebliebenen
   v2-Übergangsstand; er schreibt keinen persönlichen Speicherstand. */
export function useStreamingNeuController({
  kontextKey = "",
  auswahl = [],
  auswahlGeladen = false,
} = {}) {
  const [beleg, setBeleg] = useState(null);
  const [uebergang, setUebergang] = useState(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const storageGeneration = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );
  const aktiverBeleg = beleg?.kontextKey === kontextKey ? beleg : null;
  const aktiverUebergang = uebergang?.kontextKey === kontextKey
    && uebergang?.storageGeneration === storageGeneration ? uebergang.snapshot : null;
  const streamingNeu = useMemo(() => projiziereStreamingNeu({
    bekannt: aktiverBeleg?.bekannt,
    entdecken: aktiverBeleg?.entdecken,
    auswahl,
    auswahlGeladen,
    vollstaendig: aktiverBeleg?.vollstaendig === true,
    uebergang: aktiverUebergang,
    now: jetzt,
  }), [aktiverBeleg, aktiverUebergang, auswahl, auswahlGeladen, jetzt]);

  useEffect(() => {
    setBeleg(null);
    setJetzt(Date.now());
  }, [kontextKey]);

  useEffect(() => {
    let aktiv = true;
    const kontext = captureStorageContext();
    const key = streamingNeuUebergangStorageKey(kontext.owner);
    setUebergang(null);
    if (!key) return () => { aktiv = false; };
    kontext.get(key).then((gespeichert) => {
      if (!aktiv || !kontext.isCurrent()) return;
      setUebergang({
        kontextKey,
        storageGeneration,
        snapshot: parseStreamingNeuUebergang(gespeichert?.value, kontext.owner),
      });
    }).catch(() => {
      if (aktiv && kontext.isCurrent()) {
        setUebergang({ kontextKey, storageGeneration, snapshot: null });
      }
    });
    return () => { aktiv = false; };
  }, [kontextKey, storageGeneration]);

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
