import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  baueBackup,
  pruefeLokaleBackupVollstaendigkeit,
} from "../lib/backup.js";
import { runtimeConfig } from "../config/runtime.js";
import {
  ACCOUNT_EXPORT_RELEASE_CONTRACT,
  istKontoExportVertragVollstaendig,
} from "../lib/privatePilotOps.js";
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

const OWN_DATA_FELDER = Object.freeze([
  "auth", "access", "personal", "aiLogs", "seriesWatch", "sharedArticles",
  "sharedClaims", "radar", "retention", "deletion",
]);

function exportFehler(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function istValidierterOwnDataStand(wert) {
  return !!wert && typeof wert === "object" && !Array.isArray(wert)
    && Object.keys(wert).length === OWN_DATA_FELDER.length
    && OWN_DATA_FELDER.every((feld) => Object.prototype.hasOwnProperty.call(wert, feld));
}

function dateiDatum(now) {
  const wert = typeof now === "function" ? now() : now;
  const datum = wert instanceof Date ? wert : new Date(wert ?? Date.now());
  return datum.toISOString().slice(0, 10);
}

function ladeBackupDateiHerunter({
  backup,
  dateiname,
  markiereExport,
  vollstaendigkeit = null,
  createBlob = (text) => new Blob([text], { type: "application/json" }),
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  createAnchor = () => document.createElement("a"),
}) {
  let url = null;
  try {
    const blob = createBlob(JSON.stringify(backup, null, 2));
    url = createObjectURL(blob);
    const anchor = createAnchor();
    anchor.href = url;
    anchor.download = dateiname;
    starteGesamtBackupDownload(anchor, markiereExport, backup._exportStaende);
    return Object.freeze({ ok: true, clicked: true, dateiname, backup, vollstaendigkeit });
  } finally {
    if (url) revokeObjectURL(url);
  }
}

/* Die normale sichtbare Sicherung ist ausschließlich der gebundene persönliche
   Registry-Stand. Sie fragt nie den serverweiten Own-Data-Endpunkt ab und kann
   deshalb auch nicht versehentlich als vollständiger Kontoexport gelten. */
export async function ladeGebundeneSicherheitskopieHerunter({
  storageContext = captureStorageContext(),
  buildBackup = baueBackup,
  markiereExport = () => {},
  now = Date.now,
  ...downloadUmgebung
} = {}) {
  const backup = await buildBackup({ storageContext, remoteOwnData: null });
  if (storageContext.isCurrent?.() !== true) {
    throw exportFehler("STORAGE_CONTEXT_CHANGED", "Sicherheitskopie abgebrochen: Der Speicherkontext hat sich geändert.");
  }
  if (Object.prototype.hasOwnProperty.call(backup || {}, "konto_serverdaten")) {
    throw exportFehler("LOCAL_EXPORT_CONTAINS_ACCOUNT_DATA", "Die lokale Sicherheitskopie enthielt unerwartete Serverdaten.");
  }
  const vollstaendigkeit = pruefeLokaleBackupVollstaendigkeit(backup);
  return ladeBackupDateiHerunter({
    backup,
    dateiname: `kinodreieck_sicherheitskopie_geraet_${dateiDatum(now)}.json`,
    markiereExport,
    vollstaendigkeit,
    ...downloadUmgebung,
  });
}

/* Der getrennte Kontoexport bleibt fail-closed. Vor dem ersten Request muss
   der versionierte Releaseumfang exakt belegt sein. `getOwnData()` validiert
   danach die Endpoint-Form streng; hier wird zusätzlich die erwartete
   Top-Level-Projektion verlangt, bevor eine Datei überhaupt erzeugt wird. */
export async function ladeVollstaendigenKontoexportHerunter({
  aktiviert = runtimeConfig.privateSelfServiceEnabled === true,
  vollstaendigkeitsVertrag = ACCOUNT_EXPORT_RELEASE_CONTRACT,
  storageContext = captureStorageContext(),
  getValidatedOwnData = () => accountSelfService.getOwnData(),
  buildBackup = baueBackup,
  markiereExport = () => {},
  now = Date.now,
  ...downloadUmgebung
} = {}) {
  if (aktiviert !== true) {
    throw exportFehler("ACCOUNT_EXPORT_DISABLED", "Der vollständige Kontoexport ist nicht freigeschaltet.");
  }
  if (!istKontoExportVertragVollstaendig(vollstaendigkeitsVertrag)) {
    throw exportFehler("ACCOUNT_EXPORT_SCOPE_UNPROVEN", "Der vollständige Umfang des Kontoexports ist für diesen Release nicht belegt.");
  }
  const remoteOwnData = await getValidatedOwnData();
  if (storageContext.isCurrent?.() !== true) {
    throw exportFehler("STORAGE_CONTEXT_CHANGED", "Kontoexport abgebrochen: Der Speicherkontext hat sich geändert.");
  }
  if (!istValidierterOwnDataStand(remoteOwnData)) {
    throw exportFehler("ACCOUNT_EXPORT_NOT_VALIDATED", "Die Server-Eigendaten wurden nicht vollständig validiert.");
  }
  const backup = await buildBackup({ storageContext, remoteOwnData });
  if (storageContext.isCurrent?.() !== true || backup?.konto_serverdaten !== remoteOwnData) {
    throw exportFehler("ACCOUNT_EXPORT_NOT_COMPLETE", "Der vollständige Kontoexport konnte nicht belegt werden.");
  }
  return ladeBackupDateiHerunter({
    backup,
    dateiname: `kinodreieck_kontoexport_${dateiDatum(now)}.json`,
    markiereExport,
    ...downloadUmgebung,
  });
}

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
  const sicherheitskopieGeraet = useCallback(async () => {
    try {
      await ladeGebundeneSicherheitskopieHerunter({ markiereExport });
      return true;
    } catch (error) {
      onFehler?.(error?.message || "Sicherheitskopie dieses Geräts konnte nicht erstellt werden.");
      return false;
    }
  }, [markiereExport, onFehler]);
  const kontoExportVollstaendig = useCallback(async () => {
    try {
      await ladeVollstaendigenKontoexportHerunter({ markiereExport });
      return true;
    } catch (error) {
      onFehler?.(error?.message || "Vollständiger Kontoexport konnte nicht erstellt werden.");
      return false;
    }
  }, [markiereExport, onFehler]);
  return {
    markiereExport,
    sicherheitskopieGeraet,
    kontoExportVollstaendig,
    /* Übergangskompatibilität für noch nicht umgestellte interne Aufrufer. */
    backupGesamt: sicherheitskopieGeraet,
    ungesichertMaster: istMasterUngesichert(masterHerkunft, aktuellerExportStand.master),
    ungesichertArtikel: istArtikelUngesichert(artikelListe, artikelGespeichertAm, aktuellerExportStand.artikel),
  };
}
