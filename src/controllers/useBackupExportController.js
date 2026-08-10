import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { baueBackup } from "../lib/backup.js";
import { runtimeConfig } from "../config/runtime.js";
import { accountSelfService } from "../services/accountSelfService.js";
import {
  K,
  captureStorageContext,
  storageContextGenerationSnapshot,
  subscribeStorageContext,
} from "../services/storage.js";
import {
  istArtikelUngesichert,
  istMasterUngesichert,
  starteGesamtBackupDownload,
} from "./backupExportController.js";

const leererStand = (generation, owner) => ({ generation, owner, master: 0, artikel: 0 });

export function useBackupExportController({
  masterHerkunft, artikelListe, artikelGespeichertAm, owner, onFehler,
}) {
  const storageGeneration = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );
  const exportOwner = String(owner || "guest-local");
  const [exportStand, setExportStand] = useState(() => leererStand(storageGeneration, exportOwner));
  const aktuellerExportStand = exportStand.generation === storageGeneration && exportStand.owner === exportOwner
    ? exportStand
    : leererStand(storageGeneration, exportOwner);
  const exportStandRef = useRef(exportStand);
  exportStandRef.current = aktuellerExportStand;
  useEffect(() => {
    let aktiv = true;
    const kontext = captureStorageContext();
    const leer = leererStand(storageGeneration, exportOwner);
    exportStandRef.current = leer;
    setExportStand(leer);
    kontext.get(K.exportStand).then((r) => {
      if (!aktiv || !kontext.isCurrent() || kontext.generation !== storageGeneration || !r?.value) return;
      try {
        const gespeichert = JSON.parse(r.value);
        /* Ungetaggte Legacywerte sowie der Marker eines anderen Kontos sind
           keine Sicherungsbestätigung für diesen persönlichen Datenraum. */
        if (gespeichert?.owner !== exportOwner) return;
        const geladen = {
          ...leer,
          master: Number.isFinite(gespeichert.master) ? gespeichert.master : 0,
          artikel: Number.isFinite(gespeichert.artikel) ? gespeichert.artikel : 0,
        };
        setExportStand((vorher) => {
          const basis = vorher.generation === storageGeneration && vorher.owner === exportOwner ? vorher : leer;
          const next = {
            ...geladen,
            master: Math.max(basis.master, geladen.master),
            artikel: Math.max(basis.artikel, geladen.artikel),
          };
          exportStandRef.current = next;
          return next;
        });
      } catch { /* Default */ }
    }).catch(() => {});
    return () => { aktiv = false; };
  }, [exportOwner, storageGeneration]);
  const markiereExport = useCallback((feld, enthaltenerStand = Date.now()) => {
    if (!Number.isFinite(enthaltenerStand)) return false;
    const kontext = captureStorageContext();
    if (!kontext.isCurrent() || kontext.generation !== storageGeneration) return false;
    const basis = exportStandRef.current.generation === storageGeneration
      && exportStandRef.current.owner === exportOwner
      ? exportStandRef.current
      : leererStand(storageGeneration, exportOwner);
    const vorher = Number(basis[feld]) || 0;
    if (enthaltenerStand <= vorher) return true;
    const next = { ...basis, [feld]: enthaltenerStand };
    exportStandRef.current = next;
    setExportStand(next);
    kontext.set(K.exportStand, JSON.stringify({
      version: 2,
      owner: exportOwner,
      master: next.master,
      artikel: next.artikel,
    })).catch(() => {});
    return true;
  }, [exportOwner, storageGeneration]);
  const backupGesamt = useCallback(async () => {
    let url = null;
    try {
      /* Ein als vollständig bezeichneter Kontoexport darf den Remote-Anteil
         nicht still weglassen. Solange der Own-Data-Endpunkt nicht sicher
         aktiviert ist, bleibt der bewährte lokale Export verfügbar und weist
         seinen Umfang maschinenlesbar aus. Ist das Flag an, bricht jeder
         Remote-Fehler den Download ehrlich ab. */
      const remoteOwnData = runtimeConfig.privateSelfServiceEnabled === true
        ? await accountSelfService.getOwnData()
        : null;
      const backup = await baueBackup({ remoteOwnData });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "kinodreieck_backup_" + new Date().toISOString().slice(0, 10) + ".json";
      starteGesamtBackupDownload(anchor, markiereExport, backup._exportStaende);
      return true;
    } catch (error) {
      onFehler?.(error?.message || "Gesamt-Backup konnte nicht erstellt werden.");
      return false;
    } finally { if (url) URL.revokeObjectURL(url); }
  }, [markiereExport, onFehler]);
  return {
    markiereExport,
    backupGesamt,
    ungesichertMaster: istMasterUngesichert(masterHerkunft, aktuellerExportStand.master),
    ungesichertArtikel: istArtikelUngesichert(artikelListe, artikelGespeichertAm, aktuellerExportStand.artikel),
  };
}
