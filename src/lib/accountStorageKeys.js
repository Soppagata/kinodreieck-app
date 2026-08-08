/* Gerätelokale Metadaten des Account-Treibers. `snap` kann vollständige
   persönliche Rohwerte enthalten und gehört deshalb zwingend in jede
   Konto→Gast-Quarantäne, obwohl diese Schlüssel keine Sync-Töpfe sind. */
export const ACCT_KEYS = Object.freeze({
  ver: "kd:acct:ver",
  status: "kd:acct:status",
  snap: "kd:acct:snap",
  epoch: "kd:acct:epoch",
  transition: "kd:acct:transition",
  owner: "kd:acct:owner",
});

export const ACCOUNT_CACHE_METADATA_KEYS = Object.freeze(Object.values(ACCT_KEYS));
export const ACCOUNT_CACHE_STATE_KEYS = Object.freeze([
  ACCT_KEYS.ver, ACCT_KEYS.status, ACCT_KEYS.snap, ACCT_KEYS.epoch,
]);
export const ACCOUNT_CACHE_METADATA_WITHOUT_OWNER = Object.freeze(
  ACCOUNT_CACHE_METADATA_KEYS.filter((key) => key !== ACCT_KEYS.owner),
);

function transitionToken() {
  try { return crypto.randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export function leseAccountCacheTransition(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(ACCT_KEYS.transition);
    if (!raw) return null;
    const wert = JSON.parse(raw);
    return wert?.token && wert?.accountId ? wert : null;
  } catch { return null; }
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
