import { BoundaryError, ERROR_CODES } from "./errors.js";

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_MODES = Object.freeze({ GUEST: "guest", ACCOUNT: "account" });

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

export function accountSession({ id, displayName = null, email = null, expiresAt = null, capabilities = {} } = {}) {
  if (!text(id)) throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
    source: "auth", operation: "session.normalize", reason: "missing-account-id",
  });
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    mode: SESSION_MODES.ACCOUNT,
    state: "ready",
    account: Object.freeze({ id: text(id), displayName: text(displayName) || null, email: text(email) || null }),
    expiresAt: expiresAt || null,
    capabilities: Object.freeze({ remoteStorage: !!capabilities.remoteStorage, personalAi: !!capabilities.personalAi }),
    error: null,
  });
}

function text(wert) { return String(wert == null ? "" : wert).trim(); }

export function createAuthService({ loadSession } = {}) {
  let snapshot = guestSession();
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener(snapshot));
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async initialize() {
      if (!loadSession) return snapshot;
      const loaded = await loadSession();
      snapshot = loaded?.mode === SESSION_MODES.ACCOUNT
        ? accountSession({
          ...(loaded.account || loaded),
          expiresAt: loaded.expiresAt,
          capabilities: loaded.capabilities,
        })
        : guestSession();
      emit();
      return snapshot;
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

export const authService = createAuthService();
