/* Persönliche Daten-Grenze. UI und App importieren nur diese Fassade.
   Zwei Betriebsarten:
     - Gast  ("guest-local"): alles bleibt auf dem Gerät. Unverändertes Verhalten.
     - Konto ("account"): der Account-Treiber spiegelt die Töpfe in kd_personal.
   Historische Git-/Supabase-Schlüsseltreiber gehören nicht zum aktiven
   Laufzeitbaum. Sie bleiben nur als getestete Migrationsreferenz im Repository. */
export {
  store, K, PROGRAMM_TTL_MS,
  activeSyncStatus, activePull,
  captureStorageContext, storageContextGenerationSnapshot, storageOwnerKennung, subscribeStorageContext,
  getTreiber, setTreiber,
} from "../lib/storage.js";

import { store as personalStore, setStorageDriver, storageDriverName } from "../lib/storage.js";
import {
  createAccountDriver, ACCOUNT_SYNC_KEYS, bereinigeVerwaisteTreiberMetadaten,
  getCacheOwner, setCacheOwner, verwerfeTreiberZustand,
} from "../lib/accountDriver.js";
import { authDriver, authService } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import {
  normalizeBoundaryError,
} from "./errors.js";
import {
  ACCOUNT_CACHE_BINDING_SCHEMA_VERSION, ACCT_KEYS,
  beginneAccountCacheTransition, beendeAccountCacheTransition,
  leseAccountCacheBindingSchemaZustand, leseAccountCacheEpochZustand,
  leseAccountCacheTransition, leseAccountCacheTransitionZustand,
} from "../lib/accountStorageKeys.js";

export { ACCOUNT_SYNC_KEYS };

/* Ein Account-Treiber gehört unveränderlich zu genau EINEM Konto und EINER
   Aktivierungsgeneration. Beim Kontowechsel entsteht eine neue Instanz mit
   eigenen Commit-Queues. Alte, noch wartende Aufträge können dadurch weder ein
   späteres Token noch den localStorage-Wert des nächsten Kontos verwenden. */
let accountDriver = null;
let vorbereitetesKonto = null;
let treiberGeneration = 0;
let kontoAktiv = false;
let privacyGesperrt = false;
let freigabeGesperrtFuerKonto = null;
let accountEpoch = null;
let lokalerTransitionToken = null;
let transitionErlaubtDriver = false;

