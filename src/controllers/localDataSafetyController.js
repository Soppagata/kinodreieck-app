import { ACCOUNT_CACHE_METADATA_KEYS } from "../lib/accountStorageKeys.js";
import { LOCAL_RETENTION_KEYS } from "../lib/localRetention.js";
import {
  PERSONAL_DATA_KEYS,
  VERALTETE_PRIVACY_KEYS,
} from "../lib/personalDataRegistry.js";
import {
  K,
  captureStorageContext,
  localDriver,
} from "../lib/storage.js";
import { UEBERNOMMEN_KEY } from "../lib/uebernahme.js";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import { ladeGebundeneSicherheitskopieHerunter } from "./useBackupExportController.js";

export const LOCAL_DATA_SAFETY_ERROR = Object.freeze({
  GUEST_CONTEXT_REQUIRED: "guest-context-required",
  SAFETY_COPY_REQUIRED: "safety-copy-required",
  SAFETY_COPY_FAILED: "safety-copy-failed",
  CONTEXT_CHANGED: "storage-context-changed",
  DELETE_INCOMPLETE: "local-delete-incomplete",
});

/* Bewusst kein Browser-Gesamtreset: Auth-Sitzung, Katalog-/PWA-Caches und rein
   gerätebezogene UI-Wahlen liegen nicht in dieser Liste. */
export const LOCAL_CONTENT_DELETE_KEYS = Object.freeze([...new Set([
  ...PERSONAL_DATA_KEYS,
  ...Object.values(LOCAL_RETENTION_KEYS),
  ...ACCOUNT_CACHE_METADATA_KEYS,
  ...VERALTETE_PRIVACY_KEYS,
  UEBERNOMMEN_KEY,
  K.exportStand,
  K.demoSeed,
])]);

function fehler(code, message, extras = null) {
  const error = new Error(message);
  error.code = code;
  if (extras && typeof extras === "object") Object.assign(error, extras);
  return error;
}

function istGast(session) {
  return session?.mode === "guest" && !session?.account;
}

function istGebundenerLokalkontext(context) {
  return context?.isCurrent?.() === true
    && context.name === localDriver.name
    && context.owner === localDriver.owner;
}

function pruefeGastgrenze(context, getSession) {
  if (!istGast(getSession?.()) || !istGebundenerLokalkontext(context)) {
    throw fehler(
      LOCAL_DATA_SAFETY_ERROR.GUEST_CONTEXT_REQUIRED,
      "Lokale Inhalte können nur in einer aktiven Gastsession auf diesem Gerät gelöscht werden.",
    );
  }
}

async function liesAusgangsstand(context, getSession) {
  const snapshot = new Map();
  for (const key of LOCAL_CONTENT_DELETE_KEYS) {
    pruefeGastgrenze(context, getSession);
    const eintrag = await context.get(key);
    pruefeGastgrenze(context, getSession);
    snapshot.set(key, eintrag?.value ?? null);
  }
  return snapshot;
}

async function rolleLokalZurueck(context, snapshot) {
  if (!snapshot || !istGebundenerLokalkontext(context)) {
    return Object.freeze({ ok: false, grund: "kontext-gewechselt" });
  }
  const fehlerKeys = [];
  for (const [key, value] of snapshot) {
    try {
      if (value == null) await context.delete(key);
      else await context.set(key, value);
    } catch { fehlerKeys.push(key); }
  }
  if (!istGebundenerLokalkontext(context)) {
    return Object.freeze({ ok: false, grund: "kontext-gewechselt", fehlerKeys });
  }
  for (const [key, value] of snapshot) {
    try {
      const aktuell = await context.get(key);
      if ((aktuell?.value ?? null) !== value) fehlerKeys.push(key);
    } catch { fehlerKeys.push(key); }
  }
  return Object.freeze({
    ok: fehlerKeys.length === 0,
    grund: fehlerKeys.length ? "rollback-unvollstaendig" : "rollback-bestaetigt",
    fehlerKeys: [...new Set(fehlerKeys)],
  });
}

