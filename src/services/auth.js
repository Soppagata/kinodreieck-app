import { BoundaryError, ERROR_CODES, normalizeBoundaryError } from "./errors.js";
import { createAuthDriver } from "../lib/authDriver.js";
import { ACCOUNT_ACCESS_STATUS, ACCOUNT_ROLES } from "../lib/accountAccess.js";
import { runtimeConfig } from "../config/runtime.js";

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_MODES = Object.freeze({ GUEST: "guest", ACCOUNT: "account" });

/* Sitzungszustände. "degraded" heißt: die technische Anmeldung gilt weiter,
   aber Auth- oder Freigabequelle ist gerade nicht verlässlich erreichbar.
   Rollen-v1 projiziert dann beide fachlichen Capabilities fail-closed. */
export const SESSION_STATES = Object.freeze({ READY: "ready", DEGRADED: "degraded" });

export function guestSession() {
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    mode: SESSION_MODES.GUEST,
    state: "ready",
    account: null,
    expiresAt: null,
    capabilities: Object.freeze({ remoteStorage: false, personalAi: false }),
    access: null,
    error: null,
  });
}

/* Gastzustand NACH einer abgelaufenen Anmeldung. Bewusst weiterhin ein
   vollwertiger, betriebsbereiter Gast (lokale Daten bleiben nutzbar) — der
   Fehler ist nur der Anlass für einen ehrlichen Hinweis in der Oberfläche.
   "Ein Gast ist kein Fehlerzustand" (Etappe 1) bleibt damit gewahrt. */
export function abgelaufeneSession() {
  const basis = guestSession();
  return Object.freeze({
    ...basis,
    error: new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
      source: "auth", operation: "session.expired", reason: "session-expired",
      message: "Deine Anmeldung ist abgelaufen. Kontodaten werden vor dem Gastbetrieb geschützt; bei ungesicherten Änderungen ist eine erneute Anmeldung nötig.",
    }),
  });
}

export function accountSession({
  id, displayName = null, email = null, expiresAt = null, role = null,
  capabilities = {}, access = null, state = SESSION_STATES.READY,
} = {}) {
  if (!text(id)) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
      source: "auth", operation: "session.normalize", reason: "missing-account-id",
    });
  }
  const fachrolle = ACCOUNT_ROLES.includes(text(role)) ? text(role) : null;
  const remoteStorage = capabilities.remoteStorage === true;
  const personalAi = remoteStorage && capabilities.personalAi === true;
  const accessStatus = Object.values(ACCOUNT_ACCESS_STATUS).includes(access?.status)
    ? access.status
    : ACCOUNT_ACCESS_STATUS.INVALID;
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    mode: SESSION_MODES.ACCOUNT,
    state: state === SESSION_STATES.DEGRADED ? SESSION_STATES.DEGRADED : SESSION_STATES.READY,
    account: Object.freeze({
      id: text(id), displayName: text(displayName) || null,
      email: text(email) || null, role: fachrolle,
    }),
    expiresAt: expiresAt || null,
    capabilities: Object.freeze({ remoteStorage, personalAi }),
    access: Object.freeze({ status: accessStatus, role: fachrolle }),
    error: null,
  });
}

function text(wert) { return String(wert == null ? "" : wert).trim(); }

function ausGeladenem(loaded) {
  if (loaded?.mode === "stale") return null;
  if (loaded?.mode !== SESSION_MODES.ACCOUNT) {
    return loaded?.abgelaufen ? abgelaufeneSession() : guestSession();
  }
  return accountSession({
    ...(loaded.account || loaded),
    role: loaded.role ?? loaded.access?.role,
    expiresAt: loaded.expiresAt,
    capabilities: loaded.capabilities,
    access: loaded.access,
    state: loaded.degradiert ? SESSION_STATES.DEGRADED : SESSION_STATES.READY,
  });
}

/* `driver` ist die Naht zum echten Anmeldeverfahren (src/lib/authDriver.js).
   Ohne Treiber verhält sich der Service exakt wie bisher: reiner Gastmodus,
   `loadSession` als Test-/Mock-Einstieg. Tokens erreichen den Snapshot nie. */
