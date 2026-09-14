import { useCallback, useEffect, useMemo, useState } from "react";
import { slugId } from "../lib/match.js";
import { mustwatchCandidatesService } from "../services/mustwatchCandidates.js";

const text = (value) => String(value == null ? "" : value).trim();

export function collectMustwatchStreamingIds(entries) {
  return [...new Set((Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.verknuepfung?.ziel === "streaming")
    .map((entry) => text(entry.verknuepfung.id)).filter(Boolean))];
}

export function candidateRefreshDelay(response, currentTime = Date.now()) {
  if (response?.status !== "ready") return null;
  const expiresAt = Date.parse(String(response?.expiresAt || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= currentTime) return null;
  return Math.min(2147483647, expiresAt - currentTime);
}

export function buildMustwatchProgramCandidates(programm, expired = false) {
  if (expired) return [];
  return (programm?.filme || []).map((film) => {
    const stableId = film.film_at_id ?? film.id ?? null;
    return {
      ...film,
      id: stableId,
      projection_id: stableId ?? `auto:${slugId(film.t, film.j)}`,
      titel: film.t,
      originaltitel: film.ot,
      jahr: film.j,
    };
  });
}

export function useMustwatchCandidatesController({
  entries = [], master = [], programm = null, programmAbgelaufen = false,
  programmExpiresAt = null, contextKey = "", active = true,
  service = mustwatchCandidatesService,
} = {}) {
  const ids = useMemo(() => collectMustwatchStreamingIds(entries), [entries]);
  const idsKey = ids.join("\n");
  const [reload, setReload] = useState(0);
  const [streamingState, setStreamingState] = useState(() => ({ contextKey, items: [] }));
  const [programmZeitlichAbgelaufen, setProgrammZeitlichAbgelaufen] = useState(false);

  useEffect(() => {
    const expiresAt = Number(programmExpiresAt) || Date.parse(String(programmExpiresAt || ""));
    if (!Number.isFinite(expiresAt)) { setProgrammZeitlichAbgelaufen(false); return undefined; }
    const delay = expiresAt - Date.now();
    if (delay <= 0) { setProgrammZeitlichAbgelaufen(true); return undefined; }
    setProgrammZeitlichAbgelaufen(false);
    const timer = setTimeout(() => setProgrammZeitlichAbgelaufen(true), Math.min(2147483647, delay));
    return () => clearTimeout(timer);
  }, [programmExpiresAt]);

  useEffect(() => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let mounted = true;
    let expiryTimer = null;
    setStreamingState({ contextKey, items: [] });
    if (!ids.length || !active) return () => { mounted = false; controller?.abort(); };
    service.loadByIds(ids, { signal: controller?.signal }).then((response) => {
      if (!mounted || controller?.signal.aborted) return;
      const items = response?.status === "ready" && Array.isArray(response.items) ? response.items : [];
      setStreamingState({ contextKey, items });
      const delay = candidateRefreshDelay(response);
      if (delay != null) {
        expiryTimer = setTimeout(() => {
          if (!mounted) return;
          setStreamingState({ contextKey, items: [] });
          setReload((value) => value + 1);
        }, delay);
      }
    }).catch(() => {
      if (mounted && !controller?.signal.aborted) setStreamingState({ contextKey, items: [] });
    });
    return () => {
      mounted = false;
      if (expiryTimer) clearTimeout(expiryTimer);
      controller?.abort();
    };
  }, [active, contextKey, idsKey, reload, service]);

  const kandidaten = useMemo(() => ({
    master: (Array.isArray(master) ? master : []).map((film) => ({
      ...film, id: film.id, titel: film.titel, jahr: film.jahr,
    })),
    programm: buildMustwatchProgramCandidates(programm, programmAbgelaufen || programmZeitlichAbgelaufen),
    streaming: streamingState.contextKey === contextKey ? streamingState.items : [],
  }), [contextKey, master, programm, programmAbgelaufen, programmZeitlichAbgelaufen, streamingState]);

  const searchStreaming = useCallback(async (query, options = {}) => {
    try {
      const response = await service.search(query, options);
      return response?.status === "ready" && Array.isArray(response.items) ? response.items : [];
    } catch { return []; }
  }, [contextKey, service]);

  return Object.freeze({ kandidaten, searchStreaming });
}
