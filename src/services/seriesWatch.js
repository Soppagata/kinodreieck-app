/* Serverseitige Beobachtungsliste für den bestehenden Kataloglauf.
   Sie synchronisiert ausschließlich Watchmode-IDs; persönliche Titel/Notizen
   verbleiben im Wochenplan-Topf. Der Aufruf selbst fragt keinen Anbieter ab. */
import { authDriver } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import { istSupabaseProjektUrl, publicSupabaseHeaders } from "../lib/supabasePublic.js";
import { normalizeBoundaryError } from "./errors.js";

export function normalisiereBeobachteteIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(Number)
    .filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b).slice(0, 200);
}

export function createSeriesWatchService({
  config = runtimeConfig,
  getAccessToken = (opts) => authDriver.getAccessToken(opts),
  getAccountId = () => authDriver.konto()?.id || null,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  return Object.freeze({
    async setObserved(ids, expectedAccountId = null) {
      const watchmodeIds = normalisiereBeobachteteIds(ids);
      if (!istSupabaseProjektUrl(config.supabaseUrl) || !config.supabasePublishableKey) {
        return { ok: false, reason: "not-configured", ids: watchmodeIds };
      }
      const gebunden = expectedAccountId == null ? null : String(expectedAccountId);
      const token = await getAccessToken({
        minValiditySeconds: 30,
        erwarteteKontoId: gebunden,
      });
      if (!token) return { ok: false, reason: "unauthenticated", ids: watchmodeIds };
      if (gebunden && String(getAccountId?.() || "") !== gebunden) {
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
        if (gebunden && String(getAccountId?.() || "") !== gebunden) {
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