export function createAuthService({ loadSession, driver = null } = {}) {
  let snapshot = guestSession();
  let asyncGeneration = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener(snapshot));
  const laden = loadSession || (driver ? driver.loadSession : null);

  function setze(neu) { snapshot = neu; emit(); return snapshot; }

  function fordereTreiber(operation) {
    if (!driver) {
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "auth", operation, reason: "auth-driver-missing",
        message: "Die Anmeldung ist in dieser Umgebung nicht eingerichtet.",
      });
    }
    return driver;
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async initialize() {
      if (!laden) return snapshot;
      const generation = ++asyncGeneration;
      const loaded = await laden();
      if (generation !== asyncGeneration) return snapshot;
      const neu = ausGeladenem(loaded);
      if (!neu) return snapshot;
      snapshot = neu;
      emit();
      return snapshot;
    },
    /* Anmelden mit Benutzername + Passwort. */
    async signIn(benutzername, passwort) {
      const d = fordereTreiber("session.sign-in");
      const generation = ++asyncGeneration;
      try {
        const konto = await d.signIn(benutzername, passwort);
        let neu = null;
        try {
          const loaded = await d.loadSession?.();
          /* Nach erfolgreichem technischem Sign-in ist nur eine ausdrücklich
             passende Account-Projektion verwertbar. `null`, Guest, stale oder
             eine unerwartete Form darf weder Guest vortäuschen noch Rechte
             erteilen; dafür greift unten der angemeldete fail-closed Zustand. */
          if (loaded?.mode === SESSION_MODES.ACCOUNT
              && String(loaded.account?.id || loaded.id || "") === String(konto.id || "")) {
            neu = ausGeladenem(loaded);
          }
        } catch { /* technische Anmeldung bleibt mit gesperrten Capabilities gültig */ }
        if (!neu) {
          neu = accountSession({
            id: konto.id,
            displayName: konto.benutzername,
            email: konto.email,
            expiresAt: konto.gueltigBis ? new Date(konto.gueltigBis).toISOString() : null,
            capabilities: { remoteStorage: false, personalAi: false },
            access: { status: ACCOUNT_ACCESS_STATUS.UNAVAILABLE },
            state: SESSION_STATES.DEGRADED,
          });
        }
        if (generation !== asyncGeneration) return snapshot;
        return setze(neu);
      } catch (error) {
        throw normalizeBoundaryError(error, { source: "auth", operation: "session.sign-in" });
      }
    },
    /* Abmelden. Löst selbst NIE lokale Daten — das ist eine harte Zusage der
       Etappe. Der optionale `beforeGuest`-Schritt gehört dem Session-Koordinator.
       Der echte Treiber führt ihn nach dem Serverversuch, aber unmittelbar vor
       der lokalen Credential-Löschung aus. Ältere/Test-Treiber, die den Hook
       ignorieren, bekommen denselben Schritt hier als Fallback. */
    async signOut({ beforeGuest = null } = {}) {
      ++asyncGeneration;
      let grenzeGelaufen = false;
      let grenzFehler = null;
      const privacyGrenze = async () => {
        grenzeGelaufen = true;
        try { if (typeof beforeGuest === "function") await beforeGuest(); }
        catch (error) { grenzFehler = error; throw error; }
      };
      if (driver) {
        try { await driver.signOut({ beforeLocalCommit: privacyGrenze }); }
        catch (error) {
          if (grenzFehler) throw grenzFehler;
          /* Nach gelaufener Privacy-Grenze ist jeder Treiberfehler ein lokaler
             Credential-Commitfehler. Ihn als Guest zu verschlucken würde beim
             Reload die noch persistierte Kontositzung wiederbeleben. */
          if (grenzeGelaufen) throw error;
          /* Ein reiner Server-/Treiberfehler hält den lokalen Logout nicht auf. */
        }
      }
      if (!grenzeGelaufen) await privacyGrenze();
      return setze(guestSession());
    },
    async changePassword(neuesPasswort) {
      const d = fordereTreiber("session.change-password");
      try { return await d.changePassword(neuesPasswort); }
      catch (error) { throw normalizeBoundaryError(error, { source: "auth", operation: "session.change-password" }); }
    },
    async reauthenticate(passwort) {
      const d = fordereTreiber("session.reauthenticate");
      try { return await d.reauthenticate(passwort); }
      catch (error) { throw normalizeBoundaryError(error, { source: "auth", operation: "session.reauthenticate" }); }
    },
    /* Sitzung prüfen/erneuern — beim Start und beim Sichtbarwerden der App. */
    async refresh() {
      if (!laden) return snapshot;
      const generation = ++asyncGeneration;
      try {
        if (driver) await driver.refresh();
        const loaded = await laden();
        const neu = ausGeladenem(loaded);
        if (generation !== asyncGeneration || !neu) return snapshot;
        const geaendert = neu.mode !== snapshot.mode
          || neu.state !== snapshot.state
          || neu.account?.id !== snapshot.account?.id
          || neu.account?.role !== snapshot.account?.role
          || neu.capabilities.remoteStorage !== snapshot.capabilities.remoteStorage
          || neu.capabilities.personalAi !== snapshot.capabilities.personalAi
          || neu.access?.status !== snapshot.access?.status
          || !!neu.error !== !!snapshot.error;
        if (geaendert) setze(neu); else snapshot = neu;
        return snapshot;
      } catch {
        if (generation !== asyncGeneration) return snapshot;
        if (snapshot.mode === SESSION_MODES.ACCOUNT && snapshot.account?.id) {
          return setze(accountSession({
            id: snapshot.account.id,
            displayName: snapshot.account.displayName,
            email: snapshot.account.email,
            expiresAt: snapshot.expiresAt,
            role: null,
            capabilities: { remoteStorage: false, personalAi: false },
            access: { status: ACCOUNT_ACCESS_STATUS.UNAVAILABLE },
            state: SESSION_STATES.DEGRADED,
          }));
        }
        return snapshot;
      }
    },
    requireAccount(capability = null) {
      if (snapshot.mode !== SESSION_MODES.ACCOUNT || snapshot.state !== "ready") {
        throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, { source: "auth", operation: "session.require-account" });
      }
      if (capability && !snapshot.capabilities[capability]) {
        throw new BoundaryError(ERROR_CODES.FORBIDDEN, { source: "auth", operation: "session.require-capability", reason: capability });
      }
      return snapshot;
    },
  });
}

/* Der App-Singleton mit echtem Anmeldeverfahren. Der Treiber liest ausschließlich
   die öffentliche Runtime-Konfiguration (Projekt-URL + Publishable-Key) — beides
   darf im Bundle stehen. Tokens entstehen erst zur Laufzeit im Browser. */
export const authDriver = createAuthDriver({
  config: runtimeConfig,
  locks: (typeof navigator !== "undefined" && navigator.locks) ? navigator.locks : null,
});
export const authService = createAuthService({ driver: authDriver });
