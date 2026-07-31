/* Einziger Koordinator für den Übergang zwischen Auth-Sitzung und persönlicher
   Datenablage. Authentifiziert zu sein und den lokalen Cache bereits einem
   Konto zuordnen zu dürfen sind zwei verschiedene Dinge:

   - account-awaiting-adoption: Konto ist angemeldet, `store` bleibt lokal;
     nur Inventur und ausdrückliche Übernahme dürfen den Account-Treiber nutzen.
   - account-ready: Übernahme/Kontostand wurde bestätigt; `store` synchronisiert.

   Dadurch kann weder der Boot noch ein UI-Login den Übernahme-Assistenten durch
   einen vorzeitigen Pull oder Commit umgehen. */

import { authService } from "./auth.js";
import {
  accountSync,
  bereiteKontoTreiberVor,
  bestaetigeKontoTreiber,
  cacheOwner,
  deaktiviereKontoTreiber,
  istKontoTreiberAktiv,
  vorbereitetesKontoId,
} from "./storage.js";
import { gaststandNachKontoAbmeldung, istUebernommen } from "./uebernahme.js";

export const STORAGE_SESSION_STATES = Object.freeze({
  GUEST: "guest",
  AWAITING_ADOPTION: "account-awaiting-adoption",
  READY: "account-ready",
});

export function createSessionCoordinator({
  auth = authService,
  storage = {
    prepare: bereiteKontoTreiberVor,
    confirm: bestaetigeKontoTreiber,
    deactivate: deaktiviereKontoTreiber,
    active: istKontoTreiberAktiv,
    preparedAccountId: vorbereitetesKontoId,
    cacheOwner,
    pull: accountSync.pull,
    flush: accountSync.flush,
    status: accountSync.status,
  },
  adoption = { isConfirmed: istUebernommen, restoreGuest: gaststandNachKontoAbmeldung },
} = {}) {
  function accountId(session = auth.getSnapshot()) {
    return session?.mode === "account" ? String(session.account?.id || "") : "";
  }

  function isConfirmed(id) {
    return !!id
      && String(storage.cacheOwner() || "") === id
      && adoption.isConfirmed(id);
  }

  async function align(session, { pullWhenReady = false } = {}) {
    const id = accountId(session);
    if (!id) {
      storage.deactivate();
      return STORAGE_SESSION_STATES.GUEST;
    }

    storage.prepare(id);
    if (!isConfirmed(id)) return STORAGE_SESSION_STATES.AWAITING_ADOPTION;

    storage.confirm(id);
    if (pullWhenReady) {
      try { await storage.pull(); } catch { /* lokaler Start bleibt möglich */ }
    }
    return STORAGE_SESSION_STATES.READY;
  }

  function storageState() {
    const id = accountId();
    if (!id) return STORAGE_SESSION_STATES.GUEST;
    if (storage.active() && storage.preparedAccountId() === id && isConfirmed(id)) {
      return STORAGE_SESSION_STATES.READY;
    }
    return STORAGE_SESSION_STATES.AWAITING_ADOPTION;
  }

  return Object.freeze({
    getSnapshot: () => auth.getSnapshot(),
    subscribe: (listener) => auth.subscribe(listener),
    getStorageState: storageState,

    async initialize() {
      const session = await auth.initialize();
      await align(session, { pullWhenReady: true });
      return session;
    },

    async signIn(benutzername, passwort) {
      const session = await auth.signIn(benutzername, passwort);
      await align(session, { pullWhenReady: true });
      return session;
    },

    async signOut() {
      const id = accountId();
      const cacheId = String(storage.cacheOwner?.() || "");

      /* Ein bewusster Logout darf keine noch ungesicherten Kontoänderungen
         vernichten. Solange der Treiber aktiv ist, erst die Queue leeren und
         bei Konflikten/Fehlern angemeldet bleiben. */
      if (id && storage.active?.()) {
        await storage.flush?.();
        const status = storage.status?.() || {};
        const offen = [status.pending, status.conflict, status.zuGross]
          .some((liste) => Array.isArray(liste) && liste.length > 0);
        if (offen) {
          throw new Error("Vor dem Abmelden konnten nicht alle Kontoänderungen gesichert werden. Bitte löse offene Konflikte oder erstelle zuerst ein Backup.");
        }
      }

      let ergebnis;
      let authFehler = null;
      try { ergebnis = await auth.signOut(); }
      catch (error) { authFehler = error; }
      finally {
        storage.deactivate();
        if (cacheId) adoption.restoreGuest?.(cacheId);
      }
      if (authFehler) throw authFehler;
      return ergebnis;
    },

    async refresh() {
      const session = await auth.refresh();
      await align(session);
      return session;
    },

    changePassword: (neuesPasswort) => auth.changePassword(neuesPasswort),
  });
}

export const sessionCoordinator = createSessionCoordinator();
