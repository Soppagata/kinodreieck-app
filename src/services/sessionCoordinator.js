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
  aktuelleAccountTransition,
  bereinigeVerwaisteAccountMetadaten,
  bereiteKontoTreiberVor,
  beginneGebundeneAccountTransition,
  bestaetigeKontoTreiber,
  cacheOwner,
  deaktiviereKontoTreiber,
  beendeGebundeneAccountTransition,
  entsperrePersoenlichenSpeicherNachTrennung,
  entsperrePersoenlichenSpeicherFuerGebundenesKonto,
  hatOffeneKontoCacheAenderungen,
  istPersoenlicherSpeicherMaskiert,
  istKontoTreiberAktiv,
  istKontoTreiberWegenFreigabeGesperrt,
  maskierePersoenlichenSpeicher,
  migriereBestaetigtenLegacyKontocache,
  vorbereitetesKontoId,
  sperreKontoTreiberWegenFreigabe,
  entsperreKontoTreiberNachFreigabe,
  warteAccountTransitionZaun,
} from "./storage.js";
import {
  gaststandNachKontoAbmeldung, istUebernommen, kontoSicherAutomatischLaden,
  quarantaeneKontodatenNachAbmeldung,
} from "./uebernahme.js";
import { ACCT_KEYS } from "../lib/accountStorageKeys.js";
import { AUTH_SESSION_KEY } from "../lib/authDriver.js";

export const STORAGE_SESSION_STATES = Object.freeze({
  GUEST: "guest",
  AWAITING_ADOPTION: "account-awaiting-adoption",
  READY: "account-ready",
  PRIVACY_LOCKED: "privacy-locked",
  ACCESS_BLOCKED: "account-access-blocked",
});

const PRIVACY_RECOVERY_TEXTE = Object.freeze({
  PERSONAL_DATA_PRIVACY_LOCKED: "Persönliche Daten bleiben geschützt. Melde dich mit demselben Konto erneut an oder lade die App neu.",
  ACCOUNT_LOAD_FAILED: "Der Kontostand konnte nicht sicher geladen werden. Bitte versuche es erneut.",
  ACCOUNT_CONTEXT_CHANGED: "Der Kontokontext hat sich geändert. Persönliche Daten bleiben geschützt. Bitte versuche es erneut.",
  AUTH_CREDENTIAL_PERSISTENCE_FAILED: "Die Anmeldung konnte auf diesem Gerät nicht sicher abgeschlossen werden. Persönliche Daten bleiben geschützt.",
});

/* UI-Grenze für Privacy-/Recovery-Fehler. Interne Ursachen, Storage-Schlüssel,
   Providertexte und Causes werden nicht weitergereicht; der maschinenlesbare
   Code bleibt für kontrollierte Zustandsentscheidungen erhalten. */
export function sicherePrivacyRecoveryFehler(error, { privacyLocked = false } = {}) {
  const originalCode = typeof error?.code === "string" && error.code.trim()
    ? error.code.trim()
    : "";
  if (!privacyLocked && !Object.prototype.hasOwnProperty.call(PRIVACY_RECOVERY_TEXTE, originalCode)) {
    return error;
  }
  const code = originalCode || "PERSONAL_DATA_PRIVACY_LOCKED";
  const begrenzt = new Error(
    PRIVACY_RECOVERY_TEXTE[code]
      || PRIVACY_RECOVERY_TEXTE.PERSONAL_DATA_PRIVACY_LOCKED,
  );
  begrenzt.name = "PrivacyRecoveryError";
  begrenzt.code = code;
  begrenzt.retryable = error?.retryable !== false;
  return begrenzt;
}

