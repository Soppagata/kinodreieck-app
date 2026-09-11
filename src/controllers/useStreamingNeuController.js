import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  aktualisiereStreamingNeuFristenbuch,
  parseStreamingNeuFristenbuch,
  parseStreamingNeuUebergang,
  projiziereStreamingNeu,
  streamingNeuAuswahlSignatur,
  streamingNeuFristenbuchStorageKey,
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
   v2-Übergangsstand. Nur Fensteranker und bereits verbrauchte Diffzeitpunkte
   landen im abgeleiteten, owner- und auswahlgebundenen Gerätecache. */
export function useStreamingNeuController({
  kontextKey = "",
  auswahl = [],
  auswahlGeladen = false,
} = {}) {
  const [beleg, setBeleg] = useState(null);
  const [uebergang, setUebergang] = useState(null);
  const [fristenbuch, setFristenbuch] = useState(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const storageGeneration = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );
  const aktiverBeleg = beleg?.kontextKey === kontextKey ? beleg : null;
  const aktuelleAuswahlSignatur = streamingNeuAuswahlSignatur(auswahl);
  const aktiverUebergang = uebergang?.kontextKey === kontextKey
    && uebergang?.storageGeneration === storageGeneration ? uebergang.snapshot : null;
  const aktivesFristenbuch = fristenbuch?.kontextKey === kontextKey
    && fristenbuch?.storageGeneration === storageGeneration
    && fristenbuch?.auswahlSignatur === aktuelleAuswahlSignatur ? fristenbuch.snapshot : null;
  const streamingNeu = useMemo(() => projiziereStreamingNeu({
    bekannt: aktiverBeleg?.bekannt,
    entdecken: aktiverBeleg?.entdecken,
    auswahl,
    auswahlGeladen,
    vollstaendig: aktiverBeleg?.vollstaendig === true,
    uebergang: aktiverUebergang,
    fristenbuch: aktivesFristenbuch,
    now: jetzt,
  }), [aktiverBeleg, aktiverUebergang, aktivesFristenbuch, auswahl, auswahlGeladen, jetzt]);

  useEffect(() => {
    setBeleg(null);
    setJetzt(Date.now());
  }, [kontextKey]);

  useEffect(() => {
    let aktiv = true;
    const kontext = captureStorageContext();
    const uebergangKey = streamingNeuUebergangStorageKey(kontext.owner);
    const fristenKey = streamingNeuFristenbuchStorageKey(kontext.owner, auswahl);
    if (!uebergangKey || !fristenKey || !auswahlGeladen) return () => { aktiv = false; };
    Promise.allSettled([kontext.get(uebergangKey), kontext.get(fristenKey)]).then(async ([v2Ergebnis, fristenErgebnis]) => {
      if (!aktiv || !kontext.isCurrent()) return;
      const snapshot = v2Ergebnis.status === "fulfilled"
        ? parseStreamingNeuUebergang(v2Ergebnis.value?.value, kontext.owner) : null;
      const bisher = fristenErgebnis.status === "fulfilled"
        ? parseStreamingNeuFristenbuch(fristenErgebnis.value?.value, kontext.owner, auswahl) : null;
      const aktualisiert = aktiverBeleg ? aktualisiereStreamingNeuFristenbuch(bisher, {
        owner: kontext.owner,
        auswahl,
        bekannt: aktiverBeleg.bekannt,
        entdecken: aktiverBeleg.entdecken,
        uebergang: snapshot,
      }) : null;
      const naechstesFristenbuch = aktualisiert?.fristenbuch || bisher;
      setUebergang({
        kontextKey,
        storageGeneration,
        snapshot,
      });
      setFristenbuch({
        kontextKey, storageGeneration, auswahlSignatur: aktuelleAuswahlSignatur,
        snapshot: naechstesFristenbuch,
      });
      if (aktualisiert?.geaendert) {
        try {
          await kontext.set(fristenKey, JSON.stringify(naechstesFristenbuch));
        } catch {
          /* Der abgeleitete Cache darf die aktuelle Producer-/v2-Projektion
             bei nicht verfügbarem Gerätespeicher nicht blockieren. */
        }
      }
    }).catch(() => {
      if (aktiv && kontext.isCurrent()) {
        setUebergang({ kontextKey, storageGeneration, snapshot: null });
        setFristenbuch({
          kontextKey, storageGeneration, auswahlSignatur: aktuelleAuswahlSignatur, snapshot: null,
        });
      }
    });
    return () => { aktiv = false; };
  }, [aktiverBeleg, aktuelleAuswahlSignatur, auswahl, auswahlGeladen, kontextKey, storageGeneration]);

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
