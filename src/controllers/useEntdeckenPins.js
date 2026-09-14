import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createEntdeckenPinsPot,
  decodeEntdeckenPinsPot,
  normalizeEntdeckenPins,
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
function readLegacyPins() {
  try { return normalizeEntdeckenPins(JSON.parse(localStorage.getItem(K.entdeckenPinsLegacy) || "[]")); }
  catch { return normalizeEntdeckenPins([]); }
}
function preserveUnboundLegacy(raw) {
  if (raw == null) return true;
  try {
    const incoming = readJson(raw)?.pins || [];
    const merged = normalizeEntdeckenPins([...readLegacyPins(), ...incoming]);
    localStorage.setItem(K.entdeckenPinsLegacy, JSON.stringify(merged));
    return true;
  } catch { return false; }
}
function clearLegacyPins() {
  try { localStorage.removeItem(K.entdeckenPinsLegacy); } catch { /* bleibt sicher lokal erhalten */ }
}
function pinsForContext(decoded, context, raw) {
  if (context.owner === "guest-local") {
    const active = !decoded || decoded.owner === null || decoded.owner === context.owner ? decoded?.pins || [] : [];
    return normalizeEntdeckenPins([...active, ...readLegacyPins()]);
  }
  if (!decoded) return normalizeEntdeckenPins([]);
  if (decoded.owner === context.owner) return decoded.pins;
  /* Eine alte Arrayform oder ein Gasttopf ist erst dann eindeutig diesem
     Konto zugeordnet, wenn der Account-Treiber bereits eine Serverrevision
     für genau diesen Topf bestätigt hat (bewusste Übernahme oder Pull). */
  if (context.hasConfirmedRemote(K.entdeckenPins)) return decoded.pins;
  preserveUnboundLegacy(raw);
  return normalizeEntdeckenPins([]);
}

export function useEntdeckenPins({ contextKey = "local", setErr = null } = {}) {
  const [state, setState] = useState(() => ({ contextKey: null, pins: normalizeEntdeckenPins([]), loaded: false }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const contextKeyRef = useRef(contextKey);
  contextKeyRef.current = contextKey;
  const setErrRef = useRef(setErr);
  setErrRef.current = setErr;
  const mutationQueueRef = useRef(Promise.resolve(true));
  const storageGeneration = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );
  const commit = useCallback((key, pins) => {
    const next = { contextKey: key, pins: normalizeEntdeckenPins(pins), loaded: true };
    stateRef.current = next;
    setState(next);
    return next.pins;
  }, []);
  const receive = useCallback((raw, context = captureStorageContext()) => {
    const decoded = readJson(raw);
    const pins = pinsForContext(decoded, context, raw);
    if (context.isCurrent() && contextKeyRef.current === contextKey) commit(contextKey, pins);
  }, [commit, contextKey]);

  useRemoteStorageValue(K.entdeckenPins, (raw) => receive(raw), () => {
    setErrRef.current?.("Neuere Titel-Pins konnten nicht sicher geladen werden. Bitte lade die App erneut.");
  });
  useEffect(() => {
    let active = true;
    const context = captureStorageContext();
    setState({ contextKey: null, pins: normalizeEntdeckenPins([]), loaded: false });
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

  const write = useCallback((calculate) => {
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
        if (context.owner === "guest-local") clearLegacyPins();
        commit(requestedKey, next);
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
  const visible = state.contextKey === contextKey && state.loaded ? state.pins : normalizeEntdeckenPins([]);
  return {
    entdeckenPins: visible,
    entdeckenPinsGeladen: state.contextKey === contextKey && state.loaded,
    toggleRecommendationPin,
    bereinigeEntdeckenPins,
  };
}
