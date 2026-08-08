import { useCallback, useReducer, useRef } from "react";

export const MAX_GLOBALE_FEHLER = 5;

export function normalisiereFehlerText(wert) {
  if (typeof wert === "string") return wert.trim();
  return typeof wert?.message === "string" ? wert.message.trim() : "";
}

export function initialisiereFehlerQueue(initial = []) {
  const werte = Array.isArray(initial) ? initial : initial ? [initial] : [];
  return werte.reduce((liste, eintrag, index) => {
    const text = normalisiereFehlerText(typeof eintrag === "string" ? eintrag : eintrag?.text);
    if (!text) return liste;
    const scope = normalisiereFehlerText(typeof eintrag === "string" ? `initial:${index}` : eintrag?.scope)
      || `initial:${index}`;
    const ohneScope = liste.filter((fehler) => fehler.scope !== scope);
    return [...ohneScope, { id: `initial:${index}`, scope, text }].slice(-MAX_GLOBALE_FEHLER);
  }, []);
}

export function fehlerQueueReducer(state, aktion) {
  if (aktion?.type === "report") {
    const scope = normalisiereFehlerText(aktion.scope);
    const text = normalisiereFehlerText(aktion.text);
    if (!scope || !text) return state;
    const vorhanden = state.find((fehler) => fehler.scope === scope);
    if (vorhanden?.text === text) return state;
    const ohneScope = state.filter((fehler) => fehler.scope !== scope);
    return [
      ...ohneScope,
      { id: vorhanden?.id || String(aktion.id), scope, text },
    ].slice(-MAX_GLOBALE_FEHLER);
  }
  if (aktion?.type === "resolve") {
    const scope = normalisiereFehlerText(aktion.scope);
    return scope ? state.filter((fehler) => fehler.scope !== scope) : state;
  }
  if (aktion?.type === "dismiss") {
    return state.filter((fehler) => fehler.id !== String(aktion.id));
  }
  return state;
}

export function useErrorQueue(initial = []) {
  const [errors, dispatch] = useReducer(
    fehlerQueueReducer,
    initial,
    initialisiereFehlerQueue,
  );
  const folge = useRef(0);
  const reportError = useCallback((scope, text) => {
    dispatch({ type: "report", scope, text, id: `fehler:${++folge.current}` });
  }, []);
  const resolveError = useCallback((scope) => dispatch({ type: "resolve", scope }), []);
  const dismissError = useCallback((id) => dispatch({ type: "dismiss", id }), []);
  /* Übergang für bestehende Produzenten: Leeren darf keinen fremden Fehler mehr
     löschen. Nichtleere Texte erhalten einen eigenen, deduplizierten Scope. */
  const setErr = useCallback((text) => {
    const wert = normalisiereFehlerText(text);
    if (wert) reportError(`legacy:${wert}`, wert);
  }, [reportError]);
  return { errors, reportError, resolveError, dismissError, setErr };
}
