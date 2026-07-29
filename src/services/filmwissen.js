import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";
import { BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError } from "./errors.js";
import { FILMWISSEN_STATUS, dekodiereFilmwissen, filmwissenKennungen, filmwissenSonderstatus } from "../lib/filmwissen.js";
import { createFilmwissenTransport } from "../lib/filmwissenTransport.js";
const kontoVon = (s) => s?.mode === "account" && s?.state === "ready" ? s.account?.id || null : null;
export function createFilmwissenService({ auth = authService, transport } = {}) {
  const offen = new Map(); let generation = 0; let konto = kontoVon(auth.getSnapshot?.());
  const unsubscribe = auth.subscribe?.((s) => {
    const neu = kontoVon(s); if (neu !== konto) { konto = neu; generation++; offen.clear(); }
  }) || (() => {});
  async function read(film, options = {}) {
    const ids = filmwissenKennungen(film);
    if (!ids.length) return filmwissenSonderstatus(FILMWISSEN_STATUS.NICHT_ZUORDENBAR);
    const accountId = auth.requireAccount().account.id; const start = generation;
    const key = accountId + "|" + ids.map((x) => x.namespace + ":" + x.kennung).join("|");
    if (offen.has(key)) return offen.get(key);
    const promise = (async () => {
      try {
        let miss = null;
        for (const id of ids) {
          const result = await transport({ ...id, signal: options.signal });
          if (!result?.ok) {
            if (result?.grund === "abgebrochen") throw new BoundaryError(ERROR_CODES.OFFLINE, { source: "filmwissen", operation: "read", reason: "abgebrochen" });
            if (!result?.status) throw new BoundaryError(ERROR_CODES.OFFLINE, { source: "filmwissen", operation: "read", reason: result?.grund || "netzwerk" });
            throw errorFromStatus(result?.status || 0, { source: "filmwissen", operation: "read", reason: result?.grund });
          }
          const data = dekodiereFilmwissen(result.data);
          if (generation !== start || kontoVon(auth.getSnapshot?.()) !== accountId) return filmwissenSonderstatus(FILMWISSEN_STATUS.VERALTET);
          if (data.status !== FILMWISSEN_STATUS.CACHE_MISS) return data;
          miss = data;
        }
        return miss || filmwissenSonderstatus(FILMWISSEN_STATUS.CACHE_MISS);
      } catch (error) {
        if (error instanceof BoundaryError) throw error;
        throw normalizeBoundaryError(error, { source: "filmwissen", operation: "read" });
      } finally { offen.delete(key); }
    })();
    offen.set(key, promise); return promise;
  }
  return Object.freeze({ read, invalidate() { generation++; offen.clear(); },
    dispose() { generation++; offen.clear(); unsubscribe(); } });
}
export const filmwissenService = createFilmwissenService({ transport: createFilmwissenTransport({
  config: runtimeConfig, getAccessToken: (opts) => authDriver.getAccessToken(opts),
}) });
