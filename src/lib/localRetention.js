import { ACCT_KEYS } from "./accountStorageKeys.js";

export const LOCAL_RETENTION_KEYS = Object.freeze({
  restore: "kd:restore:vorher",
  takeover: "kd:acct:uebernahme:vorher",
  accountSnapshots: ACCT_KEYS.snap,
});

export const LOCAL_RETENTION_DAYS = Object.freeze({
  [LOCAL_RETENTION_KEYS.restore]: 7,
  [LOCAL_RETENTION_KEYS.takeover]: 7,
  [LOCAL_RETENTION_KEYS.accountSnapshots]: 7,
});

const ms = (days) => days * 24 * 60 * 60 * 1000;
const timestamp = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function remove(storage, key) {
  try { storage.removeItem(key); return storage.getItem(key) == null; }
  catch { return false; }
}

export function purgeExpiredLocalData(storage = globalThis.localStorage, now = Date.now()) {
  const report = { checked: 0, removed: [], pruned: 0, invalidRemoved: [] };
  if (!storage?.getItem || !storage?.removeItem) return report;
  for (const key of [LOCAL_RETENTION_KEYS.restore, LOCAL_RETENTION_KEYS.takeover]) {
    report.checked += 1;
    let raw;
    try { raw = storage.getItem(key); } catch { continue; }
    if (raw == null) continue;
    let value;
    try { value = JSON.parse(raw); } catch {
      if (remove(storage, key)) report.invalidRemoved.push(key);
      continue;
    }
    const created = timestamp(value?.t);
    if (created == null || now - created >= ms(LOCAL_RETENTION_DAYS[key])) {
      if (remove(storage, key)) report.removed.push(key);
    }
  }
  const snapKey = LOCAL_RETENTION_KEYS.accountSnapshots;
  report.checked += 1;
  let raw;
  try { raw = storage.getItem(snapKey); } catch { raw = null; }
  if (raw != null) {
    let value;
    try { value = JSON.parse(raw); } catch {
      if (remove(storage, snapKey)) report.invalidRemoved.push(snapKey);
      value = null;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const next = {};
      for (const [key, entries] of Object.entries(value)) {
        if (!Array.isArray(entries)) { report.pruned += 1; continue; }
        const kept = entries.filter((entry) => {
          const created = timestamp(entry?.t);
          return created != null && now - created < ms(LOCAL_RETENTION_DAYS[snapKey]);
        });
        report.pruned += entries.length - kept.length;
        if (kept.length) next[key] = kept;
      }
      try {
        if (Object.keys(next).length) storage.setItem(snapKey, JSON.stringify(next));
        else remove(storage, snapKey);
      } catch { /* Aufräumfehler macht den App-Start nicht unbenutzbar. */ }
    }
  }
  return report;
}
