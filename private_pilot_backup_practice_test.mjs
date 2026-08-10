import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const browserMeta = new Map();
globalThis.localStorage = {
  getItem: (key) => browserMeta.has(key) ? browserMeta.get(key) : null,
  setItem: (key, value) => { browserMeta.set(key, String(value)); },
  removeItem: (key) => { browserMeta.delete(key); },
  clear: () => browserMeta.clear(),
};

const { baueBackup } = await import("./src/lib/backup.js");
const { restoreBackup, restoreRueckgaengig } = await import("./src/lib/restore.js");
const { PERSONAL_DATA_ENTRIES, PERSONAL_DATA_KEYS } = await import("./src/lib/personalDataRegistry.js");
const { createEmptyLocalRadar, upsertGuestRadarSubscription } = await import("./src/lib/localEventRadar.js");
const { setStorageDriver } = await import("./src/lib/storage.js");
const { createSessionCoordinator, STORAGE_SESSION_STATES } = await import("./src/services/sessionCoordinator.js");

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`✓ ${name}`);
};

function mapDriver(name, owner, entries = []) {
  const values = new Map(entries);
  return {
    name,
    owner,
    values,
    async get(key) { return values.has(key) ? { key, value: values.get(key) } : null; },
    async set(key, value) { values.set(key, String(value)); return { key, value: String(value) }; },
    async delete(key) { values.delete(key); return { key, deleted: true }; },
    async list(prefix = "") { return { keys: [...values.keys()].filter((key) => key.startsWith(prefix)) }; },
    async pull() { return { ok: true, noop: true }; },
  };
}

function radarState() {
  return upsertGuestRadarSubscription(createEmptyLocalRadar({ authority: "guest" }), {
    target: {
      targetId: "fixture:target:private-pilot", targetType: "work", targetStatus: "active",
      title: "Synthetischer Praxisfilm", canonical: true,
    },
    now: "2026-08-09T18:00:00.000Z",
  }).state;
}

function persoenlicherStand(label) {
  const timestamp = label === "A" ? 1_754_761_600_000 : 1_754_761_660_000;
  return new Map([
    ["kd:master", JSON.stringify({
      meta: { version: `practice-${label}` },
      filme: [{ id: `practice-film-${label.toLowerCase()}`, titel: `Praxisfilm ${label}`, jahr: 2026 }],
      herkunft: { typ: "storage", zeit: timestamp, basis: "synthetische Praxisprobe" },
      gespeichertAm: timestamp,
    })],
    ["kd:artikel", JSON.stringify({ artikel: [], gespeichertAm: timestamp })],
    ["kd:kino-pins", "[]"],
    ["kd:wochenplan", JSON.stringify({ version: 1, eintraege: [] })],
    ["kd:radar", JSON.stringify(radarState())],
    ["kd:merkliste", "[]"],
    ["kd:vokabular", "[]"],
    ["kd:einstellungen", JSON.stringify({ theme: label === "A" ? "dunkel" : "hell", startTab: "start" })],
    ["kd:entdecken-status", "{}"],
    ["kd:autor-name", `Praxis ${label}`],
    ["kd:streaming-dienste", JSON.stringify({ quellen: [], heuristik: false })],
    ["kd:mustwatch", JSON.stringify({ eintraege: [], gespeichertAm: timestamp })],
    ["kd:achievements", JSON.stringify({ eggs: [] })],
    ["kd:zeitgrenze", "14:00"],
    ["kd:filter-mediathek", "0"],
    ["kd:filter-kino", "0"],
    ["kd:filter-streaming", "0"],
    ["kd:geschmacksprofil", JSON.stringify({ version: 1, signale: [] })],
  ]);
}