export function createLocalDataSafetyController({
  captureContext = captureStorageContext,
  getSession = () => sessionCoordinator.getSnapshot(),
  downloadSafetyCopy = (optionen) => ladeGebundeneSicherheitskopieHerunter(optionen),
  markiereExport = () => {},
  reload = () => globalThis.location?.reload?.(),
  now = Date.now,
} = {}) {
  let aktiveBestaetigung = null;

  return Object.freeze({
    async download() {
      const context = captureContext();
      pruefeGastgrenze(context, getSession);
      const download = await downloadSafetyCopy({ storageContext: context, markiereExport });
      pruefeGastgrenze(context, getSession);
      if (download?.clicked !== true) {
        throw fehler(
          LOCAL_DATA_SAFETY_ERROR.SAFETY_COPY_FAILED,
          "Die lokale Sicherheitskopie wurde nicht als Download bestätigt.",
        );
      }
      const timestamp = Number(typeof now === "function" ? now() : now);
      aktiveBestaetigung = Object.freeze({
        token: Symbol("local-data-safety"),
        generation: context.generation,
        owner: context.owner,
        completedAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
      });
      return aktiveBestaetigung;
    },

    async deleteLocalContents(receipt) {
      if (!aktiveBestaetigung || receipt !== aktiveBestaetigung) {
        throw fehler(
          LOCAL_DATA_SAFETY_ERROR.SAFETY_COPY_REQUIRED,
          "Lade zuerst die lokale Sicherheitskopie herunter.",
        );
      }
      const context = captureContext();
      pruefeGastgrenze(context, getSession);
      if (context.generation !== receipt.generation || context.owner !== receipt.owner) {
        aktiveBestaetigung = null;
        throw fehler(
          LOCAL_DATA_SAFETY_ERROR.CONTEXT_CHANGED,
          "Der lokale Datenkontext hat sich seit dem Download geändert. Bitte erstelle eine neue Sicherheitskopie.",
        );
      }

      let snapshot = null;
      let loeschungBegonnen = false;
      try {
        snapshot = await liesAusgangsstand(context, getSession);
        for (const key of LOCAL_CONTENT_DELETE_KEYS) {
          pruefeGastgrenze(context, getSession);
          loeschungBegonnen = true;
          await context.delete(key);
          pruefeGastgrenze(context, getSession);
        }
        const restKeys = [];
        for (const key of LOCAL_CONTENT_DELETE_KEYS) {
          pruefeGastgrenze(context, getSession);
          const rest = await context.get(key);
          pruefeGastgrenze(context, getSession);
          if (rest != null) restKeys.push(key);
        }
        if (restKeys.length) {
          throw fehler(
            LOCAL_DATA_SAFETY_ERROR.DELETE_INCOMPLETE,
            "Lokale Inhalte konnten nicht vollständig entfernt werden.",
            { restKeys },
          );
        }
      } catch (cause) {
        const rollback = loeschungBegonnen
          ? await rolleLokalZurueck(context, snapshot)
          : Object.freeze({ ok: true, grund: "nicht-noetig", fehlerKeys: [] });
        aktiveBestaetigung = null;
        throw fehler(
          cause?.code === LOCAL_DATA_SAFETY_ERROR.GUEST_CONTEXT_REQUIRED
            ? LOCAL_DATA_SAFETY_ERROR.CONTEXT_CHANGED
            : LOCAL_DATA_SAFETY_ERROR.DELETE_INCOMPLETE,
          rollback.ok
            ? "Die lokale Löschung wurde nicht abgeschlossen; der vorherige Stand wurde zurückgesetzt."
            : "Die lokale Löschung wurde nicht abgeschlossen und konnte nicht vollständig zurückgesetzt werden. Bitte schließe die App und prüfe deine Sicherheitskopie.",
          { cause, rollback },
        );
      }

      aktiveBestaetigung = null;
      const entfernt = [...snapshot.values()].filter((value) => value != null).length;
      let reloadAusgeloest = false;
      try {
        reload();
        reloadAusgeloest = true;
      } catch { /* Die bestätigte Löschung bleibt wahr; die UI meldet den offenen Reload ehrlich. */ }
      return Object.freeze({ ok: true, entfernt, restKeys: [], reloadAusgeloest });
    },
  });
}
