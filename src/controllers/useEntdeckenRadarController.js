import { useCallback, useEffect, useMemo, useState } from "react";
import { runtimeConfig } from "../config/runtime.js";
import { K, store } from "../services/storage.js";
import { useConfirmedStorageState } from "./useConfirmedStorageState.js";
import {
  createEmptyLocalRadar,
  decodeLocalRadar,
  queueAccountPersonRadarChange,
  queueAccountRadarChange,
  queueAccountRadarPilotImport,
  queueAccountRadarPilotReceipt,
  queueAccountRadarShareChange,
  removeGuestPersonRadarSubscription,
  removeGuestRadarSubscription,
  setGuestPersonRadarSubscriptionStatus,
  upsertGuestPersonRadarSubscription,
  upsertGuestRadarSubscription,
  validateLocalRadarState,
} from "../lib/localEventRadar.js";
import {
  createRadarCatalogIndex,
  localRadarTargetLabel,
  resolveTitleGroupRadarTarget,
} from "../lib/entdeckenUi.js";
import { validatePersonIdentity } from "../lib/personDiscoveryContracts.js";
import {
  createPersonRadarTargetId,
  findPersonRadarCatalogIdentity,
} from "../lib/personRadarCatalog.js";
import { projectEntdeckenRadarPilot } from "../lib/radarPilotContracts.js";
import { istBeobachtet, serienBeobachten, setzeSerienBeobachtung } from "../lib/staffeln.js";
import { radarPilotService } from "../services/radarPilot.js";
import {
  RADAR_WEBSEARCH_SINGLE_FILE_DISABLED,
  radarWebsearchService,
} from "../services/radarWebsearch.js";

export { projectEntdeckenRadarPilot } from "../lib/radarPilotContracts.js";

function neueLokaleOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (zeichen) => (
    (Number(zeichen) ^ Math.random() * 16 >> Number(zeichen) / 4).toString(16)
  ));
}

/* Phase-3-Grenze für alle persönlichen Entdecken-/Radar-Mutationen.
   Der Controller kennt keinen Provider, Scheduler, Proposal-Import oder
   Personen-Automatik-Pfad. Sichtbarer State folgt exakt der Gast- bzw.
   Kontocache-Autorität und wird erst nach bestätigtem Storage-Write übernommen. */
