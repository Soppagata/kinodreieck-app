/* Persönliche Daten-Grenze. UI und App importieren nur diese Fassade.
   Zwei Betriebsarten:
     - Gast  ("guest-local"): alles bleibt auf dem Gerät. Unverändertes Verhalten.
     - Konto ("account"): der Account-Treiber spiegelt die Töpfe in kd_personal.
   Die alten Git-/Sync-Schlüssel-Treiber bleiben Legacy-Adapter und sind kein
   Accountmodell — sie werden hier nur noch durchgereicht, nicht mehr aktiviert. */
export {
  store, K, PROGRAMM_TTL_MS,
  activeSyncStatus, activePull,
  getTreiber, setTreiber,
} from "../lib/storage.js";

import { store as personalStore, setStorageDriver, storageDriverName } from "../lib/storage.js";
import * as git from "../lib/gitDriver.js";
import * as supabase from "../lib/supabaseDriver.js";
import {
  createAccountDriver, ACCOUNT_SYNC_KEYS, getCacheOwner, setCacheOwner, verwerfeTreiberZustand,
} from "../lib/accountDriver.js";
import { authDriver } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import {
  BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError,
} from "./errors.js";

export { ACCOUNT_SYNC_KEYS };

function requireSuccessfulResult(result, operation) {
  if (result?.ok) return result;
  if (Number.isFinite(result?.status) && result.status > 0) {
    throw errorFromStatus(result.status, { source: "storage", operation });
  }
  throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
    source: "storage",
    operation,
    message: "Die persönliche Datenablage ist nicht verbunden.",
    reason: "legacy-storage-unconfigured",
  });
}

/* Der Account-Treiber wird einmal gebaut und beim Anmelden aktiviert. Er holt
   sein Zugriffstoken bei jedem Request frisch vom Auth-Treiber — Tokens liegen
   damit an genau einer Stelle und erreichen weder diese Fassade noch die UI. */
const accountDriver = createAccountDriver({
  config: runtimeConfig,
  getAccessToken: (opts) => authDriver.getAccessToken(opts || {}),
});

let kontoAktiv = false;

/* Meldet, ob der lokale Datenbestand zu einem ANDEREN Konto gehört. Grundlage
   für die Warnung im Übernahme-Weg: fremde Gerätedaten dürfen nie unbemerkt in
   den frisch angemeldeten Account wandern. */
export function cacheGehoertZuFremdemKonto(accountId) {
  const owner = getCacheOwner();
  return !!owner && !!accountId && owner !== String(accountId);
}
export function cacheOwner() { return getCacheOwner(); }

/* Nach der Anmeldung: Treiber scharf schalten. Bei Kontowechsel wird der
   Treiberzustand (gesehene Versionen, Status, Sicherungspunkte) verworfen —
   die persönlichen Töpfe bleiben unangetastet, über sie entscheidet die Übernahme. */
export function aktiviereKontoTreiber(accountId) {
  if (cacheGehoertZuFremdemKonto(accountId)) verwerfeTreiberZustand();
  setCacheOwner(accountId);
  setStorageDriver(accountDriver);
  kontoAktiv = true;
  return accountDriver;
}

/* Nach dem Abmelden: zurück auf lokal. Lokale Daten bleiben vollständig liegen
   (harte Zusage: Abmelden löscht nie persönliche Daten). */
export function deaktiviereKontoTreiber() {
  setStorageDriver(null);
  kontoAktiv = false;
}

export function istKontoTreiberAktiv() { return kontoAktiv && storageDriverName() === "konto"; }

/* Konto-Sync-Fläche für die Oberfläche — die UI kennt den Treiber nicht direkt. */
export const accountSync = Object.freeze({
  status: () => accountDriver.status(),
  pull: () => accountDriver.pull(),
  flush: () => accountDriver.syncFlush(),
  inventur: () => accountDriver.inventur(),
  verbindungstest: () => accountDriver.connectionTest(),
  uebernehmeKey: (key, value) => accountDriver.uebernehmeKey(key, value),
  loescheRemote: (key) => accountDriver.loescheRemote(key),
  resolveKeepLocal: (key) => accountDriver.resolveConflictPushLocal(key),
  resolveKeepRemote: (key) => accountDriver.resolveConflictUseRemote(key),
});

export const storageService = Object.freeze({
  /* Folgt der Sitzung: Gast bleibt "guest-local", angemeldet wird "account". */
  get mode() { return istKontoTreiberAktiv() ? "account" : "guest-local"; },
  async get(key) {
    try { return await personalStore.get(key); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.get" }); }
  },
  async set(key, value) {
    try { return await personalStore.set(key, value); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.set" }); }
  },
  async delete(key) {
    try { return await personalStore.delete(key); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.delete" }); }
  },
  async list() {
    try { return await personalStore.list(); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.list" }); }
  },
  hasLegacyGitConnection() {
    return git.isGitConfigured();
  },
  /* Veröffentlichen läuft weiterhin über den eingefrorenen Legacy-Weg und ist
     deshalb praktisch nur noch für den Altbestand verfügbar. Der Account-Weg für
     geteilte Blogs ist ein eigener Folgeschritt (er braucht eine Autorenbindung
     in kd_store, die diese Etappe bewusst nicht anfasst). Wichtig ist, dass der
     Fehlerfall ehrlich und verständlich bleibt statt technisch zu wirken. */
  async publishSharedArticle(article) {
    try { return requireSuccessfulResult(await supabase.publishBlog(article), "article.publish"); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "article.publish" }); }
  },
  async unpublishSharedArticle(articleId) {
    try { return requireSuccessfulResult(await supabase.unpublishBlog(articleId), "article.unpublish"); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "article.unpublish" }); }
  },
});
