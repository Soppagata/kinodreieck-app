/* Easteregg-Lebenszyklus: Freischaltung, Verfügbarkeit, Tagesfrequenz,
   Overlayzustände und sichere Navigation. App.jsx rendert nur die Overlays. */

import { useState, useEffect, useCallback, useRef } from "react";
import { EGGS_ENABLED, EGG_AKTIV } from "../lib/modus.js";
import {
  berechneUnlocks,
  ladeAchievements,
  speichereAchievements,
} from "../lib/eggs.js";
import { versucheCageTag } from "../lib/eggFrequenz.js";
import { baueCagePool } from "../lib/cagePool.js";
import {
  DEEP_SPACE_HORROR_ID,
  istDeepSpaceFreigeschaltet,
} from "../lib/deepSpaceHorror.js";

const aktuelleZeit = () => new Date();
const browserZufall = () => Math.random();

export function useEggController({
  master,
  kinoMatches,
  programmInfo,
  streamingBekannt,
  streamingEntdecken,
  streamingRoh,
  ladeCageKatalog,
  katalogFreigegeben = false,
  katalogKontext = "lokal",
  kinoLaedt = false,
  auswahl,
  bootDone,
  setupWarnung,
  startModalOffen,
  springeZuFilm,
  springeZuKino,
  springeZuStreaming,
  jetzt = aktuelleZeit,
  zufall = browserZufall,
}) {
  const [achievements, setAchievements] = useState(null);
  const backfillRef = useRef(false);
  const unlockPendingRef = useRef(new Set());
  const toastSeq = useRef(0);
  const toastTimerRef = useRef(new Set());
  const [toasts, setToasts] = useState([]);
  const zeigeToast = useCallback((text, sub) => {
    const id = ++toastSeq.current;
    setToasts((alt) => [...alt, { id, text, sub }]);
    const timer = setTimeout(() => {
      toastTimerRef.current.delete(timer);
      setToasts((alt) => alt.filter((toast) => toast.id !== id));
    }, 4000);
    toastTimerRef.current.add(timer);
  }, []);
  useEffect(() => () => {
    for (const timer of toastTimerRef.current) clearTimeout(timer);
    toastTimerRef.current.clear();
  }, []);

  useEffect(() => {
    if (!EGGS_ENABLED) return;
    ladeAchievements().then(setAchievements).catch(() => setAchievements(new Set()));
  }, []);
  useEffect(() => {
    if (!EGGS_ENABLED || achievements == null || master == null) return;
    for (const id of achievements) unlockPendingRef.current.delete(id);
    const kandidaten = berechneUnlocks(master);
    if (EGG_AKTIV.deepSpace && istDeepSpaceFreigeschaltet(master)) kandidaten.add(DEEP_SPACE_HORROR_ID);
    const neu = [...kandidaten].filter((id) =>
      !achievements.has(id) && !unlockPendingRef.current.has(id));
    if (!neu.length) {
      backfillRef.current = true;
      return;
    }
    for (const id of neu) unlockPendingRef.current.add(id);
    const naechste = new Set([...achievements, ...neu]);
    setAchievements(naechste);
    speichereAchievements(naechste);
    if (backfillRef.current) zeigeToast("Easteregg freigeschalten!");
    backfillRef.current = true;
  }, [master, achievements, zeigeToast]);

  const cageFilmeRef = useRef([]);
  const [cageOffen, setCageOffen] = useState(false);
  const [reducedMotion] = useState(() => {
    try {
      return !!(window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch { return false; }
  });

  const modalOffen = setupWarnung || startModalOffen;
  const cageStartBereit = EGGS_ENABLED && EGG_AKTIV.cage && bootDone
    && achievements?.has("cage-alphabet") && !modalOffen;
  const [katalogFertig, setKatalogFertig] = useState(null);
  const katalogLaufRef = useRef(null);
  const katalogNoetig = katalogFreigegeben && !!ladeCageKatalog;
  const cageBereit = cageStartBereit && !kinoLaedt && (!katalogNoetig || katalogFertig === katalogKontext);
  const aktuellerCagePool = useCallback(() => baueCagePool({
    master, kinoMatches, programmInfo, streamingRoh, streamingBekannt,
    streamingEntdecken, auswahl, jetzt: jetzt(),
  }), [master, kinoMatches, programmInfo, streamingRoh, streamingBekannt, streamingEntdecken, auswahl, jetzt]);

  /* Ein gezielter, mit dem vorhandenen App-Lader geteilter Katalogversuch pro
     Sitzungskontext. StrictMode/Rerender teilen das Promise; ein Fehler lässt
     bewiesene andere Quellen zu. Niemals vor seinem Abschluss würfeln. */
  useEffect(() => {
    if (!cageStartBereit || cageOffen || !katalogNoetig || katalogFertig === katalogKontext) return undefined;
    let aktiv = true;
    const vorbereiten = () => {
      if (document.hidden) return;
      if (katalogLaufRef.current?.kontext !== katalogKontext) {
        katalogLaufRef.current = { kontext: katalogKontext,
          promise: Promise.resolve().then(() => ladeCageKatalog()).catch(() => {}) };
      }
      const lauf = katalogLaufRef.current;
      void lauf.promise.then(() => {
        if (aktiv && katalogLaufRef.current === lauf) setKatalogFertig(katalogKontext);
      });
    };
    vorbereiten();
    document.addEventListener("visibilitychange", vorbereiten);
    return () => { aktiv = false; document.removeEventListener("visibilitychange", vorbereiten); };
  }, [cageStartBereit, cageOffen, katalogNoetig, katalogFertig, katalogKontext, ladeCageKatalog]);

  const zeigeCage = useCallback(() => {
    if (!cageBereit || document.hidden) return false;
    const pool = aktuellerCagePool();
    if (!pool.length) return false;
    cageFilmeRef.current = pool;
    setCageOffen(true);
    return true;
  }, [cageBereit, aktuellerCagePool]);

  const eggHerkunft = useCallback((film) => film?.cageHerkunft, []);

  const eggZeigeEintrag = useCallback((film) => {
    const ziel = film?.cageZiel;
    setCageOffen(false);
    if (ziel?.tab === "kino") springeZuKino(ziel);
    else if (ziel?.tab === "streaming") void springeZuStreaming(ziel);
    else if (ziel?.tab === "mediathek") springeZuFilm(ziel.ref);
  }, [springeZuKino, springeZuStreaming, springeZuFilm]);

  useEffect(() => {
    if (!cageBereit || cageOffen) return undefined;
    const pruefeTag = () => {
      if (document.hidden) return;
      const pool = aktuellerCagePool();
      if (pool.length && versucheCageTag({ jetzt: jetzt(), rnd: zufall })) {
        cageFilmeRef.current = pool;
        setCageOffen(true);
      }
    };
    pruefeTag();
    document.addEventListener("visibilitychange", pruefeTag);
    return () => document.removeEventListener("visibilitychange", pruefeTag);
  }, [cageBereit, cageOffen, aktuellerCagePool, jetzt, zufall]);

  useEffect(() => {
    if (!EGGS_ENABLED || !cageOffen) return undefined;
    let vorher = "";
    try {
      vorher = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } catch { /* */ }
    return () => {
      try { document.body.style.overflow = vorher; } catch { /* */ }
    };
  }, [cageOffen]);

  return {
    achievements,
    toasts,
    cageFilmeRef,
    cageOffen,
    setCageOffen,
    reducedMotion,
    zeigeCage,
    eggHerkunft,
    eggZeigeEintrag,
  };
}
