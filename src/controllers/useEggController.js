/* Easteregg-Lebenszyklus: Freischaltung, Verfügbarkeit, Tagesfrequenz,
   Overlayzustände und sichere Navigation. App.jsx rendert nur die Overlays. */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { EGGS_ENABLED } from "../lib/modus.js";
import {
  berechneUnlocks,
  ladeAchievements,
  speichereAchievements,
  liveVertreter,
  SCHWELLEN_EGGS,
} from "../lib/eggs.js";
import {
  wuerfleTag,
  schonGefeuertHeute,
  markiereGefeuert,
} from "../lib/eggFrequenz.js";
import { filmHerkunft } from "../lib/finder.js";
import { sichtbareDienste } from "../lib/dienste.js";

export function useEggController({
  master,
  kinoMatches,
  streamingBekannt,
  auswahl,
  bootDone,
  setupWarnung,
  startModalOffen,
  willkommenOffen,
  setTab,
  springeZuFilm,
}) {
  const [achievements, setAchievements] = useState(null);
  const backfillRef = useRef(false);
  const toastSeq = useRef(0);
  const [toasts, setToasts] = useState([]);
  const zeigeToast = useCallback((text, sub) => {
    const id = ++toastSeq.current;
    setToasts((alt) => [...alt, { id, text, sub }]);
    setTimeout(() => setToasts((alt) => alt.filter((toast) => toast.id !== id)), 4000);
  }, []);

  useEffect(() => {
    if (!EGGS_ENABLED) return;
    ladeAchievements().then(setAchievements).catch(() => setAchievements(new Set()));
  }, []);
  useEffect(() => {
    if (!EGGS_ENABLED || achievements == null || master == null) return;
    const neu = [...berechneUnlocks(master)].filter((id) => !achievements.has(id));
    if (!neu.length) {
      backfillRef.current = true;
      return;
    }
    const naechste = new Set([...achievements, ...neu]);
    setAchievements(naechste);
    speichereAchievements(naechste);
    if (backfillRef.current) zeigeToast("Easteregg freigeschalten");
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

  const zeigeCage = useCallback(() => {
    cageFilmeRef.current = cageEgg ? liveVertreter(master || [], cageEgg, eggCtx) : [];
    setCageOffen(true);
  }, [cageEgg, master, eggCtx]);

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

  const modalOffen = setupWarnung || startModalOffen || willkommenOffen;
  const cageAutoRef = useRef(false);
  useEffect(() => {
    if (!EGGS_ENABLED || !bootDone || achievements == null || master == null) return;
    if (!achievements.has("cage-alphabet") || cageAutoRef.current) return;
    if (cageOffen || modalOffen) return;
    cageAutoRef.current = true;
    if (!schonGefeuertHeute("cage") && wuerfleTag("cage", 1 / 30)) {
      markiereGefeuert("cage");
      zeigeCage();
    }
  }, [
    bootDone, achievements, master, cageOffen, modalOffen, zeigeCage,
  ]);

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
