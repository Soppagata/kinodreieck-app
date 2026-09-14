import { useCallback, useEffect, useMemo, useState } from "react";
import { slugId } from "../lib/match.js";
import { mustwatchCandidatesService } from "../services/mustwatchCandidates.js";

const text = (value) => String(value == null ? "" : value).trim();

export function collectMustwatchStreamingIds(entries) {
  return [...new Set((Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.verknuepfung?.ziel === "streaming")
    .map((entry) => text(entry.verknuepfung.id)).filter(Boolean))];
}

export function useMustwatchCandidatesController({
  entries = [], master = [], programm = null, programmAbgelaufen = false,
  contextKey = "", service = mustwatchCandidatesService,
} = {}) {
  const ids = useMemo(() => collectMustwatchStreamingIds(entries), [entries]);
  const idsKey = ids.join("\n");
  const [reload, setReload] = useState(0);
  const [streamingState, setStreamingState] = useState(() => ({ contextKey, items: [] }));

  useEffect(() => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let active = true;
    setStreamingState({ contextKey, items: [] });
    if (!ids.length) return () => { active = false; controller?.abort(); };
    service.loadByIds(ids, { signal: controller?.signal }).then((response) => {
      if (!active || controller?.signal.aborted) return;
      const items = response?.status === "ready" && Array.isArray(response.items) ? response.items : [];
      setStreamingState({ contextKey, items });
      const expiresAt = Date.parse(String(response?.expiresAt || ""));
      if (Number.isFinite(expiresAt)) {
        const delay = Math.max(1, Math.min(2147483647, expiresAt - Date.now()));
        const timer = setTimeout(() => {
          if (!active) return;
          setStreamingState({ contextKey, items: [] });
          setReload((value) => value + 1);
        }, delay);
        controller.__kdExpiryTimer = timer;
      }
    }).catch(() => {
      if (active && !controller?.signal.aborted) setStreamingState({ contextKey, items: [] });
    });
    return () => {
      active = false;
      if (controller?.__kdExpiryTimer) clearTimeout(controller.__kdExpiryTimer);
      controller?.abort();
    };
  }, [contextKey, idsKey, reload, service]);

  const kandidaten = useMemo(() => ({
    master: (Array.isArray(master) ? master : []).map((film) => ({
      ...film, id: film.id, titel: film.titel, jahr: film.jahr,
    })),
    programm: programmAbgelaufen ? [] : ((programm?.filme || []).map((film) => {
      const id = film.film_at_id ?? film.id ?? `auto:${slugId(film.t, film.j)}`;
      return {
        ...film, id, projection_id: id,
        titel: film.t, originaltitel: film.ot, jahr: film.j,
      };
    })),
    streaming: streamingState.contextKey === contextKey ? streamingState.items : [],
  }), [contextKey, master, programm, programmAbgelaufen, streamingState]);

  const searchStreaming = useCallback(async (query, options = {}) => {
    try {
      const response = await service.search(query, options);
      return response?.status === "ready" && Array.isArray(response.items) ? response.items : [];
    } catch { return []; }
  }, [service]);

  return Object.freeze({ kandidaten, searchStreaming });
}
