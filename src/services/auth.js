import { BoundaryError, ERROR_CODES, normalizeBoundaryError } from "./errors.js";
import { createAuthDriver } from "../lib/authDriver.js";
import { runtimeConfig } from "../config/runtime.js";

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_MODES = Object.freeze({ GUEST: "guest", ACCOUNT: "account" });

/* Sitzungszustände. "degraded" heißt: die Anmeldung gilt weiter, der Server ist
   nur gerade nicht erreichbar (offline, pausiertes Projekt, 5xx). Die App bleibt
   damit voll benutzbar, Änderungen laufen in die Nachtrags-Warteschlange. */
export const SESSION_STATES = Object.freeze({ READY: "ready", DEGRADED: "degraded" });

export function guestSession() {
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    mode: SESSION_MODES.GUEST,
    state: "ready",
    account: null,
    expiresAt: null,
    capabilities: Object.freeze({ remoteStorage: false, personalAi: false }),
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
      message: "Deine Anmeldung ist abgelaufen. Du arbeitest als Gast weiter — deine Daten auf diesem Gerät bleiben erhalten.",
    }),
  });
}

export function accountSession({
  id, displayName = null, email = null, expiresAt = null, capabilities = {}, state = SESSION_STATES.READY,
} = {}) {
  if (!text(id)) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
      source: "auth", operation: "session.normalize", reason: "missing-account-id",
    });
  }
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    mode: SESSION_MODES.ACCOUNT,
    state: state === SESSION_STATES.DEGRADED ? SESSION_STATES.DEGRADED : SESSION_STATES.READY,
    account: Object.freeze({ id: text(id), displayName: text(displayName) || null, email: text(email) || null }),
    expiresAt: expiresAt || null,
    capabilities: Object.freeze({ remoteStorage: !!capabilities.remoteStorage, personalAi: !!capabilities.personalAi }),
    error: null,
  });
}

function text(wert) { return String(wert == null ? "" : wert).trim(); }

function ausGeladenem(loaded) {
  if (loaded?.mode !== SESSION_MODES.ACCOUNT) {
    return loaded?.abgelaufen ? abgelaufeneSession() : guestSession();
  }
  return accountSession({
    ...(loaded.account || loaded),
    expiresAt: loaded.expiresAt,
    capabilities: loaded.capabilities,
    state: loaded.degradiert ? SESSION_STATES.DEGRADED : SESSION_STATES.READY,
  });
}

/* `driver` ist die Naht zum echten Anmeldeverfahren (src/lib/authDriver.js).
   Ohne Treiber verhält sich der Service exakt wie bisher: reiner Gastmodus,
   `loadSession` als Test-/Mock-Einstieg. Tokens erreichen den Snapshot nie. */
export function createAuthService({ loadSession, driver = null } = {}) {
  let snapshot = guestSession();
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
      const loaded = await laden();
      snapshot = ausGeladenem(loaded);
      emit();
      return snapshot;
    },
    /* Anmelden mit Benutzername + Passwort. */
    async signIn(benutzername, passwort) {
      const d = fordereTreiber("session.sign-in");
      try {
        const konto = await d.signIn(benutzername, passwort);
        return setze(accountSession({
          id: konto.id,
          displayName: konto.benutzername,
          expiresAt: new Date(konto.gueltigBis).toISOString(),
          capabilities: { remoteStorage: true, personalAi: false },
        }));
      } catch (error) {
        throw normalizeBoundaryError(error, { source: "auth", operation: "session.sign-in" });
      }
    },
    /* Abmelden. Löst NIE lokale Daten — das ist eine harte Zusage der Etappe. */
    async signOut() {
      if (driver) { try { await driver.signOut(); } catch { /* lokaler Logout gilt immer */ } }
      return setze(guestSession());
    },
    async changePassword(neuesPasswort) {
      const d = fordereTreiber("session.change-password");
      try { return await d.changePassword(neuesPasswort); }
      catch (error) { throw normalizeBoundaryError(error, { source: "auth", operation: "session.change-password" }); }
    },
    /* Sitzung prüfen/erneuern — beim Start und beim Sichtbarwerden der App. */
    async refresh() {
      if (!laden) return snapshot;
      try {
        if (driver) await driver.refresh();
        const loaded = await laden();
        const neu = ausGeladenem(loaded);
        const geaendert = neu.mode !== snapshot.mode
          || neu.state !== snapshot.state
          || neu.account?.id !== snapshot.account?.id
          || !!neu.error !== !!snapshot.error;
        if (geaendert) setze(neu); else snapshot = neu;
        return snapshot;
      } catch { return snapshot; }
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
