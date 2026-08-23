import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";
import { BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError } from "./errors.js";
import {
  FILMWISSEN_STATUS, dekodiereFilmwissen, dekodiereFilmwissenEntwurf,
  filmwissenKennungen, filmwissenRechercheKennung,
  filmwissenSonderstatus, mitFilmwissenDarstellung,
} from "../lib/filmwissen.js";
import { createFilmwissenTransport } from "../lib/filmwissenTransport.js";
import { aiService } from "./ai.js";
const kontoVon = (s) => s?.mode === "account" && s?.state === "ready"
  && s?.capabilities?.remoteStorage === true
  ? s.account?.id || null
  : null;
const kiKontoVon = (s) => {
  const accountId = kontoVon(s);
  return accountId && s?.capabilities?.personalAi === true ? accountId : null;
};
export function createFilmwissenService({ auth = authService, transport, ai = aiService } = {}) {
  const offen = new Map(); const rechercheOffen = new Map();
  let generation = 0;
  let konto = kontoVon(auth.getSnapshot?.());
  let kiKonto = kiKontoVon(auth.getSnapshot?.());
  const unsubscribe = auth.subscribe?.((s) => {
    const neu = kontoVon(s);
    const neuKi = kiKontoVon(s);
    if (neu !== konto || neuKi !== kiKonto) {
      konto = neu; kiKonto = neuKi;
      generation++; offen.clear(); rechercheOffen.clear();
    }
  }) || (() => {});
  async function read(film, options = {}) {
    const ids = filmwissenKennungen(film);
    if (!ids.length) return filmwissenSonderstatus(FILMWISSEN_STATUS.NICHT_ZUORDENBAR);
    const accountId = auth.requireAccount("remoteStorage").account.id;
    const start = generation;
    const key = accountId + "|" + ids.map((x) => x.namespace + ":" + x.kennung).join("|");
    if (offen.has(key)) return offen.get(key);
    const promise = (async () => {
      try {
        let miss = null;
        for (const id of ids) {
          const result = await transport({ ...id, signal: options.signal, accountId });
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
  async function recherchiere(film, options = {}) {
    const id = filmwissenRechercheKennung(film);
    if (!id) return filmwissenSonderstatus(FILMWISSEN_STATUS.NICHT_ZUORDENBAR);
    const accountId = auth.requireAccount("personalAi").account.id;
    const start = generation;
    const key = accountId + "|" + id.namespace + ":" + id.kennung;
    if (rechercheOffen.has(key)) return rechercheOffen.get(key);
    const promise = (async () => {
      try {
        const vorhanden = await read(film, options);
        if (![FILMWISSEN_STATUS.CACHE_MISS, FILMWISSEN_STATUS.NICHT_ZUORDENBAR,
          FILMWISSEN_STATUS.VERALTET].includes(vorhanden.status)) {
          return vorhanden;
        }
        if (vorhanden.status === FILMWISSEN_STATUS.VERALTET) return vorhanden;
        /* `read()` und der KI-Start liegen in zwei getrennten Await-Schritten.
           Ein Widerruf genau dazwischen darf keinen Rechercheauftrag mehr
           starten, auch wenn die äußere Methode mit Personal-AI begann. */
        if (generation !== start || kiKontoVon(auth.getSnapshot?.()) !== accountId) {
          return filmwissenSonderstatus(FILMWISSEN_STATUS.VERALTET);
        }
        const result = await ai.runTask("filmwissen-synthese", id, {
          signal: options.signal,
          vorgangId: options.vorgangId,
          /* Der Server ersetzt diese Marke durch seine eigene, fest gebaute
             Promptfassung. Die Clientmarke bleibt absichtlich generisch. */
          promptVersion: "v1",
        });
        if (generation !== start || kiKontoVon(auth.getSnapshot?.()) !== accountId) {
          return filmwissenSonderstatus(FILMWISSEN_STATUS.VERALTET);
        }
        if (result?.responseMode === "degraded") {
          /* Der sichere Freitext ist nur eine sichtbare, unverbindliche
             Rueckmeldung. Er wird weder als Cacheobjekt gelesen noch als
             `belegt` behandelt. */
          return mitFilmwissenDarstellung(
            filmwissenSonderstatus(FILMWISSEN_STATUS.NICHT_BELEGT),
            result,
          );
        }
        const status = result?.data?.status;
        if (status === FILMWISSEN_STATUS.ENTWURF) {
          return mitFilmwissenDarstellung(
            dekodiereFilmwissenEntwurf(result.data),
            result,
          );
        }
        if (status === "nicht_belegt") {
          return filmwissenSonderstatus(FILMWISSEN_STATUS.NICHT_BELEGT);
        }
        if (status === "nicht_zuordenbar") {
          return filmwissenSonderstatus(FILMWISSEN_STATUS.NICHT_ZUORDENBAR);
        }
        if (status === "quellen_nicht_verfuegbar") {
          return filmwissenSonderstatus(FILMWISSEN_STATUS.GESPERRT);
        }
        if (!["belegt", "cache_hit"].includes(status)) {
          throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
            source: "filmwissen", operation: "research.decode", reason: "status-unbekannt",
          });
        }
        const gelesen = await read(film, options);
        return result?.responseMode === "partial"
          ? mitFilmwissenDarstellung(gelesen, result)
          : gelesen;
      } catch (error) {
        if (error instanceof BoundaryError) throw error;
        throw normalizeBoundaryError(error, { source: "filmwissen", operation: "research" });
      } finally {
        rechercheOffen.delete(key);
      }
    })();
    rechercheOffen.set(key, promise);
    return promise;
  }
  return Object.freeze({
    read,
    recherchiere,
    invalidate() { generation++; offen.clear(); rechercheOffen.clear(); },
    dispose() { generation++; offen.clear(); rechercheOffen.clear(); unsubscribe(); },
  });
}
export const filmwissenService = createFilmwissenService({ transport: createFilmwissenTransport({
  config: runtimeConfig, getAccessToken: (opts) => authDriver.getAccessToken(opts),
  getAccountId: () => authDriver.konto()?.id || null,
}) });
