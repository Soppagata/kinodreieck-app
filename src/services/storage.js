/* Persönliche Daten-Grenze. UI und App importieren nur diese Fassade.
   Zwei Betriebsarten:
     - Gast  ("guest-local"): alles bleibt auf dem Gerät. Unverändertes Verhalten.
     - Konto ("account"): der Account-Treiber spiegelt die Töpfe in kd_personal.
   Historische Git-/Supabase-Schlüsseltreiber gehören nicht zum aktiven
   Laufzeitbaum. Sie bleiben nur als getestete Migrationsreferenz im Repository. */
export {
  store, K, PROGRAMM_TTL_MS,
  activeSyncStatus, activePull,
  getTreiber, setTreiber,
} from "../lib/storage.js";

import { store as personalStore, setStorageDriver, storageDriverName } from "../lib/storage.js";
import {
  createAccountDriver, ACCOUNT_SYNC_KEYS, getCacheOwner, setCacheOwner, verwerfeTreiberZustand,
} from "../lib/accountDriver.js";
import { authDriver, authService } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import {
  normalizeBoundaryError,
} from "./errors.js";

export { ACCOUNT_SYNC_KEYS };

/* Ein Account-Treiber gehört unveränderlich zu genau EINEM Konto und EINER
   Aktivierungsgeneration. Beim Kontowechsel entsteht eine neue Instanz mit
   eigenen Commit-Queues. Alte, noch wartende Aufträge können dadurch weder ein
   späteres Token noch den localStorage-Wert des nächsten Kontos verwenden. */
let accountDriver = null;
let vorbereitetesKonto = null;
let treiberGeneration = 0;
let kontoAktiv = false;

function leeresKontoStatus() {
  return {
    lastPull: null, lastCommit: null,
    pending: [], conflict: [], stale: [], zuGross: [], schemaVeraltet: [],
    configured: false, prepared: false,
  };
}

function baueAccountDriver(accountId) {
  const id = String(accountId || "");
  const generation = ++treiberGeneration;
  const driver = createAccountDriver({
    config: runtimeConfig,
    isActive: () => vorbereitetesKonto === id
      && treiberGeneration === generation
      && accountDriver === driver,
    getAccessToken: async (opts) => {
      /* Vor UND nach dem potenziell asynchronen Tokenzugriff prüfen. Ein
         Auftrag von Konto A darf nie nach einem Wechsel das Token von B sehen. */
      const vorher = authService.getSnapshot();
      if (vorher?.mode !== "account" || String(vorher.account?.id || "") !== id) return null;
      const token = await authDriver.getAccessToken(opts || {});
      const nachher = authService.getSnapshot();
      if (nachher?.mode !== "account" || String(nachher.account?.id || "") !== id) return null;
      return token;
    },
  });
  return driver;
}

/* Meldet, ob der lokale Datenbestand zu einem ANDEREN Konto gehört. Grundlage
   für die Warnung im Übernahme-Weg: fremde Gerätedaten dürfen nie unbemerkt in
   den frisch angemeldeten Account wandern. */
export function cacheGehoertZuFremdemKonto(accountId) {
  const owner = getCacheOwner();
  return !!owner && !!accountId && owner !== String(accountId);
}
export function cacheOwner() { return getCacheOwner(); }

/* Nach der Anmeldung wird der Treiber zunächst NUR für Inventur und die
   ausdrückliche Übernahme vorbereitet. Der normale `store` bleibt lokal, bis
   der Nutzer entschieden hat. So kann zwischen Login und Bestätigung kein
   lokaler Topf versehentlich ins Konto geschrieben werden. */
export function bereiteKontoTreiberVor(accountId) {
  const id = String(accountId || "");
  if (!id) throw new Error("Konto-Treiber benötigt eine Konto-ID.");
  setStorageDriver(null);
  kontoAktiv = false;
  if (accountDriver && vorbereitetesKonto === id) return accountDriver;

  if (cacheGehoertZuFremdemKonto(id)) verwerfeTreiberZustand();
  vorbereitetesKonto = id;
  accountDriver = baueAccountDriver(id);
  return accountDriver;
}

/* Erst nach bestätigter Übernahme beziehungsweise bestätigtem Kontostand wird
   der lokale Cache diesem Konto zugeordnet und der Alltagssync eingeschaltet. */
export function bestaetigeKontoTreiber(accountId) {
  const id = String(accountId || "");
  const session = authService.getSnapshot();
  if (session?.mode !== "account" || String(session.account?.id || "") !== id) {
    throw new Error("Der Kontospeicher kann nur für die aktuell angemeldete Konto-ID bestätigt werden.");
  }
  const driver = bereiteKontoTreiberVor(id);
  if (vorbereitetesKonto !== id) throw new Error("Falscher Konto-Treiber vorbereitet.");
  setCacheOwner(id);
  setStorageDriver(driver);
  kontoAktiv = true;
  return driver;
}

/* Nach dem Abmelden: Treiber stoppen. Die getrennte Übernahme-Fassade stellt
   anschließend den Gaststand her und entfernt erst dann die Cache-Bindung. */
export function deaktiviereKontoTreiber() {
  setStorageDriver(null);
  kontoAktiv = false;
  vorbereitetesKonto = null;
  accountDriver = null;
  treiberGeneration++;
}

export function verwerfeLokaleKontoBindung() {
  setCacheOwner(null);
  verwerfeTreiberZustand();
}

export function istKontoTreiberAktiv() { return kontoAktiv && storageDriverName() === "konto"; }
export function istKontoTreiberVorbereitet() { return !!accountDriver && !!vorbereitetesKonto; }
export function vorbereitetesKontoId() { return vorbereitetesKonto; }

/* Konto-Sync-Fläche für die Oberfläche — die UI kennt den Treiber nicht direkt. */
export const accountSync = Object.freeze({
  status: () => accountDriver
    ? { ...accountDriver.status(), prepared: true, active: istKontoTreiberAktiv() }
    : leeresKontoStatus(),
  pull: () => accountDriver?.pull() || Promise.resolve({ ok: false, reason: "not-prepared" }),
  flush: () => accountDriver?.syncFlush() || Promise.resolve([]),
  inventur: () => accountDriver?.inventur() || Promise.resolve({ ok: false, reason: "not-prepared", zeilen: {} }),
  verbindungstest: () => accountDriver?.connectionTest() || Promise.resolve({ ok: false, reason: "not-prepared" }),
  uebernehmeKey: (key, value) => accountDriver?.uebernehmeKey(key, value)
    || Promise.resolve({ ok: false, reason: "not-prepared" }),
  loescheRemote: (key) => accountDriver?.loescheRemote(key)
    || Promise.resolve({ ok: false, reason: "not-prepared" }),
  resolveKeepLocal: (key) => accountDriver?.resolveConflictPushLocal(key)
    || Promise.resolve({ ok: false, reason: "not-prepared" }),
  resolveKeepRemote: (key) => accountDriver?.resolveConflictUseRemote(key)
    || Promise.resolve({ ok: false, reason: "not-prepared" }),
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
});
