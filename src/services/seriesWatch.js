/* Serverseitige Beobachtungsliste für den bestehenden Kataloglauf.
   Sie synchronisiert ausschließlich Watchmode-IDs; persönliche Titel/Notizen
   verbleiben im Wochenplan-Topf. Der Aufruf selbst fragt keinen Anbieter ab.
   Rollen-v1 härtet ausschließlich den Zugriff: Daraus entstehen weder Radar-
   Regeln noch automatische Geschmackspräferenzen. */
import { authDriver, authService } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import { istSupabaseProjektUrl, publicSupabaseHeaders } from "../lib/supabasePublic.js";
import { normalizeBoundaryError } from "./errors.js";

export function normalisiereBeobachteteIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(Number)
    .filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b).slice(0, 200);
}

export function createSeriesWatchService({
  config = runtimeConfig,
  getSession = () => authService.getSnapshot(),
  getAccessToken = (opts) => authDriver.getAccessToken(opts),
  getAccountId = () => authDriver.konto()?.id || null,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  function remoteKonto() {
    let snapshot = null;
    try { snapshot = getSession?.(); } catch { return { ok: false, reason: "access-unavailable" }; }
    const id = String(snapshot?.account?.id || "").trim();
    if (snapshot?.mode !== "account" || !id) return { ok: false, reason: "unauthenticated" };
    if (snapshot?.state !== "ready" || snapshot?.capabilities?.remoteStorage !== true) {
      return { ok: false, reason: "forbidden" };
    }
    return { ok: true, id };
  }

  return Object.freeze({
    async setObserved(ids, expectedAccountId = null) {
      const watchmodeIds = normalisiereBeobachteteIds(ids);
      if (!istSupabaseProjektUrl(config.supabaseUrl) || !config.supabasePublishableKey) {
        return { ok: false, reason: "not-configured", ids: watchmodeIds };
      }
      const kontoVorher = remoteKonto();
      if (!kontoVorher.ok) return { ok: false, reason: kontoVorher.reason, ids: watchmodeIds };
      const gebunden = expectedAccountId == null ? kontoVorher.id : String(expectedAccountId);
      if (gebunden !== kontoVorher.id) {
        return { ok: false, reason: "account-changed", ids: watchmodeIds };
      }
      const gespeicherteKontoId = String(getAccountId?.() || "");
      if (gespeicherteKontoId && gespeicherteKontoId !== gebunden) {
        return { ok: false, reason: "account-changed", ids: watchmodeIds };
      }
      const token = await getAccessToken({
        minValiditySeconds: 30,
        erwarteteKontoId: gebunden,
      });
      if (!token) return { ok: false, reason: "unauthenticated", ids: watchmodeIds };
      const kontoNachToken = remoteKonto();
      if (!kontoNachToken.ok) {
        return { ok: false, reason: kontoNachToken.reason, ids: watchmodeIds };
      }
      if (kontoNachToken.id !== gebunden
          || (getAccountId?.() && String(getAccountId()) !== gebunden)) {
        return { ok: false, reason: "account-changed", ids: watchmodeIds };
      }
      try {
        const res = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/kd_set_series_watch`, {
          method: "POST",
          headers: {
            ...publicSupabaseHeaders(config.supabasePublishableKey),
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_watchmode_ids: watchmodeIds }),
        });
        const kontoNachRequest = remoteKonto();
        if (!kontoNachRequest.ok) {
          return { ok: false, reason: kontoNachRequest.reason, ids: watchmodeIds };
        }
        if (kontoNachRequest.id !== gebunden
            || (getAccountId?.() && String(getAccountId()) !== gebunden)) {
          return { ok: false, reason: "account-changed", ids: watchmodeIds };
        }
        if (!res.ok) throw Object.assign(new Error("Beobachtungsliste konnte nicht synchronisiert werden."), { status: res.status });
        return { ok: true, ids: watchmodeIds };
      } catch (error) {
        throw normalizeBoundaryError(error, { source: "series-watch", operation: "observed.set" });
      }
    },
  });
}

export const seriesWatchService = createSeriesWatchService();
