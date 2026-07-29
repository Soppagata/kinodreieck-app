import { istSupabaseProjektUrl } from "./supabasePublic.js";
export const FILMWISSEN_TIMEOUT_MS = 12000;
export function createFilmwissenTransport({ config, getAccessToken,
  fetchImpl = typeof fetch === "function" ? fetch : null, timeoutMs = FILMWISSEN_TIMEOUT_MS } = {}) {
  return async ({ namespace, kennung, signal } = {}) => {
    const basis = String(config?.supabaseUrl || "").trim().replace(/\/+$/, "");
    if (!istSupabaseProjektUrl(basis) || typeof fetchImpl !== "function") return { ok: false, status: 500, grund: "nicht-konfiguriert" };
    let token = null; try { token = await getAccessToken?.(); } catch { /* leer */ }
    if (!token) return { ok: false, status: 401, grund: "kein-sitzungstoken" };
    const ctrl = new AbortController(); let timeout = false;
    const timer = setTimeout(() => { timeout = true; ctrl.abort(); }, timeoutMs);
    const stop = () => ctrl.abort();
    if (signal?.aborted) ctrl.abort(); else signal?.addEventListener?.("abort", stop, { once: true });
    try {
      const response = await fetchImpl(basis + "/rest/v1/rpc/kd_filmwissen_aktuell_lesen", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", apikey: String(config?.supabasePublishableKey || ""), Authorization: "Bearer " + token },
        body: JSON.stringify({ p_namespace: namespace, p_kennung: kennung }),
      });
      let data = null; try { data = await response.json(); } catch { /* leer */ }
      return response.ok ? { ok: true, status: response.status, data }
        : { ok: false, status: response.status, grund: "rpc-fehler" };
    } catch (error) {
      const abort = error?.name === "AbortError";
      return { ok: false, status: abort && timeout ? 504 : 0,
        grund: abort && timeout ? "zeitgrenze" : abort ? "abgebrochen" : "netzwerk", error };
    } finally { clearTimeout(timer); signal?.removeEventListener?.("abort", stop); }
  };
}