export function createSessionCoordinator({
  auth = authService,
  storage = {
    prepare: bereiteKontoTreiberVor,
    confirm: bestaetigeKontoTreiber,
    deactivate: deaktiviereKontoTreiber,
    unlockAfterPrivacyCleanup: entsperrePersoenlichenSpeicherNachTrennung,
    unlockForSameOwnerAccount: entsperrePersoenlichenSpeicherFuerGebundenesKonto,
    mask: maskierePersoenlichenSpeicher,
    blockAccess: sperreKontoTreiberWegenFreigabe,
    unblockAccess: entsperreKontoTreiberNachFreigabe,
    accessBlocked: istKontoTreiberWegenFreigabeGesperrt,
    masked: istPersoenlicherSpeicherMaskiert,
    migrateLegacyBinding: migriereBestaetigtenLegacyKontocache,
    cleanupOrphanMetadata: bereinigeVerwaisteAccountMetadaten,
    beginTransition: beginneGebundeneAccountTransition,
    endTransition: beendeGebundeneAccountTransition,
    transitionFence: warteAccountTransitionZaun,
    active: istKontoTreiberAktiv,
    preparedAccountId: vorbereitetesKontoId,
    cacheOwner,
    currentTransition: aktuelleAccountTransition,
    hasOpenChanges: hatOffeneKontoCacheAenderungen,
    pull: accountSync.pull,
    flush: accountSync.flush,
    status: accountSync.status,
  },
  adoption = {
    isConfirmed: istUebernommen,
    loadAccount: kontoSicherAutomatischLaden,
    restoreGuest: gaststandNachKontoAbmeldung,
    quarantine: quarantaeneKontodatenNachAbmeldung,
  },
  eventTarget = (typeof window !== "undefined" ? window : null),
} = {}) {
  let sichtbareSession = auth.getSnapshot();
  let grenzQueue = Promise.resolve();
  let nurDieserOwnerDarfEntsperren = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => {
    try { listener(sichtbareSession); } catch { /* ein UI-Listener blockiert die Grenze nie */ }
  });
  const publish = (session) => {
    sichtbareSession = session;
    emit();
    return sichtbareSession;
  };
  const serialisiere = (auftrag) => {
    const lauf = grenzQueue.catch(() => {}).then(auftrag);
    grenzQueue = lauf.catch(() => {});
    return lauf;
  };
  const begrenzePrivacyFehler = (error) => sicherePrivacyRecoveryFehler(error, {
    privacyLocked: (() => {
      try { return storage.masked?.() === true; } catch { return true; }
    })(),
  });
  const serialisiereSicher = (auftrag) => serialisiere(async () => {
    try { return await auftrag(); }
    catch (error) { throw begrenzePrivacyFehler(error); }
  });

  function accountId(session = sichtbareSession) {
    return session?.mode === "account" ? String(session.account?.id || "") : "";
  }

  function isConfirmed(id) {
    return !!id
      && String(storage.cacheOwner() || "") === id
      && adoption.isConfirmed(id);
  }

  function remoteStorageFreigegeben(session) {
    return session?.mode === "account"
      && session?.state === "ready"
      && session.capabilities?.remoteStorage === true;
  }

  async function trenneKontocache(cacheId, { behalteTransition = false } = {}) {
    let gaststand = { ok: true, quelle: "ungebundener-gaststand" };
    let transition = null;
    if (cacheId) {
      if (storage.beginTransition) {
        transition = storage.beginTransition(cacheId, "konto-zu-gast", {
          driverErlaubt: false,
          uebernehmeBestehend: true,
        });
        if (!transition) {
          storage.mask?.();
          emit();
          const error = new Error("Die geräteweite Kontotrennung konnte nicht sicher begonnen werden. Persönliche Daten bleiben gesperrt.");
          error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
          throw error;
        }
        await storage.transitionFence?.();
      }
      try {
        gaststand = await adoption.restoreGuest?.(cacheId, { behalteTransition: !!transition })
          || { ok: true, quelle: "gast-rueckholpunkt" };
        if (gaststand.ok === false) throw new Error("Gaststand nicht wiederhergestellt.");
      } catch (restoreError) {
        try {
          gaststand = await adoption.quarantine?.(
            cacheId, restoreError, { behalteTransition: !!transition },
          );
        }
        catch { gaststand = null; }
        if (!gaststand?.ok) {
          storage.mask?.();
          emit();
          const error = new Error("Der lokale Kontocache konnte nicht sicher vom Gastbetrieb getrennt werden. Persönliche Daten bleiben gesperrt.");
          error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
          error.cause = restoreError;
          throw error;
        }
      }
    } else if (storage.cleanupOrphanMetadata?.() === false) {
      storage.mask?.();
      emit();
      const error = new Error("Verwaiste Konto-Snapshots konnten nicht sicher entfernt werden. Persönliche Daten bleiben gesperrt.");
      error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
      throw error;
    }
    if (transition && behalteTransition) return { gaststand, transition };
    if (transition && storage.endTransition?.(transition.token) === false) {
      storage.mask?.();
      emit();
      const error = new Error("Die geräteweite Kontotrennung konnte nicht sicher abgeschlossen werden. Persönliche Daten bleiben gesperrt.");
      error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
      throw error;
    }
    if (storage.unlockAfterPrivacyCleanup) storage.unlockAfterPrivacyCleanup();
    else storage.deactivate();
    return { gaststand, transition: null };
  }

  async function beendeLokaleKontositzung(cacheId) {
    let trennung = { gaststand: { ok: true, quelle: "ungebundener-gaststand" }, transition: null };
    let session;
    try {
      session = await auth.signOut({
        beforeGuest: async () => {
          trennung = await trenneKontocache(cacheId, { behalteTransition: true });
        },
      });
    } catch (error) {
      if (trennung?.transition) { storage.mask?.(); emit(); }
      throw error;
    }
    if (trennung?.transition) {
      if (storage.endTransition?.(trennung.transition.token) === false) {
        storage.mask?.(); emit();
        const error = new Error("Die Kontotrennung konnte nach dem Logout nicht dauerhaft abgeschlossen werden.");
        error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
        throw error;
      }
      if (storage.unlockAfterPrivacyCleanup) storage.unlockAfterPrivacyCleanup();
      else storage.deactivate();
    }
    return publish(Object.freeze({ ...session, gaststand: trennung.gaststand }));
  }

  async function align(session, { pullWhenReady = false, verifiedTransitionEnd = false } = {}) {
    const id = accountId(session);
    if (!id) {
      /* Migration fuer Installationen, die sich vor der Logout-Trennung
         abgemeldet haben: Der alte Ablauf liess Besitzer-Marke und
         heruntergeladenen Kontocache im Browser liegen. Ohne aktive Sitzung
         darf so ein eindeutig kontogebundener Cache nie als Gast erscheinen. */
      const verwaisterCache = String(storage.cacheOwner?.() || "");
      if (verwaisterCache && storage.hasOpenChanges?.()) {
        nurDieserOwnerDarfEntsperren = verwaisterCache;
        storage.mask?.(); emit();
        const error = new Error("Ungesicherte Kontoänderungen bleiben geschützt. Bitte melde dich erneut an oder sichere den Kontostand, bevor du als Gast fortfährst.");
        error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
        throw error;
      }
      await trenneKontocache(verwaisterCache);
      return STORAGE_SESSION_STATES.GUEST;
    }

    /* Technische Authentifizierung darf bestehen bleiben, erteilt aber noch
       keinen Zugriff auf den Kontocache. Widerruf/Timeout stoppt die aktuelle
       Treibergeneration sofort und maskiert ohne Restore, Flush oder Löschen. */
    if (!remoteStorageFreigegeben(session)) {
      if (storage.blockAccess) storage.blockAccess(id);
      else storage.mask?.();
      emit();
      return STORAGE_SESSION_STATES.ACCESS_BLOCKED;
    }
    if (storage.accessBlocked?.(id)) {
      if (storage.unblockAccess?.(id) !== true) {
        storage.mask?.(); emit();
        const error = new Error("Der geschützte Kontocache konnte nach der Freigabe nicht sicher reaktiviert werden.");
        error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
        throw error;
      }
    }

    /* Auth und Cache können sich in verschiedenen Tabs unabhängig bewegen.
       Konto B darf niemals auf den noch sichtbaren Haupttöpfen von A
       vorbereitet werden. Eine abgebrochene same-account Transition wird über
       denselben Restore-/Quarantänepfad sicher fertiggestellt. */
    const ownerVorMigration = String(storage.cacheOwner?.() || "");
    let legacyMigration = null;
    if (ownerVorMigration === id && isConfirmed(id) && storage.migrateLegacyBinding) {
      legacyMigration = await storage.migrateLegacyBinding(
        id, () => isConfirmed(id), { remoteStorage: true },
      );
    }
    const transition = storage.currentTransition?.() || null;
    const owner = String(storage.cacheOwner?.() || "");
    const migrationAktiv = legacyMigration?.status === "migrated"
      && transition?.token === legacyMigration.transitionToken
      && transition?.accountId === id;
    if (verifiedTransitionEnd && storage.masked?.() && !owner && !transition) {
      if (storage.cleanupOrphanMetadata?.() === false) {
        const error = new Error("Die abgeschlossene Konto-Transition hinterließ unklare lokale Metadaten.");
        error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
        throw error;
      }
      storage.unlockAfterPrivacyCleanup?.();
    }
    if (nurDieserOwnerDarfEntsperren && id !== nurDieserOwnerDarfEntsperren) {
      storage.mask?.(); emit();
      const error = new Error("Nur das Konto mit den geschützten lokalen Änderungen kann diesen Cache entsperren.");
      error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
      throw error;
    }
    if (migrationAktiv) {
      nurDieserOwnerDarfEntsperren = null;
    } else if (storage.masked?.() && owner === id && !transition) {
      if (storage.unlockForSameOwnerAccount?.(id) === false) {
        const error = new Error("Der geschützte Kontocache gehört nicht sicher zu dieser Anmeldung.");
        error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
        throw error;
      }
      nurDieserOwnerDarfEntsperren = null;
    }
    if (!migrationAktiv && transition && !owner) {
      if (storage.cleanupOrphanMetadata?.() === false) {
        storage.mask?.(); emit();
        const error = new Error("Eine abgebrochene Konto-Transition konnte nicht sicher zurückgesetzt werden.");
        error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
        throw error;
      }
      storage.unlockAfterPrivacyCleanup?.();
    } else if (!migrationAktiv && owner && (owner !== id || transition)) {
      if (storage.hasOpenChanges?.()) {
        nurDieserOwnerDarfEntsperren = owner;
        storage.mask?.(); emit();
        const error = new Error("Ungesicherte Änderungen des bisherigen Kontos bleiben geschützt. Bitte melde dich dort erneut an und sichere sie zuerst.");
        error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
        throw error;
      }
      await trenneKontocache(owner);
    }

    if (storage.prepare.length >= 2) storage.prepare(id, { remoteStorage: true });
    else storage.prepare(id);
    if (!isConfirmed(id)) {
      if (typeof adoption.loadAccount !== "function") {
        return STORAGE_SESSION_STATES.AWAITING_ADOPTION;
      }
      try {
        await adoption.loadAccount(id);
      } catch (error) {
        /* Auth ist bereits erfolgreich. Die Konto-Sitzung bleibt sichtbar,
           aber der App-Baum bleibt bis zu einem erneuten sicheren Ladeversuch
           ausgehängt; der Gaststand wird dadurch nie als Kontostand gezeigt. */
        if (accountId(auth.getSnapshot?.()) === id) publish(session);
        throw error;
      }
      const aktuelleAuthSession = auth.getSnapshot?.();
      if (accountId(aktuelleAuthSession) !== id || !remoteStorageFreigegeben(aktuelleAuthSession)) {
        storage.mask?.(); emit();
        const error = new Error("Der Kontokontext hat sich während des Ladens geändert.");
        error.code = "ACCOUNT_CONTEXT_CHANGED";
        throw error;
      }
      if (!isConfirmed(id) || !storage.active?.() || storage.preparedAccountId?.() !== id) {
        const error = new Error("Der Kontostand konnte nicht sicher aktiviert werden.");
        error.code = "ACCOUNT_LOAD_FAILED";
        publish(session);
        throw error;
      }
      return STORAGE_SESSION_STATES.READY;
    }

    if (storage.confirm.length >= 2) await storage.confirm(id, { remoteStorage: true });
    else await storage.confirm(id);
    if (pullWhenReady) {
      try { await storage.pull(); } catch { /* lokaler Start bleibt möglich */ }
    }
    return STORAGE_SESSION_STATES.READY;
  }

  function storageState() {
    const id = accountId();
    if (id && !remoteStorageFreigegeben(sichtbareSession)) return STORAGE_SESSION_STATES.ACCESS_BLOCKED;
    if (storage.masked?.()) return STORAGE_SESSION_STATES.PRIVACY_LOCKED;
    if (!id) return STORAGE_SESSION_STATES.GUEST;
    if (storage.active() && storage.preparedAccountId() === id && isConfirmed(id)) {
      return STORAGE_SESSION_STATES.READY;
    }
    return STORAGE_SESSION_STATES.AWAITING_ADOPTION;
  }

  async function externalStorageEvent(event) {
    if (event?.key !== ACCT_KEYS.transition && event?.key !== AUTH_SESSION_KEY) return;
    if (event.key === ACCT_KEYS.transition && event.newValue != null) {
      /* Anderer Tab hat die rückgelesene Trennungs-/Adoptionsgrenze gesetzt.
         Sofort Store maskieren und den bereits gerenderten App-Baum aushängen. */
      storage.mask?.();
      emit();
      return;
    }
    /* Auth-ID-Wechsel maskiert ebenso synchron. Der eigentliche Refresh läuft
       serialisiert; solange ein Transitionmarker steht, bleibt der Tab aus. */
    storage.mask?.();
    emit();
    return serialisiere(async () => {
      try {
        if (storage.currentTransition?.()) return;
        const session = await auth.refresh();
        await align(session, {
          verifiedTransitionEnd: event.key === ACCT_KEYS.transition && event.newValue == null,
        });
        publish(session);
      } catch {
        storage.mask?.();
        emit();
      }
    });
  }

  const api = Object.freeze({
    getSnapshot: () => sichtbareSession,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getStorageState: storageState,
    handleExternalStorageEvent: externalStorageEvent,

    async initialize() {
      return serialisiere(async () => {
      try {
        const session = await auth.initialize();
        await align(session, { pullWhenReady: true });
        return publish(session);
      } catch (error) {
        /* Ein neutral gemeldeter Remote-Ladefehler vor der Adoption hat weder
           Owner noch Haupttöpfe verändert. `align` hat die Konto-Sitzung
           bereits veröffentlicht; awaiting-adoption hängt den App-Baum aus
           und bleibt über refresh wiederholbar. Echte Privacy-/Markerfehler
           werden weiterhin hart maskiert. */
        const fehlerKontoId = accountId(auth.getSnapshot?.());
        const fehlerOwner = String(storage.cacheOwner?.() || "");
        const fehlerTransition = storage.currentTransition?.() || null;
        const wiederholbarerLadefehler = error?.code === "ACCOUNT_LOAD_FAILED"
          && !!fehlerKontoId && (!fehlerOwner || fehlerOwner === fehlerKontoId)
          && !fehlerTransition && !isConfirmed(fehlerKontoId);
        if (!wiederholbarerLadefehler && (fehlerOwner || fehlerTransition)) {
          storage.mask?.(); emit();
        }
        throw begrenzePrivacyFehler(error);
      }
      });
    },

    async signIn(benutzername, passwort) {
      return serialisiereSicher(async () => {
        const session = await auth.signIn(benutzername, passwort);
        await align(session, { pullWhenReady: true });
        return publish(session);
      });
    },

    async signOut() {
      return serialisiereSicher(async () => {
      const id = accountId();
      const cacheId = String(storage.cacheOwner?.() || "");

      /* Ein bewusster Logout darf keine noch ungesicherten Kontoänderungen
         vernichten. Solange der Treiber aktiv ist, erst die Queue leeren und
         bei Konflikten/Fehlern angemeldet bleiben. */
      if (id && storage.active?.()) {
        await storage.flush?.();
        const status = storage.status?.() || {};
        const offen = [status.pending, status.conflict, status.zuGross, status.schemaVeraltet]
          .some((liste) => Array.isArray(liste) && liste.length > 0);
        if (offen) {
          throw new Error("Vor dem Abmelden konnten nicht alle Kontoänderungen gesichert werden. Bitte löse offene Konflikte oder erstelle zuerst ein Backup.");
        }
      } else if (id && storage.hasOpenChanges?.()) {
        /* Bei entzogener/unklarer Freigabe ist Flush ausdrücklich verboten.
           Ein Logout dürfte die persistente Queue dann aber ebenso wenig über
           den Gast-Restore beseitigen. Das Konto bleibt technisch angemeldet
           und maskiert, bis dieselbe Freigabe wieder sicher geprüft wurde. */
        throw new Error("Ungesicherte Kontoänderungen bleiben geschützt. Melde dich erst ab, nachdem dieses Konto wieder freigegeben und vollständig synchronisiert wurde oder ein Backup vorliegt.");
      }

      return beendeLokaleKontositzung(cacheId);
      });
    },

    async finalizeDeletedAccount() {
      return serialisiereSicher(async () => {
        /* Nur nach bestätigter serverseitiger Auth-Löschung: kein Flush mehr,
           weil das Konto nicht länger Ziel einer Remote-Schreiboperation ist. */
        return beendeLokaleKontositzung(String(storage.cacheOwner?.() || accountId() || ""));
      });
    },

    async refresh() {
      return serialisiereSicher(async () => {
      const session = await auth.refresh();
      await align(session);
      return publish(session);
      });
    },

    changePassword: (neuesPasswort) => auth.changePassword(neuesPasswort),
    reauthenticate: (passwort) => auth.reauthenticate(passwort),
  });
  eventTarget?.addEventListener?.("storage", externalStorageEvent);
  return api;
}

export const sessionCoordinator = createSessionCoordinator();
