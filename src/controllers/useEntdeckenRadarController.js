import { useCallback, useEffect, useMemo, useState } from "react";
import { runtimeConfig } from "../config/runtime.js";
import { K, store } from "../services/storage.js";
import { useConfirmedStorageState } from "./useConfirmedStorageState.js";
import {
  applyPersonRadarCheckResult,
  createEmptyLocalRadar,
  decodeLocalRadar,
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
import { createCatalogRadarTarget, localRadarTargetLabel } from "../lib/entdeckenUi.js";
import { validatePersonIdentity } from "../lib/personDiscoveryContracts.js";
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
  personRadarAdapter = null,
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
    title: localRadarTargetLabel(entry, {
      master: master || [], streamingKnown, streamingDiscover,
    }),
    canonical: true,
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

  const personRadarCatalog = useMemo(() => {
    const rows = [
      ...(Array.isArray(master) ? master.map((entry) => ({
        watchmodeId: entry.watchmode_id,
        catalogId: entry.id,
        title: entry.titel,
        type: entry.typ,
        year: Number(entry.jahr),
      })) : []),
      ...[...(streamingKnown?.titel || []), ...(streamingDiscover?.titel || [])].map((entry) => ({
        watchmodeId: entry.watchmode_id,
        title: entry.titel,
        type: entry.typ,
        year: Number(entry.jahr),
      })),
    ];
    const byId = new Map();
    for (const row of rows) {
      const target = createCatalogRadarTarget(row);
      if (!target || !Number.isInteger(row.year) || byId.has(target.targetId)) continue;
      byId.set(target.targetId, Object.freeze({
        targetId: target.targetId, targetType: target.targetType, title: target.title, year: row.year,
      }));
    }
    return Object.freeze([...byId.values()]);
  }, [master, streamingDiscover, streamingKnown]);

  const personRadarAvailable = radarAuthority === "guest"
    && typeof personRadarAdapter?.resolve === "function"
    && typeof personRadarAdapter?.check === "function";

  const fuegePersonRadarHinzu = useCallback(async ({ name, role } = {}) => {
    if (!personRadarAvailable) return Object.freeze({ status: "unavailable", writes: 0 });
    let resolved;
    try { resolved = await personRadarAdapter.resolve({ name: String(name || "").trim(), role }); }
    catch { return Object.freeze({ status: "provider_error", writes: 0 }); }
    const checked = validatePersonIdentity(resolved);
    if (!checked.ok || resolved.name !== String(name || "").trim() || resolved.role !== role) {
      return Object.freeze({ status: "unresolved", writes: 0 });
    }
    const identity = Object.freeze({
      personExternalId: resolved.personExternalId,
      name: resolved.name,
      role: resolved.role,
      canonical: true,
    });
    const saved = await schreibeRadarState((previous) => {
      const result = upsertGuestPersonRadarSubscription(previous, { identity });
      return result.ok ? result.state : null;
    });
    return Object.freeze(saved === false
      ? { status: "storage_error", writes: 0 }
      : { status: "active", writes: 1, identity });
  }, [personRadarAdapter, personRadarAvailable, schreibeRadarState]);

  const aenderePersonRadar = useCallback(async (identity, action) => {
    if (radarAuthority !== "guest") return Object.freeze({ status: "unavailable", writes: 0 });
    const saved = await schreibeRadarState((previous) => {
      const result = action === "remove"
        ? removeGuestPersonRadarSubscription(previous, identity)
        : setGuestPersonRadarSubscriptionStatus(previous, identity, action === "pause" ? "paused" : "active");
      return result.ok ? result.state : null;
    });
    return Object.freeze(saved === false
      ? { status: "storage_error", writes: 0 }
      : { status: action === "remove" ? "removed" : action === "pause" ? "paused" : "active", writes: 1 });
  }, [radarAuthority, schreibeRadarState]);

  const fuehrePersonRadarCheck = useCallback(async (identity) => {
    const state = radarStateRef.current;
    const matches = (state?.personSubscriptions || []).filter((entry) => (
      entry.personExternalId === identity?.personExternalId && entry.role === identity?.role && entry.status === "active"
    ));
    if (!personRadarAvailable || matches.length !== 1) {
      return Object.freeze({ status: "forbidden", writes: 0 });
    }
    let response;
    try {
      response = await personRadarAdapter.check(Object.freeze({
        personExternalId: matches[0].personExternalId,
        name: matches[0].name,
        role: matches[0].role,
        canonical: true,
      }));
    } catch { return Object.freeze({ status: "provider_error", writes: 0 }); }
    let reason = "person-check-invalid";
    const saved = await schreibeRadarState((previous) => {
      const result = applyPersonRadarCheckResult(previous, {
        identity: matches[0], response, catalog: personRadarCatalog,
      });
      reason = result.reason;
      return result.ok ? result.state : null;
    });
    if (saved === false) {
      return Object.freeze({ status: reason === "person-check-invalid" ? "invalid_response" : "storage_error", writes: 0 });
    }
    return Object.freeze({ status: reason, writes: 1 });
  }, [personRadarAdapter, personRadarAvailable, personRadarCatalog, radarStateRef, schreibeRadarState]);

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
    const state = radarStateRef.current;
    const activeMatches = (state?.subscriptions || []).filter((entry) => (
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
    syncRadarPilot,
  ]);

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
    fuegePersonRadarHinzu,
    aenderePersonRadar,
    fuehrePersonRadarCheck,
    fuehreGlobaleSuchaktionAus,
  };
}
