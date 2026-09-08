/* Easteregg-Lebenszyklus: Freischaltung, Verfügbarkeit, Tagesfrequenz,
   Overlayzustände und sichere Navigation. App.jsx rendert nur die Overlays. */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { EGGS_ENABLED, EGG_AKTIV } from "../lib/modus.js";
import {
  berechneUnlocks,
  ladeAchievements,
  speichereAchievements,
  liveVertreter,
  SCHWELLEN_EGGS,
} from "../lib/eggs.js";
import { versucheCageTag } from "../lib/eggFrequenz.js";
import { buchstabeUndTitel } from "../lib/cageAlphabet.js";
import { filmHerkunft } from "../lib/finder.js";
import { sichtbareDienste } from "../lib/dienste.js";
import {
  DEEP_SPACE_HORROR_ID,
  istDeepSpaceFreigeschaltet,
} from "../lib/deepSpaceHorror.js";

const aktuelleZeit = () => new Date();
const browserZufall = () => Math.random();

export function useEggController({
  master,
  kinoMatches,
  streamingBekannt,
  auswahl,
  bootDone,
  setupWarnung,
  startModalOffen,
  setTab,
  springeZuFilm,
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

  const [cageEgg] = useState(() => SCHWELLEN_EGGS.find((e) => e.id === "cage-alphabet"));
  const cageFilmeRef = useRef([]);
  const [cageOffen, setCageOffen] = useState(false);
  const [reducedMotion] = useState(() => {
    try {
      return !!(window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch { return false; }
  });

  const eggCtx = useMemo(() => ({
    auswahl,
    kinoIds: new Set((kinoMatches?.matched || []).map((m) => m.film.id)),
    dienstePro: new Map(
      ((streamingBekannt?.titel) || []).map((titel) => [titel.id, titel.dienste || []]),
    ),
  }), [auswahl, kinoMatches, streamingBekannt]);

  const cagePool = useMemo(() => cageEgg
    ? liveVertreter(master || [], cageEgg, eggCtx).filter(buchstabeUndTitel) : [],
  [cageEgg, master, eggCtx]);
  const modalOffen = setupWarnung || startModalOffen;
  const cageBereit = EGGS_ENABLED && EGG_AKTIV.cage && bootDone
    && achievements?.has("cage-alphabet") && !modalOffen && cagePool.length > 0;
  const zeigeCage = useCallback(() => {
    if (!cageBereit || document.hidden) return false;
    cageFilmeRef.current = cagePool;
    setCageOffen(true);
    return true;
  }, [cageBereit, cagePool]);

  const eggHerkunft = useCallback((film) => {
    const herkunft = filmHerkunft(film, { kinoMatches, streamingBekannt });
    if (herkunft.kino) return { text: "Läuft gerade im Kino", tab: "kino" };
    const dienste = herkunft.streaming
      ? sichtbareDienste(herkunft.streaming.dienste, auswahl)
      : [];
    if (dienste.length) {
      return { text: "Streamst du auf " + dienste.slice(0, 2).join(" / "), tab: "streaming" };
    }
    if (herkunft.dvd) return { text: "In deinem Besitz", tab: "mediathek" };
    return { text: "In deiner Mediathek", tab: "mediathek" };
  }, [kinoMatches, streamingBekannt, auswahl]);

  const eggZeigeEintrag = useCallback((film, zielTab) => {
    setCageOffen(false);
    if (zielTab === "kino") setTab("kino");
    else if (zielTab === "streaming") setTab("streaming");
    else if (film) springeZuFilm(film.id);
  }, [setTab, springeZuFilm]);

  useEffect(() => {
    if (!cageBereit || cageOffen) return undefined;
    const pruefeTag = () => {
      if (!document.hidden && versucheCageTag({ jetzt: jetzt(), rnd: zufall })) zeigeCage();
    };
    pruefeTag();
    document.addEventListener("visibilitychange", pruefeTag);
    return () => document.removeEventListener("visibilitychange", pruefeTag);
  }, [cageBereit, cageOffen, zeigeCage, jetzt, zufall]);

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