function neueEpoch() {
  try { return crypto.randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function leseEpoch(accountId) {
  try {
    const wert = JSON.parse(localStorage.getItem(ACCT_KEYS.epoch) || "null");
    return wert?.accountId === String(accountId || "") && wert?.token ? wert.token : null;
  } catch { return null; }
}

function schreibeEpoch(accountId, token = neueEpoch()) {
  const wert = { accountId: String(accountId || ""), token: String(token || "") };
  if (!wert.accountId || !wert.token) return null;
  try {
    const raw = JSON.stringify(wert);
    localStorage.setItem(ACCT_KEYS.epoch, raw);
    return localStorage.getItem(ACCT_KEYS.epoch) === raw ? wert.token : null;
  } catch { return null; }
}

function leseRoh(key) {
  try { return { ok: true, value: localStorage.getItem(key) }; }
  catch { return { ok: false, value: null }; }
}

function leseBindung(accountId) {
  const id = String(accountId || "");
  const zustand = leseAccountCacheBindingSchemaZustand();
  if (zustand.status !== "valid") return zustand;
  return zustand.value?.accountId === id ? zustand : { status: "invalid" };
}

function schreibeBindung(accountId) {
  const wert = {
    v: ACCOUNT_CACHE_BINDING_SCHEMA_VERSION,
    accountId: String(accountId || ""),
  };
  if (!wert.accountId) return false;
  try {
    const raw = JSON.stringify(wert);
    localStorage.setItem(ACCT_KEYS.bindingSchema, raw);
    return localStorage.getItem(ACCT_KEYS.bindingSchema) === raw;
  } catch { return false; }
}

function leseEpochStand(accountId) {
  const id = String(accountId || "");
  const zustand = leseAccountCacheEpochZustand();
  if (zustand.status !== "valid") return zustand;
  return zustand.value?.accountId === id
    ? { ...zustand, token: String(zustand.value.token) }
    : { status: "invalid" };
}

function bindungPasst(accountId) {
  return leseBindung(accountId).status === "valid";
}

export function istGebundenerAccountCacheAktiv({
  accountId, epoch, lokalerToken = null, driverErlaubt = false, aktiv = true,
} = {}) {
  if (!aktiv) return false;
  const id = String(accountId || "");
  const transition = leseAccountCacheTransition();
  const lokalerMarker = String(lokalerToken || "");
  /* Ein lokal autorisierter Adoption-Pull bleibt nur solange autorisiert, wie
     GENAU sein rückgelesener Marker persistent vorhanden ist. Fremdes
     Entfernen ist kein erfolgreicher Abschluss, sondern Kontextverlust. */
  if (lokalerMarker) {
    if (!driverErlaubt || transition?.token !== lokalerMarker || transition?.accountId !== id) return false;
  } else if (transition) return false;
  /* Vor der Adoption darf der vorbereitete Treiber Inventur/gebundenen Pull
     ausführen. Sobald eine Aktivierungsepoche existiert, sind Owner+Epoch die
     tabübergreifende Identität und niemals nur die In-Memory-Instanz. */
  if (!epoch) return true;
  return !!id && getCacheOwner() === id && leseEpoch(id) === epoch;
}

export function bindePersistentenAccountCache(accountId, { epoch = null } = {}) {
  const id = String(accountId || "");
  if (!id || !setCacheOwner(id)) return null;
  const gebunden = epoch ? schreibeEpoch(id, epoch) : (leseEpoch(id) || schreibeEpoch(id));
  if (!gebunden || getCacheOwner() !== id || leseEpoch(id) !== gebunden
      || !schreibeBindung(id) || !bindungPasst(id)) return null;
  accountEpoch = gebunden;
  return Object.freeze({ accountId: id, epoch: gebunden });
}

function privacyError() {
  const error = new Error("Persönliche Daten sind gesperrt, weil ein Kontocache nicht sicher getrennt werden konnte.");
  error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
  return error;
}

function accessError() {
  const error = new Error("Der Kontospeicher ist für diese Anmeldung nicht freigegeben.");
  error.code = "ACCOUNT_ACCESS_BLOCKED";
  return error;
}

/* Wenn weder Gast-Restore noch lokales Entfernen möglich sind, darf die
   dynamische Store-Fassade keinesfalls auf den darunterliegenden Accountcache
   zurückfallen. Dieser Treiber liefert keine persönlichen Werte und bestätigt
   auch keine Writes. Die UI wird zusätzlich vom Boot-Gate ausgehängt. */
const privacyMaskDriver = Object.freeze({
  name: "privacy-mask",
  owner: "privacy-locked",
  async get() { return null; },
  async set() { throw privacyError(); },
  async delete() { throw privacyError(); },
  async list() { return { keys: [] }; },
});

/* Eine entzogene oder unklare fachliche Freigabe darf den persistenten Cache
   nicht in Gastdaten verwandeln. Dieser Maskentreiber stoppt neue Lese- und
   Schreibvorgänge, ohne Owner, Epoch, Queue oder persönliche Werte anzutasten. */
const accessMaskDriver = Object.freeze({
  name: "account-access-mask",
  owner: "account-access-blocked",
  async get() { return null; },
  async set() { throw accessError(); },
  async delete() { throw accessError(); },
  async list() { return { keys: [] }; },
});

function remoteStoragePasst(accountId) {
  const id = String(accountId || "");
  try {
    const session = authService.getSnapshot();
    return !!id
      && session?.mode === "account"
      && session?.state === "ready"
      && String(session.account?.id || "") === id
      && session.capabilities?.remoteStorage === true;
  } catch { return false; }
}

function accountContextError() {
  const error = new Error("Der vorbereitete Kontokontext hat sich während des Auftrags geändert.");
  error.code = "ACCOUNT_CONTEXT_CHANGED";
  return error;
}

/* Gebundene Fassade für mehrschrittige Übernahme-Abläufe. `accountSync`
   delegiert absichtlich dynamisch an den jeweils aktuellen Treiber; ein
   bereits gestarteter A-Auftrag darf nach einem Kontowechsel aber niemals
   seine Folgeschritte gegen B ausführen. */
export function erstelleGebundenenAccountContext({ driver, accountId, generation, isCurrent }) {
  const id = String(accountId || "");
  const aktuell = () => !!driver && !!id && isCurrent?.() === true;
  const run = async (method, args = []) => {
    if (!aktuell() || typeof driver?.[method] !== "function") throw accountContextError();
    const result = await driver[method](...args);
    if (!aktuell()) throw accountContextError();
    return result;
  };
  return Object.freeze({
    accountId: id,
    generation,
    bindung: Object.freeze({ accountId: id, generation }),
    isCurrent: aktuell,
    inventur: () => run("inventur"),
    pull: () => run("pull"),
    uebernehmeKey: (key, value) => run("uebernehmeKey", [key, value]),
    loescheRemote: (key) => run("loescheRemote", [key]),
    resolveKeepRemote: (key) => run("resolveConflictUseRemote", [key]),
  });
}

export function capturePreparedAccountContext(erwarteteBindung = null, optionen = null) {
  const driver = accountDriver;
  const accountId = vorbereitetesKonto;
  if (!freigabeFuerAufrufPasst(accountId, optionen)) throw accessError();
  const generation = treiberGeneration;
  const context = erstelleGebundenenAccountContext({
    driver,
    accountId,
    generation,
    isCurrent: () => accountDriver === driver
      && vorbereitetesKonto === accountId
      && treiberGeneration === generation,
  });
  if (!context.isCurrent()
      || (erwarteteBindung && (String(erwarteteBindung.accountId || "") !== context.accountId
        || erwarteteBindung.generation !== context.generation))) {
    throw accountContextError();
  }
  return context;
}

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
    owner: `account:${id}`,
    config: runtimeConfig,
    isActive: () => vorbereitetesKonto === id
      && treiberGeneration === generation
      && accountDriver === driver
      && freigabeGesperrtFuerKonto == null
      && remoteStoragePasst(id)
      && String(authDriver.konto()?.id || "") === id
      && istGebundenerAccountCacheAktiv({
        accountId: id,
        epoch: accountEpoch,
        lokalerToken: lokalerTransitionToken,
        driverErlaubt: transitionErlaubtDriver,
      }),
    getAccessToken: async (opts) => {
      /* Vor UND nach dem potenziell asynchronen Tokenzugriff prüfen. Ein
         Auftrag von Konto A darf nie nach einem Wechsel das Token von B sehen. */
      const vorher = authService.getSnapshot();
      if (vorher?.mode !== "account" || vorher?.state !== "ready"
          || vorher.capabilities?.remoteStorage !== true
          || String(vorher.account?.id || "") !== id) return null;
      if (String(authDriver.konto()?.id || "") !== id) return null;
      const token = await authDriver.getAccessToken({ ...(opts || {}), erwarteteKontoId: id });
      const nachher = authService.getSnapshot();
      if (nachher?.mode !== "account" || nachher?.state !== "ready"
          || nachher.capabilities?.remoteStorage !== true
          || String(nachher.account?.id || "") !== id
          || String(authDriver.konto()?.id || "") !== id) return null;
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
function freigabeFuerAufrufPasst(accountId, optionen = null) {
  return freigabeGesperrtFuerKonto == null
    && (optionen?.remoteStorage === true || remoteStoragePasst(accountId));
}

export function bereiteKontoTreiberVor(accountId, optionen) {
  const id = String(accountId || "");
  if (!id) throw new Error("Konto-Treiber benötigt eine Konto-ID.");
  if (!freigabeFuerAufrufPasst(id, optionen)) throw accessError();
  if (privacyGesperrt) throw privacyError();
  const transition = leseAccountCacheTransition();
  if (transition && transition.token !== lokalerTransitionToken) {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }
  if (accountDriver && vorbereitetesKonto === id) return accountDriver;

  const owner = getCacheOwner();
  const metadatenSauber = owner
    ? (owner === id || verwerfeTreiberZustand())
    : bereinigeVerwaisteTreiberMetadaten();
  if (!metadatenSauber) {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }
  setStorageDriver(null);
  kontoAktiv = false;
  accountEpoch = owner === id ? leseEpoch(id) : null;
  vorbereitetesKonto = id;
  accountDriver = baueAccountDriver(id);
  return accountDriver;
}

/* Erst nach bestätigter Übernahme beziehungsweise bestätigtem Kontostand wird
   der lokale Cache diesem Konto zugeordnet und der Alltagssync eingeschaltet. */
export function bestaetigeKontoTreiber(accountId, optionen) {
  const id = String(accountId || "");
  const session = authService.getSnapshot();
  const explizitFreigegeben = optionen?.remoteStorage === true;
  if ((!explizitFreigegeben && (session?.mode !== "account" || session?.state !== "ready"
      || session.capabilities?.remoteStorage !== true
      || String(session.account?.id || "") !== id))) {
    throw new Error("Der Kontospeicher kann nur für die aktuell angemeldete Konto-ID bestätigt werden.");
  }
  const driver = bereiteKontoTreiberVor(id, optionen);
  if (vorbereitetesKonto !== id) throw new Error("Falscher Konto-Treiber vorbereitet.");
  if (!lokalerTransitionToken) {
    const persistierteEpoch = leseEpoch(id);
    if (getCacheOwner() !== id || !persistierteEpoch || !bindungPasst(id)) {
      maskierePersoenlichenSpeicher();
      throw privacyError();
    }
    accountEpoch = persistierteEpoch;
  }
  if (!accountEpoch || getCacheOwner() !== id || leseEpoch(id) !== accountEpoch
      || !bindungPasst(id)) {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }
  if (lokalerTransitionToken) {
    const beendet = beendeGebundeneAccountTransition(lokalerTransitionToken);
    if (!beendet) throw privacyError();
  }
  setStorageDriver(driver);
  kontoAktiv = true;
  return driver;
}

/* Nach dem Abmelden: Treiber stoppen. Die getrennte Übernahme-Fassade stellt
   anschließend den Gaststand her und entfernt erst dann die Cache-Bindung. */
export function deaktiviereKontoTreiber() {
  setStorageDriver(privacyGesperrt ? privacyMaskDriver : null);
  kontoAktiv = false;
  vorbereitetesKonto = null;
  accountDriver = null;
  accountEpoch = null;
  lokalerTransitionToken = null;
  transitionErlaubtDriver = false;
  freigabeGesperrtFuerKonto = null;
  treiberGeneration++;
}

export function sperreKontoTreiberWegenFreigabe(accountId) {
  const id = String(accountId || "");
  if (!id) throw accessError();
  freigabeGesperrtFuerKonto = id;
  kontoAktiv = false;
  vorbereitetesKonto = null;
  accountDriver = null;
  accountEpoch = null;
  transitionErlaubtDriver = false;
  treiberGeneration++;
  setStorageDriver(accessMaskDriver);
}

export function entsperreKontoTreiberNachFreigabe(accountId) {
  const id = String(accountId || "");
  if (!id || freigabeGesperrtFuerKonto !== id || privacyGesperrt) return false;
  freigabeGesperrtFuerKonto = null;
  setStorageDriver(null);
  return true;
}

export function istKontoTreiberWegenFreigabeGesperrt(accountId = null) {
  if (accountId == null) return freigabeGesperrtFuerKonto != null;
  return freigabeGesperrtFuerKonto === String(accountId || "");
}

export function maskierePersoenlichenSpeicher() {
  privacyGesperrt = true;
  freigabeGesperrtFuerKonto = null;
  kontoAktiv = false;
  vorbereitetesKonto = null;
  accountDriver = null;
  accountEpoch = null;
  lokalerTransitionToken = null;
  transitionErlaubtDriver = false;
  treiberGeneration++;
  setStorageDriver(privacyMaskDriver);
}

/* Nur nach bestätigtem Restore beziehungsweise bestätigter Quarantäne. */
export function entsperrePersoenlichenSpeicherNachTrennung() {
  privacyGesperrt = false;
  deaktiviereKontoTreiber();
}

export function istPersoenlicherSpeicherMaskiert() {
  return privacyGesperrt || freigabeGesperrtFuerKonto != null;
}

function authentifizierungPasst(accountId, optionen = null) {
  const id = String(accountId || "");
  if (optionen?.remoteStorage === true && id) return true;
  try {
    const sichtbar = authService.getSnapshot();
    const persistent = authDriver.konto();
    return sichtbar?.mode === "account"
      && sichtbar?.state === "ready"
      && sichtbar.capabilities?.remoteStorage === true
      && String(sichtbar.account?.id || "") === id
      && String(persistent?.id || "") === id;
  } catch { return false; }
}

function bestaetigungPasst(istBestaetigt, accountId) {
  try { return istBestaetigt?.(accountId) === true; }
  catch { return false; }
}

function legacyBindungsstand(accountId, istBestaetigt, eigenerTransitionToken = null, optionen = null) {
  const id = String(accountId || "");
  if (!id || !authentifizierungPasst(id, optionen)) return { status: "unsafe" };
  const owner = leseRoh(ACCT_KEYS.owner);
  if (!owner.ok || owner.value !== id) return { status: "unsafe" };
  if (!bestaetigungPasst(istBestaetigt, id)) return { status: "not-applicable" };

  const transitionStand = leseAccountCacheTransitionZustand();
  let wiederaufnahmeToken = null;
  if (eigenerTransitionToken) {
    const transition = transitionStand.value;
    if (transitionStand.status !== "valid" || transition.accountId !== id
        || transition.zweck !== "legacy-epoch-migration"
        || transition.token !== String(eigenerTransitionToken)) return { status: "unsafe" };
  } else if (transitionStand.status === "valid") {
    const transition = transitionStand.value;
    if (transition.accountId === id && transition.zweck === "legacy-epoch-migration") {
      wiederaufnahmeToken = transition.token;
    } else {
      return { status: "not-applicable" };
    }
  } else if (transitionStand.status !== "missing") {
    return { status: "unsafe" };
  }

  const epoch = leseEpochStand(id);
  const bindung = leseBindung(id);
  if (epoch.status === "error" || epoch.status === "invalid"
      || bindung.status === "error" || bindung.status === "invalid") {
    return { status: "unsafe" };
  }
  if (epoch.status === "valid" && bindung.status === "valid") {
    return { status: "current", epoch: epoch.token, transitionToken: wiederaufnahmeToken };
  }
  /* Ein vorhandenes Bindungsschema beweist, dass diese Installation bereits
     migriert war. Fehlt danach nur die Epoch, ist das Korruption und niemals
     erneut ein Legacy-Kandidat. */
  if (bindung.status === "valid" && epoch.status === "missing") {
    return { status: "unsafe" };
  }
  return {
    status: "legacy",
    epoch: epoch.status === "valid" ? epoch.token : null,
    transitionToken: wiederaufnahmeToken,
  };
}

/* Einmalige Upgrade-Grenze für bestätigte Kontocaches aus Builds vor der
   Aktivierungs-Epoch. Sie verändert ausschließlich Epoch/Bindungsschema und
   lässt den eigenen Transitionmarker bis zum normalen Confirm stehen. */
export async function migriereBestaetigtenLegacyKontocache(accountId, istBestaetigt, optionen = null) {
  const id = String(accountId || "");
  const vorher = legacyBindungsstand(id, istBestaetigt, null, optionen);
  if (vorher.status === "current" && !vorher.transitionToken) {
    return Object.freeze({ status: "already-current", epoch: vorher.epoch, transitionToken: null });
  }
  if (vorher.status === "not-applicable") return Object.freeze({ status: "not-applicable" });
  if (vorher.status !== "legacy" && vorher.status !== "current") {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }

  const transition = beginneGebundeneAccountTransition(id, "legacy-epoch-migration", {
    uebernehmeBestehend: !!vorher.transitionToken,
  });
  if (!transition) {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }
  try {
    await warteAccountTransitionZaun();
    const stabil = legacyBindungsstand(id, istBestaetigt, transition.token, optionen);
    if (stabil.status !== "legacy" && stabil.status !== "current") throw privacyError();
    const epoch = stabil.epoch || schreibeEpoch(id);
    if (!epoch || leseEpoch(id) !== epoch) throw privacyError();
    if (stabil.status !== "current" && (!schreibeBindung(id) || !bindungPasst(id))) {
      throw privacyError();
    }
    const nachher = legacyBindungsstand(id, istBestaetigt, transition.token, optionen);
    if (nachher.status !== "current" || nachher.epoch !== epoch) throw privacyError();
    accountEpoch = epoch;
    /* Der dynamische Store bleibt durch den Transition-Treiber gesperrt. Nur
       der direkt anschließende Confirm darf den Marker entfernen und aktivieren. */
    privacyGesperrt = false;
    return Object.freeze({ status: "migrated", epoch, transitionToken: transition.token });
  } catch (cause) {
    maskierePersoenlichenSpeicher();
    const error = privacyError();
    error.cause = cause;
    throw error;
  }
}

export function entsperrePersoenlichenSpeicherFuerGebundenesKonto(accountId) {
  const id = String(accountId || "");
  if (freigabeGesperrtFuerKonto != null) return false;
  if (!privacyGesperrt) return true;
  if (!id || getCacheOwner() !== id || leseAccountCacheTransition()
      || !leseEpoch(id) || !bindungPasst(id)) return false;
  privacyGesperrt = false;
  setStorageDriver(null);
  return true;
}
export function bereinigeVerwaisteAccountMetadaten() {
  return bereinigeVerwaisteTreiberMetadaten();
}

export function beginneGebundeneAccountTransition(accountId, zweck, {
  driverErlaubt = false, uebernehmeBestehend = false,
} = {}) {
  const vorhanden = leseAccountCacheTransition();
  const transition = vorhanden
    ? (uebernehmeBestehend && vorhanden.accountId === String(accountId || "") ? vorhanden : null)
    : beginneAccountCacheTransition(accountId, zweck);
  if (!transition) return null;
  lokalerTransitionToken = transition.token;
  transitionErlaubtDriver = !!driverErlaubt;
  /* Normale UI-Writes des dynamischen Stores werden während jeder Transition
     gesperrt; nur der explizit gebundene Adoption-Pull darf seinen Driver direkt nutzen. */
  setStorageDriver(privacyMaskDriver);
  return transition;
}

export function beginneKontoAdoptionCache(accountId) {
  const id = String(accountId || "");
  const session = authService.getSnapshot();
  if (!id || session?.mode !== "account" || session?.state !== "ready"
      || session.capabilities?.remoteStorage !== true
      || String(session.account?.id || "") !== id
      || freigabeGesperrtFuerKonto != null) {
    throw new Error("Der Kontocache kann nur für die aktuell angemeldete Konto-ID vorbereitet werden.");
  }
  const transition = beginneGebundeneAccountTransition(id, "konto-adoption", { driverErlaubt: true });
  if (!transition) {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }
  return transition;
}

/* Owner und Epoch werden erst NACH Marker, Tab-Zaun und gebundenem
   Gast-Rückholpunkt gesetzt. Damit kann weder ein Crash noch ein zweiter Tab
   Accountwerte als ownerlosen Gastbestand hinterlassen. */
export function bindeKontoAdoptionCache(accountId, transitionToken = lokalerTransitionToken) {
  const id = String(accountId || "");
  const transition = leseAccountCacheTransition();
  if (!remoteStoragePasst(id) || freigabeGesperrtFuerKonto != null
      || !id || !transition || transition.accountId !== id
      || transition.token !== String(transitionToken || "")
      || transition.token !== String(lokalerTransitionToken || "")) {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }
  if (!bindePersistentenAccountCache(id, { epoch: neueEpoch() })) {
    maskierePersoenlichenSpeicher();
    throw privacyError();
  }
  return Object.freeze({ ...transition, epoch: accountEpoch });
}

/* Alle synchron bereits gestarteten Schreib-Turns anderer Tabs dürfen nach dem
   rückgelesenen Marker noch auslaufen. Neue Turns sehen anschließend Marker/
   Epoch und fallen geschlossen aus, bevor gemeinsame Haupttöpfe mutieren. */
export function warteAccountTransitionZaun() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function beendeGebundeneAccountTransition(token) {
  const erwartet = String(token || "");
  const aktuell = leseAccountCacheTransition();
  const ok = !!aktuell
    && aktuell.token === erwartet
    && erwartet === String(lokalerTransitionToken || "")
    && beendeAccountCacheTransition(erwartet);
  if (!ok) return false;
  lokalerTransitionToken = null;
  transitionErlaubtDriver = false;
  return true;
}

export function verwerfeLokaleKontoBindung({ behalteTransition = false } = {}) {
  if (!verwerfeTreiberZustand({ behalteTransition })) return false;
  return setCacheOwner(null);
}

export function aktuelleAccountTransition() { return leseAccountCacheTransition(); }
export function istLokaleAccountTransition(token, accountId = null) {
  const aktuell = leseAccountCacheTransition();
  return !!aktuell
    && aktuell.token === String(token || "")
    && aktuell.token === String(lokalerTransitionToken || "")
    && (!accountId || aktuell.accountId === String(accountId));
}
export function hatOffeneKontoCacheAenderungen() {
  try {
    const status = JSON.parse(localStorage.getItem(ACCT_KEYS.status) || "null");
    if (!status || typeof status !== "object") return false;
    return [status.pending, status.conflict, status.zuGross, status.schemaVeraltet]
      .some((feld) => feld && typeof feld === "object" && Object.keys(feld).length > 0);
  } catch { return true; }
}

export function istKontoTreiberAktiv() { return kontoAktiv && storageDriverName() === "konto"; }
export function istKontoTreiberVorbereitet() { return !!accountDriver && !!vorbereitetesKonto; }
export function vorbereitetesKontoId() { return vorbereitetesKonto; }

/* Konto-Sync-Fläche für die Oberfläche — die UI kennt den Treiber nicht direkt. */
function accountSyncFreigegeben() {
  return !!accountDriver && remoteStoragePasst(vorbereitetesKonto)
    && freigabeGesperrtFuerKonto == null;
}

export const accountSync = Object.freeze({
  status: () => accountSyncFreigegeben()
    ? { ...accountDriver.status(), prepared: true, active: istKontoTreiberAktiv() }
    : leeresKontoStatus(),
  pull: () => accountSyncFreigegeben()
    ? accountDriver.pull() : Promise.resolve({ ok: false, reason: "access-blocked" }),
  flush: () => accountSyncFreigegeben() ? accountDriver.syncFlush() : Promise.resolve([]),
  inventur: () => accountSyncFreigegeben()
    ? accountDriver.inventur()
    : Promise.resolve({ ok: false, reason: "access-blocked", zeilen: {} }),
  verbindungstest: () => accountSyncFreigegeben()
    ? accountDriver.connectionTest() : Promise.resolve({ ok: false, reason: "access-blocked" }),
  uebernehmeKey: (key, value) => accountSyncFreigegeben()
    ? accountDriver.uebernehmeKey(key, value)
    : Promise.resolve({ ok: false, reason: "access-blocked" }),
  loescheRemote: (key) => accountSyncFreigegeben()
    ? accountDriver.loescheRemote(key)
    : Promise.resolve({ ok: false, reason: "access-blocked" }),
  resolveKeepLocal: (key) => accountSyncFreigegeben()
    ? accountDriver.resolveConflictPushLocal(key)
    : Promise.resolve({ ok: false, reason: "access-blocked" }),
  resolveKeepRemote: (key) => accountSyncFreigegeben()
    ? accountDriver.resolveConflictUseRemote(key)
    : Promise.resolve({ ok: false, reason: "access-blocked" }),
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
