import { useCallback, useEffect, useMemo, useState } from "react";
import { runtimeConfig } from "../config/runtime.js";
import { K, store } from "../services/storage.js";
import { useConfirmedStorageState } from "./useConfirmedStorageState.js";
import {
  changeLocalTextRadarSubscription,
  createEmptyLocalRadar,
  decodeLocalRadar,
  discardRejectedAccountRadarChange,
  queueAccountPersonRadarChange,
  queueAccountRadarChange,
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
import { projectVisibleRadarWebsearchEvents, validateRadarWebsearchTarget } from "../lib/radarWebsearchFlow.js";
import {
  CANONICAL_FRANCHISE_RADAR_CATALOG,
  resolveCanonicalFranchiseRadarInput,
  resolveCanonicalFranchiseRadarTarget,
  validateTitleGroupMetadata,
} from "../lib/titleGroupRadar.js";
import { istBeobachtet, serienBeobachten, setzeSerienBeobachtung } from "../lib/staffeln.js";
import { radarPilotService } from "../services/radarPilot.js";
import { RADAR_WEBSEARCH_SINGLE_FILE_DISABLED } from "../services/radarWebsearch.js";

export { projectEntdeckenRadarPilot } from "../lib/radarPilotContracts.js";

function neueLokaleOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (zeichen) => (
    (Number(zeichen) ^ Math.random() * 16 >> Number(zeichen) / 4).toString(16)
  ));
}

