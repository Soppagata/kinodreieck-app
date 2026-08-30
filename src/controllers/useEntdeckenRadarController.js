import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runtimeConfig } from "../config/runtime.js";
import { K, store, captureStorageContext } from "../services/storage.js";
import { useConfirmedStorageState } from "./useConfirmedStorageState.js";
import {
  changeLocalTextRadarSubscription,
  createLocalTextRadarTargetId,
  createEmptyLocalRadar,
  decodeLocalRadar,
  discardRejectedAccountRadarChange,
  queueAccountPersonRadarChange,
  queueAccountRadarChange,
  queueAccountTextRadarChange,
  queueUnsyncedAccountTextRadarTargets,
  queueAccountRadarPilotImport,
  queueAccountRadarPilotReceipt,
  queueAccountRadarShareChange,
  removeGuestPersonRadarSubscription,
  removeGuestRadarSubscription,
  setLocalRadarReceipt,
  setGuestPersonRadarSubscriptionStatus,
  upsertGuestPersonRadarSubscription,
  upsertGuestRadarSubscription,
  validateLocalRadarState,
} from "../lib/localEventRadar.js";
import { createCatalogRadarTarget, localRadarTargetLabel } from "../lib/entdeckenUi.js";
import { createPersonIdentityKey, validatePersonIdentity } from "../lib/personDiscoveryContracts.js";
import {
  createPersonRadarTargetId,
  findPersonRadarCatalogIdentity,
  resolvePersonRadarCatalogIdentity,
} from "../lib/personRadarCatalog.js";
import { projectEntdeckenRadarPilot, radarAutomationAttested } from "../lib/radarPilotContracts.js";
import { projectVisibleRadarWebsearchEvents } from "../lib/radarWebsearchFlow.js";
import { istBeobachtet, serienBeobachten, setzeSerienBeobachtung } from "../lib/staffeln.js";
import { radarPilotService } from "../services/radarPilot.js";
import { RADAR_WEBSEARCH_SINGLE_FILE_DISABLED, radarWebsearchService } from "../services/radarWebsearch.js";

export { projectEntdeckenRadarPilot } from "../lib/radarPilotContracts.js";

function neueLokaleOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (zeichen) => (
    (Number(zeichen) ^ Math.random() * 16 >> Number(zeichen) / 4).toString(16)
  ));
}

/* Grenze für alle persönlichen Entdecken-/Radar-Mutationen. Ein optional
   injizierter lokaler Executor trägt ausschließlich den begrenzten Mockpfad;
   Browser-Scheduler und freie Katalogsuche bleiben verboten. Automatische
   Prüfungen laufen ausschließlich im vorhandenen serverseitigen Claim-Pfad.
   Sichtbarer State folgt exakt der Gast- bzw. Kontocache-Autorität und wird
   erst nach bestätigtem Storage-Write übernommen. */