export function useEntdeckenRadarController({
  session, remoteKontoAktiv, bootDone, master, streamingKnown, streamingDiscover,
  entdeckenStatus, entdeckenStatusRef, schreibeEntdeckenStatus, serienKatalog, setErr,
  personRadarAdapter = radarWebsearchService,
}) {
  const radarAuthority = session.mode === "account" ? "account-cache" : "guest";
  const radarPilotClientEnabled = runtimeConfig.radarPilotClientEnabled === true;
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
  const schliesseRadarPreview = useCallback(() => setRadarPreviewTarget(null), []);

  const syncRadarPilot = useCallback(async (stateForSync = null) => {
    const state = stateForSync || radarStateRef.current;
    if (!radarPilotClientEnabled || radarAuthority !== "account-cache" || !remoteKontoAktiv) {
      setRadarPilotSyncStatus("disabled");
      return { status: "disabled", state };
    }
    setRadarPilotSyncStatus("syncing");
    try {
      const status = await radarPilotService.sync({
        state,
        commit: (next) => setRadarState(next),
      });
      setRadarPilotSyncStatus(status?.status || "pending");
      return status;
    } catch {
      setRadarPilotSyncStatus("pending");
      return { status: "pending", state, reason: "pilot-unknown" };
    }
  }, [radarPilotClientEnabled, radarAuthority, remoteKontoAktiv, radarStateRef, setRadarState]);

  useEffect(() => {
    if (!bootDone) {
      return undefined;
    }
    let aktiv = true;
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
        setRadarState(decoded.state);
        if (!radarPilotClientEnabled || radarAuthority !== "account-cache" || !remoteKontoAktiv) return;
        setRadarPilotSyncStatus("syncing");
        try {
          const status = await radarPilotService.sync({
            state: decoded.state,
            commit: (next) => (aktiv ? setRadarState(next) : false),
          });
          if (!aktiv) return;
          setRadarPilotSyncStatus(status?.status || "pending");
        } catch {
          if (aktiv) setRadarPilotSyncStatus("pending");
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
  }, [bootDone, radarAuthority, session.account?.id, setRadarState, setErr]);

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
    title: entry?.titleGroup?.displayName || localRadarTargetLabel(entry, {
      master: master || [], streamingKnown, streamingDiscover,
    }),
    canonical: true,
    ...(entry?.titleGroup ? { titleGroup: entry.titleGroup } : {}),
  }), [master, streamingKnown, streamingDiscover]);

  const aendereRadar = useCallback(async (targetOrEntry, action = "upsert") => {
    if (radarAuthority === "account-cache" && !remoteKontoAktiv) {
      setErr("Radar-Änderungen im Kontomodus brauchen einen fachlich aktiven Kontozugriff. Es wurde nichts verändert.");
      return false;
    }
    const target = targetOrEntry?.targetStatus ? targetOrEntry : radarTargetAusEintrag(targetOrEntry || {});
    let grund = "radar-change-invalid";
    const gespeichert = await schreibeRadarState((prev) => {
      if (prev.authority !== radarAuthority) { grund = "authority-mismatch"; return null; }
      const result = prev.authority === "guest"
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
      void syncRadarPilot(gespeichert);
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

  /* Die kuratierte lokale Suche und das kontogebundene Vormerken sind keine
     Providerfreigabe. Ein aktives personalAi-Konto darf deshalb ein starkes
     Personenziel lokal in die Outbox legen, auch wenn der Build die spätere
     Online-Bestätigung noch sperrt. Der Netzwerkpfad bleibt unten am Flag. */
  const personRadarAvailable = radarAuthority === "guest"
    || (remoteKontoAktiv && session?.capabilities?.personalAi === true);
  const personRadarCheckAvailable = !RADAR_WEBSEARCH_SINGLE_FILE_DISABLED
    && radarAuthority === "account-cache" && remoteKontoAktiv
    && radarPilotClientEnabled && radarState?.pilot?.status === "ready"
    && radarState.pilot.radarReview === true
    && typeof personRadarAdapter?.checkPersonNow === "function";

  const fuegePersonRadarHinzu = useCallback(async (selected = {}) => {
    if (!personRadarAvailable) return Object.freeze({ status: "unavailable", writes: 0 });
    const resolved = findPersonRadarCatalogIdentity(selected);
    const checked = validatePersonIdentity(resolved);
    if (!resolved || !checked.ok) {
      return Object.freeze({ status: "unresolved", writes: 0 });
    }
    const identity = Object.freeze({
      personExternalId: resolved.personExternalId,
      name: resolved.name,
      role: resolved.role,
      canonical: true,
    });
    let reason = "person-subscription-invalid";
    const targetId = createPersonRadarTargetId(identity.personExternalId, identity.role);
    const saved = await schreibeRadarState((previous) => {
      const result = previous.authority === "guest"
        ? upsertGuestPersonRadarSubscription(previous, { identity })
        : queueAccountPersonRadarChange(previous, {
          operationId: neueLokaleOperationId(), action: "upsert", identity, targetId,
        });
      reason = result.reason;
      return result.ok ? result.state : null;
    });
    if (saved === false) return Object.freeze({ status: reason === "outbox-person-invalid" ? "unresolved" : "storage_error", writes: 0 });
    if (radarAuthority === "guest") return Object.freeze({ status: "active", writes: 1, identity });
    if (!radarPilotClientEnabled) return Object.freeze({ status: "pending", writes: 1, identity });
    const synced = await syncRadarPilot(saved);
    const active = (synced?.state?.personSubscriptions || []).some((entry) => (
      entry.personExternalId === identity.personExternalId && entry.role === identity.role && entry.status === "active"
    ));
    return Object.freeze({ status: active ? "active" : "unavailable", writes: active ? 1 : 0, identity });
  }, [personRadarAvailable, radarAuthority, schreibeRadarState, syncRadarPilot]);

  const aenderePersonRadar = useCallback(async (identity, action) => {
    if (!personRadarAvailable) return Object.freeze({ status: "unavailable", writes: 0 });
    const canonical = findPersonRadarCatalogIdentity({
      targetId: createPersonRadarTargetId(identity?.personExternalId, identity?.role),
      personExternalId: identity?.personExternalId,
      name: identity?.name,
      role: identity?.role,
    });
    if (!canonical) return Object.freeze({ status: "unresolved", writes: 0 });
    let reason = "person-subscription-invalid";
    const saved = await schreibeRadarState((previous) => {
      const result = previous.authority === "guest"
        ? action === "remove"
          ? removeGuestPersonRadarSubscription(previous, canonical)
          : setGuestPersonRadarSubscriptionStatus(previous, canonical, action === "pause" ? "paused" : "active")
        : queueAccountPersonRadarChange(previous, {
          operationId: neueLokaleOperationId(), action, identity: canonical, targetId: canonical.targetId,
        });
      reason = result.reason;
      return result.ok ? result.state : null;
    });
    if (saved === false) return Object.freeze({ status: reason === "outbox-person-invalid" ? "unresolved" : "storage_error", writes: 0 });
    if (radarAuthority === "account-cache" && radarPilotClientEnabled) await syncRadarPilot(saved);
    return Object.freeze({
      status: radarAuthority === "account-cache" && !radarPilotClientEnabled
        ? "pending" : action === "remove" ? "removed" : action === "pause" ? "paused" : "active",
      writes: 1,
    });
  }, [personRadarAvailable, radarAuthority, radarPilotClientEnabled, schreibeRadarState, syncRadarPilot]);

  const fuehrePersonRadarCheck = useCallback(async (identity) => {
    const state = radarStateRef.current;
    const matches = (state?.personSubscriptions || []).filter((entry) => (
      entry.personExternalId === identity?.personExternalId && entry.role === identity?.role && entry.status === "active"
    ));
    if (!personRadarCheckAvailable || matches.length !== 1) {
      return Object.freeze({ status: "forbidden", writes: 0 });
    }
    let serviceResult;
    try {
      serviceResult = await personRadarAdapter.checkPersonNow(Object.freeze({
        targetId: createPersonRadarTargetId(matches[0].personExternalId, matches[0].role),
        personExternalId: matches[0].personExternalId,
        name: matches[0].name,
        role: matches[0].role,
        canonical: true,
      }));
    } catch { return Object.freeze({ status: "provider_error", writes: 0 }); }
    if (!serviceResult?.personResult) {
      return Object.freeze({ status: serviceResult?.status || "invalid_response", writes: 0 });
    }
    const synced = await syncRadarPilot(radarStateRef.current);
    if (synced?.status !== "ready") {
      return Object.freeze({ status: "storage_error", writes: 0 });
    }
    const visible = (synced.state?.personResults || []).find((entry) => (
      entry.personExternalId === matches[0].personExternalId && entry.role === matches[0].role
    ));
    if (serviceResult.status === "confirmed" && !visible?.decisions?.length) {
      return Object.freeze({ status: "storage_error", writes: 0 });
    }
    return Object.freeze({ status: serviceResult.status, writes: serviceResult.writes });
  }, [personRadarAdapter, personRadarCheckAvailable, radarStateRef, syncRadarPilot]);

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

  const fuehreRadarWebsearchCheck = useCallback(async (targetId) => {
    let state = radarStateRef.current;
    let activeMatches = (state?.subscriptions || []).filter((entry) => (
      entry.targetId === targetId && entry.status === "active"
    ));
    const hasPendingTargetChange = (state?.outbox || []).some((entry) => (
      entry.targetId === targetId && entry.status === "pending"
    ));
    if (!radarPilotClientEnabled || !remoteKontoAktiv || radarAuthority !== "account-cache"
        || state?.authority !== "account-cache" || state?.pilot?.status !== "ready"
        || state?.pilot?.radarReview !== true || activeMatches.length !== 1
        || hasPendingTargetChange) {
      return Object.freeze({ status: "forbidden", writes: 0 });
    }

    const activeTarget = activeMatches[0];
    if (activeTarget?.targetType === "franchise" && activeTarget?.titleGroup) {
      const currentCatalog = createRadarCatalogIndex({
        master: master || [], streamingKnown, streamingDiscover,
      });
      const resolved = resolveTitleGroupRadarTarget(radarTargetAusEintrag(activeTarget), currentCatalog);
      if (resolved.status !== "ready" || resolved.target?.targetId !== targetId) {
        return Object.freeze({ status: "forbidden", writes: 0, reason: "title-group-unavailable" });
      }
      if (JSON.stringify(resolved.target.titleGroup) !== JSON.stringify(activeTarget.titleGroup)) {
        const operationId = neueLokaleOperationId();
        const saved = await schreibeRadarState((previous) => {
          if (previous.authority !== "account-cache"
              || (previous.outbox || []).some((entry) => (
                entry.targetId === targetId && entry.status === "pending"
              ))) return null;
          const queued = queueAccountRadarChange(previous, {
            operationId, action: "upsert", target: resolved.target,
          });
          return queued.ok ? queued.state : null;
        });
        if (saved === false) {
          return Object.freeze({ status: "storage_error", writes: 0, reason: "title-group-refresh-not-queued" });
        }
        const synced = await syncRadarPilot(saved);
        state = synced?.state;
        activeMatches = (state?.subscriptions || []).filter((entry) => (
          entry.targetId === targetId && entry.status === "active"
        ));
        const refreshed = activeMatches.length === 1
          && JSON.stringify(activeMatches[0].titleGroup) === JSON.stringify(resolved.target.titleGroup);
        const stillPending = (state?.outbox || []).some((entry) => (
          entry.targetId === targetId && entry.status === "pending"
        ));
        if (synced?.status !== "ready" || !refreshed || stillPending) {
          return Object.freeze({ status: "pending", writes: 0, reason: "title-group-refresh-pending" });
        }
      }
    }
    const result = await radarWebsearchService.checkNow(targetId);
    if (["confirmed", "insufficient_evidence", "no_change"].includes(result?.status)) {
      await syncRadarPilot();
    }
    return result;
  }, [
    radarAuthority,
    radarPilotClientEnabled,
    radarStateRef,
    remoteKontoAktiv,
    master,
    streamingKnown,
    streamingDiscover,
    radarTargetAusEintrag,
    schreibeRadarState,
    syncRadarPilot,
  ]);

  const bestaetigeRadarVorschau = useCallback(async (targetOrTargets, { shareEnabled = false } = {}) => {
    if (radarAuthority === "account-cache" && !remoteKontoAktiv) {
      setErr("Radar-Änderungen im Kontomodus brauchen einen fachlich aktiven Kontozugriff.");
      return false;
    }
    const requestedTargets = Array.isArray(targetOrTargets) ? targetOrTargets : [targetOrTargets];
    const targets = requestedTargets
      .filter((target) => target?.targetStatus === "active" && target?.canonical === true && target?.targetId);
    const uniqueTargets = [...new Map(targets.map((target) => [target.targetId, target])).values()];
    if (!uniqueTargets.length || targets.length !== requestedTargets.length || uniqueTargets.length !== targets.length) {
      setErr("Die Radar-Auswahl ist nicht eindeutig. Es wurde nichts verändert.");
      return false;
    }
    let grund = "radar-change-invalid";
    const gespeichert = await schreibeRadarState((previous) => {
      if (previous.authority !== radarAuthority) { grund = "authority-mismatch"; return null; }
      let next = previous;
      for (const target of uniqueTargets) {
        const bereitsAktiv = (next.subscriptions || []).some((entry) => (
          entry.targetId === target.targetId && entry.status === "active"
        ));
        if (bereitsAktiv) continue;
        const result = next.authority === "guest"
          ? upsertGuestRadarSubscription(next, { target, status: "active" })
          : queueAccountRadarChange(next, {
            operationId: neueLokaleOperationId(), action: "upsert", target,
          });
        grund = result.reason;
        if (!result.ok) return null;
        next = result.state;
      }
      return next;
    });
    if (gespeichert === false) {
      setErr(grund === "quota-exceeded"
        ? "Für diese Auswahl sind nicht genug freie Radarplätze vorhanden. Es wurde kein Titel übernommen."
        : "Die Radar-Auswahl wurde nicht bestätigt gespeichert. Es wurde kein Titel übernommen.");
      return false;
    }
    if (radarPilotClientEnabled && radarAuthority === "account-cache" && remoteKontoAktiv) {
      void syncRadarPilot(gespeichert);
    }
    if (shareEnabled && uniqueTargets.length === 1
        && !await aendereRadarShare(uniqueTargets[0].targetId, true)) return false;
    return true;
  }, [aendereRadarShare, radarAuthority, radarPilotClientEnabled, remoteKontoAktiv,
    schreibeRadarState, setErr, syncRadarPilot]);

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
  const radarPilotProjection = useMemo(() => projectEntdeckenRadarPilot({
    clientEnabled: runtimeConfig.radarPilotClientEnabled,
    radarAuthority,
    radarState: sichtbarerRadarState,
  }), [radarAuthority, sichtbarerRadarState]);
  const radarCheckAvailable = !RADAR_WEBSEARCH_SINGLE_FILE_DISABLED
    && remoteKontoAktiv && radarAuthority === "account-cache"
    && radarPilotProjection.active === true && radarPilotProjection.radarReview === true;
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
    radarCheckAvailable,
    radarPilotSyncStatus,
    setRadarPreviewTarget,
    schliesseRadarPreview,
    aendereSerienBeobachtung,
    aendereRadar,
    aendereRadarShare,
    bestaetigeRadarVorschau,
    beobachteteWatchmodeIds,
    radarTargetIds,
    fuehreRadarPilotReceipt,
    fuehreRadarPilotImport,
    fuehreRadarPilotSync,
    fuehreRadarWebsearchCheck,
    personRadarAvailable,
    personRadarCheckAvailable,
    fuegePersonRadarHinzu,
    aenderePersonRadar,
    fuehrePersonRadarCheck,
    fuehreGlobaleSuchaktionAus,
  };
}
