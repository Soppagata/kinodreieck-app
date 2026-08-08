/* Gerätelokale Metadaten des Account-Treibers. `snap` kann vollständige
   persönliche Rohwerte enthalten und gehört deshalb zwingend in jede
   Konto→Gast-Quarantäne, obwohl diese Schlüssel keine Sync-Töpfe sind. */
export const ACCT_KEYS = Object.freeze({
  ver: "kd:acct:ver",
  status: "kd:acct:status",
  snap: "kd:acct:snap",
  epoch: "kd:acct:epoch",
  bindingSchema: "kd:acct:binding-schema",
  transition: "kd:acct:transition",
  owner: "kd:acct:owner",
});

export const ACCOUNT_CACHE_BINDING_SCHEMA_VERSION = 1;

export const ACCOUNT_CACHE_METADATA_KEYS = Object.freeze(Object.values(ACCT_KEYS));
export const ACCOUNT_CACHE_STATE_KEYS = Object.freeze([
  ACCT_KEYS.ver, ACCT_KEYS.status, ACCT_KEYS.snap, ACCT_KEYS.epoch, ACCT_KEYS.bindingSchema,
]);
export const ACCOUNT_CACHE_METADATA_WITHOUT_OWNER = Object.freeze(
  ACCOUNT_CACHE_METADATA_KEYS.filter((key) => key !== ACCT_KEYS.owner),
);

function transitionToken() {
  try { return crypto.randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function liesRoh(key, storage) {
  if (!storage?.getItem) return Object.freeze({ status: "error", raw: null });
  try {
    const raw = storage.getItem(key);
    return Object.freeze({ status: raw == null ? "missing" : "present", raw });
  } catch (error) {
    return Object.freeze({ status: "error", raw: null, error });
  }
}

/* Die Upgrade-Grenze muss „fehlt wirklich" von „vorhanden, aber kaputt oder
   für ein anderes Konto" unterscheiden. Die bisherigen Komfortleser geben in
   all diesen Fällen null zurück und sind deshalb absichtlich nicht ausreichend. */
export function leseAccountCacheEpochZustand(storage = globalThis.localStorage) {
  const roh = liesRoh(ACCT_KEYS.epoch, storage);
  if (roh.status !== "present") return roh;
  try {
    const wert = JSON.parse(roh.raw);
    if (!wert || typeof wert !== "object" || Array.isArray(wert)
        || typeof wert.accountId !== "string" || !wert.accountId
        || typeof wert.token !== "string" || !wert.token) {
      return Object.freeze({ status: "invalid", raw: roh.raw, value: null });
    }
    return Object.freeze({ status: "valid", raw: roh.raw, value: Object.freeze({
      accountId: wert.accountId, token: wert.token,
    }) });
  } catch {
    return Object.freeze({ status: "invalid", raw: roh.raw, value: null });
  }
}

export function leseAccountCacheBindingSchemaZustand(storage = globalThis.localStorage) {
  const roh = liesRoh(ACCT_KEYS.bindingSchema, storage);
  if (roh.status !== "present") return roh;
  try {
    const wert = JSON.parse(roh.raw);
    if (!wert || typeof wert !== "object" || Array.isArray(wert)
        || wert.v !== ACCOUNT_CACHE_BINDING_SCHEMA_VERSION
        || typeof wert.accountId !== "string" || !wert.accountId) {
      return Object.freeze({ status: "invalid", raw: roh.raw, value: null });
    }
    return Object.freeze({ status: "valid", raw: roh.raw, value: Object.freeze({
      v: wert.v, accountId: wert.accountId,
    }) });
  } catch {
    return Object.freeze({ status: "invalid", raw: roh.raw, value: null });
  }
}

export function leseAccountCacheTransitionZustand(storage = globalThis.localStorage) {
  const roh = liesRoh(ACCT_KEYS.transition, storage);
  if (roh.status !== "present") return roh;
  try {
    const wert = JSON.parse(roh.raw);
    if (!wert || typeof wert !== "object" || Array.isArray(wert)
        || typeof wert.token !== "string" || !wert.token
        || typeof wert.accountId !== "string" || !wert.accountId) {
      return Object.freeze({ status: "invalid", raw: roh.raw, value: null });
    }
    return Object.freeze({ status: "valid", raw: roh.raw, value: Object.freeze({ ...wert }) });
  } catch {
    return Object.freeze({ status: "invalid", raw: roh.raw, value: null });
  }
}

export function leseAccountCacheTransition(storage = globalThis.localStorage) {
  const zustand = leseAccountCacheTransitionZustand(storage);
  return zustand.status === "valid" ? zustand.value : null;
}

export function beginneAccountCacheTransition(accountId, zweck, storage = globalThis.localStorage) {
  const id = String(accountId || "");
  if (!id || !storage?.getItem || !storage?.setItem) return null;
  try {
    if (storage.getItem(ACCT_KEYS.transition) != null) return null;
    const wert = {
      accountId: id,
      zweck: String(zweck || "trennung"),
      token: transitionToken(),
      t: new Date().toISOString(),
    };
    const raw = JSON.stringify(wert);
    storage.setItem(ACCT_KEYS.transition, raw);
    return storage.getItem(ACCT_KEYS.transition) === raw ? Object.freeze(wert) : null;
  } catch { return null; }
}

export function beendeAccountCacheTransition(token, storage = globalThis.localStorage) {
  const erwartet = String(token || "");
  if (!erwartet || !storage?.getItem || !storage?.removeItem) return false;
  try {
    const aktuell = leseAccountCacheTransition(storage);
    if (!aktuell || aktuell.token !== erwartet) return false;
    storage.removeItem(ACCT_KEYS.transition);
    return storage.getItem(ACCT_KEYS.transition) == null;
  } catch { return false; }
}
