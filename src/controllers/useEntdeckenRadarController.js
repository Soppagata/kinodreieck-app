import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runtimeConfig } from "../config/runtime.js";
import { K, store } from "../services/storage.js";
import { useConfirmedStorageState } from "./useConfirmedStorageState.js";
import {
  createEmptyLocalRadar,
  decodeLocalRadar,
  queueAccountRadarChange,
  queueAccountRadarPilotImport,
  queueAccountRadarPilotReceipt,
  queueAccountRadarShareChange,
  removeGuestRadarSubscription,
  upsertGuestRadarSubscription,
  validateLocalRadarState,
} from "../lib/localEventRadar.js";
import { localRadarTargetLabel } from "../lib/entdeckenUi.js";
import { projectEntdeckenRadarPilot } from "../lib/radarPilotContracts.js";
import { istBeobachtet, serienBeobachten, setzeSerienBeobachtung } from "../lib/staffeln.js";
import { radarPilotService } from "../services/radarPilot.js";

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
}) {
  const radarAuthority = session.mode === "account" ? "account-cache" : "guest";
  const radarPilotClientEnabled = runtimeConfig.radarPilotClientEnabled === true;
  const radarPilotAutoSyncRef = useRef("");
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

  const syncRadarPilot = useCallback(async () => {
    if (!radarPilotClientEnabled || radarAuthority !== "account-cache" || !remoteKontoAktiv) {
      setRadarPilotSyncStatus("disabled");
      return { status: "disabled", state: radarStateRef.current };
    }
    const status = await radarPilotService.sync({
      state: radarStateRef.current,
      commit: (next) => setRadarState(next),
    });
    setRadarPilotSyncStatus(status?.status || "pending");
    return status;
  }, [radarPilotClientEnabled, radarAuthority, remoteKontoAktiv, radarStateRef, setRadarState]);

  useEffect(() => {
    if (!bootDone || radarAuthority !== "account-cache" || !remoteKontoAktiv || !radarPilotClientEnabled) {
      return undefined;
    }
    const signature = `${session.account?.id || ""}|${radarAuthority}`;
    if (radarPilotAutoSyncRef.current === signature) return undefined;
    radarPilotAutoSyncRef.current = signature;
    void syncRadarPilot();
    return undefined;
  }, [bootDone, remoteKontoAktiv, radarAuthority, radarPilotClientEnabled, session.account?.id, syncRadarPilot]);

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
    title: localRadarTargetLabel(entry.targetId, {
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
    if (radarPilotClientEnabled && radarAuthority === "account-cache" && remoteKontoAktiv && gespeichert !== false) {
      void syncRadarPilot();
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
    if (radarPilotClientEnabled && radarAuthority === "account-cache" && remoteKontoAktiv && gespeichert !== false) {
      void syncRadarPilot();
    }
    if (gespeichert !== false) return true;
    setErr(grund === "active-subscription-required"
      ? "Teilen ist erst für ein serverbestätigtes aktives Radarziel möglich."
      : "Die Teilen-Wahl wurde nicht bestätigt gespeichert.");
    return false;
  }, [
    radarAuthority,
    radarPilotClientEnabled,
    remoteKontoAktiv,
    schreibeRadarState,
    setErr,
    syncRadarPilot,
  ]);

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
    await syncRadarPilot();
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
    ) return false;
    const operationId = neueLokaleOperationId();
    const gespeichert = await schreibeRadarState((prev) => {
      const result = queueAccountRadarPilotImport(prev, {
        operationId,
        payload,
        now: new Date().toISOString(),
      });
      return result.ok ? result.state : null;
    });
    if (gespeichert === false) return false;
    await syncRadarPilot();
    return true;
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
    fuehreGlobaleSuchaktionAus,
  };
}
