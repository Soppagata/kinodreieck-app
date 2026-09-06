import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  captureStorageContext,
  storageContextGenerationSnapshot,
  subscribeStorageContext,
} from "../services/storage.js";
import {
  aktualisiereStreamingNeuSnapshot,
  parseStreamingNeuSnapshot,
  streamingNeuIds,
  streamingNeuStorageKey,
} from "../lib/streamingNeu.js";

const LEER = Object.freeze({ status: "idle", runId: null, neueIds: Object.freeze([]), initial: false });

/* Bewusst lokal und nicht im PersonalDataRegistry: Der Snapshot ist nur ein
   kleiner abgeleiteter Geraetecache. Der dynamische, ownergebundene Key trennt
   Konten; captureStorageContext verhindert verspaetete A->B-Uebernahmen. */
export function useStreamingNeuController() {
  const [zustand, setZustand] = useState(LEER);
  const auftragRef = useRef(0);
  const generation = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );

  useEffect(() => {
    auftragRef.current++;
    setZustand(LEER);
  }, [generation]);

  const uebernehmeVollkatalog = useCallback(async ({ runId, titel } = {}) => {
    const auftrag = ++auftragRef.current;
    const kontext = captureStorageContext();
    const key = streamingNeuStorageKey(kontext.owner);
    if (!key || !String(runId == null ? "" : runId).trim() || !Array.isArray(titel)) {
      if (kontext.isCurrent() && auftragRef.current === auftrag) {
        setZustand({ ...LEER, status: "unavailable" });
      }
      return false;
    }
    try {
      const gespeichert = await kontext.get(key);
      if (!kontext.isCurrent() || auftragRef.current !== auftrag) return false;
      const vorher = parseStreamingNeuSnapshot(gespeichert?.value, kontext.owner);
      const ergebnis = aktualisiereStreamingNeuSnapshot(vorher, {
        owner: kontext.owner, runId, titel,
      });
      if (!ergebnis) {
        setZustand({ ...LEER, status: "unavailable" });
        return false;
      }
      if (ergebnis.geaendert) {
        await kontext.set(key, JSON.stringify(ergebnis.snapshot));
        if (!kontext.isCurrent() || auftragRef.current !== auftrag) return false;
      }
      setZustand(Object.freeze({
        status: "ready",
        runId: ergebnis.snapshot.runId,
        neueIds: Object.freeze([...streamingNeuIds(ergebnis.snapshot)]),
        initial: ergebnis.snapshot.neueIds === null,
      }));
      return true;
    } catch {
      if (kontext.isCurrent() && auftragRef.current === auftrag) {
        setZustand({ ...LEER, status: "error" });
      }
      return false;
    }
  }, []);

  return { streamingNeu: zustand, uebernehmeVollkatalog };
}
