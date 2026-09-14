import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearEntdeckenPinsLegacy,
  createEntdeckenPinsPot,
  decodeEntdeckenPinsPot,
  normalizeEntdeckenPins,
  preserveEntdeckenPinsLegacy,
  readEntdeckenPinsLegacy,
  toggleEntdeckenPin,
} from "../lib/entdeckenPins.js";
import {
  K,
  captureStorageContext,
  storageContextGenerationSnapshot,
  subscribeStorageContext,
} from "../services/storage.js";
import { useRemoteStorageValue } from "./useRemoteStorageValue.js";

function readJson(raw) {
  if (raw == null) return null;
  return decodeEntdeckenPinsPot(JSON.parse(raw));
}
function pinsForContext(decoded, context, raw) {
  const currentLegacy = () => readEntdeckenPinsLegacy();
  if (context.owner === "guest-local") {
    const active = !decoded || decoded.owner === null || decoded.owner === context.owner ? decoded?.pins || [] : [];
    return {
      pins: normalizeEntdeckenPins([...active, ...currentLegacy().pins]),
      legacy: Object.freeze({ pins: normalizeEntdeckenPins([]), owner: null }),
    };
  }
  if (!decoded) return { pins: normalizeEntdeckenPins([]), legacy: currentLegacy() };
  const serverBestaetigt = context.hasConfirmedRemote(K.entdeckenPins);
  const sicherGebunden = context.canAdoptLegacyPins() || serverBestaetigt;
  if (decoded.owner !== context.owner) {
    preserveEntdeckenPinsLegacy(raw, { owner: sicherGebunden ? context.owner : null });
  }
  const pins = decoded.owner === context.owner || sicherGebunden
    ? decoded.pins : normalizeEntdeckenPins([]);
  return { pins, legacy: currentLegacy() };
}

export function useEntdeckenPins({ contextKey = "local", setErr = null } = {}) {
  const [state, setState] = useState(() => ({
    contextKey: null,
    pins: normalizeEntdeckenPins([]),
    legacy: Object.freeze({ pins: normalizeEntdeckenPins([]), owner: null }),
    loaded: false,
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const contextKeyRef = useRef(contextKey);
  contextKeyRef.current = contextKey;
  const setErrRef = useRef(setErr);
  setErrRef.current = setErr;
  const mutationQueueRef = useRef(Promise.resolve(true));
  const automaticAdoptionRef = useRef("");
  const storageGeneration = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );
  const commit = useCallback((key, pins, legacy = readEntdeckenPinsLegacy()) => {
    const next = { contextKey: key, pins: normalizeEntdeckenPins(pins), legacy, loaded: true };
    stateRef.current = next;
    setState(next);
    return next.pins;
  }, []);
  const receive = useCallback((raw, context = captureStorageContext()) => {
    const decoded = readJson(raw);
    const projected = pinsForContext(decoded, context, raw);
    if (context.isCurrent() && contextKeyRef.current === contextKey) {
      commit(contextKey, projected.pins, projected.legacy);
    }
  }, [commit, contextKey]);

  useRemoteStorageValue(K.entdeckenPins, (raw) => receive(raw), () => {
    setErrRef.current?.("Neuere Titel-Pins konnten nicht sicher geladen werden. Bitte lade die App erneut.");
  });
  useEffect(() => {
    let active = true;
    const context = captureStorageContext();
    setState({
      contextKey: null,
      pins: normalizeEntdeckenPins([]),
      legacy: Object.freeze({ pins: normalizeEntdeckenPins([]), owner: null }),
      loaded: false,
    });
    context.get(K.entdeckenPins).then((row) => {
      if (!active || !context.isCurrent() || contextKeyRef.current !== contextKey) return;
      receive(row?.value ?? null, context);
    }).catch(() => {
      if (active && context.isCurrent() && contextKeyRef.current === contextKey) {
        setErrRef.current?.("Titel-Pins konnten nicht sicher geladen werden. Änderungen bleiben bis zum Neuladen gesperrt.");
      }
    });
    return () => { active = false; };
  }, [contextKey, receive, storageGeneration]);

  const write = useCallback((calculate, { clearLegacy = false } = {}) => {
    const context = captureStorageContext();
    const requestedKey = contextKeyRef.current;
    const task = mutationQueueRef.current.then(async () => {
      if (!context.isCurrent() || contextKeyRef.current !== requestedKey) return false;
      const current = stateRef.current.contextKey === requestedKey && stateRef.current.loaded
        ? stateRef.current.pins : null;
      if (!current) return false;
      const next = normalizeEntdeckenPins(calculate(current));
      const pot = createEntdeckenPinsPot(next, { owner: context.owner, epoch: context.generation });
      if (!pot) return false;
      try {
        await context.set(K.entdeckenPins, JSON.stringify(pot));
        if (!context.isCurrent() || contextKeyRef.current !== requestedKey) return false;
        if (context.owner === "guest-local" || clearLegacy) clearEntdeckenPinsLegacy();
        commit(requestedKey, next, readEntdeckenPinsLegacy());
        return true;
      } catch {
        if (context.isCurrent() && contextKeyRef.current === requestedKey) {
          setErrRef.current?.("Der Titel-Pin konnte nicht gespeichert werden. Die Änderung wurde nicht übernommen.");
        }
        return false;
      }
    });
    mutationQueueRef.current = task.catch(() => false);
    return task;
  }, [commit]);
  const toggleRecommendationPin = useCallback(
    (entry) => write((current) => toggleEntdeckenPin(current, entry)),
    [write],
  );
  const bereinigeEntdeckenPins = useCallback((pinIds) => {
    const ids = new Set(Array.isArray(pinIds) ? pinIds : []);
    if (!ids.size) return Promise.resolve(false);
    return write((current) => current.filter((pin) => !ids.has(pin.pinId)));
  }, [write]);
  const uebernehmeLegacyPins = useCallback(() => write(
    (current) => [...current, ...readEntdeckenPinsLegacy().pins],
    { clearLegacy: true },
  ), [write]);
  useEffect(() => {
    if (state.contextKey !== contextKey || !state.loaded || !state.legacy.pins.length
        || state.legacy.owner == null) return;
    const context = captureStorageContext();
    if (!context.isCurrent() || state.legacy.owner !== context.owner) return;
    const adoptionKey = `${context.generation}|${state.legacy.owner}|${state.legacy.pins.map((pin) => pin.pinId).join("|")}`;
    if (automaticAdoptionRef.current === adoptionKey) return;
    automaticAdoptionRef.current = adoptionKey;
    uebernehmeLegacyPins().then((ok) => {
      if (!ok && context.isCurrent()) {
        setErrRef.current?.("Ältere Titel-Pins sind auf diesem Gerät gesichert und können hier übernommen werden.");
      }
    });
  }, [contextKey, state, uebernehmeLegacyPins]);
  const visible = state.contextKey === contextKey && state.loaded ? state.pins : normalizeEntdeckenPins([]);
  const visibleLegacy = state.contextKey === contextKey && state.loaded && state.legacy.owner == null
    ? state.legacy.pins : normalizeEntdeckenPins([]);
  return {
    entdeckenPins: visible,
    legacyEntdeckenPins: visibleLegacy,
    entdeckenPinsGeladen: state.contextKey === contextKey && state.loaded,
    toggleRecommendationPin,
    bereinigeEntdeckenPins,
    uebernehmeLegacyPins,
  };
}