function katalogFranchiseId(entry) {
  const direct = String(entry?.franchise_id || entry?.franchiseId || "").trim();
  if (direct) return direct;
  for (const raw of Array.isArray(entry?.relevanz_signale) ? entry.relevanz_signale : []) {
    const core = String(raw || "").trim().replace(/\([^)]*\)\s*$/, "");
    const splitAt = core.indexOf(":");
    if (splitAt > 0 && core.slice(0, splitAt).trim().toLowerCase() === "franchise") {
      return core.slice(splitAt + 1).trim() || null;
    }
  }
  for (const item of Array.isArray(entry?.attribute) ? entry.attribute : []) {
    const kind = String(item?.art || item?.kind || item?.type || "").trim().toLowerCase();
    if (kind === "franchise") return String(item?.wert || item?.value || item?.name || "").trim() || null;
  }
  return null;
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
  radarPilotEnabled = runtimeConfig.radarPilotClientEnabled,
  franchiseRadarResolver = resolveCanonicalFranchiseRadarTarget,
}) {
  const radarAuthority = session.mode === "account" ? "account-cache" : "guest";
  const radarPilotClientEnabled = radarPilotEnabled === true;
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
        commit: (next) => setRadarState(next),
      });
      setRadarPilotSyncStatus(status?.status || "pending");
      setRadarAutomationAttestation(
        status?.status === "ready" && radarAutomationAttested(status.automation, { allowInactive: true })
          ? status.automation : null,
      );
      return status;
    } catch {
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
        setRadarState(decoded.state);
        if (!radarPilotClientEnabled || radarAuthority !== "account-cache" || !remoteKontoAktiv) return;
        setRadarPilotSyncStatus("syncing");
        try {
          const status = await radarPilotAdapter.sync({
            state: decoded.state,
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
    remoteKontoAktiv, session.account?.id, setRadarState, setErr]);

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
        ? changeLocalTextRadarSubscription(prev, { targetText: targetOrEntry.targetText, action })
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
      !textTarget && radarPilotClientEnabled && radarAuthority === "account-cache" && remoteKontoAktiv
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

  const fuegeRadarFreitextHinzu = useCallback(async (targetText) => {
    let reason = "text-subscription-invalid";
    const saved = await schreibeRadarState((previous) => {
      if (previous.authority !== radarAuthority) { reason = "authority-mismatch"; return null; }
      const result = changeLocalTextRadarSubscription(previous, { targetText, action: "upsert" });
      reason = result.reason;
      return result.ok ? result.state : null;
    });
    if (saved !== false) return Object.freeze({ status: "active", writes: 1 });
    if (reason === "quota-exceeded") {
      setErr("Dein lokaler Radar hat bereits zehn aktive Ziele. Pausiere oder entferne zuerst eines.");
    }
    return Object.freeze({ status: reason === "quota-exceeded" ? "forbidden" : "storage_error", writes: 0 });
  }, [radarAuthority, schreibeRadarState, setErr]);

  const personRadarCatalog = useMemo(() => {
    const rows = [
      ...(Array.isArray(master) ? master.map((entry) => ({
        watchmodeId: entry.watchmode_id,
        catalogId: entry.id,
        title: entry.titel,
        type: entry.typ,
        year: Number(entry.jahr),
        franchiseId: katalogFranchiseId(entry),
      })) : []),
      ...[...(streamingKnown?.titel || []), ...(streamingDiscover?.titel || [])].map((entry) => ({
        watchmodeId: entry.watchmode_id,
        title: entry.titel,
        type: entry.typ,
        year: Number(entry.jahr),
        franchiseId: katalogFranchiseId(entry),
      })),
    ];
    const byId = new Map();
    for (const row of rows) {
      const target = createCatalogRadarTarget(row);
      if (!target || !Number.isInteger(row.year) || byId.has(target.targetId)) continue;
      byId.set(target.targetId, Object.freeze({
        targetId: target.targetId, targetType: target.targetType, title: target.title, year: row.year,
        franchiseId: row.franchiseId,
      }));
    }
    return Object.freeze([...byId.values()]);
  }, [master, streamingDiscover, streamingKnown]);

  const localPersonRadarAvailable = localRadarWebsearchAvailable
    && typeof radarWebsearchExecutor?.resolvePerson === "function";
  const accountRadarServerAvailable = !RADAR_WEBSEARCH_SINGLE_FILE_DISABLED
    && radarAuthority === "account-cache" && remoteKontoAktiv
    && radarPilotClientEnabled;
  const personRadarAvailable = localPersonRadarAvailable
    || (accountRadarServerAvailable && session?.capabilities?.personalAi === true);
  const franchiseRadarAvailable = (localRadarWebsearchAvailable
    && typeof radarWebsearchExecutor?.resolveFranchise === "function")
    || (accountRadarServerAvailable && typeof franchiseRadarResolver === "function");

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

  const fuegeFranchiseRadarHinzu = useCallback(async ({ name, franchiseId = null, targetId = null } = {}) => {
    const requestedName = String(name || "").trim();
    if (!franchiseRadarAvailable || !requestedName) {
      return Object.freeze({ status: "unavailable", writes: 0 });
    }
    let resolved;
    try {
      resolved = localRadarWebsearchAvailable
        ? await radarWebsearchExecutor.resolveFranchise({ name: requestedName })
        : franchiseRadarResolver({ name: requestedName, catalog: personRadarCatalog });
    }
    catch { return Object.freeze({ status: "provider_error", writes: 0 }); }
    const franchise = localRadarWebsearchAvailable ? resolved : resolved?.franchise;
    const target = localRadarWebsearchAvailable ? Object.freeze({
      targetId: franchise?.franchiseId,
      targetType: "franchise",
      targetStatus: "active",
      title: franchise?.title,
      canonical: true,
    }) : resolved?.target;
    const checked = validateRadarWebsearchTarget(franchise);
    const serverTargetValid = localRadarWebsearchAvailable || (
      resolved?.status === "ready" && target?.targetType === "franchise"
      && validateTitleGroupMetadata(target.titleGroup, { targetId: target.targetId, title: target.title })
    );
    const requestedTargetValid = targetId == null || (localRadarWebsearchAvailable
      ? CANONICAL_FRANCHISE_RADAR_CATALOG.some((entry) => (
        entry.targetId === targetId
        && entry.franchiseId === franchise?.franchiseId
        && entry.title === franchise?.title
        && entry.aliases.some((alias) => alias.localeCompare(requestedName, "de-AT", { sensitivity: "base" }) === 0)
      ))
      : target?.targetId === targetId);
    if (!checked.ok || franchise.kind !== "franchise" || !serverTargetValid
        || (franchiseId != null && franchise.franchiseId !== franchiseId)
        || !requestedTargetValid
        || !franchise.aliases.some((alias) => alias.localeCompare(requestedName, "de-AT", { sensitivity: "base" }) === 0)) {
      return Object.freeze({ status: resolved?.status === "unavailable" ? "unavailable" : "unresolved", writes: 0 });
    }
    const saved = await aendereRadar(target, "upsert");
    const active = saved && (radarStateRef.current?.subscriptions || []).some((entry) => (
      entry.targetId === target.targetId && entry.status === "active"
    ));
    return Object.freeze(saved
      ? { status: active || radarAuthority === "guest" ? "active" : "pending", writes: 1, target: franchise }
      : { status: "storage_error", writes: 0 });
  }, [aendereRadar, franchiseRadarAvailable, franchiseRadarResolver, localRadarWebsearchAvailable,
    personRadarCatalog, radarAuthority, radarStateRef, radarWebsearchExecutor]);

  const fuegeRadarTextHinzu = useCallback(async (targetText) => {
    const canonical = resolveCanonicalFranchiseRadarInput(targetText);
    if (canonical && franchiseRadarAvailable) {
      const result = await fuegeFranchiseRadarHinzu(canonical);
      if (!["unavailable", "unresolved", "provider_error", "forbidden"].includes(result?.status)) return result;
    }
    return fuegeRadarFreitextHinzu(targetText);
  }, [franchiseRadarAvailable, fuegeFranchiseRadarHinzu, fuegeRadarFreitextHinzu]);

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
    fuegeFranchiseRadarHinzu,
    personRadarAvailable,
    fuegePersonRadarHinzu,
    aenderePersonRadar,
    fuehreGlobaleSuchaktionAus,
  };
}
