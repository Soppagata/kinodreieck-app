import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  captureStorageContext,
  storageContextGenerationSnapshot,
  subscribeStorageContext,
} from "../services/storage.js";
import {
  aktualisiereStreamingNeuSnapshot,
  bereinigeStreamingNeuSnapshot,
  naechsterStreamingNeuAblauf,
  streamingNeuIds,
  streamingNeuLegacyStorageKey,
  streamingNeuStorageKey,
} from "../lib/streamingNeu.js";

const LEER = Object.freeze({
  status: "idle", runId: null, neueIds: Object.freeze([]), naechsterAblauf: null,
});

function zustandFuer(snapshot, now = Date.now()) {
  return Object.freeze({
    status: "ready",
    runId: snapshot.runId,
    neueIds: Object.freeze([...streamingNeuIds(snapshot, now)]),
    naechsterAblauf: naechsterStreamingNeuAblauf(snapshot, now),
  });
}

/* Bewusst lokal und nicht im PersonalDataRegistry: Der Snapshot ist nur ein
   kleiner abgeleiteter Geraetecache. Der dynamische, ownergebundene Key trennt
   Konten; captureStorageContext verhindert verspaetete A->B-Uebernahmen. */
export function useStreamingNeuController() {
  const [zustand, setZustand] = useState(LEER);
  const auftragRef = useRef(0);
  const snapshotRef = useRef(null);
  const aktiveKatalogAuftraegeRef = useRef(0);
  const generation = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );

  useEffect(() => {
    auftragRef.current++;
    snapshotRef.current = null;
    setZustand(LEER);
  }, [generation]);

  const uebernehmeVollkatalog = useCallback(async ({ runId, titel } = {}) => {
    const auftrag = ++auftragRef.current;
    aktiveKatalogAuftraegeRef.current += 1;
    const kontext = captureStorageContext();
    const key = streamingNeuStorageKey(kontext.owner);
    const legacyKey = streamingNeuLegacyStorageKey(kontext.owner);
    try {
      if (!key || !String(runId == null ? "" : runId).trim() || !Array.isArray(titel)) {
        if (kontext.isCurrent() && auftragRef.current === auftrag) {
          setZustand({ ...LEER, status: "unavailable" });
        }
        return false;
      }
      let gespeichert = await kontext.get(key);
      let ausLegacyKey = false;
      if (!gespeichert && legacyKey) {
        gespeichert = await kontext.get(legacyKey);
        ausLegacyKey = !!gespeichert;
      }
      if (!kontext.isCurrent() || auftragRef.current !== auftrag) return false;
      const ergebnis = aktualisiereStreamingNeuSnapshot(gespeichert?.value, {
        owner: kontext.owner, runId, titel,
      });
      if (!ergebnis) {
        setZustand({ ...LEER, status: "unavailable" });
        return false;
      }
      if (ergebnis.geaendert || ausLegacyKey) {
        await kontext.set(key, JSON.stringify(ergebnis.snapshot));
        if (!kontext.isCurrent() || auftragRef.current !== auftrag) return false;
      }
      snapshotRef.current = ergebnis.snapshot;
      setZustand(zustandFuer(ergebnis.snapshot));
      return true;
    } catch {
      if (kontext.isCurrent() && auftragRef.current === auftrag) {
        setZustand({ ...LEER, status: "error" });
      }
      return false;
    } finally {
      aktiveKatalogAuftraegeRef.current = Math.max(0, aktiveKatalogAuftraegeRef.current - 1);
    }
  }, []);

  /* Eine offen gebliebene PWA bereinigt den naechsten Eintrag exakt an seiner
     14-Tage-Grenze. Der lokale Snapshot wird dabei ebenfalls verkleinert; ein
     Reload ist fuer das Verschwinden nicht erforderlich. */
  useEffect(() => {
    if (!Number.isFinite(zustand.naechsterAblauf)) return undefined;
    const wartezeit = Math.max(0, zustand.naechsterAblauf - Date.now() + 5);
    let timer = null;
    const bereinige = async () => {
      /* Ein schon laufender Vollkatalogauftrag besitzt Vorrang. Cleanup darf
         ihn weder ueber den Zaehler abbrechen noch seinen alten Snapshot
         darueber schreiben; nach seinem Abschluss wird kurz erneut geprueft. */
      if (aktiveKatalogAuftraegeRef.current > 0) {
        timer = window.setTimeout(bereinige, 50);
        return;
      }
      const auftrag = auftragRef.current;
      const kontext = captureStorageContext();
      const key = streamingNeuStorageKey(kontext.owner);
      const ergebnis = bereinigeStreamingNeuSnapshot(snapshotRef.current, Date.now());
      if (!key || !ergebnis || !kontext.isCurrent() || auftragRef.current !== auftrag) return;
      try {
        if (ergebnis.geaendert) {
          await kontext.set(key, JSON.stringify(ergebnis.snapshot));
          if (!kontext.isCurrent() || auftragRef.current !== auftrag) return;
        }
        snapshotRef.current = ergebnis.snapshot;
        setZustand(zustandFuer(ergebnis.snapshot));
      } catch {
        if (kontext.isCurrent() && auftragRef.current === auftrag) {
          setZustand({ ...LEER, status: "error" });
        }
      }
    };
    timer = window.setTimeout(bereinige, wartezeit);
    return () => window.clearTimeout(timer);
  }, [zustand.naechsterAblauf]);

  return { streamingNeu: zustand, uebernehmeVollkatalog };
}
