import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  aktualisiereStreamingNeuFristenbuch,
  STREAMING_NEU_DAUER_MS,
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

/* Nur qualifizierte RPC-Anker, nie Abrufzeit oder das bloße neu_seit-Label.
   Ein jüngerer Restdiff darf einen bereits verbrauchten Zugang nicht neu datieren. */
export function uebernehmeStreamingSeitenAnker(vorher, anchors, { owner, auswahl, now = Date.now() }) {
  const alt = parseStreamingNeuFristenbuch(vorher, owner, auswahl);
  const map = new Map((alt?.eintraege || []).map((entry) => [entry.id, entry]));
  for (const entry of Array.isArray(anchors) ? anchors : []) {
    const id = String(entry?.id || "");
    const start = entry?.fensterBeginn, consumed = entry?.verbrauchtBis;
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))
        || !Number.isFinite(start) || !Number.isFinite(consumed)
        || start > now || consumed > now || consumed < start) continue;
    const prior = map.get(id);
    if (prior && consumed < prior.verbrauchtBis) continue;
    const fensterBeginn = prior && consumed < prior.fensterBeginn + STREAMING_NEU_DAUER_MS
      ? Math.min(prior.fensterBeginn, start)
      : prior && consumed === prior.verbrauchtBis ? prior.fensterBeginn : start;
    map.set(id, { id, fensterBeginn, verbrauchtBis: consumed });
  }
  const next = parseStreamingNeuFristenbuch({
    format: 1, owner, auswahl: streamingNeuAuswahlSignatur(auswahl),
    v2Uebernommen: alt?.v2Uebernommen ?? false,
    eintraege: [...map.values()],
  }, owner, auswahl);
  return { fristenbuch: next, geaendert: !!next && JSON.stringify(next) !== JSON.stringify(alt)
    && (next.eintraege.length > 0 || !!alt) };
}

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
  const [seitenBeleg, setSeitenBeleg] = useState(null);
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
  const aktiveSeitenAnker = seitenBeleg?.kontextKey === kontextKey
    && seitenBeleg?.storageGeneration === storageGeneration
    && seitenBeleg?.auswahlSignatur === aktuelleAuswahlSignatur ? seitenBeleg : null;
  const streamingPagePersonalReady = fristenbuch?.kontextKey === kontextKey
    && fristenbuch?.storageGeneration === storageGeneration
    && fristenbuch?.auswahlSignatur === aktuelleAuswahlSignatur;
  const uebernehmeSeitenAnker = useCallback((page, context) => {
    const kontext = captureStorageContext();
    if (!auswahlGeladen || context?.accountKey !== kontextKey || !context.isCurrent?.()
        || streamingNeuAuswahlSignatur(context.services) !== aktuelleAuswahlSignatur
        || page?.status !== "ready" || !page.version || !Array.isArray(page.newAnchors)
        || !page.newAnchors.length || !kontext.isCurrent()) return false;
    setSeitenBeleg((vorher) => {
      const passend = vorher?.kontextKey === kontextKey && vorher?.storageGeneration === storageGeneration
        && vorher?.auswahlSignatur === aktuelleAuswahlSignatur;
      const merged = uebernehmeStreamingSeitenAnker(passend ? vorher.snapshot : null,
        page.newAnchors, { owner: kontext.owner, auswahl });
      if (!merged.geaendert) return vorher;
      return { kontextKey, storageGeneration, auswahlSignatur: aktuelleAuswahlSignatur,
        snapshot: merged.fristenbuch };
    });
    return true;
  }, [kontextKey, storageGeneration, aktuelleAuswahlSignatur, auswahl, auswahlGeladen]);
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
  /* Der Seiten-RPC erhaelt ausschliesslich die bereits bestehenden
     Fristanker. Cachetreffer und Seitenwechsel erzeugen hier keine neue Zeit
     und koennen das 14-Tage-Fenster deshalb nicht verlaengern. */
  const streamingPagePersonal = useMemo(() => Object.freeze({
    newEntries: Object.freeze((aktivesFristenbuch?.eintraege || []).map((entry) => Object.freeze({
      id: entry.id,
      fensterBeginn: entry.fensterBeginn,
      verbrauchtBis: entry.verbrauchtBis,
    }))),
    legacyNew: Object.freeze((aktiverUebergang?.neu || []).map((entry) => Object.freeze({
      id: entry.id,
      firstSeenAt: entry.firstSeenAt,
    }))),
  }), [aktiverUebergang, aktivesFristenbuch]);

  useEffect(() => {
    setBeleg(null);
    setSeitenBeleg(null);
    setJetzt(Date.now());
  }, [kontextKey]);

  useEffect(() => {
    let aktiv = true;
    const kontext = captureStorageContext();
    const uebergangKey = streamingNeuUebergangStorageKey(kontext.owner);
    const fristenKey = streamingNeuFristenbuchStorageKey(kontext.owner, auswahl);
    if (!auswahlGeladen) return () => { aktiv = false; };
    if (!uebergangKey || !fristenKey) {
      setFristenbuch({ kontextKey, storageGeneration, auswahlSignatur: aktuelleAuswahlSignatur, snapshot: null });
      return () => { aktiv = false; };
    }
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
      const seitenUpdate = uebernehmeStreamingSeitenAnker(aktualisiert?.fristenbuch || bisher,
        aktiveSeitenAnker?.snapshot?.eintraege, { owner: kontext.owner, auswahl });
      const naechstesFristenbuch = seitenUpdate.fristenbuch || aktualisiert?.fristenbuch || bisher;
      setUebergang({
        kontextKey,
        storageGeneration,
        snapshot,
      });
      setFristenbuch({
        kontextKey, storageGeneration, auswahlSignatur: aktuelleAuswahlSignatur,
        snapshot: naechstesFristenbuch,
      });
      if (aktualisiert?.geaendert || seitenUpdate.geaendert) {
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
  }, [aktiverBeleg, aktiveSeitenAnker, aktuelleAuswahlSignatur, auswahl, auswahlGeladen, kontextKey, storageGeneration]);

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

  return { streamingNeu, streamingPagePersonal, streamingPagePersonalReady, uebernehmeVollkatalog, uebernehmeSeitenAnker };
}