export function useEntdeckenRadarController({
  session, remoteKontoAktiv, bootDone, master, streamingKnown, streamingDiscover,
  entdeckenStatus, entdeckenStatusRef, schreibeEntdeckenStatus, serienKatalog, setErr,
  radarWebsearchExecutor = null,
  radarPilotAdapter = radarPilotService,
  radarWebsearchAdapter = radarWebsearchService,
  radarPilotEnabled = runtimeConfig.radarPilotClientEnabled,
}) {
  const radarAuthority = session.mode === "account" ? "account-cache" : "guest";
  const radarPilotClientEnabled = radarPilotEnabled === true;
  const contextKey = JSON.stringify([session.mode, session.state, session.account?.id,
    session.capabilities?.personalAi, remoteKontoAktiv, radarPilotClientEnabled]);
  const contextRef = useRef({ key: contextKey });
  if (contextRef.current.key !== contextKey) contextRef.current = { key: contextKey };
  const mountedRef = useRef(true);
  const textAddLockRef = useRef(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const radarInitial = useMemo(() => {
    try {
      const decoded = decodeLocalRadar(localStorage.getItem(K.radar), { authority: radarAuthority });
      return decoded.ok ? decoded.state : createEmptyLocalRadar({ authority: radarAuthority });
    } catch { return createEmptyLocalRadar({ authority: radarAuthority }); }
  }, [radarAuthority]);
  const normalisiereRadar = useCallback((wert) => {
    if (!validateLocalRadarState(wert).ok || wert.authority !== radarAuthority) {
      throw new Error("Radarzustand passt nicht zur aktuellen Ablage");
    }
    return wert;
  }, [radarAuthority]);
  const {
    wert: radarState,
    wertRef: radarStateRef,
    uebernehmeBestaetigt: setRadarState,
    schreibe: schreibeRadarState,
  } = useConfirmedStorageState({
    key: K.radar,
    initial: radarInitial,
    normalisiere: normalisiereRadar,
    setErr,
    fehlermeldung: "Radar konnte nicht bestätigt gespeichert werden. Die Änderung wurde nicht übernommen.",
  });
  const [radarPreviewTarget, setRadarPreviewTarget] = useState(null);
  const [radarPilotSyncStatus, setRadarPilotSyncStatus] = useState(radarPilotClientEnabled ? "idle" : "disabled");
  const [radarAutomationAttestation, setRadarAutomationAttestation] = useState(null);
  const [localRadarWebsearchEvents, setLocalRadarWebsearchEvents] = useState([]);
  const localRadarWebsearchAvailable = radarAuthority === "guest"
    && radarWebsearchExecutor?.valid === true
    && typeof radarWebsearchExecutor?.check === "function"
    && typeof radarWebsearchExecutor?.loadEvents === "function";
  const schliesseRadarPreview = useCallback(() => setRadarPreviewTarget(null), []);

  useEffect(() => {
    let active = true;
    if (!bootDone || !localRadarWebsearchAvailable) {
      setLocalRadarWebsearchEvents([]);
      return () => { active = false; };
    }
    void radarWebsearchExecutor.loadEvents().then((events) => {
      if (active) setLocalRadarWebsearchEvents(Array.isArray(events) ? events : []);
    }).catch(() => {
      if (active) setLocalRadarWebsearchEvents([]);
    });
    return () => { active = false; };
  }, [bootDone, localRadarWebsearchAvailable, radarWebsearchExecutor]);

  const syncRadarPilot = useCallback(async (stateForSync = null) => {
    const state = stateForSync || radarStateRef.current;
    const context = contextRef.current;
    const storage = captureStorageContext();
    const current = () => mountedRef.current && contextRef.current === context && storage.isCurrent();
    if (!radarPilotClientEnabled || radarAuthority !== "account-cache" || !remoteKontoAktiv) {
      setRadarPilotSyncStatus("disabled");
      setRadarAutomationAttestation(null);
      return { status: "disabled", state };
    }
    setRadarPilotSyncStatus("syncing");
    setRadarAutomationAttestation(null);
    try {
      const status = await radarPilotAdapter.sync({
        state,
        commit: (next) => current() ? setRadarState(next) : false,
      });
      if (!current()) return { status: "forbidden", state: null };
      setRadarPilotSyncStatus(status?.status || "pending");
      setRadarAutomationAttestation(
        status?.status === "ready" && radarAutomationAttested(status.automation, { allowInactive: true })
          ? status.automation : null,
      );
      return status;
    } catch {
      if (!current()) return { status: "forbidden", state: null };
      setRadarPilotSyncStatus("pending");
      setRadarAutomationAttestation(null);
      return { status: "pending", state, reason: "pilot-unknown" };
    }
  }, [radarPilotAdapter, radarPilotClientEnabled, radarAuthority, remoteKontoAktiv, radarStateRef, setRadarState]);

  useEffect(() => {
    if (!bootDone) {
      return undefined;
    }
    let aktiv = true;
    setRadarAutomationAttestation(null);
    void (async () => {
      try {
        const gespeicherterRadar = await store.get(K.radar);
        const decoded = decodeLocalRadar(gespeicherterRadar?.value, { authority: radarAuthority });
        if (!aktiv) return;
        if (!decoded.ok) {
          setRadarState(createEmptyLocalRadar({ authority: radarAuthority }));
          setErr("Der lokale Radar-Stand passt nicht zur aktuellen Anmeldung oder ist beschädigt. Er wurde nicht verändert und bleibt vorsichtshalber ausgeblendet.");
          return;
        }
        if (!radarPilotClientEnabled || radarAuthority !== "account-cache" || !remoteKontoAktiv) {
          setRadarState(decoded.state);
          return;
        }
        const prepared = queueUnsyncedAccountTextRadarTargets(decoded.state, {
          createOperationId: neueLokaleOperationId,
        });
        if (!prepared.ok) {
          setRadarState(decoded.state);
          setRadarPilotSyncStatus("pending");
          return;
        }
        let stateForSync = decoded.state;
        if (prepared.changed) {
          const persisted = await schreibeRadarState(prepared.state);
          if (!aktiv || persisted === false) return;
          stateForSync = persisted;
        } else {
          setRadarState(decoded.state);
        }
        setRadarPilotSyncStatus("syncing");
        try {
          const status = await radarPilotAdapter.sync({
            state: stateForSync,
            commit: (next) => (aktiv ? setRadarState(next) : false),
          });
          if (!aktiv) return;
          setRadarPilotSyncStatus(status?.status || "pending");
          setRadarAutomationAttestation(
            status?.status === "ready" && radarAutomationAttested(status.automation, { allowInactive: true })
              ? status.automation : null,
          );
        } catch {
          if (aktiv) {
            setRadarPilotSyncStatus("pending");
            setRadarAutomationAttestation(null);
          }
        }
      } catch {
        if (!aktiv) return;
        setRadarState(createEmptyLocalRadar({ authority: radarAuthority }));
        setErr("Der lokale Radar-Stand konnte nicht gelesen werden. Es wurde nichts verändert.");
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [bootDone, radarAuthority, radarPilotAdapter, radarPilotClientEnabled,
    remoteKontoAktiv, session.account?.id, schreibeRadarState, setRadarState, setErr]);

  const aendereSerienBeobachtung = useCallback(async (eintrag, aktiv) => {
    const watchmodeId = eintrag?.watchmode_id ?? eintrag?.watchmodeId;
    if (!Number.isInteger(Number(watchmodeId)) || Number(watchmodeId) <= 0) {
      setErr("Beobachten braucht eine stabile Watchmode-ID. Es wurde nichts verändert.");
      return false;
    }
    const katalogEintrag = serienKatalog.find((item) => String(item.watchmode_id) === String(watchmodeId));
    const serie = katalogEintrag || {
      watchmode_id: Number(watchmodeId),
      titel: eintrag?.titel || eintrag?.target?.title || "Serie",
      typ: "tv_series",
    };
    const gespeichert = await schreibeEntdeckenStatus((prev) => {
      const next = { ...(prev || {}) };
      const wert = setzeSerienBeobachtung(next[watchmodeId], serie, aktiv);
      if (wert == null) delete next[watchmodeId];
      else next[watchmodeId] = wert;
      return next;
    });
    return gespeichert !== false;
  }, [schreibeEntdeckenStatus, serienKatalog, setErr]);

  const radarTargetAusEintrag = useCallback((entry) => ({
    targetId: entry.targetId,
    targetType: entry.targetType,
    targetStatus: "active",
    title: localRadarTargetLabel(entry, {
      master: master || [], streamingKnown, streamingDiscover,
    }),
    canonical: true,
  }), [master, streamingKnown, streamingDiscover]);

  const aendereRadar = useCallback(async (targetOrEntry, action = "upsert") => {
    const textTarget = targetOrEntry?.targetType === "text";
    if (radarAuthority === "account-cache" && !remoteKontoAktiv && !textTarget) {
      setErr("Radar-Änderungen im Kontomodus brauchen einen fachlich aktiven Kontozugriff. Es wurde nichts verändert.");
      return false;
    }
    const target = targetOrEntry?.targetStatus ? targetOrEntry : radarTargetAusEintrag(targetOrEntry || {});
    let grund = "radar-change-invalid";
    const gespeichert = await schreibeRadarState((prev) => {
      if (prev.authority !== radarAuthority) { grund = "authority-mismatch"; return null; }
      const result = textTarget
        ? prev.authority === "account-cache"
          ? queueAccountTextRadarChange(prev, {
            operationId: neueLokaleOperationId(), action, targetText: targetOrEntry.targetText,
          })
          : changeLocalTextRadarSubscription(prev, { targetText: targetOrEntry.targetText, action })
        : prev.authority === "guest"
        ? action === "remove"
          ? removeGuestRadarSubscription(prev, target.targetId)
          : upsertGuestRadarSubscription(prev, { target, status: action === "pause" ? "paused" : "active" })
        : queueAccountRadarChange(prev, {
          operationId: neueLokaleOperationId(), action, target,
        });
      grund = result.reason;
      return result.ok ? result.state : null;
    });
    if (
      radarPilotClientEnabled && radarAuthority === "account-cache" && remoteKontoAktiv
      && gespeichert !== false && gespeichert
    ) {
      await syncRadarPilot(gespeichert);
    }
    if (gespeichert !== false) return true;
    setErr(grund === "quota-exceeded"
      ? "Dein lokaler Radar hat bereits zehn aktive Ziele. Pausiere oder entferne zuerst eines."
      : grund === "authority-mismatch"
        ? "Radar-Änderungen passen nicht zur aktuellen Ablage. Es wurde nichts verändert."
        : "Die Radar-Änderung wurde nicht bestätigt gespeichert. Es wurde kein Providerjob gestartet.");
    return false;
  }, [
    radarAuthority,
    radarPilotClientEnabled,
    remoteKontoAktiv,
    radarTargetAusEintrag,
    schreibeRadarState,
    setErr,
    syncRadarPilot,
  ]);

  const fuegeRadarFreitextHinzu = useCallback(async (targetText, { onProgress } = {}) => {
    const normalizedTargetText = String(targetText || "").trim();
    const targetId = createLocalTextRadarTargetId(normalizedTargetText);
    const context = contextRef.current;
    const storage = captureStorageContext();
    const current = () => mountedRef.current && contextRef.current === context && storage.isCurrent();
    if (textAddLockRef.current?.context === context) return Object.freeze({ status: "busy", writes: 0 });
    const operation = { context };
    textAddLockRef.current = operation;
    const progress = (status) => { if (current() && typeof onProgress === "function") onProgress(status); };
    try {
      progress("saving");
      let reason = "text-subscription-invalid";
      let newlyAdded = false;
      const saved = await schreibeRadarState((previous) => {
        if (!current() || previous.authority !== radarAuthority) { reason = "authority-mismatch"; return null; }
        const existing = previous.subscriptions.find((entry) => entry.targetId === targetId);
        const pending = previous.outbox.some((entry) => entry.targetId === targetId && entry.status === "pending");
        if (existing?.status === "active" || pending) { reason = pending ? "pending" : "active"; return previous; }
        newlyAdded = !existing;
        const result = previous.authority === "account-cache"
          ? queueAccountTextRadarChange(previous, {
            operationId: neueLokaleOperationId(), action: "upsert", targetText: normalizedTargetText,
          })
          : changeLocalTextRadarSubscription(previous, { targetText: normalizedTargetText, action: "upsert" });
        reason = result.reason;
        return result.ok ? result.state : null;
      });
      if (!current()) return Object.freeze({ status: "forbidden", writes: 0 });
      if (["active", "pending"].includes(reason)) return Object.freeze({ status: reason, saved: true, writes: 0 });
      if (saved !== false && radarAuthority === "account-cache") {
        const synced = await syncRadarPilot(saved);
        if (!current()) return Object.freeze({ status: "forbidden", writes: 0 });
        const activeTarget = (state) => (state?.subscriptions || []).some((entry) => (
          entry.targetId === targetId && entry.targetType === "text"
            && entry.status === "active" && entry.authority === "server"
            && entry.targetText === normalizedTargetText
        )) && !(state?.outbox || []).some((entry) => entry.targetId === targetId && entry.status === "pending");
        const active = synced?.status === "ready" && activeTarget(synced.state) && activeTarget(radarStateRef.current);
        const canSearch = newlyAdded && active && remoteKontoAktiv && radarPilotClientEnabled
          && !RADAR_WEBSEARCH_SINGLE_FILE_DISABLED && session.state === "ready"
          && session.capabilities?.personalAi === true && synced.state.pilot?.radarReview === true
          && storage.owner === `account:${session.account?.id}`;
        if (!canSearch) return Object.freeze({ status: active ? "active" : "pending", saved: true, writes: 1 });
        progress("searching");
        let result;
        try { result = await radarWebsearchAdapter.checkNow(targetId, normalizedTargetText, { initial: true }); }
        catch { result = { status: "unavailable" }; }
        if (!current()) return Object.freeze({ status: "forbidden", writes: 0 });
        // Removal/pause while the request runs wins. No raw result is ever
        // installed; only the existing account-fenced, persisted feed sync is used.
        if (!activeTarget(radarStateRef.current)) return Object.freeze({ status: "no_change", saved: true, writes: 1 });
        const refreshed = await syncRadarPilot();
        if (!current()) return Object.freeze({ status: "forbidden", writes: 0 });
        return Object.freeze({ status: refreshed?.status === "ready" ? result?.status || "unavailable" : "storage_error", saved: true, writes: 1 });
      }
      if (saved !== false) return Object.freeze({ status: "active", saved: true, writes: 1 });
      if (reason === "quota-exceeded") {
        setErr("Dein lokaler Radar hat bereits zehn aktive Ziele. Pausiere oder entferne zuerst eines.");
      }
      return Object.freeze({ status: reason === "quota-exceeded" ? "forbidden" : "storage_error", writes: 0 });
    } finally { if (textAddLockRef.current === operation) textAddLockRef.current = null; }
  }, [radarAuthority, schreibeRadarState, setErr, syncRadarPilot, radarStateRef,
    remoteKontoAktiv, radarPilotClientEnabled, session, radarWebsearchAdapter]);

  const localPersonRadarAvailable = localRadarWebsearchAvailable
    && typeof radarWebsearchExecutor?.resolvePerson === "function";
  const accountRadarServerAvailable = !RADAR_WEBSEARCH_SINGLE_FILE_DISABLED
    && radarAuthority === "account-cache" && remoteKontoAktiv
    && radarPilotClientEnabled;
  const personRadarAvailable = localPersonRadarAvailable
    || (accountRadarServerAvailable && session?.capabilities?.personalAi === true);
  const franchiseRadarAvailable = false;

  const fuegePersonRadarHinzu = useCallback(async ({ name, role, personExternalId = null } = {}) => {
    if (!personRadarAvailable) return Object.freeze({ status: "unavailable", writes: 0 });
    const requestedName = String(name || "").trim();
    let resolved;
    try {
      resolved = localPersonRadarAvailable
        ? await radarWebsearchExecutor.resolvePerson({ name: requestedName, role })
        : resolvePersonRadarCatalogIdentity({ name: requestedName, role });
    }
    catch { return Object.freeze({ status: "provider_error", writes: 0 }); }
    const checked = validatePersonIdentity(resolved);
    if (!checked.ok || resolved.role !== role
        || (personExternalId != null && resolved.personExternalId !== personExternalId)
        || resolved.name.localeCompare(requestedName, "de-AT", { sensitivity: "base" }) !== 0) {
      return Object.freeze({ status: "unresolved", writes: 0 });
    }
    const identity = Object.freeze({
      personExternalId: resolved.personExternalId,
      name: resolved.name,
      role: resolved.role,
      canonical: true,
    });
    const targetId = createPersonRadarTargetId(identity.personExternalId, identity.role);
    let reason = "person-subscription-invalid";
    const saved = await schreibeRadarState((previous) => {
      const result = previous.authority === "guest"
        ? upsertGuestPersonRadarSubscription(previous, { identity })
        : queueAccountPersonRadarChange(previous, {
          operationId: neueLokaleOperationId(), action: "upsert", identity, targetId,
        });
      reason = result.reason;
      return result.ok ? result.state : null;
    });
    if (saved === false) return Object.freeze({
      status: reason === "outbox-person-invalid" ? "unresolved" : "storage_error", writes: 0,
    });
    if (radarAuthority === "guest") return Object.freeze({ status: "active", writes: 1, identity });
    const synced = await syncRadarPilot(saved);
    const active = (synced?.state?.personSubscriptions || []).some((entry) => (
      entry.personExternalId === identity.personExternalId && entry.role === identity.role && entry.status === "active"
    ));
    return Object.freeze({ status: active ? "active" : "pending", writes: 1, identity });
  }, [
    localPersonRadarAvailable,
    personRadarAvailable,
    radarAuthority,
    radarWebsearchExecutor,
    schreibeRadarState,
    syncRadarPilot,
  ]);

  const fuegeRadarTextHinzu = useCallback(async (targetText, options) => {
    return fuegeRadarFreitextHinzu(targetText, options);
  }, [fuegeRadarFreitextHinzu]);

  const aenderePersonRadar = useCallback(async (identity, action) => {
    if (!personRadarAvailable) return Object.freeze({ status: "unavailable", writes: 0 });
    const canonical = localPersonRadarAvailable ? identity : findPersonRadarCatalogIdentity({
      targetId: createPersonRadarTargetId(identity?.personExternalId, identity?.role),
      personExternalId: identity?.personExternalId,
      name: identity?.name,
      role: identity?.role,
    });
    if (!validatePersonIdentity(canonical).ok) return Object.freeze({ status: "unresolved", writes: 0 });
    let reason = "person-subscription-invalid";
    const saved = await schreibeRadarState((previous) => {
      const result = previous.authority === "guest"
        ? action === "remove"
          ? removeGuestPersonRadarSubscription(previous, canonical)
          : setGuestPersonRadarSubscriptionStatus(previous, canonical, action === "pause" ? "paused" : "active")
        : queueAccountPersonRadarChange(previous, {
          operationId: neueLokaleOperationId(), action, identity: canonical,
          targetId: createPersonRadarTargetId(canonical.personExternalId, canonical.role),
        });
      reason = result.reason;
      return result.ok ? result.state : null;
    });
    if (saved === false) return Object.freeze({
      status: reason === "outbox-person-invalid" ? "unresolved" : "storage_error", writes: 0,
    });
    if (radarAuthority === "account-cache") await syncRadarPilot(saved);
    return Object.freeze({
      status: action === "remove" ? "removed" : action === "pause" ? "paused" : "active", writes: 1,
    });
  }, [localPersonRadarAvailable, personRadarAvailable, radarAuthority, schreibeRadarState, syncRadarPilot]);

  const aendereRadarShare = useCallback(async (targetId, shareEnabled) => {
    if (radarAuthority !== "account-cache" || !remoteKontoAktiv) {
      setErr("Anonymes Teilen braucht ein aktives Konto und ein serverbestätigtes Radarziel.");
      return false;
    }
    let grund = "share-invalid";
    const gespeichert = await schreibeRadarState((prev) => {
      const result = queueAccountRadarShareChange(prev, {
        operationId: neueLokaleOperationId(), targetId, shareEnabled,
      });
      grund = result.reason;
      return result.ok ? result.state : null;
    });
    if (gespeichert !== false) return true;
    setErr(grund === "active-subscription-required"
      ? "Teilen ist erst für ein serverbestätigtes aktives Radarziel möglich."
      : "Die Teilen-Wahl wurde nicht bestätigt gespeichert.");
    return false;
  }, [radarAuthority, remoteKontoAktiv, schreibeRadarState, setErr]);

  const fuehreRadarPilotReceipt = useCallback(async ({ eventId, eventVersionId, status = "seen" }) => {
    if (localRadarWebsearchAvailable && radarAuthority === "guest") {
      const known = localRadarWebsearchEvents.some((event) => (
        event.eventId === eventId && event.eventVersionId === eventVersionId
      ));
      if (!known) return false;
      const gespeichert = await schreibeRadarState((prev) => {
        const result = setLocalRadarReceipt(prev, {
          eventId,
          versionId: eventVersionId,
          status,
          now: new Date().toISOString(),
        });
        return result.ok ? result.state : null;
      });
      return gespeichert !== false;
    }
    if (!radarPilotClientEnabled || radarAuthority !== "account-cache" || !remoteKontoAktiv) return false;
    const gespeichert = await schreibeRadarState((prev) => {
      const result = queueAccountRadarPilotReceipt(prev, {
        eventId,
        eventVersionId,
        status,
        now: new Date().toISOString(),
      });
      return result.ok ? result.state : null;
    });
    if (gespeichert === false) return false;
    await syncRadarPilot(gespeichert);
    return true;
  }, [
    localRadarWebsearchAvailable,
    localRadarWebsearchEvents,
    radarAuthority,
    radarPilotClientEnabled,
    remoteKontoAktiv,
    schreibeRadarState,
    syncRadarPilot,
  ]);

  const fuehreRadarPilotImport = useCallback(async (payload) => {
    if (
      !radarPilotClientEnabled || !remoteKontoAktiv || radarAuthority !== "account-cache"
      || radarStateRef.current?.pilot?.status !== "ready"
      || radarStateRef.current?.pilot?.radarReview !== true
    ) return { status: "not-started", reason: "pilot-not-ready" };
    const operationId = neueLokaleOperationId();
    const gespeichert = await schreibeRadarState((prev) => {
      const result = queueAccountRadarPilotImport(prev, {
        operationId,
        payload,
        now: new Date().toISOString(),
      });
      return result.ok ? result.state : null;
    });
    if (gespeichert === false) return { status: "not-started", reason: "radar-import-state-not-queued" };
    const syncResult = await syncRadarPilot(gespeichert);
    const importEntry = syncResult?.state?.pilot?.importOutbox?.find((entry) => entry.operationId === operationId);
    if (importEntry?.status === "ready") return { status: "ready", state: syncResult.state, reason: importEntry.reason };
    if (importEntry?.status === "pending") {
      return { status: "pending", state: syncResult.state, reason: importEntry.reason || "pilot-import-pending" };
    }
    if (importEntry?.status === "rejected") {
      return {
        status: "rejected",
        state: syncResult.state,
        reason: importEntry.reason || "pilot-import-rejected",
      };
    }
    return syncResult?.status ? syncResult : { status: "pending", reason: "pilot-unknown" };
  }, [
    radarAuthority,
    radarPilotClientEnabled,
    remoteKontoAktiv,
    schreibeRadarState,
    syncRadarPilot,
    radarStateRef,
  ]);

  const fuehreRadarPilotSync = useCallback(async () => {
    return syncRadarPilot();
  }, [syncRadarPilot]);

  const verwerfeAbgelehnteRadarAenderung = useCallback(async (operationId) => {
    let reason = "rejected-operation-invalid";
    const saved = await schreibeRadarState((previous) => {
      const result = discardRejectedAccountRadarChange(previous, operationId);
      reason = result.reason;
      return result.ok ? result.state : null;
    });
    if (saved !== false) return Object.freeze({ status: "resolved", writes: 1 });
    return Object.freeze({ status: "storage_error", writes: 0, reason });
  }, [schreibeRadarState]);

  const bestaetigeRadarVorschau = useCallback(async (target, { shareEnabled = false } = {}) => {
    if (radarAuthority === "account-cache" && !remoteKontoAktiv) {
      setErr("Radar-Änderungen im Kontomodus brauchen einen fachlich aktiven Kontozugriff.");
      return false;
    }
    const bereitsAktiv = radarStateRef.current?.authority === radarAuthority
      && (radarStateRef.current.subscriptions || []).some((entry) => (
        entry.targetId === target.targetId && entry.status === "active"
      ));
    if (!bereitsAktiv && !await aendereRadar(target, "upsert")) return false;
    if (shareEnabled && !await aendereRadarShare(target.targetId, true)) return false;
    return true;
  }, [aendereRadar, aendereRadarShare, radarAuthority, radarStateRef, remoteKontoAktiv, setErr]);

  const beobachteteWatchmodeIds = useMemo(
    () => serienBeobachten(entdeckenStatus, serienKatalog).map((entry) => String(entry.watchmode_id)),
    [entdeckenStatus, serienKatalog],
  );
  const radarTargetIds = useMemo(() => {
    if (radarState?.authority !== radarAuthority) return [];
    const ids = new Set((radarState.subscriptions || []).filter((entry) => entry.status === "active").map((entry) => entry.targetId));
    for (const operation of radarState.outbox || []) {
      if (operation.status !== "pending") continue;
      if (operation.action === "remove" || operation.action === "pause") ids.delete(operation.targetId);
      else if (operation.action === "upsert") ids.add(operation.targetId);
    }
    return [...ids];
  }, [radarAuthority, radarState]);
  const sichtbarerRadarState = useMemo(
    () => radarState?.authority === radarAuthority ? radarState : createEmptyLocalRadar({ authority: radarAuthority }),
    [radarAuthority, radarState],
  );
  const accountRadarPilotProjection = useMemo(() => projectEntdeckenRadarPilot({
    clientEnabled: radarPilotClientEnabled,
    radarAuthority,
    radarState: sichtbarerRadarState,
  }), [radarAuthority, radarPilotClientEnabled, sichtbarerRadarState]);
  const activePersonKeys = useMemo(() => (sichtbarerRadarState.personSubscriptions || [])
    .filter((entry) => entry.status === "active")
    .map((entry) => createPersonIdentityKey(entry)).filter(Boolean), [sichtbarerRadarState.personSubscriptions]);
  const activeWorkTargetIds = useMemo(() => (sichtbarerRadarState.subscriptions || [])
    .filter((entry) => entry.status === "active" && entry.targetType !== "franchise")
    .map((entry) => entry.targetId), [sichtbarerRadarState.subscriptions]);
  const activeFranchiseIds = useMemo(() => (sichtbarerRadarState.subscriptions || [])
    .filter((entry) => entry.status === "active" && entry.targetType === "franchise")
    .map((entry) => entry.targetId), [sichtbarerRadarState.subscriptions]);
  const visibleLocalRadarEvents = useMemo(() => projectVisibleRadarWebsearchEvents({
    events: localRadarWebsearchEvents,
    receipts: sichtbarerRadarState.receipts,
    activeWorkTargetIds,
    activeFranchiseIds,
    activePersonKeys,
  }), [activeFranchiseIds, activePersonKeys, activeWorkTargetIds, localRadarWebsearchEvents, sichtbarerRadarState.receipts]);
  const visiblePilotRadarEvents = useMemo(() => {
    const receipts = new Map((sichtbarerRadarState.receipts || []).map((entry) => [entry.versionId, entry.status]));
    return (accountRadarPilotProjection.events || []).filter((event) => {
      const status = receipts.get(event.eventVersionId) || "new";
      return status === "new" || status === "accepted_week";
    });
  }, [accountRadarPilotProjection.events, sichtbarerRadarState.receipts]);
  const radarPilotProjection = useMemo(() => Object.freeze({
    ...accountRadarPilotProjection,
    events: radarAuthority === "guest" ? visibleLocalRadarEvents : visiblePilotRadarEvents,
  }), [accountRadarPilotProjection, radarAuthority, visibleLocalRadarEvents, visiblePilotRadarEvents]);
  const radarAutomaticAvailable = accountRadarServerAvailable
    && radarPilotSyncStatus === "ready"
    && radarPilotProjection.active === true && radarPilotProjection.radarReview === true
    && radarAutomationAttested(radarAutomationAttestation);
  const fuehreGlobaleSuchaktionAus = useCallback((treffer, intent) => {
    const action = treffer?.searchActions?.[intent];
    if (!action) return;
    if (intent === "watch") {
      const aktiv = !istBeobachtet(entdeckenStatusRef.current?.[action.watchmodeId]);
      void aendereSerienBeobachtung({
        watchmodeId: action.watchmodeId,
        titel: treffer.titel,
        target: action.target,
      }, aktiv);
    } else if (intent === "radar" && action.target) setRadarPreviewTarget(action.target);
  }, [aendereSerienBeobachtung, entdeckenStatusRef]);

  return {
    radarAuthority, sichtbarerRadarState, radarPreviewTarget,
    radarPilotClientEnabled,
    radarPilotActive: radarPilotProjection.active,
    radarPilotEvents: radarPilotProjection.events,
    radarReview: radarPilotProjection.radarReview,
    radarAutomaticAvailable,
    radarPilotSyncStatus,
    setRadarPreviewTarget,
    schliesseRadarPreview,
    aendereSerienBeobachtung,
    aendereRadar,
    fuegeRadarTextHinzu,
    aendereRadarShare,
    bestaetigeRadarVorschau,
    beobachteteWatchmodeIds,
    radarTargetIds,
    fuehreRadarPilotReceipt,
    fuehreRadarPilotImport,
    fuehreRadarPilotSync,
    verwerfeAbgelehnteRadarAenderung,
    franchiseRadarAvailable,
    personRadarAvailable,
    fuegePersonRadarHinzu,
    aenderePersonRadar,
    fuehreGlobaleSuchaktionAus,
  };
}