function checksum(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function backupFields(backup) {
  return Object.fromEntries(PERSONAL_DATA_ENTRIES.map((entry) => [entry.backupField, backup[entry.backupField]]));
}

async function assertDriverMatchesBackup(driver, backup) {
  for (const entry of PERSONAL_DATA_ENTRIES) {
    const row = await driver.get(entry.key);
    assert.deepEqual(
      entry.backupAusRoh(row?.value ?? null),
      backup[entry.backupField],
      `${entry.key} weicht vom Backup ab`,
    );
  }
}

const profilA = mapDriver("lokal", "synthetic-profile-a", persoenlicherStand("A"));
const profilB = mapDriver("lokal", "synthetic-profile-b", persoenlicherStand("B"));

await check("Praxisstand A deckt exakt alle Registry-Töpfe inklusive Radar ab", () => {
  assert.equal(PERSONAL_DATA_KEYS.length, 18);
  assert.deepEqual([...profilA.values.keys()].sort(), [...PERSONAL_DATA_KEYS].sort());
  assert.equal(JSON.parse(profilA.values.get("kd:radar")).subscriptions.length, 1);
});

setStorageDriver(profilA);
const backupA = await baueBackup();
const checksumA = checksum(backupFields(backupA));

await check("Frisches Gesamtbackup A besitzt eine stabile SHA-256-Prüfsumme", () => {
  assert.match(checksumA, /^[a-f0-9]{64}$/);
  assert.equal(backupA.format, "kinodreieck-backup");
  assert.equal(backupA.radar.subscriptions.length, 1);
  assert.equal(backupA._warnungen, undefined);
});

setStorageDriver(profilB);
const restoreAinB = await restoreBackup(backupA);
await check("Synthetischer Treiber B stellt alle Registry-Töpfe aus A wieder her", async () => {
  assert.equal(restoreAinB.ok, true);
  assert.equal(restoreAinB.remoteVerifiziert, null);
  await assertDriverMatchesBackup(profilB, backupA);
});

const backupVorAenderung = await baueBackup();
const geaenderteSettings = JSON.stringify({ theme: "hell", startTab: "daten", praxisAenderung: true });
await profilB.set("kd:einstellungen", geaenderteSettings);
const syntheticRemote = new Map();
const operationLedger = new Set();
function synchronisiere(operationId, key, value) {
  if (operationLedger.has(operationId)) return { ok: true, idempotent: true };
  syntheticRemote.set(key, value);
  operationLedger.add(operationId);
  return { ok: true, idempotent: false };
}
const firstSync = synchronisiere("practice-operation-1", "kd:einstellungen", geaenderteSettings);
const repeatedSync = synchronisiere("practice-operation-1", "kd:einstellungen", geaenderteSettings);

await check("Bewusste Änderung wird lokal erhalten und idempotent in den synthetischen Remote-Adapter gespiegelt", () => {
  assert.equal(profilB.values.get("kd:einstellungen"), geaenderteSettings);
  assert.deepEqual(firstSync, { ok: true, idempotent: false });
  assert.deepEqual(repeatedSync, { ok: true, idempotent: true });
  assert.equal(syntheticRemote.get("kd:einstellungen"), geaenderteSettings);
});

await restoreBackup(backupVorAenderung);
await check("Vorbereiteter Restore nimmt die Änderung feldweise zurück", async () => {
  await assertDriverMatchesBackup(profilB, backupVorAenderung);
});

await restoreRueckgaengig();
await check("Restore-Undo stellt den unmittelbar vorherigen geänderten Stand wieder her", () => {
  assert.equal(profilB.values.get("kd:einstellungen"), geaenderteSettings);
});

await restoreBackup(backupA);
for (const [key, value] of profilB.values) syntheticRemote.set(key, value);
const erneutExportiert = await baueBackup();
await check("A, B, synthetischer Remote-Stand und erneuter Export stimmen feldweise überein", async () => {
  await assertDriverMatchesBackup(profilB, backupA);
  for (const key of PERSONAL_DATA_KEYS) assert.equal(syntheticRemote.get(key), profilB.values.get(key), key);
  assert.deepEqual(backupFields(erneutExportiert), backupFields(backupA));
  assert.equal(checksum(backupFields(erneutExportiert)), checksumA);
});

function session(id = "", capabilities = {}) {
  return id ? {
    mode: "account", state: capabilities.remoteStorage === false ? "ready" : "ready",
    account: { id }, capabilities: { remoteStorage: true, personalAi: false, ...capabilities },
  } : { mode: "guest", state: "ready", account: null, capabilities: { remoteStorage: false, personalAi: false } };
}

function coordinatorFixture({ current = session(), owner = "", confirmed = [], open = false, restoreFails = false, quarantineFails = false } = {}) {
  const calls = [];
  let snapshot = current;
  let masked = false;
  let blocked = false;
  const auth = {
    getSnapshot: () => snapshot,
    async initialize() { return snapshot; },
    async refresh() { return snapshot; },
    async signOut({ beforeGuest } = {}) { await beforeGuest?.(); snapshot = session(); return snapshot; },
    async signIn() { return snapshot; },
    async changePassword() { return true; },
  };
  const storage = {
    prepare(id) { calls.push(["prepare", id]); },
    async confirm(id) { calls.push(["confirm", id]); },
    deactivate() { calls.push(["deactivate"]); },
    unlockAfterPrivacyCleanup() { masked = false; calls.push(["unlock"]); },
    unlockForSameOwnerAccount() { masked = false; return true; },
    mask() { masked = true; calls.push(["mask"]); },
    blockAccess(id) { blocked = true; masked = true; calls.push(["block", id]); },
    unblockAccess() { blocked = false; masked = false; return true; },
    accessBlocked: () => blocked,
    masked: () => masked,
    migrateLegacyBinding: async () => null,
    cleanupOrphanMetadata: () => true,
    beginTransition: () => ({ token: "practice-transition" }),
    endTransition: () => true,
    transitionFence: async () => {},
    active: () => confirmed.includes(current.account?.id),
    preparedAccountId: () => current.account?.id || null,
    cacheOwner: () => owner,
    currentTransition: () => null,
    hasOpenChanges: () => open,
    async pull() { calls.push(["pull"]); return { ok: true }; },
    async flush() { calls.push(["flush"]); },
    status: () => ({ pending: open ? ["kd:master"] : [], conflict: [], zuGross: [], schemaVeraltet: [] }),
  };
  const adoption = {
    isConfirmed: (id) => confirmed.includes(id),
    async restoreGuest(id) { calls.push(["restore", id]); if (restoreFails) throw new Error("restore-failed"); return { ok: true }; },
    async quarantine(id) { calls.push(["quarantine", id]); return quarantineFails ? null : { ok: true }; },
  };
  return { coordinator: createSessionCoordinator({ auth, storage, adoption, eventTarget: null }), calls };
}

await check("Gast-, Konto- und Logoutpfad bleiben getrennt", async () => {
  const guest = coordinatorFixture();
  await guest.coordinator.initialize();
  assert.equal(guest.coordinator.getStorageState(), STORAGE_SESSION_STATES.GUEST);

  const account = coordinatorFixture({ current: session("synthetic-a"), owner: "synthetic-a", confirmed: ["synthetic-a"] });
  await account.coordinator.initialize();
  assert.equal(account.coordinator.getStorageState(), STORAGE_SESSION_STATES.READY);
  assert.deepEqual(account.calls.slice(0, 3), [["prepare", "synthetic-a"], ["confirm", "synthetic-a"], ["pull"]]);

  const pending = coordinatorFixture({ current: session("synthetic-a"), owner: "synthetic-a", confirmed: ["synthetic-a"], open: true });
  await pending.coordinator.initialize();
  await assert.rejects(() => pending.coordinator.signOut());
  assert.equal(pending.coordinator.getSnapshot().mode, "account");
});

await check("Offline-Freigabe und A/B-Verwechslung bleiben fail-closed", async () => {
  const offline = coordinatorFixture({ current: session("synthetic-a", { remoteStorage: false }), owner: "synthetic-a", confirmed: ["synthetic-a"], open: true });
  await offline.coordinator.initialize();
  assert.equal(offline.coordinator.getStorageState(), STORAGE_SESSION_STATES.ACCESS_BLOCKED);
  assert.deepEqual(offline.calls, [["block", "synthetic-a"]]);

  const mismatch = coordinatorFixture({ current: session("synthetic-b"), owner: "synthetic-a", confirmed: ["synthetic-b"], open: true });
  await assert.rejects(() => mismatch.coordinator.initialize(), (error) => error.code === "PERSONAL_DATA_PRIVACY_LOCKED");
  assert.equal(mismatch.calls.some(([name]) => name === "prepare"), false);
});

await check("Doppelter Restore-/Quarantänefehler maskiert Daten statt Gastzugriff zu behaupten", async () => {
  const privacy = coordinatorFixture({ owner: "synthetic-a", restoreFails: true, quarantineFails: true });
  await assert.rejects(() => privacy.coordinator.initialize(), (error) => error.code === "PERSONAL_DATA_PRIVACY_LOCKED");
  assert.equal(privacy.coordinator.getStorageState(), STORAGE_SESSION_STATES.PRIVACY_LOCKED);
  assert.equal(privacy.calls.some(([name]) => name === "mask"), true);
});

setStorageDriver(null);
console.log(`PRIVATE-PILOT-BACKUP-PRAXIS BESTANDEN (${checks}/${checks})`);
